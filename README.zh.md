# GoAnyAPI CLI

[![npm version](https://img.shields.io/npm/v/@goanyapi/cli.svg)](https://www.npmjs.com/package/@goanyapi/cli)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933.svg)](https://nodejs.org/)

[中文](./README.zh.md) | [English](./README.md)

[GoAnyAPI](https://goanyapi.com) 官方命令行客户端，面向人类用户和 AI Agent。通过 OAuth 或 API Key，即可在终端中查询网站流量、SEO 指标、搜索结果、广告情报及账户数据，并获得结构化输出。

[安装](#安装与快速开始) · [AI Agent](#ai-agent-快速开始) · [鉴权](#鉴权) · [命令](#命令) · [进阶用法](#进阶用法) · [安全](#安全)

## 为什么选择 GoAnyAPI CLI？

- **面向 Agent 设计** — 命令稳定、Schema 可读取、支持 JSON 输出和明确退出码，API 调用过程中不会弹出交互式问题。
- **能力始终同步** — 命令和参数来自 GoAnyAPI 在线 Catalog，不使用可能过期的本地快照。
- **交互登录简单** — 使用 OAuth Authorization Code + PKCE，自动打开浏览器并通过本机回调完成授权。
- **适合自动化** — API Key 可用于 CI/CD、Cron、Docker 和服务器脚本。
- **凭证安全存储** — 使用 Windows Credential Locker、macOS Keychain 或 Linux Secret Service。
- **按安装实例授权** — 每个操作系统用户下的 CLI 安装保存随机客户端标识；同一客户端重新登录会替换原连接，不同电脑可独立撤销。
- **结构化输出** — 支持格式化 JSON、紧凑 JSON、原始响应，以及只输出 `data` 字段。

## 适合哪些场景？

| 你是…… | 推荐使用方式 |
| --- | --- |
| 终端用户 | 全局安装后运行 `goanyapi login`，然后执行 API 命令。 |
| AI 编程客户端用户 | 登录一次，让 Codex、Claude Code 等具备终端能力的 Agent 执行 `goanyapi ... --output json`。 |
| CI/CD 或服务器运维人员 | 通过密钥管理服务注入 `GOANYAPI_API_KEY`，不要使用交互式 OAuth。 |
| MCP 客户端用户 | 原生 MCP 工具调用请使用 [GoAnyAPI MCP Server](https://mcp.goanyapi.com/mcp)。CLI OAuth 与 MCP OAuth 相互独立。 |

## 功能

| 分类 | 能力 |
| --- | --- |
| 网站情报 | 流量估算、排名、流量来源、Domain Rating 和外链数据 |
| 关键词研究 | 关键词难度、关键词生成、Google/Bing 搜索建议 |
| 搜索情报 | Google/Bing SERP、Top 10 结果、`intitle` 查询和站内搜索 |
| 广告情报 | AdSense 查询、Google Ads Transparency 和广告统计 |
| 账户 | 积分余额和分页积分活动记录 |

服务端发布权威命令目录。运行 `goanyapi list` 可查看当前可用的全部 API。

## 安装与快速开始

### 环境要求

- Node.js 20 或更高版本
- npm 或兼容的包管理器
- 用于 OAuth 的 GoAnyAPI 账号，或 GoAnyAPI API Key

### 安装

```bash
npm install --global @goanyapi/cli
goanyapi --version
```

### 人类用户快速开始

```bash
# 1. 在浏览器中登录
goanyapi login

# 2. 检查鉴权状态
goanyapi auth status

# 3. 查看当前 API
goanyapi list

# 4. 发起请求
goanyapi traffic example.com --month 3
```

浏览器登录使用固定公共 OAuth Client `goanyapi-cli`、Resource `https://api.goanyapi.com` 和 Scope `api:invoke`。

## AI Agent 快速开始

> 部分步骤需要用户在浏览器中完成授权。Agent 不得读取、打印或复制系统凭证库中的凭证。

```bash
# 1. 安装
npm install --global @goanyapi/cli

# 2. 请用户在浏览器中完成授权
goanyapi login

# 3. 验证并发现 API
goanyapi auth status
goanyapi list --output json

# 4. 调用 API
goanyapi traffic example.com --month 3 --output json
goanyapi dr example.com --output json
goanyapi serp --q "open source" --gl us --output json
goanyapi credits-balance --data-only --output json
```

为了让 Agent 稳定调用，可以将以下内容加入 `AGENTS.md`、`CLAUDE.md` 或同类指令文件：

```md
需要网站、SEO、搜索结果或广告数据时，使用全局安装的 `goanyapi` CLI。
API 命令统一添加 `--output json`。使用 `goanyapi list --output json` 获取
当前 API，使用 `goanyapi describe <command> --output json` 查看参数。
禁止读取或暴露已保存的 OAuth Token 和 API Key。
```

AI Agent 必须运行在完成 `goanyapi login` 的同一个操作系统用户下。Windows 保存的凭证不会自动共享给 WSL、Docker、另一台电脑或远程 Agent。

## 鉴权

| 场景 | 推荐凭证 |
| --- | --- |
| 用户电脑上的交互式使用 | OAuth + PKCE |
| CI/CD、Cron、Docker 和服务器脚本 | 通过环境变量传递 API Key |
| 临时执行一次命令 | `--api-key` 或 `GOANYAPI_API_KEY` |
| 本机长期使用 API Key | `goanyapi auth set-key` |

### OAuth

```bash
goanyapi login
goanyapi auth status
goanyapi logout
```

Access Token 即将过期时会自动刷新。退出登录时，CLI 会尝试在服务端撤销凭证，并始终删除本地凭证。

### API Key

macOS 和 Linux：

```bash
export GOANYAPI_API_KEY="ga_xxx"
goanyapi traffic example.com --month 3 --output json
```

PowerShell：

```powershell
$env:GOANYAPI_API_KEY = "ga_xxx"
goanyapi traffic example.com --month 3 --output json
```

也可以将 API Key 保存到系统凭证库，避免直接写入 Shell 历史：

```bash
goanyapi auth set-key
```

凭证优先级为 `--api-key`、`GOANYAPI_API_KEY`、系统凭证库中保存的 API Key 或 OAuth 凭证。

## 命令

### 发现 API 和 Schema

```bash
goanyapi list
goanyapi list --output json
goanyapi describe traffic
goanyapi describe traffic --output json
goanyapi traffic --help
```

CLI 从 `/api/v1/mcp/catalog` 加载 Catalog。如果在线 Catalog 不可用或格式错误，命令会直接失败，不会使用过期的本地定义。

### API 命令和子接口

线上 Catalog 是唯一数据源。README 不重复维护完整命令清单，因此服务端新增 API
或子接口后，无需发布文档版本即可被发现：

```bash
# 列出当前全部顶层 API
goanyapi list

# 查看参数、子接口模式和 Catalog 示例
goanyapi describe ads-statistics

# 调用由 action + oneOf 定义的子接口
goanyapi ads-statistics advertiser-search --keyword ai --output json

# 调用 oneOf 查询模式
goanyapi transparency --domain example.com --output json
```

必填参数既可以按名称传入，也可以在没有歧义时作为位置参数：

```bash
goanyapi traffic --domain example.com --month 3
goanyapi traffic example.com --month 3
```

Catalog 参数名支持 kebab-case 别名。例如 `creativeIds`、`setLang` 和 `search_type` 可分别写成 `--creative-ids`、`--set-lang` 和 `--search-type`。

## 进阶用法

### 输出模式

```bash
--output pretty   # 缩进格式化 JSON（默认）
--output json     # 适合 Agent 和脚本的紧凑 JSON
--output raw      # 原始响应正文
--data-only       # 只输出响应中的 data 字段
```

`--data-only` 不能与 `--output raw` 同时使用。正常结果写入 stdout，错误和升级提示写入 stderr。

### 全局参数

```text
-k, --api-key <key>       API Key（或 GOANYAPI_API_KEY）
    --base-url <url>       API Base URL（或 GOANYAPI_BASE_URL）
-o, --output <mode>        pretty、json 或 raw（默认：pretty）
    --data-only            只输出响应中的 data 字段
    --timeout <seconds>     请求超时时间（默认：45 秒）
-h, --help                 显示帮助
-V, --version              显示版本
```

### 环境变量

| 变量 | 用途 |
| --- | --- |
| `GOANYAPI_API_KEY` | 用于非交互鉴权的 API Key |
| `GOANYAPI_BASE_URL` | 覆盖 REST API Base URL |
| `GOANYAPI_OAUTH_ISSUER` | 开发时覆盖 OAuth Issuer |
| `GOANYAPI_OAUTH_RESOURCE` | 开发时覆盖 OAuth Resource |
| `GOANYAPI_NO_UPDATE_CHECK=1` | 禁用 npm 版本检查 |

正式版本默认连接生产环境；版本号中包含 `-next` 的预发布版本默认连接测试环境。

### 升级提示

CLI 在交互式终端中检查对应的 npm 发布通道，并可能输出非阻塞升级提示。成功结果缓存 24 小时；CI 和非交互进程不会显示提示。

### 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功 |
| `1` | API、鉴权状态、网络或运行时失败 |
| `2` | 命令或参数使用错误 |

## 安全

- OAuth 使用 Authorization Code + PKCE，公共客户端不包含 Client Secret。
- 回调服务器只监听 `127.0.0.1` 的随机端口。
- OAuth Token 和 API Key 使用操作系统原生凭证服务保存，不写入项目明文配置文件。
- 凭证不会出现在正常输出或错误信息中。
- CLI OAuth Token 使用 REST API Audience 和 `api:invoke` Scope，不能作为 MCP Token 使用。
- 无人值守任务应优先使用可独立撤销的 API Key。
- AI Agent 可能做出错误决策。请审查可能暴露私有业务数据的命令，并只授予必要权限。

## 相关链接

- [GoAnyAPI](https://goanyapi.com)
- [npm 上的 GoAnyAPI CLI](https://www.npmjs.com/package/@goanyapi/cli)
- [源代码](https://github.com/GoAnyAPI/goanyapi-cli)
- [问题反馈](https://github.com/GoAnyAPI/goanyapi-cli/issues)
