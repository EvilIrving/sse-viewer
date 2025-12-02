# SSE Viewer Chrome 扩展项目说明

## 项目概述
SSE Viewer 是一个 Chrome DevTools 扩展，用于捕获和可视化网页中的 Server-Sent Events (SSE) 流数据。支持原生 EventSource API、基于 fetch 的 text/event-stream 请求，以及 `@microsoft/fetch-event-source` 等第三方 SSE 库。

**版本**: 0.1.0  
**Manifest 版本**: 3

## 核心功能
- ✅ 拦截并监听原生 `EventSource` 连接
- ✅ 拦截并解析 `fetch` 请求中的 `text/event-stream` 响应
- ✅ **支持 `@microsoft/fetch-event-source` 库**（通过 `ReadableStream.getReader()` 拦截）
- ✅ **支持纯 JSON 流格式**（逐行 JSON 对象）
- ✅ 实时展示 SSE 事件流（open、message、error、close）
- ✅ 支持事件过滤（按 URL 或事件名）
- ✅ **按 SSE 请求分组显示**（基于 `streamId` 唯一标识，支持相同 URL 的多个并发连接）
- ✅ **两级列表结构**（请求组 + 可展开的子消息列表）
- ✅ **侧边抽屉面板**（类似 Network 面板的交互体验）
- ✅ **多 Tab 详情展示**（Data / Headers / Raw）
- ✅ JSON 数据自动解析和美化显示
- ✅ 事件列表清空功能
- ✅ 可选的调试日志模式
- ✅ **国际化支持**（中英日法四种语言，Beta 版支持手动切换，正式版自动适配浏览器语言）

## 架构设计

### 整体架构
```
页面世界 (MAIN)           隔离世界 (ISOLATED)      后台 (Service Worker)     DevTools 面板
┌──────────────┐         ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│  inject.js   │ ──msg──>│  bridge.js   │ ──port─>│background.js │ ──port─>│   panel.js   │
│              │         │              │         │              │         │              │
│ 拦截 ES/fetch│         │   消息转发   │         │  端口路由    │         │  UI 渲染     │
└──────────────┘         └──────────────┘         └──────────────┘         └──────────────┘
```

### 通信流程
1. **DevTools 打开** → `devtools.js` 创建面板 → `panel.js` 连接后台
2. **后台接收 init** → 注入 `bridge.js` (ISOLATED) 和 `inject.js` (MAIN)
3. **inject.js 拦截事件** → `postMessage` 发送到主窗口
4. **bridge.js 监听** → 通过 `chrome.runtime.connect` 转发到后台
5. **background.js 路由** → 根据 tabId 转发到对应面板
6. **panel.js 渲染** → 展示事件列表和数据

## 文件说明

### 配置文件
#### `manifest.json`
扩展配置清单文件：
- **name/description**: 使用 `__MSG_*__` 格式支持国际化
- **default_locale**: `en` - 默认语言为英文
- **permissions**: `scripting`, `storage` - 允许脚本注入和数据存储
- **host_permissions**: `<all_urls>` - 所有域名权限
- **devtools_page**: `devtools.html` - DevTools 入口
- **background**: Service Worker 后台脚本

---

### 核心脚本

#### `inject.js` - 主世界脚本（MAIN World）
**执行环境**: 页面主世界，与网页 JavaScript 共享上下文  
**职责**: 拦截和监听 SSE 相关 API

**关键功能**:
1. **拦截 EventSource**
   - 包装原生 `window.EventSource` 构造函数
   - 监听 `open`、`message`、`error` 事件
   - 重写 `close` 方法以捕获关闭事件
   - 保留原型链和静态属性 (CONNECTING/OPEN/CLOSED)

2. **拦截 ReadableStream.getReader()** ⭐ **核心机制**
   - 包装 `ReadableStream.prototype.getReader` 方法
   - 这是拦截 `@microsoft/fetch-event-source` 等库的关键
   - 在 `reader.read()` 时同步捕获流数据
   - 支持标准 SSE 格式和纯 JSON 流格式
   - 自动识别流类型并解析

