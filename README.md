# Ultimate Token Dashboard

A local dashboard that turns the JSONL transcripts Claude Code writes to `~/.claude/projects/` into per-prompt cost analytics, a daily burn heatmap, cache-efficiency analysis, burn-moment timelines, per-project activity, tool/file heatmaps, subagent attribution, and a rule-based tips engine.

**Everything runs locally.** No data leaves your machine — no telemetry, no API calls for your data, no login.

![Overview — greeting, KPIs, and the daily token-burn heatmap](docs/images/dashboard-overview-top.jpg)

![Cache efficiency — reuse vs. rebuild, by project and by skill](docs/images/dashboard-overview-bottom.jpg)

## Install — two ways

### 1. Mac app (recommended — no Python, no Terminal)

**[⬇︎ Download the latest macOS app](https://github.com/360dgtal/ultimate-token-dashboard/releases/latest)** — grab the `.dmg` under the latest release.

1. Open the `.dmg`, then **drag the app onto the Applications folder**.
2. Open it from Applications.
3. On first launch macOS may say it's from an "unidentified developer" — **right-click the app → Open → Open** once, and it'll launch normally from then on.

The app bundles its own Python runtime — **you do not need Python (or anything else) installed.** It scans your Claude Code sessions and opens the dashboard in its own window.

> Why the right-click step? The app is ad-hoc signed, not yet Apple-notarized. The right-click → Open is a one-time macOS Gatekeeper approval; it isn't a Python or install problem.

### 2. Run from source (any OS)

If you'd rather run the Python directly (macOS / Linux / Windows):

```bash
git clone https://github.com/360dgtal/ultimate-token-dashboard.git
cd ultimate-token-dashboard
python3 cli.py dashboard
```

Requires **Python 3.8+** (already on macOS and most Linux; on Windows `winget install Python.Python.3.12`). No `pip install`, no Node.js, no build step. On Windows substitute `py -3` for `python3`.

## What this is useful for

- Seeing which of your prompts are expensive (usually large tool results).
- A **daily burn heatmap** + 30-day rolling average to spot your heavy days at a glance.
- **Cache efficiency** — whether you worked against a warm cache or kept paying to rebuild it after `/clear` or 5-minute cache expiry, broken down by project, prompt, and skill.
- **Burn moments** — your biggest spend days and what drove them.
- Comparing token usage and activity across projects (with sparklines).
- Cost in real money (GBP / USD / EUR) on your actual plan (API / Pro / Max).

## Where the data comes from

Claude Code writes one JSONL file per session here:

| OS | Path |
|---|---|
| macOS / Linux | `~/.claude/projects/<project-slug>/<session-id>.jsonl` |
| Windows | `C:\Users\<you>\.claude\projects\<project-slug>\<session-id>.jsonl` |

The dashboard never modifies those files — it only reads them and keeps a local SQLite cache at `~/.claude/token-dashboard.db`. It also reads Claude Desktop Cowork sessions where present, and has groundwork for OpenAI Codex (inert until `~/.codex/sessions/` has data).

To point at a different location (source mode):

```bash
python3 cli.py dashboard --projects-dir /path/to/projects --db /path/to/cache.db
```

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Port the local web server listens on |
| `HOST` | `127.0.0.1` | Bind address. Keep the default. Setting `0.0.0.0` exposes your entire prompt history to anyone on your local network — don't do this on any network you don't fully control (no coffee-shop Wi-Fi, no coworking spaces). |
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | Where to scan for session JSONL files |
| `CLAUDE_COWORK_DIR` | Claude Desktop default | Cowork `local-agent-mode-sessions` folder |
| `TOKEN_DASHBOARD_DB` | `~/.claude/token-dashboard.db` | SQLite cache location |

Pricing lives in [`pricing.json`](pricing.json). Edit it directly if model prices change or to add a new plan.

## The tabs

A single page with a hash-router tab bar. Each tab is backed by its own JSON API under `/api/`:

- **Overview** — the landing tab: greeting, KPI cards, **daily burn heatmap**, daily total + **30-day rolling average** (with a log-scale toggle), **cache efficiency** (reuse vs. rebuild by project / prompt / skill), **burn moments**, **per-project activity sparklines**, tokens-by-project and -by-model, top tools, recent sessions, and **scale equivalents**.
- **Prompts** — your most expensive prompts ranked by tokens; click a row for the response, tool calls, and per-result sizes.
- **Sessions** — turn-by-turn view of a single session.
- **Projects** — per-project comparison: tokens, sessions, files touched.
- **Skills** — which skills you invoke most, and (where measurable) their token cost. See [limitations](docs/KNOWN_LIMITATIONS.md#skills-token-counts-are-partial).
- **Tips** — rule-based suggestions for reducing token usage.
- **Settings** — switch pricing between API / Pro / Max so cost figures reflect your plan; set display name; currency.

## CLI reference (source mode)

```bash
python3 cli.py scan          # populate / refresh the local DB, then exit
python3 cli.py today         # today's totals (terminal)
python3 cli.py stats         # all-time totals (terminal)
python3 cli.py tips          # active suggestions (terminal)
python3 cli.py dashboard     # scan + serve the UI at http://localhost:8080
python3 cli.py dashboard --no-open   # don't auto-open the browser
python3 cli.py dashboard --no-scan   # skip the initial scan (cached DB only)
```

Change the port: `PORT=9000 python3 cli.py dashboard`.

## Troubleshooting

**"unidentified developer" / "damaged" on first launch.** Right-click the app → Open → Open (one-time Gatekeeper approval). This is not a Python problem — the app is self-contained.

**"No data" or empty charts.** Run a Claude Code session first, then click Refresh (or `python3 cli.py scan` in source mode).

**Port 8080 already in use.** `PORT=9000 python3 cli.py dashboard`.

**Numbers look wrong / stuck.** Delete `~/.claude/token-dashboard.db` and re-scan to rebuild from scratch.

## Accuracy note

Claude Code writes each assistant response 2–3 times to disk while it streams. The dashboard dedupes these by `message.id` so the final tally matches what the API actually billed. Tools that sum every JSONL row will report higher (less accurate) numbers.

## Privacy

Nothing leaves your machine. No telemetry, no remote calls for your data. The UI fetches JSON from `127.0.0.1` and all JS/CSS/fonts are served locally (ECharts is vendored into `web/`). Press `Cmd/Ctrl + B` anywhere to blur sensitive text for screenshots. Verify with `grep -r "https://" token_dashboard/ web/`.

## Tech stack

Python 3 (stdlib only) for the CLI, scanner, and HTTP server; SQLite for the local cache; vanilla JS + ECharts for the UI (no build step); SSE for live refresh. The Mac app is packaged with PyInstaller, bundling the Python runtime so end users need nothing installed.

Data flow: `cli.py` → `token_dashboard/scanner.py` → SQLite DB; `token_dashboard/server.py` exposes `/api/*` and serves `web/`.

## Further reading

- [`CLAUDE.md`](CLAUDE.md) — conventions and architecture
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — backlog and milestone notes
- [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) — rough edges
- [`docs/COMPETITOR_ANALYSIS.md`](docs/COMPETITOR_ANALYSIS.md) — feature comparison
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — develop and test

## License

[MIT](LICENSE).
