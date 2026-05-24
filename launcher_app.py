#!/usr/bin/env python3
"""
launcher_app.py — native-window launcher for Ultimate Token Dashboard.

Uses pywebview to render the dashboard UI inside a dedicated app window.
The HTTP server runs in a background thread; the webview points at
http://127.0.0.1:<PORT>.
"""
import os
import socket
import sys
import threading
import time
import traceback

# ── path / working-dir setup ─────────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    _base = sys._MEIPASS
else:
    _base = os.path.dirname(os.path.abspath(__file__))

os.chdir(_base)
sys.path.insert(0, _base)

_HOME   = os.path.expanduser("~")
_DB     = os.path.join(_HOME, ".claude", "token-dashboard.db")
_PROJ   = os.path.join(_HOME, ".claude", "projects")
_COWORK = os.path.join(_HOME, "Library", "Application Support",
                       "Claude", "local-agent-mode-sessions")

HOST = "127.0.0.1"
PORT = 8080

# ── startup error tracking ────────────────────────────────────────────────────
_server_error = None


def _find_free_port(start=8080, end=8099):
    """Find the first free port in range."""
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((HOST, port))
                return port
            except OSError:
                continue
    return start  # fallback


def _ensure_dirs():
    """Create required directories if they don't exist."""
    claude_dir = os.path.join(_HOME, ".claude")
    if not os.path.isdir(claude_dir):
        os.makedirs(claude_dir, exist_ok=True)
    proj_dir = _PROJ
    if not os.path.isdir(proj_dir):
        os.makedirs(proj_dir, exist_ok=True)


def _start_server(port):
    """Start the HTTP server. Sets _server_error on failure."""
    global _server_error
    try:
        _ensure_dirs()
        from token_dashboard.server import run as _run_server
        cowork = _COWORK if os.path.isdir(_COWORK) else None
        _run_server(HOST, port, _DB, _PROJ, cowork_dir=cowork)
    except Exception as e:
        _server_error = traceback.format_exc()


def _error_html(err_text):
    """Return a self-contained HTML page showing the startup error."""
    safe = (err_text or "Unknown error").replace("&", "&amp;").replace("<", "&lt;")
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body {{ background:#0A0E14; color:#E6EDF3; font-family:system-ui; padding:40px; }}
  h1 {{ color:#E5484D; font-size:20px; }}
  pre {{ background:#0F1419; border:1px solid #1F2630; border-radius:8px;
         padding:16px; font-size:12px; overflow-x:auto; color:#E8A23B; }}
  p {{ color:#8B98A6; font-size:13px; line-height:1.6; }}
  code {{ background:#131922; padding:2px 6px; border-radius:4px; color:#4A9EFF; font-size:12px; }}
</style></head><body>
<h1>Ultimate Token Dashboard — startup error</h1>
<p>The server couldn't start. Details below:</p>
<pre>{safe}</pre>
<p><b>Common fixes:</b></p>
<ul style="color:#8B98A6;font-size:13px;line-height:2">
  <li>Port {PORT} already in use — close other instances or restart your Mac</li>
  <li>Missing <code>~/.claude/</code> directory — install and run Claude Code once: <code>claude login</code></li>
  <li>Architecture mismatch — this build is for Apple Silicon (arm64)</li>
</ul>
<p>To see full logs, open Terminal and run:<br>
<code>/Applications/UltimateTokenDashboard.app/Contents/MacOS/UltimateTokenDashboard</code></p>
</body></html>"""


def _wait_for_server(port, timeout=8):
    """Wait until the server responds or timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _server_error:
            return False
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.5)
                s.connect((HOST, port))
                return True
        except (ConnectionRefusedError, OSError):
            time.sleep(0.3)
    return False


def main():
    import webview

    port = _find_free_port(PORT)
    url  = f"http://{HOST}:{port}"

    # Start server in background
    t = threading.Thread(target=_start_server, args=(port,), daemon=True)
    t.start()

    # Wait for server to be ready
    server_ok = _wait_for_server(port)

    if server_ok:
        window = webview.create_window(
            title="Ultimate Token Dashboard",
            url=url,
            width=1400,
            height=900,
            min_size=(900, 600),
            background_color="#0A0E14",
        )
    else:
        # Show error page inside the webview
        window = webview.create_window(
            title="Ultimate Token Dashboard — Error",
            html=_error_html(_server_error),
            width=800,
            height=600,
            background_color="#0A0E14",
        )

    webview.start(debug=False)


if __name__ == "__main__":
    main()
