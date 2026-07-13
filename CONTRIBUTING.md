# 贡献说明

提交问题时请提供扩展版本、浏览器版本、目标页面类型、可公开的复现步骤与预期结果。不要附带令牌、私有地址或捕获到的 SSE 消息内容。

改动权限、注入逻辑或数据处理时，必须同步更新 README、`docs/privacy.html`、`release-docs/` 和 `AGENTS.md`。提交前运行 `npm run release`，并在 Chrome 与 Edge 中做 DevTools 冒烟验证。
