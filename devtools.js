// devtools.js - DevTools 入口，仅负责创建面板
// 连接和通信逻辑在 panel.js 中处理
chrome.devtools.panels.create('SSE Viewer', '', 'panel.html', (panel) => {
  // 面板创建成功，实际的初始化逻辑在 panel.js 中
  console.log('[SSE Viewer] DevTools panel created');
});
