// panel.js
const list = document.getElementById('list');
const listContainer = document.getElementById('listContainer');
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
  expandedRequests: new Set(), // 展开的请求组
  selectedRequest: null, // {requestKey, messageIndex} 或 {requestKey} 只选择请求头
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
  state.expandedRequests.clear();
  state.selectedRequest = null;
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
  listContainer.classList.remove('drawer-open');
  state.selectedRequest = null;
  render();
}

function openDrawer(requestKey, messageIndex = null) {
  state.selectedRequest = { requestKey, messageIndex };
  drawer.classList.add('open');
  listContainer.classList.add('drawer-open');
  renderDrawer();
  render();
}

function toggleRequestExpand(requestKey) {
  if (state.expandedRequests.has(requestKey)) {
    state.expandedRequests.delete(requestKey);
  } else {
    state.expandedRequests.add(requestKey);
  }
  render();
}

// 从 URL 中提取 conversation_id 或其他 ID
function extractRequestId(url, payload) {
  // 尝试从 URL 中提取 ID
  const urlMatch = url.match(/conversation\/([^/?]+)/);
  if (urlMatch) return urlMatch[1];
  
  // 尝试从 payload 中提取
  if (payload?.json?.conversation_id) return payload.json.conversation_id;
  if (payload?.conversation_id) return payload.conversation_id;
  
  return null;
}

// 生成请求的唯一键
function getRequestKey(event) {
  const baseUrl = event.url.split('?')[0]; // 去掉查询参数
  const requestId = extractRequestId(event.url, event.payload);
  return requestId ? `${baseUrl}#${requestId}` : baseUrl;
}

// 按请求分组事件
function groupEventsByRequest(events) {
  const groups = new Map();
  
  for (const event of events) {
    const key = getRequestKey(event);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        url: event.url.split('?')[0],
        requestId: extractRequestId(event.url, event.payload),
        messages: [],
        firstTime: event.time,
        lastTime: event.time,
      });
    }
    const group = groups.get(key);
    group.messages.push(event);
    group.lastTime = event.time;
  }
  
  return Array.from(groups.values()).sort((a, b) => b.firstTime - a.firstTime);
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
  const filteredEvents = state.events.filter((e) => {
    if (!ft) return true;
    const s = `${e.url} ${e.type} ${(e.payload?.event ?? '')}`.toLowerCase();
    return s.includes(ft);
  });
  
  const groups = groupEventsByRequest(filteredEvents);

  list.innerHTML = '';
  
  if (groups.length === 0) {
    list.innerHTML = '<div class="empty-state">暂无 SSE 请求</div>';
    return;
  }
  
  for (const group of groups) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'request-group';
    
    // 请求头部
    const header = document.createElement('div');
    header.className = 'request-header';
    
    const isExpanded = state.expandedRequests.has(group.key);
    const isHeaderSelected = state.selectedRequest?.requestKey === group.key && state.selectedRequest.messageIndex === null;
    
    if (isExpanded) header.classList.add('expanded');
    if (isHeaderSelected) header.classList.add('selected');
    
    const headerLeft = document.createElement('div');
    headerLeft.className = 'request-header-left';
    
    const expandIcon = document.createElement('span');
    expandIcon.className = 'expand-icon';
    expandIcon.textContent = '▶';
    if (isExpanded) expandIcon.classList.add('expanded');
    
    const urlSpan = document.createElement('span');
    urlSpan.className = 'request-url';
    const displayUrl = group.requestId ? `${group.url} (${group.requestId.substring(0, 8)}...)` : group.url;
    urlSpan.textContent = displayUrl;
    urlSpan.title = group.url + (group.requestId ? ` [${group.requestId}]` : '');
    
    headerLeft.appendChild(expandIcon);
    headerLeft.appendChild(urlSpan);
    
    const headerRight = document.createElement('div');
    headerRight.className = 'request-header-right';
    
    const messageCount = document.createElement('span');
    messageCount.className = 'message-count';
    messageCount.textContent = group.messages.length;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'request-time';
    timeSpan.textContent = new Date(group.firstTime).toLocaleTimeString();
    
    headerRight.appendChild(messageCount);
    headerRight.appendChild(timeSpan);
    
    header.appendChild(headerLeft);
    header.appendChild(headerRight);
    
    // 点击展开图标 - 切换展开/收起
    expandIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleRequestExpand(group.key);
    });
    
    // 点击请求头 - 打开抽屉显示请求信息
    header.addEventListener('click', (e) => {
      if (e.target === expandIcon) return;
      openDrawer(group.key, null);
    });
    
    groupDiv.appendChild(header);
    
    // 子消息列表
    if (group.messages.length > 0) {
      const messageList = document.createElement('div');
      messageList.className = 'message-list';
      if (isExpanded) messageList.classList.add('expanded');
      
      for (let i = 0; i < group.messages.length; i++) {
        const msg = group.messages[i];
        const msgItem = document.createElement('div');
        msgItem.className = 'message-item';
        
        const isSelected = state.selectedRequest?.requestKey === group.key && 
                          state.selectedRequest?.messageIndex === i;
        if (isSelected) msgItem.classList.add('selected');
        
        const msgLeft = document.createElement('div');
        msgLeft.className = 'message-item-left';
        
        const typeTag = document.createElement('span');
        typeTag.className = 'tag type';
        typeTag.textContent = msg.type;
        
        const eventTag = document.createElement('span');
        eventTag.className = 'tag event';
        eventTag.textContent = msg.payload?.event || 'message';
        
        const preview = document.createElement('span');
        preview.className = 'message-preview';
        const data = msg.payload?.data ?? msg.payload?.json ?? msg.payload;
        let previewText = '';
        if (typeof data === 'string') {
          previewText = data.substring(0, 50);
        } else if (data) {
          previewText = JSON.stringify(data).substring(0, 50);
        }
        preview.textContent = previewText;
        preview.title = previewText;
        
        msgLeft.appendChild(typeTag);
        msgLeft.appendChild(eventTag);
        msgLeft.appendChild(preview);
        
        const msgRight = document.createElement('div');
        msgRight.className = 'message-item-right';
        msgRight.textContent = new Date(msg.time).toLocaleTimeString();
        
        msgItem.appendChild(msgLeft);
        msgItem.appendChild(msgRight);
        
        // 点击消息 - 打开抽屉显示消息详情
        msgItem.addEventListener('click', () => {
          openDrawer(group.key, i);
        });
        
        messageList.appendChild(msgItem);
      }
      
      groupDiv.appendChild(messageList);
    }
    
    list.appendChild(groupDiv);
  }
}

