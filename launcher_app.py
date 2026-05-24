#!/usr/bin/env python3
"""
launcher_app.py — double-click GUI launcher for Ultimate Token Dashboard.

When bundled into a .app with PyInstaller, this is the entry point.
It shows a small dark status window, starts the HTTP server in a
background thread, and opens the browser automatically.
"""
import os
import sys
import threading
import webbrowser
import tkinter as tk

# ── path / working-dir setup ─────────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    # Running inside a PyInstaller bundle — _MEIPASS has web/ and pricing.json
    _base = sys._MEIPASS
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


# ── launcher window ───────────────────────────────────────────────────────────
class Launcher(tk.Tk):
    BG     = "#0A0E14"
    PANEL  = "#0F1419"
    BORDER = "#1F2630"
    ACCENT = "#4A9EFF"
    TEXT   = "#E6EDF3"
    MUTED  = "#8B98A6"
    GOOD   = "#3FB68B"
    BAD    = "#E5484D"

    def __init__(self):
        super().__init__()
        self.title("Ultimate Token Dashboard")
        self.configure(bg=self.BG)
        self.resizable(False, False)
        self._build()
        self.after(300, self._start_server)

    def _build(self):
        # ── header ───────────────────────────────────────────────────────────
        hdr = tk.Frame(self, bg=self.PANEL, padx=20, pady=14)
        hdr.pack(fill="x")

        # Try to show logo; fall back gracefully if image module isn't available
        try:
            logo_path = os.path.join(_base, "web", "assets", "logo.png")
            if os.path.exists(logo_path):
                from PIL import Image, ImageTk  # type: ignore
                img = Image.open(logo_path).convert("RGBA")
                img.thumbnail((22, 22))
                self._logo = ImageTk.PhotoImage(img)
                tk.Label(hdr, image=self._logo, bg=self.PANEL).pack(side="left", padx=(0, 8))
        except Exception:
            pass

        tk.Label(hdr, text="Ultimate Token Dashboard",
                 bg=self.PANEL, fg=self.TEXT,
                 font=("Helvetica Neue", 14, "bold")).pack(side="left", anchor="w")

        # ── body ─────────────────────────────────────────────────────────────
        body = tk.Frame(self, bg=self.BG, padx=24, pady=18)
        body.pack(fill="both", expand=True)

        self._status_var = tk.StringVar(value="Starting…")
        self._status_lbl = tk.Label(body, textvariable=self._status_var,
                                    bg=self.BG, fg=self.MUTED,
                                    font=("Helvetica Neue", 12))
        self._status_lbl.pack(anchor="w", pady=(0, 6))

        url_lbl = tk.Label(body, text=URL, bg=self.BG, fg=self.ACCENT,
                           font=("Menlo", 12), cursor="hand2")
        url_lbl.pack(anchor="w")
        url_lbl.bind("<Button-1>", lambda _: webbrowser.open(URL))

        # ── buttons ───────────────────────────────────────────────────────────
        btn_row = tk.Frame(self, bg=self.BG, padx=24, pady=14)
        btn_row.pack(fill="x")

        tk.Button(btn_row, text="Open in browser",
                  command=lambda: webbrowser.open(URL),
                  bg=self.ACCENT, fg="white", activebackground="#3a8eef",
                  relief="flat", padx=14, pady=7,
                  font=("Helvetica Neue", 11), cursor="hand2"
                  ).pack(side="left", padx=(0, 10))

        tk.Button(btn_row, text="Stop server",
                  command=self._stop,
                  bg=self.PANEL, fg=self.MUTED, activebackground=self.BORDER,
                  relief="flat", padx=14, pady=7,
                  font=("Helvetica Neue", 11), cursor="hand2"
                  ).pack(side="left")

        self.geometry("400x210")
        self.eval("tk::PlaceWindow . center")

    def _start_server(self):
        cowork = _COWORK if os.path.isdir(_COWORK) else None
        t = threading.Thread(
            target=_run_server,
            args=(HOST, PORT, _DB, _PROJ),
            kwargs={"cowork_dir": cowork},
            daemon=True,
        )
        t.start()
        self.after(1400, self._on_ready)

    def _on_ready(self):
        self._status_var.set("Server running — click the link to open")
        self._status_lbl.configure(fg=self.GOOD)
        webbrowser.open(URL)

    def _stop(self):
        self.destroy()
        os._exit(0)


if __name__ == "__main__":
    app = Launcher()
    app.mainloop()
