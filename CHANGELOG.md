# Changelog

All notable changes to Ultimate Token Dashboard are documented here.

---

## [Unreleased]

---

## [1.0.0] — 2026-05-24

### Added
- Cowork local-agent-mode session scanning (audit.jsonl support)
- Human-readable session titles from Cowork metadata files
- GBP/USD/EUR currency conversion with live exchange rates
- Currency dropdown in top bar (GBP default)
- Projects tab shows real session names and first prompt as subtitle
- `--no-cowork` flag and `CLAUDE_COWORK_DIR` env var
- Background 30-second scan loop includes Cowork sessions

### Changed
- Projects tab now groups Cowork sessions under readable labels
- Parser handles both camelCase and snake_case JSONL field names

### Fixed
- Tool call timestamps now correctly read `_audit_timestamp` from audit files

---

## [0.1.0] — Initial fork from nateherkai/token-dashboard

- Base dashboard with Overview, Prompts, Sessions, Projects, Skills, Tips, Settings
- Claude Code ~/.claude/projects/ scanning
- SQLite database with incremental scanning
- ECharts visualisations
- Dark theme UI