function renderDrawer() {
  if (!state.selectedRequest) return;
  
  const { requestKey, messageIndex } = state.selectedRequest;
  
  const ft = state.filterText;
  const filteredEvents = state.events.filter((e) => {
    if (!ft) return true;
    const s = `${e.url} ${e.type} ${(e.payload?.event ?? '')}`.toLowerCase();
    return s.includes(ft);
  });
  
  const groups = groupEventsByRequest(filteredEvents);
  const group = groups.find(g => g.key === requestKey);
  
  if (!group) return;
  
  // 如果选中的是请求头（没有具体消息索引）
  if (messageIndex === null) {
    renderRequestSummary(group);
  } else {
    // 选中的是具体消息
    const message = group.messages[messageIndex];
    if (message) {
      renderMessage(message, group);
    }
  }
}

// 渲染请求概览
function renderRequestSummary(group) {
  // Data Tab - 显示所有消息的汇总
  tabData.innerHTML = '';
  const summaryDiv = document.createElement('div');
  summaryDiv.innerHTML = `
    <h3 style="margin-top: 0; font-size: 14px; color: #666;">请求概览</h3>
    <div style="margin-bottom: 16px;">
      <div style="font-size: 12px; color: #999; margin-bottom: 8px;">共 ${group.messages.length} 条消息</div>
    </div>
  `;
  
  group.messages.forEach((msg, idx) => {
    const msgDiv = document.createElement('div');
    msgDiv.style.marginBottom = '12px';
    msgDiv.style.padding = '8px';
    msgDiv.style.background = '#f9f9f9';
    msgDiv.style.borderRadius = '4px';
    msgDiv.style.fontSize = '11px';
    
    const header = document.createElement('div');
    header.style.marginBottom = '4px';
    header.style.color = '#666';
    header.innerHTML = `<strong>#${idx + 1}</strong> ${msg.payload?.event || 'message'} - ${new Date(msg.time).toLocaleTimeString()}`;
    
    const preview = document.createElement('div');
    preview.className = 'json-view';
    preview.style.maxHeight = '100px';
    preview.style.overflow = 'hidden';
    preview.style.fontSize = '11px';
    
    const data = msg.payload?.json || msg.payload?.data || msg.payload;
    if (typeof data === 'string') {
      preview.textContent = data.substring(0, 200);
    } else {
      preview.textContent = JSON.stringify(data, null, 2).substring(0, 200);
    }
    
    msgDiv.appendChild(header);
    msgDiv.appendChild(preview);
    summaryDiv.appendChild(msgDiv);
  });
  
  tabData.appendChild(summaryDiv);
  
  // Headers Tab - 显示请求信息
  tabHeaders.innerHTML = '';
  const infoRows = [
    { label: 'URL', value: group.url },
    { label: 'Request ID', value: group.requestId || 'N/A' },
    { label: '首次时间', value: new Date(group.firstTime).toLocaleString() },
    { label: '最后时间', value: new Date(group.lastTime).toLocaleString() },
    { label: '消息数量', value: group.messages.length },
  ];
  
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
  
  // Raw Tab - 显示原始数据
  tabRaw.innerHTML = '';
  const rawDiv = document.createElement('div');
  rawDiv.className = 'json-view';
  rawDiv.textContent = JSON.stringify(group, null, 2);
  tabRaw.appendChild(rawDiv);
}

// 渲染单条消息
function renderMessage(event, group) {
  // Data Tab
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
  
  // Headers Tab
  tabHeaders.innerHTML = '';
  
  const infoRows = [
    { label: 'Request ID', value: group.requestId || 'N/A' },
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
  
  // Raw Tab
  tabRaw.innerHTML = '';
  const rawDiv = document.createElement('div');
  rawDiv.className = 'json-view';
  rawDiv.textContent = JSON.stringify(event, null, 2);
  tabRaw.appendChild(rawDiv);
}
