// background.js (Service Worker)
const panels = new Map();  // tabId -> Port (panel)
const bridges = new Map(); // tabId -> Port (bridge)
const injectedTabs = new Set(); // 记录已注入脚本的 tabId

// Service Worker 激活时恢复状态
chrome.runtime.onStartup.addListener(() => {
  console.log('[SSE Viewer] Service Worker started');
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[SSE Viewer] Extension installed/updated');
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'panel') {
    port.onMessage.addListener(async (msg) => {
      if (msg?.type === 'init' && msg.tabId) {
        panels.set(msg.tabId, port);
        
        // 只在未注入时执行注入
        if (!injectedTabs.has(msg.tabId)) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: msg.tabId },
              files: ['bridge.js'],
            });
            await chrome.scripting.executeScript({
              target: { tabId: msg.tabId },
              files: ['inject.js'],
              world: 'MAIN',
            });
            injectedTabs.add(msg.tabId);
            console.log(`[SSE Viewer] Scripts injected to tab ${msg.tabId}`);
          } catch (e) {
            console.error(`[SSE Viewer] Injection failed for tab ${msg.tabId}:`, e);
            port.postMessage({ __sse_viewer: true, type: 'error', url: '', time: Date.now(), payload: { message: String(e) } });
          }
        } else {
          console.log(`[SSE Viewer] Scripts already injected to tab ${msg.tabId}, skipping`);
        }
      }
    });
    port.onDisconnect.addListener(() => {
      // 清理已断开的面板端口
      for (const [tabId, p] of panels.entries()) {
        if (p === port) {
          panels.delete(tabId);
          console.log(`[SSE Viewer] Panel disconnected for tab ${tabId}`);
          // 不清理 injectedTabs，因为脚本仍在页面中运行
        }
      }
    });
  } else if (port.name === 'bridge') {
    const tabId = port.sender?.tab?.id;
    if (tabId != null) {
      bridges.set(tabId, port);
      console.log(`[SSE Viewer] Bridge connected for tab ${tabId}`);
    }
    
    port.onMessage.addListener((msg) => {
      if (!msg) return;
      const p = panels.get(tabId);
      if (p) {
        try {
          p.postMessage(msg);
        } catch (err) {
          console.error(`[SSE Viewer] Failed to send message to panel for tab ${tabId}:`, err);
          panels.delete(tabId);
        }
      } else {
        // 面板未连接时，打印日志但不报错（panel 可能还未打开）
        // console.log(`[SSE Viewer] No panel found for tab ${tabId}, message dropped`);
      }
    });
    
    port.onDisconnect.addListener(() => {
      if (tabId != null) {
        bridges.delete(tabId);
        console.log(`[SSE Viewer] Bridge disconnected for tab ${tabId}`);
      }
    });
  }
});

// 监听标签页关闭/刷新，清理注入标记
chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
  panels.delete(tabId);
  bridges.delete(tabId);
  console.log(`[SSE Viewer] Tab ${tabId} removed, cleaned up`);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // 页面导航时清理注入标记
  if (changeInfo.status === 'loading' && changeInfo.url) {
    injectedTabs.delete(tabId);
    console.log(`[SSE Viewer] Tab ${tabId} navigated, cleared injection flag`);
  }
});
