# SSE Inspector (Chrome / Edge DevTools 扩展) 工程契约

## 1. 项目核心定位与隐私安全边界

- **定位**：专为 Chrome 与 Edge 打造的 Manifest V3 开发者工具扩展（DevTools Extension）。用于在 DevTools 独立面板中捕获、解析与可视化网页中的 Server-Sent Events (SSE) 及长程流式传输数据。
- **数据隐私与零上传红线（Zero-Telemetry）**：
  - **纯本地闭环**：扩展捕获的所有网络流数据、请求头、响应载荷仅在浏览器内存与 DevTools 面板内流转，绝对不向任何外部服务器发送请求，严禁引入任何第三方埋点、遥测或远程统计 SDK。
  - **按需注入原则**：仅当用户主动打开 DevTools 并切换到 "SSE Inspector" 面板时，扩展才向当前激活的标签页动态注入观察脚本；DevTools 关闭或未激活该面板时不占用页面运行资源。
  - **权限最小化**：核心清单权限仅声明 `scripting` 与 `storage`；`host_permissions` 声明 `<all_urls>` 用于支持开发者在任意调试域名下分析 SSE 数据流。

## 2. 系统核心架构与四层通信总线

系统通过严格解耦的四层通信链路突破 Chrome MV3 安全沙盒隔离与 Service Worker 生命周期限制：

```text
页面主世界 (MAIN)          隔离世界 (ISOLATED)       后台 Service Worker        DevTools 面板
┌──────────────┐         ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│  inject.js   │ ──msg──>│  bridge.js   │ ──port─>│background.js │ ──port─>│   panel.js   │
│              │         │              │         │              │         │              │
│ 拦截 ES/fetch│ window. │  消息中转    │ runtime.│ 端口路由与   │ runtime.│  UI 渲染与   │
│ & getReader  │postMsg  │  重连队列    │ connect │ 生命周期心跳 │ connect │  双级列表交互│
└──────────────┘         └──────────────┘         └──────────────┘         └──────────────┘
```

### 2.1 主世界拦截层（`inject.js` - MAIN World）
- **执行环境**：目标页面主上下文，与网页应用 JavaScript 共享 Window 与全局对象。
- **拦截能力**：
  1. **原生 `window.EventSource` 包装**：重写构造函数并劫持原型链，深度监听 `open`、`message`、`error` 与 `close` 事件。
  2. **Fetch 响应流标记**：包装 `window.fetch`，嗅探响应头 `Content-Type: text/event-stream`，在 `response.body` 上打上 `__sse_viewer_url` 内部追踪标记。
  3. **`ReadableStream.prototype.getReader()` 猴子补丁（核心机制）**：
     - 全面拦截基于流式读取的第三方客户端库（如 `@microsoft/fetch-event-source`、`ai/react` 等）。
     - 在调用 `reader.read()` 时同步分流（Tee/Tap）捕获 Uint8Array 原始字节块并解码。
- **`streamId` 唯一标识机制**：
  - 针对每一个流实例，在 `getReader()` 触发时生成唯一连接标识：`stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`。
  - 所有后续产生的数据帧均绑定该 `streamId`，彻底解决相同 URL 多个并发长连接无法物理区分的难题。
- **上报机制**：通过 `window.postMessage` 向宿主窗口派发格式为 `{ __sse_viewer: true, type, url, time, payload }` 的事件。

### 2.2 隔离世界桥接层（`bridge.js` - ISOLATED World）
- **执行环境**：扩展内容脚本上下文，与页面共享 DOM 但享有独立的 JS 运行沙箱，具备调用 `chrome.runtime` 的权限。
- **消息转接**：监听 Window 上的 `message` 事件，严格校验 `event.data?.__sse_viewer === true` 签名，剥离内部标记后通过 `chrome.runtime.connect({ name: 'bridge' })` 端口转发至后台。
- **断线重连与弹性消息队列**：
  - 维护最大容量为 100 条的 `messageQueue` 环形缓冲。
  - 当后台 Service Worker 休眠导致端口断开（`onDisconnect`）时，自动将待发送消息存入队列，并在 5 秒后尝试重新建连；建连成功后按序排空并补发缓冲帧，避免首包丢失。

### 2.3 后台路由与保活中枢（`background.js` - Service Worker）
- **执行环境**：MV3 Service Worker 后台线程。
- **端口映射路由**：
  - 维护 `panels: Map<tabId, Port>` 与 `bridges: Map<tabId, Port>`，基于通信端口所属的 `tabId` 实现点对点精准路由。
