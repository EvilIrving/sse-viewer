// panel.js
// I18n helper functions
const i18n = {
  messages: {}, // Current language messages
  currentLang: null,
  
  // Load messages for a specific language
  async loadMessages(lang) {
    try {
      const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
      const response = await fetch(url);
      const data = await response.json();
      
      // Convert Chrome i18n format to simple key-value pairs
      const messages = {};
      for (const [key, value] of Object.entries(data)) {
        messages[key] = value.message;
      }
      
      this.messages = messages;
      this.currentLang = lang;
      return messages;
    } catch (e) {
      console.warn(`Failed to load messages for ${lang}:`, e);
      // Fallback to English
      if (lang !== 'en') {
        return await this.loadMessages('en');
      }
      return {};
    }
  },
  
  // Get message with optional substitutions
  getMessage(key, substitutions) {
    let message = this.messages[key] || key;
    
    // Handle substitutions (e.g., $COUNT$ -> substitutions)
    if (substitutions !== undefined) {
      if (Array.isArray(substitutions)) {
        substitutions.forEach((sub, index) => {
          message = message.replace(`$${index + 1}`, sub);
        });
      } else {
        // Simple single substitution
        message = message.replace(/\$\w+\$/g, substitutions);
      }
    }
    
    return message;
  },
  
  // Initialize all elements with i18n attributes
  init() {
    // Handle text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = this.getMessage(key);
    });
    
    // Handle placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = this.getMessage(key);
    });
  },
  
  // Get current language from storage or browser
  async getCurrentLanguage() {
    // Check if custom language is set (Beta feature)
    try {
      const result = await chrome.storage.local.get(['customLanguage']);
      if (result.customLanguage) {
        return result.customLanguage;
      }
    } catch (e) {
      console.warn('Failed to get custom language:', e);
    }
    
    // Use browser UI language as default
    const browserLang = chrome.i18n.getUILanguage().replace('-', '_');
    // Map browser language codes to our locale codes
    const langMap = {
      'zh_CN': 'zh_CN',
      'zh': 'zh_CN',
      'en': 'en',
      'en_US': 'en',
      'ja': 'ja',
      'fr': 'fr'
    };
    return langMap[browserLang] || 'en';
  },
  
  // Set custom language (Beta feature only)
  async setLanguage(lang) {
    await chrome.storage.local.set({ customLanguage: lang });
    // Load and apply new language
    await this.loadMessages(lang);
    this.init();
  }
};

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
const langSelector = document.getElementById('langSelector');

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
let contextInvalidated = false; // 扩展上下文是否已失效
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_INTERVAL = 3000; // 3秒

// Initialize i18n and language selector
(async () => {
  const currentLang = await i18n.getCurrentLanguage();
  await i18n.loadMessages(currentLang);
  i18n.init();
  langSelector.value = currentLang;
})();

// Language selector change handler (Beta feature)
langSelector.addEventListener('change', async (e) => {
  const selectedLang = e.target.value;
  await i18n.setLanguage(selectedLang);
  
  // Re-render the UI to apply new language
  render();
  if (state.selectedRequest) {
    renderDrawer();
  }
});

