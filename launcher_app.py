#!/usr/bin/env python3
"""
launcher_app.py — native-window launcher for Ultimate Token Dashboard.

Uses pywebview to render the dashboard UI inside a dedicated app window —
no browser tab needed. The HTTP server runs in a background thread;
the webview points at http://127.0.0.1:8080.
"""
import os
import sys
import threading
import time

# ── path / working-dir setup ─────────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    _base = sys._MEIPASS          # web/ and pricing.json live here when frozen
else:
    _base = os.path.dirname(os.path.abspath(__file__))

os.chdir(_base)
sys.path.insert(0, _base)

# ── dashboard internals ───────────────────────────────────────────────────────
from token_dashboard.server import run as _run_server  # noqa: E402

_HOME   = os.path.expanduser("~")
_DB     = os.path.join(_HOME, ".claude", "token-dashboard.db")
_PROJ   = os.path.join(_HOME, ".claude", "projects")
_COWORK = os.path.join(_HOME, "Library", "Application Support",
                       "Claude", "local-agent-mode-sessions")

HOST = "127.0.0.1"
PORT = 8080
URL  = f"http://{HOST}:{PORT}"


def _start_server():
    """Start the HTTP server in a daemon thread."""
    cowork = _COWORK if os.path.isdir(_COWORK) else None
    t = threading.Thread(
        target=_run_server,
        args=(HOST, PORT, _DB, _PROJ),
        kwargs={"cowork_dir": cowork},
        daemon=True,
    )
    t.start()
    # Give the server a moment to bind before the webview tries to load
    time.sleep(1.2)


def main():
    import webview  # pywebview — imported here so path is set up first

    # Start server, wait for it to be ready, then open the window
    server_thread = threading.Thread(target=_start_server, daemon=True)
    server_thread.start()
    server_thread.join()  # wait until _start_server's sleep finishes

    window = webview.create_window(
        title="Ultimate Token Dashboard",
        url=URL,
        width=1400,
        height=900,
        min_size=(900, 600),
        background_color="#0A0E14",
    )

    webview.start(debug=False)


if __name__ == "__main__":
    main()
