// panel.js
const list = document.getElementById('list');
const filter = document.getElementById('filter');
const clearBtn = document.getElementById('clear');
const drawer = document.getElementById('drawer');
const closeDrawerBtn = document.getElementById('closeDrawer');
const tabs = document.querySelectorAll('.tab');
const tabData = document.getElementById('tabData');
const tabHeaders = document.getElementById('tabHeaders');
const tabRaw = document.getElementById('tabRaw');

const state = {
  events: [], // {time, type, url, payload: {data,event,id,json, ...}}
  filterText: '',
  selectedIndex: -1,
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
  state.selectedIndex = -1;
  closeDrawer();
  render();
});

// 关闭抽屉
closeDrawerBtn.addEventListener('click', () => {
  closeDrawer();
});

// Tab 切换
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    switchTab(tabName);
  });
});

function closeDrawer() {
  drawer.classList.remove('open');
  state.selectedIndex = -1;
  render();
}

function openDrawer(index) {
  state.selectedIndex = index;
  drawer.classList.add('open');
  renderDrawer();
  render();
}

function switchTab(tabName) {
  // 更新 tab 按钮状态
  tabs.forEach(t => {
    if (t.dataset.tab === tabName) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });
  
  // 更新 tab 面板显示
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  
  if (tabName === 'data') {
    tabData.classList.add('active');
  } else if (tabName === 'headers') {
    tabHeaders.classList.add('active');
  } else if (tabName === 'raw') {
    tabRaw.classList.add('active');
  }
  
  renderDrawer();
}

function render() {
  const ft = state.filterText;
  const items = state.events.filter((e) => {
    if (!ft) return true;
    const s = `${e.url} ${e.type} ${(e.payload?.event ?? '')}`.toLowerCase();
    return s.includes(ft);
  });

  list.innerHTML = '';
  
  if (items.length === 0) {
    list.innerHTML = '<div class="empty-state">暂无 SSE 消息</div>';
    return;
  }
  
  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    const div = document.createElement('div');
    div.className = 'list-item';
    
    // 高亮选中的项
    if (i === state.selectedIndex) {
      div.classList.add('selected');
    }
    
    const left = document.createElement('div');
    left.className = 'list-item-left';
    
    const typeTag = document.createElement('span');
    typeTag.className = 'tag type';
    typeTag.textContent = e.type;
    
    const eventTag = document.createElement('span');
    eventTag.className = 'tag event';
    eventTag.textContent = e.payload?.event || 'message';
    
    const urlSpan = document.createElement('span');
    urlSpan.className = 'url';
    urlSpan.textContent = e.url;
    urlSpan.title = e.url;
    
    left.appendChild(typeTag);
    left.appendChild(eventTag);
    left.appendChild(urlSpan);
    
    const right = document.createElement('div');
    right.className = 'list-item-right';
    right.textContent = new Date(e.time).toLocaleTimeString();
    
    div.appendChild(left);
    div.appendChild(right);
    
    // 点击事件
    div.addEventListener('click', () => {
      openDrawer(i);
    });
    
    list.appendChild(div);
  }
}

function renderDrawer() {
  if (state.selectedIndex < 0 || state.selectedIndex >= state.events.length) {
    return;
  }
  
  const ft = state.filterText;
  const items = state.events.filter((e) => {
    if (!ft) return true;
    const s = `${e.url} ${e.type} ${(e.payload?.event ?? '')}`.toLowerCase();
    return s.includes(ft);
  });
  
  const event = items[state.selectedIndex];
  if (!event) return;
  
  // 渲染 Data Tab
  tabData.innerHTML = '';
  if (event.payload?.json) {
    const jsonDiv = document.createElement('div');
    jsonDiv.className = 'json-view';
    jsonDiv.textContent = JSON.stringify(event.payload.json, null, 2);
    tabData.appendChild(jsonDiv);
  } else {
    const data = event.payload?.data ?? event.payload;
    const jsonDiv = document.createElement('div');
    jsonDiv.className = 'json-view';
    if (typeof data === 'string') {
      jsonDiv.textContent = data;
    } else {
      jsonDiv.textContent = JSON.stringify(data, null, 2);
    }
    tabData.appendChild(jsonDiv);
  }
  
  // 渲染 Headers Tab
  tabHeaders.innerHTML = '';
  
  const infoRows = [
    { label: 'URL', value: event.url },
    { label: 'Time', value: new Date(event.time).toLocaleString() },
    { label: 'Type', value: event.type },
    { label: 'Event', value: event.payload?.event || 'message' },
  ];
  
  if (event.payload?.id) {
    infoRows.push({ label: 'Event ID', value: event.payload.id });
  }
  
  infoRows.forEach(({ label, value }) => {
    const row = document.createElement('div');
    row.className = 'info-row';
    
    const labelDiv = document.createElement('div');
    labelDiv.className = 'info-label';
    labelDiv.textContent = label;
    
    const valueDiv = document.createElement('div');
    valueDiv.className = 'info-value';
    valueDiv.textContent = value;
    
    row.appendChild(labelDiv);
    row.appendChild(valueDiv);
    tabHeaders.appendChild(row);
  });
  
  // 渲染 Raw Tab
  tabRaw.innerHTML = '';
  const rawDiv = document.createElement('div');
  rawDiv.className = 'json-view';
  rawDiv.textContent = JSON.stringify(event, null, 2);
  tabRaw.appendChild(rawDiv);
}