3. **标记 SSE 流（fetch 拦截）**
   - 包装 `window.fetch` 函数
   - 检测响应头 `Content-Type: text/event-stream`
   - 在 `response.body` 上标记 `__sse_viewer_url`
   - 供 `getReader()` 拦截器识别 SSE 流
   - 在 `getReader()` 时生成唯一 `streamId` 标识该连接

4. **智能解析**
   - **标准 SSE 格式**: 解析 `data:`、`event:`、`id:`、`retry:` 字段
   - **纯 JSON 流**: 逐行解析 JSON，从 `json.type` 提取事件类型
   - 自动尝试 JSON 解析并展示

5. **消息发送**
   - 通过 `window.postMessage` 发送事件到 bridge
   - 消息格式: `{__sse_viewer: true, type, url, time, payload}`

**事件类型**:
- `open` - EventSource 连接打开
- `message` - 接收到 SSE 消息（携带 `streamId`）
- `error` - 连接错误
- `close` - EventSource 关闭
- `stream-open` - fetch 流打开（携带 `streamId`）
- `stream-close` - fetch 流关闭（携带 `streamId`）
- `warn` - 内部警告/错误

**streamId 机制**:
- 每个 `ReadableStream` 实例在 `getReader()` 时生成唯一 ID
- 格式：`stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
- 所有该连接的消息都携带相同的 `streamId`
- 用于区分相同 URL 的多个并发连接

---

#### `bridge.js` - 内容脚本（ISOLATED World）
**执行环境**: 隔离世界，与页面脚本隔离但共享 DOM  
**职责**: 作为中间桥梁，转发主世界消息到扩展后台

**工作流程**:
1. 通过 `chrome.runtime.connect({name: 'bridge'})` 连接后台
2. 监听 `window.message` 事件
3. 过滤标记为 `__sse_viewer` 的消息
4. 通过 `port.postMessage` 转发到后台

**断线重连机制** ⭐:
1. **消息队列**: 维护 `messageQueue` 缓存断线期间的消息（最大 100 条）
2. **连接状态**: `isConnected` 标记当前连接状态
3. **自动重连**: 端口断开时，5 秒后自动尝试重连
4. **队列发送**: 重连成功后，优先发送队列中的缓存消息
5. **容错处理**: 发送失败时自动加入队列，避免消息丢失

**为何需要**: 
- 主世界脚本无法直接使用 Chrome Extension API
- 必须通过内容脚本作为中转站
- 应对 Chrome MV3 的 Service Worker 休眠机制

---

#### `background.js` - Service Worker 后台
**执行环境**: Service Worker（后台常驻）  
**职责**: 管理端口连接，路由消息，注入脚本

**数据结构**:
- `panels: Map<tabId, Port>` - 面板端口映射
- `bridges: Map<tabId, Port>` - 桥接端口映射
- `injectedTabs: Set<tabId>` - 已注入脚本的标签页

**核心逻辑**:
1. **Panel 连接** (`port.name === 'panel'`)
   - 接收 `init` 消息，存储 tabId 和 port
   - 使用 `chrome.scripting.executeScript` 注入脚本
     - 先注入 `bridge.js` (ISOLATED 世界)
     - 再注入 `inject.js` (MAIN 世界)
   - 注入失败时发送错误消息到面板
   - 启动心跳机制保持 Service Worker 活跃

2. **Bridge 连接** (`port.name === 'bridge'`)
   - 从 `port.sender.tab.id` 获取 tabId
   - 接收消息后查找对应的 panel port
   - 转发消息到面板
   - 启动心跳机制

3. **端口清理**
   - 监听 `onDisconnect` 事件
   - 从 Map 中移除断开的端口
   - 无活跃连接时停止心跳

4. **Service Worker 生命周期管理** ⭐
   - 监听 `onStartup` 和 `onInstalled` 事件进行初始化
   - 使用心跳机制（`setInterval` 20秒）保持 Service Worker 活跃
   - 有活跃连接时启动心跳，无连接时停止心跳以节省资源
   - 详细的连接生命周期日志便于调试
   - 防止 30 秒空闲后休眠导致的连接断开

---

#### `devtools.js` - DevTools 入口
**执行环境**: DevTools 页面  
**职责**: 创建 DevTools 面板

**流程**:
1. 调用 `chrome.devtools.panels.create` 创建 "SSE Viewer" 面板
2. 监听 `onShown` 事件（面板首次显示时触发）
3. 连接后台并发送 `init` 消息，传递 `chrome.devtools.inspectedWindow.tabId`

---

#### `panel.js` - 面板逻辑
**执行环境**: DevTools 面板页面  
**职责**: UI 渲染、用户交互和国际化

**状态管理**:
```javascript
state = {
  events: [],              // 事件列表
  filterText: '',          // 过滤关键字
  expandedRequests: Set(), // 展开的请求组
  selectedRequest: null    // 选中的请求 {requestKey, messageIndex}
}
```

**国际化工具** (`i18n` 对象):
- `getMessage(key, substitutions)` - 获取翻译文本
- `init()` - 初始化页面所有 i18n 元素
- `getCurrentLanguage()` - 获取当前语言（优先自定义设置，其次浏览器语言）
- `setLanguage(lang)` - 保存语言设置到 `chrome.storage.local`（Beta 功能）

**分组键生成规则**:
```javascript
function getRequestKey(event) {
  // 优先使用 streamId（来自 stream-open/close/message 事件）
  if (event.payload?.streamId) {
    return event.payload.streamId;
  }
  // 对于旧的 EventSource 事件，使用 URL
  return event.url;
}
```

**功能实现**:
1. **连接后台** ⭐
   - 建立 `chrome.runtime.connect({name: 'panel'})` 连接
   - 发送 `init` 消息触发脚本注入
   - 监听消息并追加到 `state.events`
   - **断线重连机制**:
     - 端口断开时，3 秒后自动尝试重连
     - 最多重连 10 次，避免无限重连
     - 显示重连状态提示（右上角通知）
     - 重连成功后保留已有数据，不影响用户体验

2. **请求分组**（基于 `streamId`）
   - 为每个 `ReadableStream` 实例生成唯一的 `streamId`
   - 按 `streamId` 分组，完全不依赖 URL 或业务字段
   - 支持同一 URL 的多个并发连接准确区分
   - 显示连接状态（🟢 打开中 / ⚫ 已关闭）

3. **两级列表展示**
   - **请求头**: 显示 URL、消息数量、时间
   - **子消息列表**: 点击展开图标显示该请求下的所有消息
   - 支持独立展开/收起每个请求组

4. **侧边抽屉面板**（宽度比例 1/3 列表 : 2/3 抽屉）
   - **点击请求头**: 显示该请求的概览（所有消息汇总）
   - **点击子消息**: 显示该消息的详细信息
   - 包含 3 个 Tab 标签页：
     - **Data**: 格式化的 JSON 数据
     - **Headers**: 元信息（Stream ID、URL、连接状态、时间、事件类型等）
     - **Raw**: 原始完整数据

5. **过滤功能**
   - 监听 `#filter` 输入框
   - 按 URL、type、event 字段模糊匹配

