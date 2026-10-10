<p align="center">
  <img src="assets/logo.png" alt="ai-kit" width="200">
</p>

<h1 align="center">ai-kit</h1>

<p align="center">
  <strong>正确配置你的 AI 编程助手 — 只需 2 分钟</strong>
</p>

<p align="center">
  🌍 <a href="README.md">English</a> |
  <a href="README.kk.md">Қазақша</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.tr.md">Türkçe</a> |
  <strong>中文</strong> |
  <a href="README.ru.md">Русский</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/aidevkit"><img src="https://img.shields.io/npm/v/aidevkit?color=60a5fa&style=flat-square" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/aidevkit"><img src="https://img.shields.io/npm/dm/aidevkit?color=2dd4bf&style=flat-square" alt="npm downloads"></a>
  <a href="https://github.com/hasabasa/ai-kit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-daea6a?style=flat-square" alt="license"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-60a5fa?style=flat-square" alt="node version">
  <img src="https://img.shields.io/badge/%E4%BE%9D%E8%B5%96-0-2dd4bf?style=flat-square" alt="zero dependencies">
  <img src="https://img.shields.io/badge/%E8%AF%AD%E8%A8%80-17-daea6a?style=flat-square" alt="17 languages">
</p>

---

> ```
> ✦ ~45,562 token/请求 (冗余 2,590 · CLAUDE.md 42,088 · 技能 884)
> ≈ $47.67/月，按 150 请求/天计算
> ```
> 真实机器上的真实输出。臃肿配置的代价就是这么多。

<p align="center"><img src="assets/demo-zh.gif" alt="ai-kit 演示" width="700"></p>

---

## 这是什么？

**零依赖**，仅使用 Node 标准库。一个 CLI 工具：

1. **扫描**你的机器 — IDE、AI 扩展、CLI 工具、LLM、MCP 服务器、项目技术栈
2. **提问** — 约 10 个方向键选择题，大部分答案已从扫描中填好
3. **推荐** — 从 **20,669 个工具**的目录中挑选，每个都附带推荐理由
4. **安装** — 一次确认即可，同时禁用浪费 token 的冗余插件
5. **审计**现有配置：`doctor` — token/请求、$/月、臃肿的配置文件

支持 **Claude Code**，可检测 **Cursor**、**Gemini CLI**、**Codex**。界面已翻译为 **17 种语言**。

## 快速开始

```bash
npx aidevkit
```

或全局安装：

```bash
npm i -g aidevkit
```

## 命令

| 命令 | 功能 |
|---|---|
| `ai-kit` | 完整流程：扫描 → 问卷 → 方案 → 安装 |
| `ai-kit scan` | 仅盘点：IDE、扩展、CLI、LLM、MCP、技术栈 |
| `ai-kit discover` | 20k+ 工具目录，按你的技术栈排序 + GitHub 搜索 |
| `ai-kit doctor` | 审计：冗余插件、臃肿的 CLAUDE.md、token/请求、$/月 |
| `ai-kit doctor --fix` | 同上 + 禁用冗余插件（会先征求确认） |
| `ai-kit update` | 从保存的配置文件重新生成方案，无需问卷 |

## 参数

| 参数 | 效果 |
|---|---|
| `--dry-run` | 只显示方案，不做任何修改 |
| `--yes` | 跳过确认提示 |
| `--lang zh` | 跳过语言选择界面 |
| `--no-open` | 不自动打开 HTML 报告 |
| `--json` | 输出机器可读的 doctor 结果（用于 CI） |
| `--requests N` | 自定义每日请求数以估算费用 |

完整列表：`npx aidevkit --help`

## 工作原理

### 1. 扫描

ai-kit 在提问之前先扫描你的机器：