- **按需动态注入**：
  - 收到面板发来的 `init` 握手报文后，调用 `chrome.scripting.executeScript` 先后向被调试标签页注入 `bridge.js`（ISOLATED 世界）与 `inject.js`（MAIN 世界），避免无效常驻。
- **Service Worker 生命周期保活（Keepalive Ping）**：
  - 应对 Chrome MV3 在无活动 30 秒后强制挂起 SW 的机制。
  - 当检测到存在活跃连接（panel 或 bridge）时，启动 20 秒周期的定时保活，连接全部关闭时自动注销定时器以释放宿主系统资源。

### 2.4 面板呈现与交互层（`panel.js` & `panel.html` - DevTools Panel）
- **UI 架构**：采用类似 Chrome Network 面板的左右/上下分割抽屉布局（1/3 概览列表 : 2/3 详情抽屉）。
- **双级树状列表**：
  - 一级为以 `streamId` 聚合的 SSE 连接会话（展示请求 URL、消息总数、连接打开时间、🟢/⚫ 活跃状态）。
  - 二级为展开后按时间线排列的具体事件消息项（展示序号、事件类型、时间戳及载荷摘要）。
- **详情抽屉三 Tab 架构**：
  - **Data**：JSON 自动美化排版与着色展示。
  - **Headers**：展示 Stream ID、URL、连接生命周期状态与协议元信息。
  - **Raw**：SSE 原始文本帧或未经处理的原始载荷。
- **前端弹性重连**：面板端口意外断开时，3 秒后自动重试（上限 10 次），右上角给出状态提示，且重连期间完整保留 `state.events` 内存数据。
- **国际化（i18n）**：原生支持 `zh_CN`、`en`、`ja`、`fr` 四种语言，自动根据浏览器语言环境匹配。

## 3. 协议支持与数据流解析规范

扩展内置对以下数据传输协议的鲁棒解析能力：

1. **标准 HTML5 SSE 协议**：
   - 遵循 WHATWG Server-Sent Events 规范。
   - 解析以 `\r?\n\r?\n` 切分的事件帧，提取 `data:`、`event:`、`id:`、`retry:` 字段，自动合并多行 `data:` 载荷。
2. **纯 JSON 换行流（NDJSON / Line-delimited JSON）**：
   - 针对现代 LLM Agent / Chat API 常见的不带 `data:` 前缀的流式 HTTP 响应。
   - 逐行提取 JSON 对象，自动嗅探顶层 `type` / `event` 字段作为事件分类。
3. **数据结构 Schema**：
   ```typescript
   interface SSEInspectorMessage {
     __sse_viewer: boolean;
     type: 'open' | 'message' | 'error' | 'close' | 'stream-open' | 'stream-close';
     url: string;
     time: string;
     payload: {
       streamId: string;
       data?: string | object;
       event?: string;
       id?: string;
       retry?: number;
     };
   }
   ```
4. **实时过滤逻辑**：
   - 顶栏搜索框支持不区分大小写的模糊匹配，联动匹配 `url`、`type` 与 `event` 字段，秒级响应并即时过滤列表视图。

## 4. 构建、验证与发布流程

项目采用原生 ES Module 与零打包器（No-Bundler）极简工程链路，直接保障代码透明可审。

- **验证指令**：
  ```bash
  # 1. 清单格式、规范与必需资源完整性自检
  npm run validate
  
  # 2. 生成 Chrome 与 Edge 发布双端 ZIP 压缩包
  npm run package
  
  # 3. 检查打包归档内容，杜绝源码与临时文件泄露
  npm run release:check
  
  # 4. 一键串联完整发布前流水线
  npm run release
  ```
- **多端打包机制（`scripts/package.mjs`）**：
  - 读取根目录 `manifest.json` 版本号，清理并重建 `build/package/` 临时目录。
  - 分别向 `build/package/chrome` 与 `build/package/edge` 阶段目录拷贝运行时必需文件：`background.js`、`bridge.js`、`devtools.html`、`devtools.js`、`inject.js`、`panel.html`、`panel.js`、各尺寸图标与 `_locales/`。
  - 调用系统原生 `zip -X -q -r` 命令，输出到 `releases/sse-inspector-{chrome,edge}-v${version}.zip`。
- **发布多文件联动契约**：
  - 变更版本或接口功能时，必须同步核验以下文件：
    1. `manifest.json`：`version` 字段。
    2. `package.json`：`version` 字段保持一致。
    3. `docs/privacy.html`：权限或网络行为变化时更新隐私说明。
    4. `README.md` 与 `_locales/`：更新多语言文档与商店宣传文案。
    5. `release-docs/release-checklist.md`：严格逐项勾选双浏览器手工验证项。