6. **清空功能**
   - 点击 `#clear` 按钮清空 `state.events`
   - 同时关闭抽屉并重置选中状态

---

### 界面文件

#### `panel.html`
DevTools 面板的 HTML 结构：
- **Header**: 过滤输入框 + 工具栏（语言选择器[Beta] + 清空按钮）
- **Container**: Flex 布局容器
  - **列表区域** (33.33% 当抽屉打开时): 
    - 请求组（request-group）
    - 请求头（request-header）：带展开图标、URL、消息数量、时间
    - 子消息列表（message-list）：可展开显示子消息项
  - **抽屉面板** (66.67% 当打开时):
    - 抽屉头部：标题 + 关闭按钮
    - Tab 标签页：Data / Headers / Raw
    - Tab 内容区：对应的详细信息
- **国际化属性**:
  - `data-i18n`: 用于元素文本内容的翻译
  - `data-i18n-placeholder`: 用于 input placeholder 的翻译
- **样式**: 
  - 类似 Network 面板的列表设计
  - 平滑的展开/收起动画
  - 选中状态高亮（蓝色背景 + 左边框）
  - 悬停效果和过渡动画

#### `devtools.html`
DevTools 入口页面，仅引入 `devtools.js`

---

### 国际化文件

#### `_locales/{locale}/messages.json`
支持的语言：
- `zh_CN` - 简体中文
- `en` - English
- `ja` - 日本語
- `fr` - Français