- **IDE**：VS Code、Cursor、Zed、Neovim、JetBrains、Xcode、Android Studio
- **AI 工具**：Claude Code、Cursor、Gemini CLI、Codex、Cline、Windsurf、Copilot
- **配置文件**：`.claude/`、MCP 配置、CLAUDE.md、技能、插件
- **项目技术栈**：从 `package.json`、`requirements.txt`、`go.mod`、`Cargo.toml` 等读取
- **LLM**：Ollama 模型、LM Studio、云端 API 密钥

### 2. 问卷

约 10 个方向键选择题。大部分答案已从扫描中预填：

- 角色和经验水平
- 编程语言和框架
- 数据库和云服务
- 工作方式：手动编码还是 vibe-coding，每天几小时
- 当前配置中最让你烦恼的是什么
- 每个问题都可以自由输入

### 3. 方案

每个推荐的工具包含：
- **一行说明** — 为什么需要它
- **"为什么适合你"** — 与你的回答相关联
- **冲突检测** — 不会安装互相冲突的工具

冗余会被标记：业务技能包（销售、法务、人力资源、财务...）每次请求都会加载，对开发者毫无用处。

### 4. 安装

一个 `y` 安装全部。通过各工具的原生命令执行（`claude mcp add`、`uv tool install` 等）。没有你的明确确认，什么都不会运行。

### 5. Doctor

```
✦ ~45,562 token/请求 (冗余 2,590 · CLAUDE.md 42,088 · 技能 884)
≈ $47.67/月，按 150 请求/天计算

冗余（每次请求都加载，毫无用处）：
  ✗ sales-navigator         1,240 token
  ✗ legal-review               850 token
  ✗ hr-toolkit                 500 token
```

`doctor --fix` 禁用冗余插件，会先展示具体操作内容。`--json` 输出机器可读结果，适用于 CI。

## 目录

**20,669 个工具**，按类别分：

- **MCP 服务器** — 数据库连接器、API 集成、文件工具、云服务
- **Claude Code 技能** — 代码审查、测试、部署、文档
- **Cursor 规则** — 按框架、按语言、按工作流
- **插件** — 代码检查、格式化、调试、性能分析
- **CLI 工具** — 通过 npm、pip、cargo、brew 安装的开发工具

## 支持的助手

| 助手 | 扫描 | 安装（自动） | 安装（手动） | Doctor |
|---|:---:|:---:|:---:|:---:|
| Claude Code | ✅ | ✅ `claude mcp add` | ✅ | ✅ 冗余 + 配置 |
| Cursor | ✅ | ✅ 写入 `mcp.json` | ✅ | ✅ 配置 |
| Gemini CLI | ✅ | ✅ `gemini mcp add` | ✅ | ✅ 配置 |
| Antigravity | ✅ | ✅ 写入 `mcp_config.json` | ✅ | ✅ 配置 |
| Codex | ✅ | ✅ `codex mcp add` | ✅ | ✅ 配置 |
| Windsurf | ✅ | ✅ 写入 `mcp_config.json` | ✅ | ✅ 配置 |
| Cline | ✅ | ✅ 写入 `mcp_settings.json` | ✅ | ✅ 配置 |

## 语言

🇺🇸 English · 🇷🇺 Русский · 🇰🇿 Қазақша · 🇪🇸 Español · 🇧🇷 Português · 🇫🇷 Français · 🇩🇪 Deutsch · 🇹🇷 Türkçe · 🇮🇩 Bahasa · 🇵🇱 Polski · 🇨🇳 中文 · 🇯🇵 日本語 · 🇰🇷 한국어 · 🇮🇳 हिन्दी · 🇸🇦 العربية · 🇺🇿 O'zbek · 🇦🇱 Shqip

## 安全性

- 没有你的明确 `y` 确认，不会安装或禁用任何东西
- `doctor` 的数字是诚实的估算，不是虚假的精确数据
- 无遥测。无自身网络请求 — 仅调用 `claude`、`uv` 等
- 零依赖 — 仅使用 Node 标准库

## 许可证

[MIT](LICENSE) © [hasabasa](https://github.com/hasabasa)
