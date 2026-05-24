# Development Workflow

Follow these 5 stages for every change — design, feature, or bug fix.

---

## Stage 1 — Start a Branch

Always branch off main. Never work directly on main.

```bash
git checkout main
git pull
git checkout -b design/page-name-description
```

Branch naming:
- `design/` — visual/layout changes
- `feat/` — new functionality
- `fix/` — bug fixes
- `release/` — preparing a version

---

## Stage 2 — Design & Edit in VS Code

Start the server in fast mode (no scan, instant startup):

```bash
python3 cli.py dashboard --no-scan --no-open
```

Open http://127.0.0.1:8080 in Chrome.

**Edit loop:**
1. Open the file in VS Code
2. Make your change and press Cmd+S (auto-formats on save)
3. Refresh the browser to see the result
4. Repeat until happy

**Key files:**
| What you want to change | File |
|---|---|
| Colours, fonts, spacing | `web/style.css` |
| Top bar, navigation | `web/app.js` |
| Overview tab | `web/routes/overview.js` |
| Prompts tab | `web/routes/prompts.js` |
| Sessions tab | `web/routes/sessions.js` |
| Projects tab | `web/routes/projects.js` |
| Skills tab | `web/routes/skills.js` |
| Tips tab | `web/routes/tips.js` |
| Settings tab | `web/routes/settings.js` |
| Token pricing | `pricing.json` |

---

## Stage 3 — Preview & Sign Off

Check every tab that your change could affect.

Run to see exactly what changed:
```bash
git diff --stat
```

When happy, commit:
```bash
git add web/
git commit -m "design(overview): description of what changed"
```

---

## Stage 4 — Run Tests

```bash
# Automated tests (must all pass before merging)
python3 -m unittest discover tests -v

# Manual checklist (interactive)
python3 scripts/test_manual.py
```

All automated tests must pass. Sign off each manual checklist item.

---

## Stage 5 — Merge & Release

```bash
# Merge to main
git checkout main
git merge your-branch-name

# Tag the version
git tag v1.1.0

# Push everything
git push origin main --tags
```

Then build the DMG:
```bash
python3 scripts/build_dmg.py
```

Upload the DMG to GitHub Releases with the changelog entry.

---

## Version Numbering

`v MAJOR . MINOR . PATCH`

- **MAJOR** — breaking change or complete redesign (v2.0.0)
- **MINOR** — new feature or page (v1.1.0)
- **PATCH** — bug fix or small design tweak (v1.0.1)