**文件结构**:
```json
{
  "extName": {
    "message": "SSE Viewer BETA",
    "description": "Extension name"
  },
  "filterPlaceholder": {
    "message": "按 URL 或事件名过滤（支持关键字）",
    "description": "Filter input placeholder"
  },
  "messagesCount": {
    "message": "共 $COUNT$ 条消息",
    "description": "Messages count",
    "placeholders": {
      "count": {
        "content": "$1",
        "example": "10"
      }
    }
  }
}
```

**翻译的内容**:
- 扩展名称和描述
- UI 标签（按钮、Tab、标题）
- 提示信息（连接状态、错误信息）
- 数据字段标签（URL、Stream ID、时间等）

---

## 技术要点

### 1. 脚本注入策略
- **ISOLATED 世界**: 内容脚本，可访问 DOM 和 Chrome API
- **MAIN 世界**: 页面脚本，可访问页面 JavaScript 对象（如 `EventSource`）
- **注入时机**: DevTools 面板首次打开时动态注入

### 2. SSE 协议解析
**规范**: [HTML Living Standard - Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)

**支持的格式**:

#### 标准 SSE 格式
```
data: 消息内容
event: 事件类型
id: 事件ID
retry: 重连间隔

```

**解析逻辑**:
- 按 `\r?\n\r?\n` 分割帧
- 按 `\r?\n` 分割行
- 识别 `data:`、`event:`、`id:`、`retry:` 前缀
- `data:` 后的空格会被移除（符合 SSE 规范）
- 自动尝试 JSON 解析

#### 纯 JSON 流格式（非标准 SSE）
```json
{"code": 0, "message": "success", "data": {...}}
{"type": "statusUpdate", "timestamp": 1234567890}
```

**解析逻辑**:
- 检测响应不包含 `data:` 或 `event:` 前缀
- 按行分割（`\r?\n`）
- 逐行解析 JSON
- 从 `json.type` 提取事件类型（如果存在）
- 兼容 `@microsoft/fetch-event-source` 等库的使用场景

### 3. 端口通信模式
使用 `chrome.runtime.connect` 建立长连接：
- **优点**: 双向通信，事件驱动，自动管理生命周期
- **消息流**: inject → bridge → background → panel
- **路由机制**: 后台根据 tabId 维护端口映射表

### 4. 错误处理
- `try-catch` 包裹所有拦截代码，避免影响页面功能
- 注入失败时发送错误消息到面板
- 解析失败时保留原始数据展示

---

## 开发建议

### 扩展功能
1. **导出功能**: 支持导出事件列表为 JSON/CSV
2. **时间线视图**: 可视化 SSE 连接的时间轴
3. **自动重连监控**: 追踪 SSE 重连次数和间隔
4. **性能统计**: 消息速率、流量统计
5. **请求对比**: 对比不同 conversation_id 的消息差异
6. **正式版语言切换移除**: 移除 Beta 版的语言选择器，仅保留自动检测

### 代码优化
1. **内存管理**: 限制 `state.events` 最大长度，自动清理旧数据
2. **虚拟滚动**: 大量事件时优化渲染性能
3. **TypeScript**: 添加类型定义提升可维护性
4. **搜索优化**: 支持正则表达式和高级过滤条件

### 调试技巧
1. **查看 Service Worker 日志**: `chrome://extensions` → 查看视图 → Service Worker
2. **查看 inject.js 日志**: 页面控制台（Console）
3. **查看 panel.js 日志**: DevTools 面板右键 → 检查
4. **测试 SSE**: 使用 [SSE 测试工具](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)

