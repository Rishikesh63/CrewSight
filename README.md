# CrewSight — OSS Maintainer's Command Center

> Built for the **Pirates of the Coral-bean** hackathon by WeMakeDevs.

CrewSight gives open-source maintainers a live intelligence dashboard: see your GitHub issues alongside real-time community buzz from Hacker News, Reddit, and Stack Overflow — all queried through [Coral](https://withcoral.com) SQL.

---

## What it does

- **Issue landscape** — 100 most-recent open GitHub issues, enriched with cross-platform activity via a single cross-source SQL JOIN across four Coral sources
- **Community buzz** — independent HN stories, Reddit posts, and SO questions about your project, clickable from the dashboard
- **AI triage** — Claude queries Coral directly via MCP (`coral mcp-stdio`) and writes a prioritized briefing based on live data
- **Source status** — live connectivity badges for all four Coral sources
- **Settings** — configure any repo and search term from the UI without touching `.env`

---

## Coral features used

| Feature | How CrewSight uses it |
|---|---|
| **SQL interface** | All data queries run via `coral sql --format json` |
| **Cross-source JOINs** | Single SQL query joins `gh.issues` with `hackernews.stories`, `reddit.posts`, and `stackoverflow.questions` |
| **Schema learning** | `/api/schema` queries `coral.tables`, `coral.columns`, and `coral.table_functions` |
| **Caching** | TTL cache layers on top of Coral's own query cache; `POST /api/refresh` clears both |
| **MCP integration** | `coral mcp-stdio` started via the `mcp` Python library — Claude uses `sql`, `list_catalog`, and `describe_table` tools to query Coral directly |

---

## Tech stack

- **Backend** — Python 3.11, FastAPI, Coral CLI
- **AI** — Anthropic Claude (`claude-sonnet-4-6`) with MCP tool use
- **Frontend** — Next.js 14 (App Router), Tailwind CSS, TypeScript
- **Data layer** — Coral SQL across GitHub, Hacker News, Reddit (via proxy), Stack Overflow

---

## Prerequisites

- [Coral CLI](https://withcoral.com/docs/getting-started/quickstart) installed
- Python 3.11+
- Node.js 18+
- A GitHub Personal Access Token (`repo` read scope)
- An Anthropic API key

---

## Setup

### 1 — Install Coral

```powershell
# Windows
winget install withcoral.coral

# macOS / Linux
brew install withcoral/tap/coral
```

Verify: `coral --version`

### 2 — Clone and configure

```bash
git clone <repo-url>
cd CrewSight
```

Create `backend/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
GITHUB_REPO=owner/repo          # e.g. zed-industries/zed
SEARCH_TERM=your project name   # used for HN / Reddit / SO queries
CACHE_TTL=300
PORT=8000
```

### 3 — Register Coral sources

Run these from the `backend/` directory. Each command will prompt for its required inputs.

```bash
# GitHub issues
coral source add --interactive --file sources/github_issues_spec.yaml
# Inputs: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO_NAME

# Hacker News (no auth needed)
coral source add --interactive --file sources/hackernews_spec.yaml
# Input: HN_SEARCH_TERM (e.g. "zed editor")

# Reddit (routed through local proxy — start backend first)
coral source add --interactive --file sources/reddit_spec.yaml
# Input: REDDIT_SEARCH_TERM (e.g. "zed editor")

# Stack Overflow (no auth needed)
coral source add --interactive --file sources/stackoverflow_spec.yaml
# Input: SO_SEARCH_TERM (e.g. "zed editor")
```

> **Note for Reddit:** The Reddit source points to `http://localhost:8000/proxy/reddit`. Start the backend before registering or testing this source.

### 4 — Start the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Verify sources are live: `http://localhost:8000/health`

### 5 — Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`

---

## API reference

| Endpoint | Description |
|---|---|
| `GET /api/issues` | GitHub issues with cross-platform activity (cross-source JOIN) |
| `GET /api/discussions` | Independent HN / Reddit / SO feeds |
| `GET /api/summary` | AI triage via Claude + Coral MCP |
| `GET /api/sources` | Live connectivity status of all Coral sources |
| `GET /api/schema` | Schema introspection (`coral.tables`, `coral.columns`, `coral.table_functions`) |
| `GET /api/config` | Current integration config (secrets masked) |
| `POST /api/config/{source}` | Update a source's credentials |
| `POST /api/refresh` | Clear all caches and force fresh data |
| `GET /proxy/reddit` | Flattens Reddit's nested API for Coral to query |

---

## Architecture

```
Browser (Next.js)
      │
      ▼
FastAPI backend
  ├── coral_client.py   ← all Coral SQL queries
  │     ├── cross-source JOIN (gh + hn + reddit + so)
  │     ├── schema introspection (coral.tables / columns)
  │     └── individual source fetchers
  ├── summarizer.py     ← Claude + Coral MCP (coral mcp-stdio)
  └── config_manager.py ← integration_config.json ↔ .env sync

Coral CLI (subprocess)
  ├── gh             ← GitHub REST API
  ├── hackernews     ← Algolia HN Search API
  ├── reddit         ← localhost:8000/proxy/reddit → reddit.com
  └── stackoverflow  ← Stack Exchange API
```

---

## Project structure

```
CrewSight/
├── backend/
│   ├── main.py               # FastAPI app + all routes
│   ├── coral_client.py       # Coral SQL queries (cross-source JOIN, schema)
│   ├── summarizer.py         # Claude + Coral MCP triage
│   ├── config_manager.py     # Settings persistence
│   ├── cache.py              # In-memory TTL cache
│   ├── sources/              # Coral source spec YAML files
│   └── .env                  # Credentials (not committed)
└── frontend/
    ├── app/
    │   ├── page.tsx           # Main dashboard
    │   ├── settings/page.tsx  # Integrations config UI
    │   └── components/        # StatCards, IssueTable, DiscussionView, …
    └── lib/
        ├── api.ts             # Backend API client
        └── types.ts           # Shared TypeScript interfaces
```
