// bridge.js（内容脚本，运行在 ISOLATED 世界，转发主世界 inject.js 的 window.postMessage）
(function() {
  // 防止重复注入
  if (window.__sse_viewer_bridge_installed) {
    console.warn('[SSE Viewer] Bridge already installed, skipping');
    return;
  }
  window.__sse_viewer_bridge_installed = true;

  let port = chrome.runtime.connect({ name: 'bridge' });
  let isConnected = true;

  port.onDisconnect.addListener(() => {
    isConnected = false;
    console.warn('[SSE Viewer] Bridge port disconnected');
  });

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const data = e.data;
    if (data && data.__sse_viewer) {
      if (isConnected) {
        try {
          port.postMessage(data);
        } catch (err) {
          console.error('[SSE Viewer] Failed to send message:', err);
          isConnected = false;
        }
      }
    }
  });

  console.log('[SSE Viewer] Bridge installed successfully');
})();
