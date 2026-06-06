# Competitor Analysis: "Nate's AI Token Burn" (Codex-built dashboard)

Source URL: https://dashboard-sepia-beta-83.vercel.app/
Date analyzed: 2026-06-06
Our app: Ultimate Token Dashboard (this repo)

---

## 1. What their dashboard is

A **single-page, public, multi-platform** token-consumption dashboard. Its whole story
is "how much AI am I burning across *all* my tools" — Codex, Claude, and ChatGPT
combined — presented as a shareable narrative rather than a precise accounting tool.

### Their feature inventory (everything readable on the live page, with real values)

Headline totals (1-year view): **14.3B tokens** — Codex **8.69B** / Claude **4.77B** /
ChatGPT **822M**. Peak day **868M** (May 28, 2026). "Updated Jun 6, 2026, 3:04 AM."

| Area | What it shows (actual data observed) |
|---|---|
| **KPI cards** | "Last hour" (8.4M, *exact local Codex events*) and "Day to date" (164M). Note: *"Fast refresh: recent Codex rows rescanned; chat lanes loaded from current CSVs"* |
| **Time-range tabs** | 90d / 180d / 1y / All |
| **Daily Token Burn** | **Stacked per-platform calendar heatmaps** — one Sun–Sat contribution grid each for Total / Codex / Claude / ChatGPT, all aligned to one month axis (Jul→Jun). **Log color scale**, "Less→More" legend. Topped by a **weekly-total sparkline on a log y-axis** (1.52B latest / 3.64B peak) |
| **Burn Moments** *(missed by WebFetch)* | Narrative table of top days: Date · Burn · **Moment** (named workstream, e.g. "Client deck/model buildout") · **Driver** (per-platform split + a sentence of human context). The honest ones say "local session text was not specific enough to assign a named workstream" |
| **What is Driving the Burn?** | Sorted dot plot of **9 work families** with Tokens · Share · **Evidence** (dated example sessions). Top families: Claude chat/long-context baseline **42.1%**, Automations + browser/computer-use ops **27.7%**, Client planning docs + models **19.1%**, ChatGPT baseline **7.4%**, then editorial, personal/admin, hiring, dashboards |
| **Per-tool summary** *(missed by WebFetch)* | Table: Tool · Today · Last 7d · Last 30d · Peak day · **Active days** · **30d shape** (inline sparkline). Rows for Total / Codex / Claude / ChatGPT |
| **Scale Equivalents** | Fermi estimates from 14.4M "query-equivalents": Water **1,225 gal** = 42.3 lattes; Electricity **4,901 kWh** = 10,891 movies; Code volume **961M LOC** = 96.1k engineer-years. Each with an explicit **Basis** (assumptions shown) |
| **30-Day Moving Average** | Per-platform sparklines (peak avg 281M) + detailed table: Date · Total · Codex · Claude · ChatGPT · **Claude exact** · **Claude chat est.** · ChatGPT export · ChatGPT activity · **Codex threads** (count) · **Claude calls** (count) |
| **Methodology honesty** | Explicit: "Claude and ChatGPT include estimated chat activity where exact chat tokens are unavailable"; "Codex groups are heuristic classifications from session prompts and paths" |

### Their architecture (observed)

- **Light, editorial/Tufte design** — generous whitespace, monochrome-green heatmaps,
  big-number KPIs. Built to *read like a data-journalism piece*. (Ours is a dark cockpit.)
- **Partially live**: Codex is rescanned near-real-time ("Last hour", "Day to date" from
  exact local Codex events); chat lanes (Claude/ChatGPT) load from periodically-updated CSVs.
- **Estimation-heavy for Claude/ChatGPT**: critically, in every recent day shown,
  **"Claude exact" = 0** — their entire 4.77B Claude figure is an *estimated long-context
  chat baseline*, not measured. This is exactly the data we capture precisely.
- Public Vercel deploy — built to be *shown to people*, not to protect private data.

---

## 2. What our dashboard is

A **local-first, precise, live, Claude-Code-deep** analytics tool. We parse the raw
JSONL transcripts Claude Code writes and reconstruct exact billable token counts —
no estimation.

### Our feature inventory (for the comparison)

- Exact per-prompt cost in **real currency** (GBP/USD/EUR with FX conversion)
- **Live updates** via SSE + auto-reconnect + 5-min poll fallback + manual Refresh
- Seven tabs: Overview, Prompts (expensive-prompt drill-down), Sessions (session
  drill-down), Projects (per-project comparison), Skills, Tips (rule-based engine), Settings
