// bridge.js（内容脚本，运行在 ISOLATED 世界，转发主世界 inject.js 的 window.postMessage）
(function() {
  // 防止重复注入
  if (window.__sse_viewer_bridge_installed) {
    console.warn('[SSE Viewer] Bridge already installed, skipping');
    return;
  }
  window.__sse_viewer_bridge_installed = true;

  let port = null;
  let isConnected = false;
  let reconnectTimer = null;
  let messageQueue = []; // 消息队列，用于断线时缓存
  let contextInvalidated = false; // 扩展上下文是否已失效
  const MAX_QUEUE_SIZE = 100;

  function connect() {
    // 如果扩展上下文已失效，不再尝试重连
    if (contextInvalidated) {
      return;
    }
    
    // 检查扩展上下文是否有效
    if (!chrome.runtime || !chrome.runtime.id) {
      console.error('[SSE Viewer] Extension context is invalid, stopping reconnect attempts');
      contextInvalidated = true;
      isConnected = false;
      port = null;
      // 清空消息队列，因为无法再发送
      messageQueue = [];
      return;
    }
    
    try {
      port = chrome.runtime.connect({ name: 'bridge' });
      isConnected = true;
      
      port.onDisconnect.addListener(() => {
        isConnected = false;
        port = null;
        
        // 检查是否是扩展上下文失效导致的断开
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.warn('[SSE Viewer] Bridge port disconnected:', lastError.message);
        } else {
          console.warn('[SSE Viewer] Bridge port disconnected, will attempt reconnect');
        }
        
        // 5秒后尝试重连
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          console.log('[SSE Viewer] Attempting to reconnect...');
          connect();
        }, 5000);
      });
      
      console.log('[SSE Viewer] Bridge connected successfully');
      
      // 发送队列中的消息
      if (messageQueue.length > 0) {
        console.log(`[SSE Viewer] Sending ${messageQueue.length} queued messages`);
        while (messageQueue.length > 0) {
          const msg = messageQueue.shift();
          try {
            port.postMessage(msg);
          } catch (err) {
            console.error('[SSE Viewer] Failed to send queued message:', err);
            break;
          }
        }
      }
    } catch (err) {
      console.error('[SSE Viewer] Failed to connect:', err);
      isConnected = false;
      port = null;
      
      // 如果是扩展上下文失效，不再尝试重连
      if (err.message && (err.message.includes('Extension context invalidated') || 
                          err.message.includes('Cannot access a chrome API'))) {
        console.error('[SSE Viewer] Extension context invalidated, stopping reconnect attempts');
        contextInvalidated = true;
        // 清空消息队列防止稍后接收错误的重连
        messageQueue = [];
        return;
      }
      
      // 其他错误，稍后重试
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        connect();
      }, 5000);
    }
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    // 如果扩展已失效，不处理消息
    if (contextInvalidated) {
      return;
    }
    const data = e.data;
    if (data && data.__sse_viewer) {
      if (isConnected && port) {
        try {
          port.postMessage(data);
        } catch (err) {
          console.error('[SSE Viewer] Failed to send message:', err);
          isConnected = false;
          // 将消息加入队列
          if (messageQueue.length < MAX_QUEUE_SIZE) {
            messageQueue.push(data);
          }
        }
      } else {
        // 未连接時，将消息加入队列
        if (messageQueue.length < MAX_QUEUE_SIZE) {
          messageQueue.push(data);
        } else {
          // 队列满时，移除最旧的消息
          messageQueue.shift();
          messageQueue.push(data);
        }
      }
    }
  });

  // 初始连接
  connect();
})();
