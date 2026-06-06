"""HTTP server: static frontend + JSON endpoints + SSE diff stream."""
from __future__ import annotations

import getpass
import http.server
import json
import mimetypes
import queue
import threading
import time
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from .db import (
    overview_totals, expensive_prompts, project_summary,
    tool_token_breakdown, recent_sessions, session_turns,
    daily_token_breakdown, model_breakdown, skill_breakdown,
    cache_by_prompt, cache_by_skill, project_daily, burn_moments,
)
from .pricing import load_pricing, cost_for, get_plan, set_plan, fetch_rates
from .tips import all_tips, dismiss_tip
from .scanner import scan_dir, scan_cowork_dir
from .skills import cached_catalog


import sys as _sys

if getattr(_sys, 'frozen', False):
    # PyInstaller bundle — _MEIPASS is the extracted root containing web/ and pricing.json
    _ROOT = Path(_sys._MEIPASS)
else:
    _ROOT = Path(__file__).resolve().parent.parent

WEB_ROOT = _ROOT / "web"
PRICING_JSON = _ROOT / "pricing.json"

EVENTS: "queue.Queue[dict]" = queue.Queue()

MAX_POST_BYTES = 1_000_000  # 1 MB — we only accept tiny JSON bodies (plan, tip key)
MAX_LIMIT = 1000


def _send_json(handler, obj, status: int = 200) -> None:
    body = json.dumps(obj, default=str).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def _send_error(handler, status: int, msg: str) -> None:
    _send_json(handler, {"error": msg}, status=status)


_ICLOUD_PROJ = str(
    Path.home() / "Library" / "Mobile Documents"
    / "com~apple~CloudDocs" / "claude-projects"
)

_APP_VERSION = "1.1.0"
_UPDATE_CACHE: dict = {"ts": 0.0, "data": None}
_UPDATE_TTL = 3600  # 1 hour


def _check_for_update() -> dict:
    """Query GitHub Releases for the latest version. Cached 1h."""
    import urllib.request
    import urllib.error
    now = time.time()
    if _UPDATE_CACHE["data"] and (now - _UPDATE_CACHE["ts"]) < _UPDATE_TTL:
        return _UPDATE_CACHE["data"]
    result = {"current": _APP_VERSION, "latest": None, "update_available": False, "url": None}
    try:
        req = urllib.request.Request(
            "https://api.github.com/repos/360dgtal/ultimate-token-dashboard/releases/latest",
            headers={"Accept": "application/vnd.github.v3+json", "User-Agent": "UltimateTokenDashboard"},
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read())
            latest = (data.get("tag_name") or "").lstrip("v")
            result["latest"] = latest
            result["url"] = data.get("html_url")
            if latest and latest != _APP_VERSION:
                result["update_available"] = True
    except Exception:
        pass
    _UPDATE_CACHE["ts"] = now
    _UPDATE_CACHE["data"] = result
    return result


def _icloud_status() -> dict:
    """Check iCloud sync availability and state."""
    icloud_root = Path.home() / "Library" / "Mobile Documents" / "com~apple~CloudDocs"
    icloud_available = icloud_root.is_dir()
    icloud_proj = Path(_ICLOUD_PROJ)
    icloud_has_data = False
    icloud_sessions = 0

    if icloud_proj.is_dir():
        import glob
        icloud_sessions = len(glob.glob(str(icloud_proj / "*" / "*.jsonl")))
        icloud_has_data = icloud_sessions > 0

    local_proj = Path.home() / ".claude" / "projects"
    local_is_symlink = local_proj.is_symlink()
    local_points_to_icloud = (
        local_is_symlink
        and str(local_proj.resolve()).startswith(str(icloud_root))
    )

    return {
        "icloud_available":       icloud_available,
        "icloud_folder_exists":   icloud_proj.is_dir(),
        "icloud_has_data":        icloud_has_data,
        "icloud_sessions":        icloud_sessions,
        "sync_enabled":           local_points_to_icloud,
    }


