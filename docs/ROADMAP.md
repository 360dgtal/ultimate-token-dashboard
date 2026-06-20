# Roadmap / Backlog

Milestone snapshot — 2026-06-20. Captures scoped-but-unbuilt work so it can be
picked up later without re-deriving the analysis.

## Shipped (v1.2.0 + groundwork)

- Overview: daily burn heatmap, daily total + 30-day rolling avg with log toggle,
  1y range preset, Today/Peak KPIs.
- Cache efficiency (reuse vs rebuild) by project (exact), prompt (exact), skill
  (correlational); daily reuse-rate line.
- Burn moments (top spend days + driver); per-project activity sparklines;
  scale equivalents.
- Multi-platform groundwork: `messages.platform` column + guarded Codex rollout
  reader (`scanner.scan_codex_dir`), inert until `~/.codex/sessions/` exists.
  Token mapping web-verified; subagent-replay + cumulative-totals caveats noted
  in `docs/KNOWN_LIMITATIONS.md`.

## Backlog — scoped, not built

### 1. DB retention / pruning  ·  recommend build  ·  ~1–1.5h  ·  low risk
- Today: DB grows unbounded (~20 MB / ~20k rows); no prune. Fully derived from JSONL.
- Build: `db.prune_before(cutoff)` deleting old `messages` + `tool_calls`;
  `retention_days` setting (default **Keep all**) in the `plan` k/v table;
  Settings dropdown (Keep all / 90d / 180d / 1y) + "Prune now" button showing
  the row count it will remove; optional auto-prune in the scan loop.
- Note: `files` table offsets stay intact so pruned-but-on-disk transcripts are
  not re-imported. Add a confirm + "re-derivable from transcripts" copy.

### 2. Custom Cowork path (and projects path) in Settings  ·  recommend build  ·  ~1.5–2h  ·  low risk
- Today: `CLAUDE_COWORK_DIR` / `CLAUDE_PROJECTS_DIR` env or defaults, resolved at
  startup only (`cli._cowork_dir`, `cli._projects`).
- Build: text inputs in Settings (browsers can't return an absolute path from a
  folder picker — must be a text field), persisted in the `plan` table, with a
  live exists ✓/✗ check + "Save & rescan". Scan loop + `/api/scan` read the
  settings dynamically instead of only closure args.

### 3. LAN-access toggle  ·  build ONLY with a PIN, else skip  ·  ~2–3h  ·  HIGH risk
- Today: binds `127.0.0.1`. `HOST=0.0.0.0` works via env but there's no UI.
- The catch: the dashboard serves usage **and full prompt text with no auth** —
  binding `0.0.0.0` exposes all of it to anyone on the network. Bind address
  can't change at runtime, so a toggle applies on **next launch**.
- Recommended shape: Settings toggle (persisted) + a generated **access PIN**
  required to load the dashboard + display the LAN URL. Do NOT ship an
  unauthenticated `0.0.0.0` toggle.

### Shared groundwork for #1 and #3 (and #2)
Make the scan loop / `/api/scan` resolve paths + settings from the DB (`plan`
k/v) rather than only startup args, with env/default fallback.

## Deferred — full Codex ingestion
Build the real Codex usage view only once there is live data to validate
against. Resolve the subagent-replay dedup (thread_spawn, ~91x inflation) and
confirm the cumulative-vs-last token handling against a real rollout first.

## Distribution / friction (from early user feedback)
- The DMG already bundles its own Python (`Python.framework` inside the .app) —
  **no Python install is required**. The "needs Python" friction is perception
  (and an older system-Python build) — the real remaining friction is macOS
  Gatekeeper. Fully removing the "unidentified developer / damaged" prompt needs
  an Apple Developer ID + notarization ($99/yr).
- README must lead with the no-Python DMG download (done in this milestone).
- Screenshots in README/release need periodic refresh to show current features.
