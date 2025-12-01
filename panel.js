// panel.js
const list = document.getElementById('list');
const filter = document.getElementById('filter');
const clearBtn = document.getElementById('clear');
const jsonPretty = document.getElementById('jsonPretty');

const state = {
  events: [], // {time, type, url, payload: {data,event,id,json, ...}}
  filterText: '',
  pretty: true,
};

let port;
let isConnected = false;

try {
  port = chrome.runtime.connect({ name: 'panel' });
  isConnected = true;
  
  port.onMessage.addListener((msg) => {
    if (!msg || !msg.__sse_viewer) return;
    state.events.push(msg);
    render();
  });
  
  port.onDisconnect.addListener(() => {
    isConnected = false;
    console.warn('[SSE Viewer] Port disconnected, extension context may be invalidated');
    list.innerHTML = '<div style="padding: 20px; color: #ff6b6b;">连接已断开：扩展上下文已失效，请重新加载扩展。</div>';
  });
  
  // 发送初始化消息
  try {
    port.postMessage({ type: 'init', tabId: chrome.devtools.inspectedWindow.tabId });
  } catch (err) {
    console.error('[SSE Viewer] Failed to send init message:', err);
    isConnected = false;
    list.innerHTML = '<div style="padding: 20px; color: #ff6b6b;">初始化失败：扩展上下文已失效，请重新加载扩展。</div>';
  }
} catch (e) {
  console.error('[SSE Viewer] Failed to connect to background:', e);
  list.innerHTML = '<div style="padding: 20px; color: #ff6b6b;">连接失败：扩展上下文已失效，请重新加载扩展或刷新页面。</div>';
}

filter.addEventListener('input', () => {
  state.filterText = filter.value.trim().toLowerCase();
  render();
});

clearBtn.addEventListener('click', () => {
  state.events = [];
  render();
});

jsonPretty.addEventListener('change', () => {
  state.pretty = jsonPretty.checked;
  render();
});

function render() {
  const ft = state.filterText;
  const items = state.events.filter((e) => {
    if (!ft) return true;
    const s = `${e.url} ${e.type} ${(e.payload?.event ?? '')}`.toLowerCase();
    return s.includes(ft);
  });

  list.innerHTML = '';
  for (const e of items) {
    const div = document.createElement('div');
    div.className = 'item';

    const meta = document.createElement('div');
    meta.className = 'meta';
    const left = document.createElement('div');
    left.innerHTML = `
      <span class="tag">${e.type}</span>
      <span class="tag">${e.payload?.event || 'message'}</span>
      <span>${new Date(e.time).toLocaleTimeString()}</span>
    `;
    const right = document.createElement('div');
    right.textContent = e.url;
    meta.appendChild(left);
    meta.appendChild(right);

    const pre = document.createElement('div');
    pre.className = 'pre';
    const data = e.payload?.data ?? e.payload?.json ?? e.payload;
    let text = '';

    if (state.pretty && e.payload?.json) {
      text = JSON.stringify(e.payload.json, null, 2);
    } else if (typeof data === 'string') {
      text = data;
    } else {
      text = JSON.stringify(data, null, state.pretty ? 2 : 0);
    }
    pre.textContent = text;

    div.appendChild(meta);
    div.appendChild(pre);
    list.appendChild(div);
  }
}
