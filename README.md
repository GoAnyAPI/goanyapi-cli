# GoAnyAPI CLI

[![npm version](https://img.shields.io/npm/v/@goanyapi/cli.svg)](https://www.npmjs.com/package/@goanyapi/cli)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933.svg)](https://nodejs.org/)

[中文](./README.zh.md) | [English](./README.md)

The official command-line client for [GoAnyAPI](https://goanyapi.com), built for humans and AI agents. Query website traffic, SEO metrics, search results, advertising intelligence, and account data from a terminal with OAuth or API key authentication and structured output.

[Install](#installation--quick-start) · [AI agents](#quick-start-for-ai-agents) · [Authentication](#authentication) · [Commands](#commands) · [Advanced](#advanced-usage) · [Security](#security)

## Why GoAnyAPI CLI?

- **Agent-friendly** — predictable commands, machine-readable schemas, JSON output, meaningful exit codes, and no prompts during API calls.
- **Always current** — commands and parameters come from the GoAnyAPI online catalog instead of a stale bundled snapshot.
- **Easy interactive login** — OAuth Authorization Code with PKCE opens the browser and returns through a loopback callback.
- **Automation-ready** — API keys work naturally in CI/CD, cron, Docker, and server scripts.
- **Secure credential storage** — credentials use Windows Credential Locker, macOS Keychain, or Linux Secret Service.
- **Structured output** — choose pretty JSON, compact JSON, raw responses, or only the response `data` field.

## Who is it for?

| You are... | Recommended path |
| --- | --- |
| A terminal user | Install globally, run `goanyapi login`, then invoke an API command. |
| An AI coding agent user | Log in once, then let Codex, Claude Code, or another terminal-capable agent run `goanyapi ... --output json`. |
| A CI/CD or server operator | Provide `GOANYAPI_API_KEY` through your secret manager; do not use interactive OAuth. |
| An MCP client user | Use the dedicated [GoAnyAPI MCP server](https://mcp.goanyapi.com/mcp) for native MCP tools. CLI OAuth and MCP OAuth are separate. |

## Capabilities

| Category | Capabilities |
| --- | --- |
| Website intelligence | Traffic estimates, rankings, traffic sources, Domain Rating, and backlinks |
| Keyword research | Keyword difficulty, keyword generation, and search suggestions |
| Search intelligence | Google and Bing SERP data, Top 10 results, `intitle` queries, and site search |
| Advertising intelligence | AdSense lookup, Google Ads Transparency, and advertising statistics |
| Account | Credit balance and paginated credit activity |

The server publishes the authoritative catalog. Run `goanyapi list` to see the current APIs.

## Installation & quick start

### Requirements

- Node.js 20 or newer
- npm or a compatible package manager
- A GoAnyAPI account for OAuth, or a GoAnyAPI API key

### Install

```bash
npm install --global @goanyapi/cli
goanyapi --version
```

### Quick start for humans

```bash
# 1. Sign in through the browser
goanyapi login

# 2. Verify authentication
goanyapi auth status

# 3. Discover current APIs
goanyapi list

# 4. Make a request
goanyapi traffic example.com --month 3
```

Browser login uses the fixed public OAuth client `goanyapi-cli`, resource `https://api.goanyapi.com`, and scope `api:invoke`.

## Quick start for AI agents

> Some steps require the user to finish authorization in a browser. An agent must never read, print, or copy credentials from the system credential store.

### Step 1 — Install

```bash
npm install --global @goanyapi/cli
```

### Step 2 — Ask the user to authorize

Run this in a visible user terminal because it opens a browser and waits for the loopback callback:

```bash
goanyapi login
```

### Step 3 — Verify and call an API

```bash
goanyapi auth status
goanyapi list --output json
goanyapi traffic example.com --month 3 --output json
goanyapi dr example.com --output json
goanyapi serp --q "open source" --gl us --output json
goanyapi credits-balance --data-only --output json
```

For reliable agent use, add this guidance to `AGENTS.md`, `CLAUDE.md`, or equivalent instructions:

```md
When website, SEO, search-result, or advertising data is needed, use the
globally installed `goanyapi` CLI. Add `--output json` to API commands. Run
`goanyapi list --output json` to discover APIs and
`goanyapi describe <command> --output json` to inspect parameters. Never read
or expose saved OAuth tokens or API keys.
```

The agent must run as the same operating-system user that completed `goanyapi login`. Windows credentials are not automatically available inside WSL, Docker, another machine, or a remote agent runtime.

## Authentication

| Scenario | Recommended credential |
| --- | --- |
| Interactive use | OAuth with PKCE |
| CI/CD, cron, Docker, and server scripts | API key through an environment variable |
| One-off command | `--api-key` or `GOANYAPI_API_KEY` |
| Repeated local API-key use | `goanyapi auth set-key` |

### OAuth

```bash
goanyapi login
goanyapi auth status
goanyapi logout
```

Access tokens refresh automatically near expiry. Logout attempts remote revocation and always removes the local credential.

### API key

macOS and Linux:

```bash
export GOANYAPI_API_KEY="ga_xxx"
goanyapi traffic example.com --month 3 --output json
```

PowerShell:

```powershell
$env:GOANYAPI_API_KEY = "ga_xxx"
goanyapi traffic example.com --month 3 --output json
```

Save a key in the system credential store without placing it directly in shell history:

```bash
goanyapi auth set-key
```

Credential precedence is `--api-key`, then `GOANYAPI_API_KEY`, then a saved API key or OAuth credential.

## Commands

### Discover APIs and schemas

```bash
goanyapi list
goanyapi list --output json
goanyapi describe traffic
goanyapi describe traffic --output json
goanyapi traffic --help
```

The CLI loads `/api/v1/mcp/catalog`. If the online catalog is unavailable or invalid, the command fails rather than using an outdated local definition.

### API commands

| Command | Purpose |
| --- | --- |
| `traffic` | Website traffic, ranking, and traffic sources |
| `dr` | Domain Rating |
| `backlink` | Backlink data |
| `keyword-difficulty` | Keyword difficulty |
| `keyword-generator` | Related keyword generation |
| `google-autocomplete` | Google autocomplete suggestions |
| `bing-autocomplete` | Bing autocomplete suggestions |
| `top10-serp` | Top search results |
| `serp` | Structured Google search results |
| `bing-serp` | Structured Bing search results |
| `google-intitle` | Google title search |
| `google-site-search` | Google site-restricted search |
| `adsense` | AdSense domain and publisher lookup |
| `transparency` | Google Ads Transparency data |
| `ads-statistics` | Advertising statistics |
| `activity-credits` | Paginated credit activity |
| `credits-balance` | Credit balance; alias: `balance` |

Required parameters may also be positionals when unambiguous:

```bash
goanyapi traffic --domain example.com --month 3
goanyapi traffic example.com --month 3
```

Catalog names accept kebab-case aliases: `creativeIds`, `setLang`, and `search_type` may be written as `--creative-ids`, `--set-lang`, and `--search-type`.

## Advanced usage

### Output modes

```bash
--output pretty   # Indented JSON (default)
--output json     # Compact JSON for agents and scripts
--output raw      # Original response body
--data-only       # Only the response envelope's data field
```

`--data-only` cannot be combined with `--output raw`. Results go to stdout; errors and update notices go to stderr.

### Global options

```text
-k, --api-key <key>       API key (or GOANYAPI_API_KEY)
    --base-url <url>       API base URL (or GOANYAPI_BASE_URL)
-o, --output <mode>        pretty, json, or raw (default: pretty)
    --data-only            Print only the response data field
    --timeout <seconds>     Request timeout (default: 45)
-h, --help                 Show help
-V, --version              Show version
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `GOANYAPI_API_KEY` | API key for non-interactive authentication |
| `GOANYAPI_BASE_URL` | Override the REST API base URL |
| `GOANYAPI_OAUTH_ISSUER` | Override the OAuth issuer for development |
| `GOANYAPI_OAUTH_RESOURCE` | Override the OAuth resource for development |
| `GOANYAPI_NO_UPDATE_CHECK=1` | Disable npm update checks |

Stable releases use production endpoints. Versions containing `-next` use GoAnyAPI test endpoints by default.

### Update notices

Interactive terminals check the matching npm channel and may print a non-blocking update notice. Successful checks are cached for 24 hours. CI and non-interactive processes do not display notices.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | API, auth-status, network, or runtime failure |
| `2` | Invalid command or argument usage |

## Security

- OAuth uses Authorization Code with PKCE; the public client has no client secret.
- The callback binds only to `127.0.0.1` on a random port.
- Tokens and saved API keys use the OS-native credential service, not a plaintext project file.
- Credentials are not printed in normal output or error messages.
- CLI OAuth tokens use the REST API audience and `api:invoke` scope; they are not MCP tokens.
- Prefer independently revocable API keys for unattended automation.
- AI agents can make incorrect decisions. Review commands that may expose private business data and grant only the access required.

## Development

```bash
git clone https://github.com/GoAnyAPI/goanyapi-cli.git
cd goanyapi-cli
pnpm install
pnpm check
pnpm link --global
```

Local development requires Node.js 20+ and pnpm 10.

## Links

- [GoAnyAPI](https://goanyapi.com)
- [GoAnyAPI CLI on npm](https://www.npmjs.com/package/@goanyapi/cli)
- [Source code](https://github.com/GoAnyAPI/goanyapi-cli)
- [Issue tracker](https://github.com/GoAnyAPI/goanyapi-cli/issues)