- **Tool/file heatmaps**, **subagent attribution**, **cache analytics**
  (5m/1h cache-create + cache-read — nobody else breaks this out)
- Streaming-snapshot dedup (exact billing, not summed snapshots)
- **Fully local / private** — no telemetry, stdlib only
- Native macOS app (DMG), cross-device iCloud sync

---

## 3. Side-by-side comparison chart

| Dimension | Nate's "AI Token Burn" | Ultimate Token Dashboard (ours) | Edge |
|---|---|---|---|
| **Platforms covered** | Codex + Claude + ChatGPT | Claude Code only (+ Cowork) | **Them** |
| **Data accuracy** | Mixed: exact + *estimated* | **Exact** (raw JSONL, deduped) | **Us** |
| **Cost in money** | None visible (tokens only) | **Yes**, multi-currency + FX | **Us** |
| **Live / real-time** | No (static/batched) | **Yes** (SSE, ~live) | **Us** |
| **Calendar heatmap** | **Yes** (log color scale) | No | **Them** |
| **Log-scale charts** | **Yes** | No (linear only) | **Them** |
| **Moving average** | **Yes** (30-day) | No | **Them** |
| **"What's driving it" categorization** | **Yes** (9 work families + evidence) | Partial (tool/file/project, no semantic families) | **Them** |
| **"Burn Moments" narrative timeline** | **Yes** (named top-days w/ context) | No (we have per-prompt, not per-day narrative) | **Them** |
| **Per-tool summary w/ sparklines** | **Yes** (Today/7d/30d/peak/active/shape) | Partial (Projects tab, no sparkline KPIs) | **Them** |
| **Scale/Fermi equivalents** | **Yes** (shareable hook, w/ bases) | No | **Them** |
| **Time-range presets** | **Yes** (90/180/365/All tabs) | Backend supports ranges; no preset UI | **Them** |
| **Per-prompt drill-down** | No | **Yes** | **Us** |
| **Session drill-down** | No | **Yes** | **Us** |
| **Per-project comparison** | No | **Yes** | **Us** |
| **Cache analytics** | No | **Yes** (unique) | **Us** |
| **Subagent attribution** | No | **Yes** | **Us** |
| **Skills view + Tips engine** | No | **Yes** | **Us** |
| **Privacy model** | Public web deploy | **Local-first, private** | **Us (by design)** |
| **Shareability** | **High** (public, narrative) | Low (private tool) | **Them** |
| **Methodology transparency** | **Explicit** exact-vs-est labels | Implicit (all exact) | **Them (UX)** |

**Net read:** We win decisively on *depth, precision, money, and live data* for Claude
Code. They win on *breadth (multi-platform), visual polish (heatmap/log/MA), and
shareable storytelling*. Different philosophies: ours is a precise private cockpit;
theirs is a shareable cross-tool story.

---

## 4. What's worth adding — prioritized

### Quick wins (hours each, no architecture change)

1. **Calendar heatmap on Overview** — ECharts has a native `calendar` + `heatmap`
   series. We already have `daily_token_breakdown()` returning per-day totals; this is
   almost pure frontend. *Highest visual ROI.*
2. **Log-scale toggle** on the daily/weekly chart — one ECharts `yAxis.type: 'log'`
   switch. Makes spiky token data readable. Trivial.
3. **30-day moving average line** overlaid on the daily chart — compute rolling mean in
   JS from existing daily data, or a SQL window function. No new data needed.
4. **Time-range preset tabs (7d / 30d / 90d / 1y / All)** — the backend already accepts
   `since`/`until` (`_range_clause`); this is a frontend selector wired to existing APIs.
5. **"Today" + "Peak day" KPI cards** on Overview — one-line SQL each (`MAX(day)` over
   `daily_token_breakdown`). Cheap, high glanceability.
6. **Scale Equivalents / Fermi panel** — pure compute from our exact totals (e.g.
   "≈ N novels", "≈ X round-trips of context"). Fun, shareable, and *more credible than
   theirs because our numbers are exact.* Add as a small static-config table.

### Medium effort (1–2 days)

7. **Per-tool/per-project summary row with inline sparklines** — their Today/7d/30d/Peak/
   Active-days/"30d shape" table is genuinely useful at a glance. We have all these numbers
   per project already; add the row layout + a tiny ECharts sparkline column.
8. **"What's driving the burn" categorization** — we already have tool/file/project
   breakdowns. We can ship a "work families" view by grouping prompts by project + tool
   signature, with an "evidence" column (top tools/files per family). Falls short of true
   semantic clustering but covers 80% of the value with data we already store.