---

# 常见问题

### Q1: 为什么 Service Worker 显示“无效”？
**A**: 这通常是 Chrome MV3 的正常行为，有以下几种情况：

**1. Service Worker 自动休眠（正常行为）**
- Chrome MV3 的 Service Worker 在空闲 30 秒后会自动休眠以节省资源
- 显示为“无效”状态不代表出错，Service Worker 会在需要时自动唤醒
- 当有消息传递、端口连接等事件时会自动激活

**2. 运行时错误导致崩溃**
- 查看方法：`chrome://extensions` → 点击 "Service Worker (无效)" 链接
- 检查控制台是否有红色错误信息
- 常见错误：未捕获的异常、端口发送失败等

**3. 保持活跃的解决方案** ⭐
- **已实现**：使用心跳机制：`setInterval` 定时执行简单操作（每 20 秒）
- 在有活跃连接时启动心跳，无连接时停止
- 参考 `background.js` 中的 `startKeepAlive()` 和 `stopKeepAlive()` 函数
- **断线重连机制**：`bridge.js` 和 `panel.js` 都实现了自动重连，即使 Service Worker 休眠也不会丢失数据

**4. 诊断步骤**
- 重新加载扩展测试功能是否正常
- 查看 Service Worker 控制台日志
- 打开 DevTools 面板触发连接，观察是否自动唤醒

### Q2: 为什么需要三层脚本通信？
**A**: Chrome 扩展安全模型限制：
- 页面脚本（MAIN）可拦截 EventSource，但无法使用 Chrome API
- 内容脚本（ISOLATED）可使用 Chrome API，但无法访问页面对象
- Service Worker 可跨标签页通信和管理生命周期

### Q3: 如何支持更多 SSE 库？
**A**: 目前已覆盖：
- 原生 `EventSource`
- `fetch` + `ReadableStream` 模式
- **`@microsoft/fetch-event-source`**（通过 `ReadableStream.getReader()` 拦截）
- 其他基于 `fetch` 和 `getReader()` 的 SSE 库

若需支持自定义库（如 `xhr-streaming`），需在 `inject.js` 中添加对应拦截逻辑。

### Q4: 如何识别和分组不同的 SSE 请求？
**A**: 
- **✅ 推荐方案（已实现）**: 使用 `streamId` 唯一标识每个 SSE 连接
  - 每个 `ReadableStream` 实例生成唯一 ID：`stream_${timestamp}_${random}`
  - 在 `stream-open`、`message`、`stream-close` 事件中携带 `streamId`
  - 完全不依赖业务逻辑中的 `conversation_id` 等字段
  - **即使 URL 完全相同的多个并发连接也能准确区分**

- **原理**：浏览器通过对象实例区分连接
  - `EventSource`：每次 `new EventSource(url)` 创建独立的对象实例
  - `fetch`：每个 `Response.body` 是不同的 `ReadableStream` 实例
  - `ReadableStreamDefaultReader`：每个实例有独立的内存地址
  - 我们为每个实例分配 `streamId`，实现与浏览器相同的区分能力

### Q5: 性能影响如何？
**A**: 
- 拦截代码轻量，对页面性能影响极小
- 消息通过 `postMessage` 和端口传递，无阻塞
- 大量消息时可能影响面板渲染，建议添加虚拟滚动

---

