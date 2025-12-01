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
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_INTERVAL = 3000; // 3秒

function connect() {
  // 检查扩展上下文是否有效
  if (!chrome.runtime || !chrome.runtime.id) {
    console.error('[SSE Viewer Panel] Extension context is invalid, stopping reconnect attempts');
    isConnected = false;
    list.innerHTML = '<div style="padding: 20px; color: #ff6b6b;">扩展上下文已失效，请重新加载扩展。</div>';
    // 更新重连提示
    const notice = document.getElementById('reconnect-notice');
    if (notice) {
      notice.style.background = '#f44336';
      notice.textContent = '扩展上下文已失效：请重新加载扩展';
    }
    return;
  }
  
  try {
    port = chrome.runtime.connect({ name: 'panel' });
    isConnected = true;
    reconnectAttempts = 0;
    
    console.log('[SSE Viewer Panel] Connected to background');
    
    port.onMessage.addListener((msg) => {
      if (!msg || !msg.__sse_viewer) return;
      state.events.push(msg);
      render();
    });
    
    port.onDisconnect.addListener(() => {
      isConnected = false;
      
      // 检查是否是扩展上下文失效导致的断开
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        console.warn('[SSE Viewer Panel] Port disconnected:', lastError.message);
      } else {
        console.warn('[SSE Viewer Panel] Port disconnected, will attempt reconnect');
      }
      
      // 显示重连提示，但不影响已有数据
      let notice = document.getElementById('reconnect-notice');
      if (!notice) {
        notice = document.createElement('div');
        notice.id = 'reconnect-notice';
        notice.style.cssText = 'position: fixed; top: 10px; right: 10px; padding: 10px 16px; background: #ff9800; color: white; border-radius: 4px; font-size: 12px; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.2);';
        document.body.appendChild(notice);
      }
      notice.textContent = '连接已断开，正在重连...';
      notice.style.background = '#ff9800';
      
      // 尝试重连
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          console.log(`[SSE Viewer Panel] Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
          connect();
        } else {
          console.error('[SSE Viewer Panel] Max reconnect attempts reached');
          const notice = document.getElementById('reconnect-notice');
          if (notice) {
            notice.style.background = '#f44336';
            notice.textContent = '连接失败：请重新加载扩展';
          }
        }
      }, RECONNECT_INTERVAL);
    });
    
    // 发送初始化消息
    try {
      port.postMessage({ type: 'init', tabId: chrome.devtools.inspectedWindow.tabId });
      
      // 移除重连提示
      const notice = document.getElementById('reconnect-notice');
      if (notice) {
        notice.remove();
      }
    } catch (err) {
      console.error('[SSE Viewer Panel] Failed to send init message:', err);
      isConnected = false;
      throw err;
    }
  } catch (e) {
    console.error('[SSE Viewer Panel] Failed to connect to background:', e);
    isConnected = false;
    
    // 如果是扩展上下文失效，不再尝试重连
    if (e.message && e.message.includes('Extension context invalidated')) {
      console.error('[SSE Viewer Panel] Extension context invalidated, stopping reconnect attempts');
      list.innerHTML = '<div style="padding: 20px; color: #ff6b6b;">扩展上下文已失效，请重新加载扩展。</div>';
      const notice = document.getElementById('reconnect-notice');
      if (notice) {
        notice.style.background = '#f44336';
        notice.textContent = '扩展上下文已失效：请重新加载扩展';
      }
      return;
    }
    
    // 如果是初次连接失败，显示错误信息
    if (reconnectAttempts === 0) {
      list.innerHTML = '<div style="padding: 20px; color: #ff6b6b;">连接失败：扩展上下文已失效，请重新加载扩展或刷新页面。</div>';
    }
  }
}

// 初始连接
connect();

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

// 生成请求的唯一键（使用 streamId）
function getRequestKey(event) {
  // 优先使用 streamId（stream-open/close 事件中携带）
  if (event.payload?.streamId) {
    return event.payload.streamId;
  }
  
  // 对于旧的 EventSource 事件，使用 URL（因为 EventSource 实例本身就是唯一的）
  return event.url;
}

// 按请求分组事件（使用 streamId）
function groupEventsByRequest(events) {
  const groups = new Map();
  
  for (const event of events) {
    const key = getRequestKey(event);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        url: event.url.split('?')[0],
        streamId: event.payload?.streamId, // 保存 streamId
        messages: [],
        firstTime: event.time,
        lastTime: event.time,
        isOpen: event.type === 'stream-open', // 标记连接是否打开
      });
    }
    const group = groups.get(key);
    group.messages.push(event);
    group.lastTime = event.time;
    
    // 更新连接状态
    if (event.type === 'stream-close') {
      group.isOpen = false;
    }
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
    // 显示 URL 和 streamId（如果存在）
    const displayUrl = group.streamId 
      ? `${group.url} [${group.streamId.substring(7, 15)}...]` 
      : group.url;
    urlSpan.textContent = displayUrl;
    urlSpan.title = group.url + (group.streamId ? ` [Stream: ${group.streamId}]` : '');
    
    // 如果连接还在打开状态，添加绿色指示器
    if (group.isOpen) {
      const indicator = document.createElement('span');
      indicator.textContent = ' ●';
      indicator.style.color = '#4caf50';
      indicator.title = '连接打开中';
      urlSpan.appendChild(indicator);
    }
    
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
    { label: 'Stream ID', value: group.streamId || 'N/A' },
    { label: '连接状态', value: group.isOpen ? '🟢 打开中' : '⚫ 已关闭' },
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
    { label: 'Stream ID', value: group.streamId || 'N/A' },
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
