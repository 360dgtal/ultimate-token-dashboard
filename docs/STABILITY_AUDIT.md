# Stability Audit — Ultimate Token Dashboard (May 2026)

This audit covers the desktop app (PyInstaller bundle) and its server. Each finding lists severity, root cause, the chosen fix, and the industry "best practice" alternative we considered.

---

## SEV-1 (data loss / wrong numbers)

### 1.1 Scanner over-evicts assistant message chains

**Symptom**: Recent user prompts disappear from the Prompts tab because their assistant reply is missing in the DB.

**Root cause**: `scanner._evict_prior_snapshots()` deletes every row that shares `(session_id, message_id)` except the one currently being inserted. But Claude Code can write *multiple records* sharing the same `message_id` that are **not** streaming snapshots — they're a chain (assistant text → tool_use → continuation), each with its own UUID and a `parent_uuid` pointing at the previous segment. The evictor mistakes them for snapshots and breaks the parent chain.

**Fix (this PR)**: only evict rows whose `parent_uuid` *also* matches. True streaming snapshots share parent + message_id; chain segments have different parents.

**Best-practice alternative**: Anthropic's own log replayers (e.g. `claude-code` itself) use the `stop_reason` field — `null/in-progress` means snapshot, anything else is a finalized segment. We don't have that field reliably, so the parent_uuid check is the next-best dedup signal.

---

### 1.2 No back-pressure / atomicity around scan + insert

**Symptom**: If the app is killed mid-scan, partial rows get committed; next scan resumes from the old byte offset and re-inserts.

**Root cause**: `scan_file()` updates `files.bytes_read` only at the end of a successful pass, but commits messages line-by-line.

**Fix (this PR)**: wrap each file scan in a single SQLite transaction (`BEGIN/COMMIT`). Either the whole file's new bytes ingest atomically or nothing changes.

**Best practice**: a write-ahead-log + checkpoint pattern. SQLite WAL mode already gives us this; we just need to use it.

---

## SEV-2 (UX / freshness)

### 2.1 No "force refresh" button

**Symptom**: When the dashboard view feels stale, users have no way to trigger an immediate scan from the UI.

**Fix (this PR)**: floating refresh button in the top-right of every page. Calls `/api/scan` then re-renders the current route. Spinner state while waiting.

---

### 2.2 SSE stream can die silently

**Symptom**: The dashboard subscribes to `/api/stream` for live updates, but if the connection drops (network blip, server restart, pywebview WebKit timeout) the page stops getting updates with no indication.

**Fix (this PR)**:
1. Auto-reconnect with exponential backoff (1s → 30s).
2. **5-minute hard refresh poll** as a fallback — if no SSE event has arrived in 5 minutes, force a `/api/scan` + re-render. Guarantees the dashboard never goes more than 5 min stale.
3. Connection status pill in the topbar: green dot when streaming, amber when polling, red when both failed.

**Best practice**: WebSockets with heartbeat frames. SSE is simpler and our server already emits it; the polling fallback covers SSE's weak spots.

---

### 2.3 In-progress responses join-blocked from Prompts view

**Symptom**: While Claude is still generating, the user prompt has no completed assistant row, so the Prompts JOIN excludes it.

**Fix (this PR)**: switch the Prompts query from `JOIN messages a` to `LEFT JOIN`. Show "(in progress)" for unmatched prompts so they at least appear with a timestamp.

---

## SEV-3 (build / distribution)

### 3.1 Manual DMG build, manual upload, manual versioning

**Symptom**: Every release needs a sequence of local commands; build numbers drift from git history; uploads to GitHub Releases done by hand.

**Fix (this PR)**: extend `scripts/build_dmg.py` so a single command:
- bumps the build number based on `git rev-list --count HEAD`
- builds + signs the .app
- packages with Applications-shortcut DMG layout
- uploads to GitHub Releases via API (token from `GH_TOKEN`)
- updates the `latest` tag

**Best practice**: GitHub Actions workflow on every tag push, doing build + sign + notarize + release. We can move to this once we have an Apple Developer ID (~$99/yr).

---

### 3.2 No app-side update notification

**Symptom**: A user with build 53 installed has no idea that build 56 is available on GitHub.

**Fix (this PR)**: launcher checks `https://api.github.com/repos/360dgtal/ultimate-token-dashboard/releases/latest` on startup (5-second timeout). If a newer tag exists, show a discreet "Update available" pill in the topbar with a download link. No auto-install (that requires notarization).

**Best practice**: Sparkle framework. Sparkle is the macOS gold standard for app updates with delta patches, but it requires a Developer ID and notarized appcasts. The lightweight check we're adding gets 80% of the benefit without the cert.

---

### 3.3 Ad-hoc signed = Gatekeeper warnings forever

**Symptom**: Every install triggers a "damaged app" or "from unidentified developer" warning. Users have to right-click → Open or use the Privacy & Security panel.

**Fix (this PR)**: documented workflow in README. Not solvable without code signing.

**Best practice**: Apple Developer Program membership ($99/yr) → Developer ID Application certificate → `codesign --sign 'Developer ID Application: ...'` → `xcrun notarytool submit`. Notarized apps launch with zero warnings.

---

## SEV-4 (operational)

### 4.1 SQLite DB grows unbounded

**Symptom**: After months of use the DB can hit GBs. No cleanup mechanism.

**Fix (deferred)**: add a Settings option "Keep last N days" with a daily prune job. Default: keep all.

### 4.2 Server binds only to 127.0.0.1 in DMG

**Symptom**: To use the dashboard from another Mac on the LAN, you have to launch from terminal with `HOST=0.0.0.0`. The app doesn't expose this.

**Fix (deferred)**: Settings toggle "Allow access from other devices on this network".

### 4.3 Cowork scan path is hardcoded to user home

**Fix (deferred)**: Settings field for custom Cowork path.

---

## Implementation order (this PR)

1. **Scanner fix** (1.1) — restores missing prompts immediately
2. **Atomic scans** (1.2) — eliminates partial-write corruption
3. **Force refresh button** + topbar status pill (2.1, 2.2)
4. **5-minute auto-refresh** fallback (2.2)
5. **In-progress prompts** in view (2.3)
6. **Build automation + upload** (3.1)
7. **Update notification** (3.2)

Deferred items (3.3, 4.x) are documented but not implemented in this PR.