## 相关资源
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [DevTools API](https://developer.chrome.com/docs/extensions/reference/devtools_panels/)
- [Server-Sent Events 规范](https://html.spec.whatwg.org/multipage/server-sent-events.html)

---

---

## 核心技术创新：streamId 机制

### 问题背景
浏览器如何区分相同 URL 的多个 SSE 连接？

### 浏览器原理
```javascript
// 即使 URL 相同，每次都创建不同的对象实例
const sse1 = new EventSource('https://api.example.com/stream');
const sse2 = new EventSource('https://api.example.com/stream');
// sse1 和 sse2 是两个完全独立的对象，有不同的内存地址和 TCP 连接

const res1 = await fetch('https://api.example.com/stream');
const res2 = await fetch('https://api.example.com/stream');
const reader1 = res1.body.getReader(); // 不同的 ReadableStreamDefaultReader 实例
const reader2 = res2.body.getReader(); // 不同的 ReadableStreamDefaultReader 实例
```

### 我们的解决方案
在 `inject.js` 中拦截 `ReadableStream.getReader()` 时：
```javascript
OriginalReadableStream.prototype.getReader = function(options) {
  const reader = origGetReader.call(this, options);
  
  if (this.__sse_viewer_url) {
    // 关键：为每个 ReadableStream 实例生成唯一 ID
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 所有该连接的事件都携带此 streamId
    post('stream-open', url, { streamId });
    // ...
    post('message', url, { streamId, ...msg });
    // ...
    post('stream-close', url, { streamId });
  }
};
```

### 优势
1. **完全独立于业务逻辑**：不依赖 `conversation_id`、`session_id` 等业务字段
2. **准确区分并发连接**：即使 URL 完全相同也能正确分组
3. **实时连接状态**：可显示每个连接的打开/关闭状态（🟢/⚫）
4. **符合浏览器语义**：基于对象实例的唯一性，与浏览器底层机制一致

---

**最后更新**: 2025-12-02  
**当前状态**: 已完成核心功能，支持主流 SSE 实现方式，提供类似 Network 面板的交互体验，采用 streamId 机制实现精准连接区分，**已实现完整的断线重连机制**，**已实现国际化支持（中英日法四种语言）**。

---

## 重连机制详解

### 问题背景
Chrome MV3 的 Service Worker 在空闲 30 秒后会自动休眠，导致：
1. 所有端口连接（`chrome.runtime.connect`）失效
2. Service Worker 内存状态（`panels` / `bridges` Map）丢失
3. 页面向已断开的端口发送消息时报错：**"连接已断开：扩展上下文已失效"**

### 解决方案

#### 1. Service Worker 心跳保活（`background.js`）
```javascript
// 每 20 秒执行一次简单操作，防止休眠
const KEEPALIVE_INTERVAL = 20000;
setInterval(() => {
  console.log('[SSE Viewer] Keepalive ping');
}, KEEPALIVE_INTERVAL);
```
- **何时启动**：有 panel 或 bridge 连接时
- **何时停止**：所有连接断开时，节省资源
- **效果**：延缓休眠，但不能完全防止（浏览器资源紧张时仍可能强制休眠）

#### 2. Bridge 重连机制（`bridge.js`）
**关键特性**：
- ✅ **消息队列**：断线期间缓存最多 100 条消息
- ✅ **自动重连**：端口断开后 5 秒自动重连
- ✅ **队列发送**：重连成功后立即发送缓存消息
- ✅ **容错处理**：发送失败自动加入队列，不丢失数据

**工作流程**：
```
SSE 消息到达 → inject.js 捕获 → postMessage → bridge.js
                                                  ↓
                                          判断连接状态
                                          │
                      ├───────────┼────────────┐
                      │                          │
                 已连接                      未连接
                      │                          │
              port.postMessage          加入 messageQueue
                      │                          │
              发送成功？                   等待重连
              │      │
             是     失败 → 加入队列
```

#### 3. Panel 重连机制（`panel.js`）
**关键特性**：
- ✅ **自动重连**：端口断开后 3 秒自动重连
- ✅ **重连限制**：最多重连 10 次，防止无限循环
- ✅ **状态提示**：右上角显示重连通知（橙色/红色）
- ✅ **数据保留**：重连时不清空 `state.events`，保留历史数据

**用户体验**：
- 断线时：显示“连接已断开，正在重连...”（橙色）
- 重连中：已有数据仍然可见，可正常查看
- 重连成功：通知自动消失，继续接收新消息
- 重连失败：显示“连接失败：请重新加载扩展”（红色）

### 为什么需要三层重连？
1. **Service Worker 心跳**：延缓休眠，减少断线频率
2. **Bridge 重连**：保证页面到后台的消息不丢失（SSE 消息源头）
3. **Panel 重连**：保证用户界面可用性，提供友好的错误提示
