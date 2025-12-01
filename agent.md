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
- ✅ JSON 数据自动解析和美化显示
- ✅ 事件列表清空功能
- ✅ 可选的调试日志模式

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
- **permissions**: `scripting` - 允许脚本注入
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

4. **智能解析**
   - **标准 SSE 格式**: 解析 `data:`、`event:`、`id:`、`retry:` 字段
   - **纯 JSON 流**: 逐行解析 JSON，从 `json.type` 提取事件类型
   - 自动尝试 JSON 解析并展示

5. **消息发送**
   - 通过 `window.postMessage` 发送事件到 bridge
   - 消息格式: `{__sse_viewer: true, type, url, time, payload}`

**事件类型**:
- `open` - EventSource 连接打开
- `message` - 接收到 SSE 消息
- `error` - 连接错误
- `close` - EventSource 关闭
- `stream-open` - fetch 流打开
- `stream-close` - fetch 流关闭
- `warn` - 内部警告/错误

---

#### `bridge.js` - 内容脚本（ISOLATED World）
**执行环境**: 隔离世界，与页面脚本隔离但共享 DOM  
**职责**: 作为中间桥梁，转发主世界消息到扩展后台

**工作流程**:
1. 通过 `chrome.runtime.connect({name: 'bridge'})` 连接后台
2. 监听 `window.message` 事件
3. 过滤标记为 `__sse_viewer` 的消息
4. 通过 `port.postMessage` 转发到后台

**为何需要**: 
- 主世界脚本无法直接使用 Chrome Extension API
- 必须通过内容脚本作为中转站

---

#### `background.js` - Service Worker 后台
**执行环境**: Service Worker（后台常驻）  
**职责**: 管理端口连接，路由消息，注入脚本

**数据结构**:
- `panels: Map<tabId, Port>` - 面板端口映射
- `bridges: Map<tabId, Port>` - 桥接端口映射

**核心逻辑**:
1. **Panel 连接** (`port.name === 'panel'`)
   - 接收 `init` 消息，存储 tabId 和 port
   - 使用 `chrome.scripting.executeScript` 注入脚本
     - 先注入 `bridge.js` (ISOLATED 世界)
     - 再注入 `inject.js` (MAIN 世界)
   - 注入失败时发送错误消息到面板

2. **Bridge 连接** (`port.name === 'bridge'`)
   - 从 `port.sender.tab.id` 获取 tabId
   - 接收消息后查找对应的 panel port
   - 转发消息到面板

3. **端口清理**
   - 监听 `onDisconnect` 事件
   - 从 Map 中移除断开的端口

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
**职责**: UI 渲染和用户交互

**状态管理**:
```javascript
state = {
  events: [],        // 事件列表
  filterText: '',    // 过滤关键字
  pretty: true       // JSON 美化开关
}
```

**功能实现**:
1. **连接后台**
   - 建立 `chrome.runtime.connect({name: 'panel'})` 连接
   - 发送 `init` 消息触发脚本注入
   - 监听消息并追加到 `state.events`

2. **过滤功能**
   - 监听 `#filter` 输入框
   - 按 URL、type、event 字段模糊匹配

3. **清空功能**
   - 点击 `#clear` 按钮清空 `state.events`

4. **JSON 美化**
   - 根据 `#jsonPretty` 复选框状态
   - 使用 `JSON.stringify(data, null, 2)` 格式化

5. **渲染逻辑**
   - 遍历过滤后的事件列表
   - 展示元数据：事件类型标签、时间戳、URL
   - 展示数据：优先显示 JSON 美化结果，否则显示原始数据

---

### 界面文件

#### `panel.html`
DevTools 面板的 HTML 结构：
- **Header**: 过滤输入框 + 工具栏（清空按钮 + JSON 美化开关）
- **List**: 事件列表容器
- **样式**: 简洁的卡片式设计，标签、时间戳、数据区

#### `devtools.html`
DevTools 入口页面，仅引入 `devtools.js`

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
3. **请求详情**: 显示请求头、响应头、连接状态
4. **自动重连监控**: 追踪 SSE 重连次数和间隔
5. **性能统计**: 消息速率、流量统计

### 代码优化
1. **事件去重**: 避免重复注入脚本
2. **内存管理**: 限制 `state.events` 最大长度
3. **虚拟滚动**: 大量事件时优化渲染性能
4. **TypeScript**: 添加类型定义提升可维护性

### 调试技巧
1. **查看 Service Worker 日志**: `chrome://extensions` → 查看视图 → Service Worker
2. **查看 inject.js 日志**: 页面控制台（Console）
3. **查看 panel.js 日志**: DevTools 面板右键 → 检查
4. **测试 SSE**: 使用 [SSE 测试工具](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)

---

## 常见问题

### Q1: 为什么需要三层脚本通信？
**A**: Chrome 扩展安全模型限制：
- 页面脚本（MAIN）可拦截 EventSource，但无法使用 Chrome API
- 内容脚本（ISOLATED）可使用 Chrome API，但无法访问页面对象
- Service Worker 可跨标签页通信和管理生命周期

### Q2: 如何支持更多 SSE 库？
**A**: 目前已覆盖：
- 原生 `EventSource`
- `fetch` + `ReadableStream` 模式
- **`@microsoft/fetch-event-source`**（通过 `ReadableStream.getReader()` 拦截）
- 其他基于 `fetch` 和 `getReader()` 的 SSE 库

若需支持自定义库（如 `xhr-streaming`），需在 `inject.js` 中添加对应拦截逻辑。

### Q3: 性能影响如何？
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

## 更新日志

### 2025-12-01 - v0.1.0
- ✅ 实现原生 `EventSource` 拦截
- ✅ 实现 `fetch` 拦截和标准 SSE 解析
- ✅ **新增 `ReadableStream.getReader()` 拦截**
  - 支持 `@microsoft/fetch-event-source` 库
  - 解决第三方库直接读取流导致无法捕获的问题
- ✅ **新增纯 JSON 流格式支持**
  - 自动检测非标准 SSE 格式
  - 逐行解析 JSON 对象
  - 从 `json.type` 提取事件类型
- ✅ 优化调试模式
  - 默认关闭调试日志
  - 通过 `sessionStorage.setItem('sse-viewer-debug', 'true')` 开启
- ✅ 修复流读取时的数据丢失问题
- ✅ 改进错误处理和异常捕获

---

**最后更新**: 2025-12-01  
**当前状态**: 已完成核心功能，支持主流 SSE 实现方式
