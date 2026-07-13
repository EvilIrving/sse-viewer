# 项目协作说明

SSE Inspector 是 Chrome 与 Edge 的 MV3 DevTools 扩展。只有用户打开 DevTools 中的 SSE Inspector 面板后，扩展才向所选标签页注入本地观察脚本；捕获的 SSE 内容不应发送到任何外部服务。

改动注入、权限或数据流前，先读 `agent.md`、`manifest.json` 和 `docs/privacy.html`；其中任一事实改变时，必须同步更新 README、隐私页、商店文案和发布检查表。发布前运行 `npm run release`，并按 `release-docs/release-checklist.md` 做 Chrome 与 Edge 手工验证。通用发布规则由全局 `browser-extension-baseline` 技能提供。
