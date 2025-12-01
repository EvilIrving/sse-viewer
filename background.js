// background.js (Service Worker)
const panels = new Map();  // tabId -> Port (panel)
const bridges = new Map(); // tabId -> Port (bridge)
const injectedTabs = new Set(); // 记录已注入脚本的 tabId

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
          // 当面板关闭时，清理注入标记，允许重新注入
          // injectedTabs.delete(tabId); // 保留标记，避免页面刷新前重复注入
        }
      }
    });
  } else if (port.name === 'bridge') {
    const tabId = port.sender?.tab?.id;
    if (tabId != null) bridges.set(tabId, port);
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
      }
    });
    port.onDisconnect.addListener(() => {
      if (tabId != null) {
        bridges.delete(tabId);
      }
    });
  }
});