def _enable_icloud_sync() -> dict:
    """Move ~/.claude/projects to iCloud Drive and symlink back."""
    import shutil
    local_proj = Path.home() / ".claude" / "projects"
    icloud_proj = Path(_ICLOUD_PROJ)
    icloud_root = Path.home() / "Library" / "Mobile Documents" / "com~apple~CloudDocs"

    if not icloud_root.is_dir():
        return {"ok": False, "error": "iCloud Drive not available on this Mac"}

    if local_proj.is_symlink():
        target = str(local_proj.resolve())
        if target == str(icloud_proj):
            return {"ok": True, "message": "Already synced"}
        return {"ok": False, "error": f"projects/ is already a symlink to {target}"}

    # Create iCloud folder
    icloud_proj.mkdir(parents=True, exist_ok=True)

    # Copy existing data to iCloud
    if local_proj.is_dir():
        for item in local_proj.iterdir():
            dest = icloud_proj / item.name
            if item.is_dir():
                if not dest.exists():
                    shutil.copytree(str(item), str(dest))
            else:
                if not dest.exists():
                    shutil.copy2(str(item), str(dest))
        # Rename local as backup
        backup = local_proj.parent / "projects_backup"
        local_proj.rename(backup)
    # Create symlink
    local_proj.symlink_to(icloud_proj)

    return {"ok": True, "message": "Sync enabled — data is now in iCloud Drive"}


def _connect_icloud() -> dict:
    """On a secondary Mac: point ~/.claude/projects at the iCloud folder."""
    import shutil
    local_proj = Path.home() / ".claude" / "projects"
    icloud_proj = Path(_ICLOUD_PROJ)

    if not icloud_proj.is_dir():
        return {"ok": False, "error": "No claude-projects folder found in iCloud Drive. Enable sync on your main Mac first."}

    if local_proj.is_symlink() and str(local_proj.resolve()) == str(icloud_proj):
        return {"ok": True, "message": "Already connected"}

    # Ensure .claude directory exists
    local_proj.parent.mkdir(parents=True, exist_ok=True)

    # Move existing local data aside if any
    if local_proj.exists() and not local_proj.is_symlink():
        backup = local_proj.parent / "projects_local_backup"
        if not backup.exists():
            local_proj.rename(backup)
        else:
            shutil.rmtree(str(local_proj))

    if local_proj.is_symlink():
        local_proj.unlink()

    local_proj.symlink_to(icloud_proj)
    return {"ok": True, "message": "Connected to iCloud data"}


def _detect_status(projects_dir: str, cowork_dir, db_path: str) -> dict:
    """Return what Claude data is available on this machine."""
    import glob
    projects_path = Path(projects_dir) if projects_dir else None
    cowork_path   = Path(cowork_dir) if cowork_dir else None

    claude_code_installed = Path.home().joinpath(".claude").is_dir()
    claude_desktop_installed = (
        Path.home() / "Library" / "Application Support" / "Claude"
    ).is_dir()

    # Count projects and JSONL files
    project_slugs = []
    session_files = 0
    if projects_path and projects_path.is_dir():
        for p in projects_path.iterdir():
            if p.is_dir() and not p.name.startswith("."):
                project_slugs.append(p.name)
                session_files += len(glob.glob(str(p / "*.jsonl")))

    # Count cowork sessions
    cowork_sessions = 0
    if cowork_path and cowork_path.is_dir():
        for ws in cowork_path.iterdir():
            if ws.is_dir():
                for cs in ws.iterdir():
                    if cs.is_dir():
                        cowork_sessions += 1

    icloud = _icloud_status()

    return {
        "username":                getpass.getuser(),
        "claude_code_installed":   claude_code_installed,
        "claude_desktop_installed": claude_desktop_installed,
        "projects_dir":            str(projects_path) if projects_path else None,
        "cowork_dir":              str(cowork_path) if cowork_path else None,
        "projects_found":          len(project_slugs),
        "sessions_found":          session_files,
        "cowork_sessions_found":   cowork_sessions,
        "has_data":                session_files > 0 or cowork_sessions > 0,
        **icloud,
    }