9. **"Burn Moments" narrative timeline** — a per-day version of our expensive-prompts view:
   top N days by spend, each with the dominant project/tools as the "driver." We already
   surface the expensive *prompts*; rolling them up to a dated daily narrative is mostly
   presentation. (Theirs leans on an LLM to name workstreams; we can start with a
   data-derived label — top project + top tool — and add naming later.)
10. **Methodology/"how this works" affordance** — a small info popover explaining we use
    *exact* JSONL token counts (a trust signal that beats their estimate disclaimer).

### Architectural shift (weeks — decide deliberately)

9. **Multi-platform ingestion (Codex + ChatGPT).** This is their core differentiator and
   our biggest gap. Feasibility:
   - **Codex**: writes local session logs (`~/.codex/`); a second scanner module could
     parse them into the same `messages`/`tool_calls` schema with a `platform` column.
     *Moderately feasible* and keeps our "exact" advantage.
   - **ChatGPT**: no live local log — only the user-requested data export (a zipped JSON).
     Would require an import flow + estimation for chat tokens, which **breaks our
     "exact-only" promise.** This is the philosophical fork.
   - **Recommendation:** add a nullable `platform` column now (cheap, future-proof),
     ship Codex ingestion as a real exact source, and treat ChatGPT as an *optional
     import* clearly labeled "estimated" — never mixed silently into exact totals.

---

## 5. Conclusions (with one-line rationale)

1. **Adopt the visual layer immediately.** Heatmap + log scale + moving average +
   range tabs + Today/Peak KPIs are all quick wins on data we already have — they close
   our biggest *perception* gap with near-zero risk. *(Their best ideas are cheap for us.)*
2. **Ship Scale Equivalents — but lead with accuracy.** Our exact numbers make the Fermi
   hook more defensible than theirs. *(Steal the shareable hook, win on credibility.)*
3. **Do NOT abandon local-first/exact.** That's our moat. Their estimation + public deploy
   is a different product, not a better one. *(Don't trade our strength for their breadth.)*
4. **Add a `platform` column now, Codex scanner soon, ChatGPT import later (clearly
   labeled estimate).** This neutralizes their one real advantage on *our* terms without
   diluting data quality. *(Breadth, but only where we can stay exact.)*
5. **Surface methodology as a trust feature — and aim it squarely at their weakness.**
   Their headline Claude number (4.77B) is *almost entirely estimated* — "Claude exact" is
   0 on every recent day. Our Claude Code numbers are measured to the token. Advertise
   "exact, not estimated." *(Turn their biggest credibility gap into our headline.)*
6. **Keep cost-in-money + live + drill-downs front and center.** These are things they
   structurally cannot match as a mostly-static cross-tool aggregator. *(Defend the lead.)*
7. **Consider the editorial/light theme as an optional "report" view.** Their Tufte
   styling is genuinely more shareable/screenshot-friendly than our dark cockpit. A
   read-only "report" layout (light, narrative, export-to-image) could be a later play
   if shareability ever becomes a goal — but it's a *want*, not a *need*.

**One-paragraph summary:** Their dashboard is a polished, shareable, multi-platform
*story* built on estimates; ours is a precise, live, private *cockpit* for Claude Code.
The right move is to absorb their cheap visual/storytelling wins (heatmap, log scale,
moving average, range tabs, KPI cards, Fermi equivalents) over the next sprint, then make
a deliberate, staged bet on multi-platform ingestion — Codex first (exact), ChatGPT later
(import-only, explicitly estimated) — without ever compromising the exact, local-first
data model that is our actual differentiator.

---

## 6. Sources

- Live site, **full JS-rendered inspection via Chrome** (get_page_text + screenshot):
  https://dashboard-sepia-beta-83.vercel.app/ — analyzed 2026-06-06 on the 1y view.
  Captured real totals (14.3B; Codex 8.69B / Claude 4.77B / ChatGPT 822M), all KPI cards,
  the Burn Moments timeline, all 9 work families with shares + evidence, the per-tool
  summary table, Scale-Equivalents values + bases, the 30-day MA table, and the light
  Tufte design with stacked per-platform heatmaps. (An earlier WebFetch pass saw only
  static markup and missed the Burn Moments + per-tool sections — the browser pass is
  authoritative.)
- Our feature set: repo `CLAUDE.md`, `token_dashboard/db.py`
  (`daily_token_breakdown`, `expensive_prompts`, `_range_clause`, `model_breakdown`),
  `token_dashboard/scanner.py`, `web/app.js`, `web/routes/overview.js`
- Prior art for context: `docs/inspiration.md` (phuryn/claude-usage)
