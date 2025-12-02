# SSE Viewer - Dedicated Debugging Panel for SSE Messages

[简体中文](README.md) | English

> 🔍 A specialized Chrome DevTools extension designed for Server-Sent Events (SSE), making SSE debugging more efficient and convenient

## 📑 Table of Contents

- [What Problem Does It Solve?](#-what-problem-does-it-solve)
- [Feature Comparison](#-feature-comparison-sse-viewer-vs-network-panel)
- [How to Use](#-how-to-use)
- [Privacy and Security](#-privacy-and-security)
- [Who Is It For](#-who-is-it-for)
- [Feedback and Support](#-feedback-and-support)

## 🎯 What Problem Does It Solve?

While Chrome's Network panel can display SSE messages, the debugging experience is far from ideal:
- Difficult to quickly locate SSE requests
- Message content scattered across multiple EventStream tabs
- JSON requires manual copying to external tools for formatting
- Multiple SSE connections mixed together, hard to distinguish
- Cannot search through message history
- History is lost after page refresh

SSE Viewer provides a dedicated SSE debugging panel, enabling you to view and analyze SSE messages more efficiently.


## ✨ Feature Comparison: SSE Viewer vs Network Panel

| Feature | Network Panel | SSE Viewer |
|---------|---------------|------------|
| 📍 **Finding SSE Requests** | ⚠️ Manual searching through numerous requests | ✅ Automatically aggregated in dedicated SSE panel |
| 📍 **Viewing Message Content** | ⚠️ Click through EventStream records one by one | ✅ All messages displayed chronologically |
| 📍 **Viewing JSON Data** | ❌ Manually copy content and paste into formatting tools | ✅ One-click automatic formatting into readable JSON |
| 📍 **Distinguishing Multiple Connections** | ❌ Multiple SSE connections mixed together | ✅ Automatically grouped by connection for clarity |
| 📍 **Searching Message History** | ❌ Search not supported | ✅ Keyword search through message history |
| 📍 **Viewing History** | ⚠️ History lost after refresh | ✅ Complete history retained in panel for easy review |


## 🚀 How to Use

### 1️⃣ Open DevTools
Press `F12`, or right-click on the page and select "**Inspect**"

### 2️⃣ Switch to SSE Viewer Tab
Find "**SSE Viewer**" in the DevTools tab bar (alongside Network, Console, etc.)

### 3️⃣ Refresh the Page
The panel will automatically capture and display all SSE messages from the current page


## 🔒 Privacy and Security

This extension strictly follows the **principle of minimum privilege**, requesting only 3 necessary permissions:

### Permission Details

| Permission | Purpose | Scope |
|------------|---------|-------|
| `activeTab` | Access to current active tab | Only active when you open DevTools and switch to SSE Viewer |
| `scripting` | Script injection | To capture SSE messages, all processing is done locally |
| `storage` | Local storage | Save minimal UI settings, does not involve business data |

### 📊 Data Flow

```
Page SSE Data → Interception Script → DevTools Panel Display
             ↓
      Local processing only, no data uploaded
```

**All SSE message data:**
- ✅ Processed only in browser memory
- ✅ Not written to disk (unless you manually export)
- ✅ Not sent to any external servers
- ✅ Automatically cleared when you close DevTools or refresh the page


## 👥 Who Is It For

- 🧑‍💻 Web frontend or backend developers who frequently debug SSE interfaces
- 🤖 Engineers developing AI chat applications or streaming response apps based on SSE
- 📊 Developers building real-time push notifications, live feeds, dashboards, etc.
- 🧪 QA engineers testing SSE functionality and stability


## 💬 Feedback and Support

If you have any suggestions or questions while using this extension, feel free to contact:

📧 **Email**: [jescain2024@gmail.com](mailto:jescain2024@gmail.com)

---

<p align="center">Made with ❤️ for developers debugging SSE</p>