function connect() {
  // 如果扩展上下文已失效，不再尝试重连
  if (contextInvalidated) {
    return;
  }
  
  // 检查扩展上下文是否有效
  if (!chrome.runtime || !chrome.runtime.id) {
    console.error('[SSE Viewer Panel] Extension context is invalid, stopping reconnect attempts');
    contextInvalidated = true;
    isConnected = false;
    list.innerHTML = `<div style="padding: 20px; color: #ff6b6b;">${i18n.getMessage('contextInvalidatedError')}</div>`;
    // 更新重连提示
    const notice = document.getElementById('reconnect-notice');
    if (notice) {
      notice.style.background = '#f44336';
      notice.textContent = i18n.getMessage('contextInvalidated');
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
      notice.textContent = i18n.getMessage('reconnecting');
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
            notice.textContent = i18n.getMessage('reconnectFailed');
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
    if (e.message && (e.message.includes('Extension context invalidated') || 
                      e.message.includes('Cannot access a chrome API'))) {
      console.error('[SSE Viewer Panel] Extension context invalidated, stopping reconnect attempts');
      contextInvalidated = true;
      list.innerHTML = `<div style="padding: 20px; color: #ff6b6b;">${i18n.getMessage('contextInvalidatedError')}</div>`;
      const notice = document.getElementById('reconnect-notice');
      if (notice) {
        notice.style.background = '#f44336';
        notice.textContent = i18n.getMessage('contextInvalidated');
      }
      return;
    }
    
    // 如果是初次连接失败，显示错误信息
    if (reconnectAttempts === 0) {
      list.innerHTML = `<div style="padding: 20px; color: #ff6b6b;">${i18n.getMessage('connectionFailedError')}</div>`;
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
  
  // 智能排序：AI 对话会话优先，需新使旧
  const isAIChatRequest = (url) => {
    return (
      url.includes('chat_conversations') || url.includes('/chat/') ||
      url.includes('/conversations/') && url.includes('/responses') ||
      url.includes('/app-chat/conversations') ||
      url.includes('conversations') && url.includes('openai') ||
      url.includes('/v1/chat') ||
      url.includes('anthropic') || url.includes('huggingface') || url.includes('together') ||
      url.includes('bedrock') || url.includes('azure')
    );
  };
  
  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    // 优先按 AI 请求排列
    const aIsAI = isAIChatRequest(a.url);
    const bIsAI = isAIChatRequest(b.url);
    
    if (aIsAI !== bIsAI) {
      return aIsAI ? -1 : 1; // AI 请求优先（出现在前面）
    }
    
    // 然后按时间排序（新需先）
    return b.firstTime - a.firstTime;
  });
  
  return sortedGroups;
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
  
  // 智能过滤：优先顫示 AI 对话请求，排除废旨请求
  const isAIChatRequest = (url) => {
    return (
      // Claude
      url.includes('chat_conversations') || url.includes('/chat/') ||
      // Grok
      url.includes('/conversations/') && url.includes('/responses') ||
      url.includes('/app-chat/conversations') ||
      // ChatGPT/OpenAI
      url.includes('conversations') && url.includes('openai') ||
      url.includes('/v1/chat') ||
      // 其他 AI 服务
      url.includes('anthropic') || url.includes('huggingface') || url.includes('together') ||
      url.includes('bedrock') || url.includes('azure')
    );
  };
  
  const isNonStreamRequest = (url) => {
    return !isAIChatRequest(url) && (
      url.toLowerCase().includes('mixpanel') ||
      url.toLowerCase().includes('segment') ||
      url.toLowerCase().includes('google-analytics') ||
      url.toLowerCase().includes('analytics') ||
      url.toLowerCase().includes('facebook.com') ||
      url.toLowerCase().includes('sentry') ||
      url.toLowerCase().includes('amplitude') ||
      url.toLowerCase().includes('intercom') ||
      url.toLowerCase().includes('datadog') ||
      url.toLowerCase().includes('newrelic') ||
      url.toLowerCase().includes('stripe.com') ||
      url.toLowerCase().includes('ads') ||
      url.toLowerCase().includes('tracking') ||
      url.toLowerCase().includes('pixel') ||
      url.toLowerCase().includes('gravatar')
    );
  };
  
  const filteredEvents = state.events.filter((e) => {
    // 首先过滤掉明显的垃圾请求
    if (isNonStreamRequest(e.url)) {
      return false;
    }
    
    // 然后应用用户的搜索过滤
    if (!ft) return true;
    const s = `${e.url} ${e.type} ${(e.payload?.event ?? '')}`.toLowerCase();
    return s.includes(ft);
  });
  
  const groups = groupEventsByRequest(filteredEvents);

  list.innerHTML = '';
  
  if (groups.length === 0) {
    list.innerHTML = `<div class="empty-state">${i18n.getMessage('emptyState')}</div>`;
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
      indicator.title = i18n.getMessage('connectionOpen');
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
    <h3 style="margin-top: 0; font-size: 14px; color: #666;">${i18n.getMessage('requestOverview')}</h3>
    <div style="margin-bottom: 16px;">
      <div style="font-size: 12px; color: #999; margin-bottom: 8px;">${i18n.getMessage('messagesCount', group.messages.length)}</div>
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
    { label: i18n.getMessage('labelUrl'), value: group.url },
    { label: i18n.getMessage('labelStreamId'), value: group.streamId || 'N/A' },
    { label: i18n.getMessage('labelConnectionStatus'), value: group.isOpen ? i18n.getMessage('statusOpen') : i18n.getMessage('statusClosed') },
    { label: i18n.getMessage('labelFirstTime'), value: new Date(group.firstTime).toLocaleString() },
    { label: i18n.getMessage('labelLastTime'), value: new Date(group.lastTime).toLocaleString() },
    { label: i18n.getMessage('labelMessageCount'), value: group.messages.length },
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
    { label: i18n.getMessage('labelStreamId'), value: group.streamId || 'N/A' },
    { label: i18n.getMessage('labelUrl'), value: event.url },
    { label: i18n.getMessage('labelTime'), value: new Date(event.time).toLocaleString() },
    { label: i18n.getMessage('labelType'), value: event.type },
    { label: i18n.getMessage('labelEvent'), value: event.payload?.event || 'message' },
  ];
  
  if (event.payload?.id) {
    infoRows.push({ label: i18n.getMessage('labelEventId'), value: event.payload.id });
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