def _clamp_limit(raw, default: int) -> int:
    try:
        v = int(raw)
    except (TypeError, ValueError):
        return default
    return max(1, min(v, MAX_LIMIT))


# Explicit MIME types — mimetypes.guess_type fails inside PyInstaller bundles
_MIME = {
    ".html": "text/html; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg":  "image/svg+xml",
    ".ico":  "image/x-icon",
    ".icns": "image/x-icns",
    ".woff": "font/woff",
    ".woff2":"font/woff2",
    ".ttf":  "font/ttf",
    ".map":  "application/json",
}


def _serve_static(handler, rel: str) -> None:
    rel = rel.lstrip("/")
    p = (WEB_ROOT / rel).resolve()
    if not str(p).startswith(str(WEB_ROOT.resolve())) or not p.is_file():
        handler.send_response(404)
        handler.end_headers()
        return
    body = p.read_bytes()
    ext = p.suffix.lower()
    ctype = _MIME.get(ext) or mimetypes.guess_type(str(p))[0] or "application/octet-stream"
    handler.send_response(200)
    handler.send_header("Content-Type", ctype)
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Cache-Control", "no-cache")
    handler.end_headers()
    handler.wfile.write(body)


def build_handler(db_path: str, projects_dir: str, cowork_dir=None):
    pricing = load_pricing(PRICING_JSON)

    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass

        def do_HEAD(self):
            return self.do_GET()

        def do_GET(self):
            url = urlparse(self.path)
            qs = parse_qs(url.query or "")
            path = url.path
            since = qs.get("since", [None])[0]
            until = qs.get("until", [None])[0]
            if path in ("/", "/index.html"):
                return _serve_static(self, "index.html")
            if path.startswith("/web/"):
                return _serve_static(self, path[5:])
            if path == "/api/overview":
                totals = overview_totals(db_path, since, until)
                cost_usd = 0.0
                for m in model_breakdown(db_path, since, until):
                    c = cost_for(m["model"], m, pricing)
                    if c["usd"] is not None:
                        cost_usd += c["usd"]
                totals["cost_usd"] = round(cost_usd, 4)
                return _send_json(self, totals)
            if path == "/api/prompts":
                limit = _clamp_limit(qs.get("limit", ["50"])[0], 50)
                sort = qs.get("sort", ["tokens"])[0]
                rows = expensive_prompts(db_path, limit=limit, sort=sort)
                for r in rows:
                    c = cost_for(r["model"], {
                        "input_tokens": 0, "output_tokens": 0,
                        "cache_read_tokens": r["cache_read_tokens"],
                        "cache_create_5m_tokens": 0, "cache_create_1h_tokens": 0,
                    }, pricing)
                    r["estimated_cost_usd"] = c["usd"]
                return _send_json(self, rows)
            if path == "/api/projects":
                return _send_json(self, project_summary(db_path, since, until))
            if path == "/api/tools":
                return _send_json(self, tool_token_breakdown(db_path, since, until))
            if path == "/api/sessions":
                return _send_json(self, recent_sessions(
                    db_path, limit=_clamp_limit(qs.get("limit", ["20"])[0], 20),
                    since=since, until=until,
                ))
            if path == "/api/daily":
                return _send_json(self, daily_token_breakdown(db_path, since, until))
            if path == "/api/cache-efficiency":
                limit = _clamp_limit(qs.get("limit", ["15"])[0], 15)
                return _send_json(self, {
                    "by_prompt": cache_by_prompt(db_path, limit=limit, since=since, until=until),
                    "by_skill":  cache_by_skill(db_path, since=since, until=until),
                })
            if path == "/api/project-daily":
                return _send_json(self, project_daily(db_path, since, until))
            if path == "/api/burn-moments":
                limit = _clamp_limit(qs.get("limit", ["8"])[0], 8)
                return _send_json(self, burn_moments(db_path, limit=limit, since=since, until=until))
            if path == "/api/skills":
                rows = skill_breakdown(db_path, since, until)
                catalog = cached_catalog()
                for r in rows:
                    info = catalog.get(r["skill"])
                    r["tokens_per_call"] = info["tokens"] if info else None
                return _send_json(self, rows)
            if path == "/api/by-model":
                rows = model_breakdown(db_path, since, until)
                for r in rows:
                    c = cost_for(r["model"], r, pricing)
                    r["cost_usd"] = c["usd"]
                    r["cost_estimated"] = c["estimated"]
                return _send_json(self, rows)
            if path.startswith("/api/sessions/"):
                sid = path.rsplit("/", 1)[1]
                return _send_json(self, session_turns(db_path, sid))
            if path == "/api/tips":
                return _send_json(self, all_tips(db_path))
            if path == "/api/whoami":
                return _send_json(self, {"username": getpass.getuser()})
            if path == "/api/update-check":
                return _send_json(self, _check_for_update())
            if path == "/api/status":
                return _send_json(self, _detect_status(
                    projects_dir, cowork_dir, db_path))
            if path == "/api/rates":
                return _send_json(self, fetch_rates())
            if path == "/api/plan":
                return _send_json(self, {"plan": get_plan(db_path), "pricing": pricing})
            if path == "/api/scan":
                n = scan_dir(projects_dir, db_path)
                if cowork_dir:
                    cn = scan_cowork_dir(cowork_dir, db_path)
                    for k in n:
                        n[k] += cn[k]
                return _send_json(self, n)
            if path == "/api/stream":
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Connection", "keep-alive")
                self.end_headers()
                while True:
                    try:
                        evt = EVENTS.get(timeout=15)
                        chunk = f"data: {json.dumps(evt, default=str)}\n\n".encode()
                    except queue.Empty:
                        chunk = b": ping\n\n"
                    try:
                        self.wfile.write(chunk)
                        self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError):
                        return
            self.send_response(404)
            self.end_headers()

        def do_POST(self):
            url = urlparse(self.path)
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                return _send_error(self, 400, "invalid Content-Length")
            if length < 0 or length > MAX_POST_BYTES:
                return _send_error(self, 413, f"body too large (max {MAX_POST_BYTES} bytes)")
            try:
                body = json.loads(self.rfile.read(length) or b"{}") if length else {}
            except json.JSONDecodeError:
                return _send_error(self, 400, "invalid JSON")
            if not isinstance(body, dict):
                return _send_error(self, 400, "body must be a JSON object")
            if url.path == "/api/plan":
                set_plan(db_path, body.get("plan", "api"))
                return _send_json(self, {"ok": True})
            if url.path == "/api/tips/dismiss":
                dismiss_tip(db_path, body.get("key", ""))
                return _send_json(self, {"ok": True})
            if url.path == "/api/icloud/enable":
                return _send_json(self, _enable_icloud_sync())
            if url.path == "/api/icloud/connect":
                return _send_json(self, _connect_icloud())
            self.send_response(404)
            self.end_headers()

    return H


def _scan_loop(db_path: str, projects_dir: str, cowork_dir=None, interval: float = 30.0):
    while True:
        try:
            n = scan_dir(projects_dir, db_path)
            if cowork_dir:
                cn = scan_cowork_dir(cowork_dir, db_path)
                for k in n:
                    n[k] += cn[k]
            # Also scan iCloud projects folder if it exists and isn't
            # already the same directory (symlinked)
            icloud = Path(_ICLOUD_PROJ)
            local  = Path(projects_dir).resolve()
            if icloud.is_dir() and icloud.resolve() != local:
                icn = scan_dir(str(icloud), db_path)
                for k in n:
                    n[k] += icn[k]
            if n["messages"] > 0:
                EVENTS.put({"type": "scan", "n": n, "ts": time.time()})
        except Exception as e:
            EVENTS.put({"type": "error", "message": str(e)})
        time.sleep(interval)


def run(host: str, port: int, db_path: str, projects_dir: str, cowork_dir=None):
    threading.Thread(
        target=_scan_loop, args=(db_path, projects_dir, cowork_dir), daemon=True
    ).start()
    H = build_handler(db_path, projects_dir, cowork_dir)
    httpd = http.server.ThreadingHTTPServer((host, port), H)
    httpd.serve_forever()
