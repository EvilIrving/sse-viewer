SSE Viewer - SSE 消息专用调试面板


🎯 解决什么问题？

Chrome 的 Network 面板虽然可以看到 SSE 消息，但调试体验很差：
• 难以快速找到 SSE 请求
• 消息内容分散在多个 EventStream 标签里
• JSON 要手动复制到别的工具再格式化
• 多个 SSE 连接混在一起不易区分
• 无法搜索历史消息
• 刷新后历史记录丢失

SSE Viewer 提供一个专门的 SSE 调试面板，让你更高效地查看和分析 SSE 消息。


✨ 功能对比：SSE Viewer vs Network 面板

📍 找到 SSE 请求
  Network 面板：⚠️ 需要在大量请求中手动翻找
  SSE Viewer：✅ 自动汇总到专门的 SSE 面板

📍 查看消息内容
  Network 面板：⚠️ 需要逐个点击 EventStream 记录
  SSE Viewer：✅ 按时间顺序直接展示所有消息

📍 查看 JSON 数据
  Network 面板：❌ 手动复制内容，再粘贴到工具里格式化
  SSE Viewer：✅ 点击即可自动格式化为易读的 JSON

📍 区分多个连接
  Network 面板：❌ 多个 SSE 连接混在一起难以区分
  SSE Viewer：✅ 按连接自动分组，清晰展示

📍 搜索历史消息
  Network 面板：❌ 不支持搜索
  SSE Viewer：✅ 支持关键词搜索历史消息

📍 查看历史记录
  Network 面板：⚠️ 刷新后历史记录丢失
  SSE Viewer：✅ 在面板中保留完整历史，方便回看


🚀 如何使用

1️⃣ 打开 DevTools
按 F12，或在页面上右键选择「检查」

2️⃣ 切换到 SSE Viewer 标签
在 DevTools 标签栏中找到「SSE Viewer」（与 Network、Console 同一位置）

3️⃣ 刷新页面
面板会自动捕获并展示当前页面的所有 SSE 消息


🔒 隐私和安全

本扩展严格遵守最小权限原则，只请求 3 个必要权限：

1️⃣ activeTab（访问当前活动标签页）
用于在你打开 DevTools、切换到 SSE Viewer 时，将该页面的 SSE 消息映射到调试面板。只在当前活动标签生效，不会后台扫描其他页面。

2️⃣ scripting（脚本注入）
用于向当前页面注入拦截脚本，以便捕获 SSE 消息并发送到 DevTools 面板展示。所有处理都在本地完成。

3️⃣ storage（本地存储）
用于在本地保存少量设置（例如界面偏好等），不涉及你的业务数据。


📊 数据流向

页面的 SSE 数据 → 拦截脚本 → DevTools 面板显示
             ↓
      仅本地处理，不上传任何数据

所有 SSE 消息数据：
✅ 仅在浏览器内存中处理
✅ 不写入磁盘（除非你手动导出）
✅ 不发送到任何外部服务器
✅ 当你关闭 DevTools 或刷新页面时，会自动清空


👥 适合谁

🧑‍💻 需要频繁调试 SSE 接口的 Web 前端或后端开发者
🤖 开发基于 SSE 的 AI 对话应用、流式响应应用的工程师
📊 构建实时推送、通知、行情、看板等功能的开发者
🧪 测试 SSE 功能和稳定性的 QA 同学


💬 反馈与支持

如果你在使用过程中有任何建议或问题，欢迎联系：
📧 联系邮箱：jescain2024@gmail.com
