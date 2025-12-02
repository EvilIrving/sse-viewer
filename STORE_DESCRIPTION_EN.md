SSE Viewer - Dedicated Debugging Panel for SSE Messages


🎯 What Problem Does It Solve?

While Chrome's Network panel can display SSE messages, the debugging experience is far from ideal:
• Difficult to quickly locate SSE requests
• Message content scattered across multiple EventStream tabs
• JSON requires manual copying to external tools for formatting
• Multiple SSE connections mixed together, hard to distinguish
• Cannot search through message history
• History is lost after page refresh

SSE Viewer provides a dedicated SSE debugging panel, enabling you to view and analyze SSE messages more efficiently.


✨ Feature Comparison: SSE Viewer vs Network Panel

📍 Finding SSE Requests
  Network Panel: ⚠️ Manual searching through numerous requests
  SSE Viewer: ✅ Automatically aggregated in dedicated SSE panel

📍 Viewing Message Content
  Network Panel: ⚠️ Click through EventStream records one by one
  SSE Viewer: ✅ All messages displayed chronologically

📍 Viewing JSON Data
  Network Panel: ❌ Manually copy content and paste into formatting tools
  SSE Viewer: ✅ One-click automatic formatting into readable JSON

📍 Distinguishing Multiple Connections
  Network Panel: ❌ Multiple SSE connections mixed together
  SSE Viewer: ✅ Automatically grouped by connection for clarity

📍 Searching Message History
  Network Panel: ❌ Search not supported
  SSE Viewer: ✅ Keyword search through message history

📍 Viewing History
  Network Panel: ⚠️ History lost after refresh
  SSE Viewer: ✅ Complete history retained in panel for easy review


🚀 How to Use

1️⃣ Open DevTools
Press F12, or right-click on the page and select "Inspect"

2️⃣ Switch to SSE Viewer Tab
Find "SSE Viewer" in the DevTools tab bar (alongside Network, Console, etc.)

3️⃣ Refresh the Page
The panel will automatically capture and display all SSE messages from the current page


🔒 Privacy and Security

This extension strictly follows the principle of minimum privilege, requesting only 3 necessary permissions:

1️⃣ activeTab (Access to Current Active Tab)
Used to map SSE messages from the page to the debugging panel when you open DevTools and switch to SSE Viewer. Only active on the current tab, does not scan other pages in the background.

2️⃣ scripting (Script Injection)
Used to inject interception scripts into the current page to capture SSE messages and send them to the DevTools panel for display. All processing is done locally.

3️⃣ storage (Local Storage)
Used to save minimal settings locally (such as UI preferences), does not involve your business data.


📊 Data Flow

Page SSE Data → Interception Script → DevTools Panel Display
             ↓
      Local processing only, no data uploaded

All SSE message data:
✅ Processed only in browser memory
✅ Not written to disk (unless you manually export)
✅ Not sent to any external servers
✅ Automatically cleared when you close DevTools or refresh the page


👥 Who Is It For

🧑‍💻 Web frontend or backend developers who frequently debug SSE interfaces
🤖 Engineers developing AI chat applications or streaming response apps based on SSE
📊 Developers building real-time push notifications, live feeds, dashboards, etc.
🧪 QA engineers testing SSE functionality and stability


💬 Feedback and Support

If you have any suggestions or questions while using this extension, feel free to contact:
📧 Email: jescain2024@gmail.com
