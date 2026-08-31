# GoAnyAPI CLI

The official command-line client for GoAnyAPI. The CLI uses the same
machine-readable catalog as the GoAnyAPI API and MCP server and currently
covers all 17 public read-only endpoints.

## Install

```bash
npm install --global @goanyapi/cli
```

To test the upcoming release against the GoAnyAPI test environment:

```bash
npm install --global @goanyapi/cli@next
```

Versions containing the `-next` prerelease identifier use `www2.goanyapi.com`
for OAuth and `api2.goanyapi.com` for API requests. Stable versions use the
production endpoints. Environment variables remain available as development
overrides.

In an interactive terminal, the CLI checks the matching npm release channel
and prints a non-blocking update notice at most once every 24 hours. Set
`GOANYAPI_NO_UPDATE_CHECK=1` to disable this check. CI and non-interactive
processes do not display update notices.

For local development:

```bash
pnpm install
pnpm build
pnpm link --global
```

Node.js 20 or newer is required.

## Authentication

For interactive use, sign in with OAuth. The CLI uses Authorization Code with
PKCE, opens the browser, and listens only on a random `127.0.0.1` callback
port:

```bash
goanyapi login
goanyapi auth status
goanyapi traffic example.com
goanyapi logout
```

The fixed public OAuth client is `goanyapi-cli`, with resource
`https://api.goanyapi.com` and scope `api:invoke`. OAuth access and refresh
tokens are stored in Windows Credential Locker, macOS Keychain, or Linux
Secret Service; they are not written to a plaintext config file.

For CI/CD, cron, Docker, and server scripts, use an independently revocable API
key through the environment:

```bash
export GOANYAPI_API_KEY="your-api-key"
```

PowerShell:

```powershell
$env:GOANYAPI_API_KEY = "your-api-key"
```

You can also pass `--api-key` / `-k` for one invocation, or save a key in the
same system credential store without putting it in shell history:

```bash
goanyapi auth set-key
```

An explicit `--api-key` or `GOANYAPI_API_KEY` takes precedence over saved
credentials. Credentials are never printed in command output or errors.

## Usage

```bash
# Discover APIs and inspect their parameters
goanyapi list
goanyapi describe traffic
goanyapi serp --help

# A required option can also be supplied as a positional argument
goanyapi traffic --domain example.com --month 3
goanyapi traffic example.com --month 3

# Query structured search results
goanyapi serp --q "open source" --gl us --hl en

# Print only the response envelope's data field
goanyapi credits-balance --data-only --output json
goanyapi balance --data-only --output json
```

Catalog camelCase and snake_case names also have kebab-case CLI spellings:

- `creativeIds`: `--creativeIds` or `--creative-ids`
- `setLang`: `--setLang` or `--set-lang`
- `search_type`: `--search_type` or `--search-type`

## API commands

| Command | Purpose |
| --- | --- |
| `traffic` | Website traffic, ranking, and traffic sources |
| `dr` | Domain Rating |
| `backlink` | Backlink data |
| `keyword-difficulty` | Keyword difficulty |
| `keyword-generator` | Keyword generation |
| `google-autocomplete` | Google search suggestions |
| `bing-autocomplete` | Bing search suggestions |
| `top10-serp` | Top 10 search results |
| `serp` | Structured Google results |
| `bing-serp` | Structured Bing results |
| `google-intitle` | Google title search |
| `google-site-search` | Google site search |
| `adsense` | AdSense domain and publisher ID lookup |
| `transparency` | Google Ads Transparency |
| `ads-statistics` | Advertising statistics |
| `activity-credits` | Paginated account credit activity |
| `credits-balance` | Credit balance (alias: `balance`) |

Run `goanyapi describe <command>` for the current argument schema.

## Global options

```text
-k, --api-key <key>       API key (or GOANYAPI_API_KEY)
    --base-url <url>       API base URL (or GOANYAPI_BASE_URL)
-o, --output <mode>        pretty, json, or raw (default: pretty)
    --data-only            Print only the response data field
    --timeout <seconds>     Request timeout (default: 45)
-h, --help                 Show help
-V, --version              Show version
```

The CLI loads the current schema from `/api/v1/mcp/catalog`. If the catalog is
unavailable or invalid, the command fails instead of using a potentially stale
local definition. Required arguments, types, enum values, and unknown fields
are validated before the API request is sent.

Exit codes: `0` success, `1` API or network error, and `2` usage error.
