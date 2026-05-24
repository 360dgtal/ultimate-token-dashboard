# Testing Guide

Run before every merge to main.

---

## Automated Tests

```bash
python3 -m unittest discover tests -v
```

All 71 tests must pass. If any fail, do not merge.

---

## Manual Checklist

Run the interactive checklist:
```bash
python3 scripts/test_manual.py
```

Or check manually against the list below.

---

## Manual Test Cases

### Startup
- [ ] `python3 cli.py dashboard` starts without errors
- [ ] Browser opens automatically at http://127.0.0.1:8080
- [ ] Dashboard loads within 3 seconds
- [ ] No errors in Terminal output

### Top Bar
- [ ] All 7 nav tabs are visible and clickable
- [ ] Active tab is highlighted
- [ ] Currency dropdown shows GBP / USD / EUR
- [ ] Switching currency updates all cost figures instantly
- [ ] Plan pill shows current plan
- [ ] Blur button (Cmd+B) hides sensitive text

### Overview Tab
- [ ] Total cost displays in selected currency
- [ ] Session count is correct
- [ ] Turn count is correct
- [ ] Charts load without errors
- [ ] Date range filter works

### Prompts Tab
- [ ] Prompts list loads
- [ ] Sort by tokens works
- [ ] Sort by recent works
- [ ] Prompt text is readable
- [ ] Cost per prompt shows in selected currency

### Sessions Tab
- [ ] Sessions list loads
- [ ] Clicking a session shows its turns
- [ ] Timestamps are correct

### Projects Tab
- [ ] All projects listed with real names (not slugs)
- [ ] Cowork sessions show human-readable titles
- [ ] First prompt visible as subtitle
- [ ] Billable token counts correct

### Skills Tab
- [ ] Skills list loads
- [ ] Invocation counts visible

### Tips Tab
- [ ] Tips load
- [ ] Dismissing a tip removes it

### Settings Tab
- [ ] Plan selector works
- [ ] Changing plan saves correctly

### Cowork Scanning
- [ ] `python3 cli.py scan` picks up Cowork sessions
- [ ] Session titles appear from metadata files
- [ ] audit.jsonl messages are counted correctly

### Currency Conversion
- [ ] GBP is default on first load
- [ ] Currency preference saves across page refreshes
- [ ] Exchange rates load from API (check Terminal for errors)
- [ ] Falls back to defaults when offline

---

## Release Sign-Off

Before tagging a release, confirm:

- [ ] All automated tests pass
- [ ] All manual checklist items pass
- [ ] CHANGELOG.md updated with what changed
- [ ] Version number bumped in any relevant files
- [ ] DMG tested on a clean Mac (or by a tester)
- [ ] GitHub Release created with DMG attached
