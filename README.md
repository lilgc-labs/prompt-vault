# Prompt Vault

Prompt Vault 是一个本地优先的 Prompt 管理工具，面向高频使用 AI 的个人和小团队。它不负责调用大模型，也不默认把 Prompt 发送到云端，而是帮助用户把可复用的 Prompt 从零散文本沉淀为可分类、可检索、可版本化、可导入导出的本地资产。

## 项目定位

在日常 AI 使用中，Prompt 往往散落在聊天记录、文档、笔记和临时文件里，复用时需要反复查找、复制和改写。Prompt Vault 试图解决的是 Prompt 的沉淀、整理和复用问题：

- 把 Prompt 从一次性文本变成本地资产。
- 用场景、标签、搜索和收藏降低查找成本。
- 用版本记录和恢复能力支持持续迭代。
- 用 JSON 导入导出支持迁移、备份和分享。
- 用本地 SQLite 存储降低隐私和依赖风险。

## 核心功能

- 创建、编辑、删除 Prompt。
- 收藏和置顶常用 Prompt。
- 使用场景和标签组织 Prompt。
- 搜索标题、描述、正文、使用场景、模型提示和标签名称。
- 自动保留 Prompt 版本历史。
- 恢复历史版本。
- 对比不同版本的 Prompt 内容差异。
- 导入和导出 JSON 分享包，包含 prompts、tags、scenes 和 versions。
- 支持本地 Web 应用和 Electron 桌面端。

## 当前不包含

- 不调用 LLM API。
- 不提供 Agent 工作流编排。
- 不包含云同步、账号系统、SSO、权限管理或审计日志。
- 不支持实时多人协同编辑。

## 技术栈

- 前端：React、TypeScript、Vite
- 后端：Fastify
- 存储：Node.js `node:sqlite` + SQLite FTS5
- 桌面端：Electron
- 测试：Vitest、Testing Library、jsdom

## 运行要求

- Node.js 24 或更高版本
- npm

本项目使用 Node.js 内置的 `node:sqlite`，因此需要 Node.js 24+。

## 快速开始

安装依赖：

```bash
npm install
```

启动本地 Web 应用并自动打开浏览器：

```bash
npm run open:web
```

Windows 用户也可以双击：

```text
Prompt Vault Web.cmd
```

固定本地入口：

```text
http://127.0.0.1:4317
```

使用本地网站时需要保持终端窗口运行。停止服务可按 `Ctrl+C`。

## 常用命令

同时启动 API 和 Vite 开发服务：

```bash
npm run dev
```

开发环境入口：

```text
http://127.0.0.1:5173
```

构建前端资源：

```bash
npm run build
```

启动生产模式本地服务：

```bash
npm start
```

启动桌面端：

```bash
npm run desktop
```

构建 Windows 桌面安装包/应用包：

```bash
npm run make:win
```

## 本地数据与隐私

Web 应用和 Electron 桌面端默认共用同一个本地 SQLite 数据库。

默认数据库位置：

```text
Windows: %APPDATA%\Prompt Vault\prompt-vault.sqlite
macOS: ~/Library/Application Support/Prompt Vault/prompt-vault.sqlite
Linux: ~/.local/share/prompt-vault/prompt-vault.sqlite
```

首次启动时，如果共享用户数据目录中还没有数据库，应用会尝试从旧的项目内数据库位置迁移：

```text
data/prompt-vault.sqlite
```

也可以通过环境变量覆盖数据库路径：

```bash
PROMPT_VAULT_DB=/path/to/prompt-vault.sqlite npm start
```

## 导入导出

导出文件为 JSON 格式，适合用于备份、迁移或分享 Prompt 包。导出内容包含：

- Prompt 基础信息
- 标签
- 场景
- 版本历史
- 作者和导出时间等元数据

导入时会进行基础结构校验，避免格式不完整的数据直接写入本地数据库。

## 测试

运行测试：

```bash
npm test
```

如果在 Windows 环境中遇到 Vitest fork pool 较慢或不稳定，可以使用：

```bash
npm test -- --pool=threads
```

## 仓库说明

以下生成文件和本地文件不会提交到仓库：

- `node_modules/`
- `dist/`
- `out/`
- `data/`
- `tmp/`
- `.vs/`
- 本地 `.env` 文件

## License

MIT
