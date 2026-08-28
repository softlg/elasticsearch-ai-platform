# 贡献指南

感谢你的贡献！提交 Issue 或 Pull Request 前，请先阅读 README 和 SECURITY.md。

## 本地开发

1. 按 README 完成 Python、Node.js、Elasticsearch 和 LLM 配置。
2. 后端测试：`cd backend && pytest`。
3. 前端检查：`cd frontend && npm run check`，构建：`npm run build`。

## Pull Request 要求

- 说明变更目的、主要改动和测试结果。
- 新功能或 Bug 修复应补充测试。
- 不提交 `.env`、密钥、真实日志、`node_modules` 或构建产物。
- 保持中英文界面文案、API 文档和类型定义同步。
- 破坏性变更请在 PR 描述和 CHANGELOG.md 中明确说明。

## Commit 建议

提交信息使用简洁的动词开头，例如 `fix: handle empty mapping`、`feat: add follow-up analysis`。
