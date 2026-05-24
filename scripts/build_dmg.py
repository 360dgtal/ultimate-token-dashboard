#!/usr/bin/env python3
"""
Build script: creates UltimateTokenDashboard.dmg for macOS distribution.

Usage:
    python3 scripts/build_dmg.py

Output:
    dist/UltimateTokenDashboard.dmg
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT     = Path(__file__).resolve().parent.parent
DIST     = ROOT / "dist"
BUILD    = ROOT / "build"
APP_NAME = "UltimateTokenDashboard"
DMG_NAME = f"{APP_NAME}.dmg"
ICON     = ROOT / "web" / "assets" / "logo.png"

PYINSTALLER = shutil.which("pyinstaller") or str(
    Path.home() / "Library" / "Python" / "3.9" / "bin" / "pyinstaller"
)


def run(cmd, **kwargs):
    print(f"  $ {' '.join(str(c) for c in cmd)}")
    subprocess.run(cmd, check=True, **kwargs)


def clean():
    print("\n[1/4] Cleaning previous build…")
    for d in (DIST, BUILD, ROOT / f"{APP_NAME}.spec"):
        if Path(str(d)).exists():
            shutil.rmtree(str(d)) if Path(str(d)).is_dir() else Path(str(d)).unlink()


def build_app():
    print("\n[2/4] Building .app with PyInstaller…")
    cmd = [
        PYINSTALLER,
        "--noconfirm",
        "--onedir",
        "--windowed",          # suppress terminal; GUI is the Tkinter launcher window
        "--name", APP_NAME,
        "--add-data", f"{ROOT / 'web'}:web",
        "--add-data", f"{ROOT / 'pricing.json'}:.",
        "--hidden-import", "token_dashboard.scanner",
        "--hidden-import", "token_dashboard.server",
        "--hidden-import", "token_dashboard.db",
        "--hidden-import", "token_dashboard.pricing",
        "--hidden-import", "webview",
        "--hidden-import", "webview.platforms.cocoa",
        "--collect-all", "webview",
        str(ROOT / "launcher_app.py"),   # pywebview launcher as entry point
    ]
    # Add icon if it's already an .icns; skip if it's a PNG (PyInstaller needs .icns on Mac)
    icns = ROOT / "web" / "assets" / "logo.icns"
    if icns.exists():
        cmd += ["--icon", str(icns)]

    run(cmd, cwd=ROOT)


def build_dmg():
    print("\n[3/4] Creating DMG…")
    app_path  = DIST / f"{APP_NAME}.app"
    dmg_path  = DIST / DMG_NAME

    if not app_path.exists():
        # onedir mode produces a folder, not .app — wrap it
        app_src = DIST / APP_NAME
        if not app_src.exists():
            print(f"ERROR: could not find {app_path} or {app_src}", file=sys.stderr)
            sys.exit(1)
        app_path = app_src

    # Use hdiutil to create a simple DMG
    tmp_dmg = DIST / f"{APP_NAME}_tmp.dmg"
    run([
        "hdiutil", "create",
        "-volname", "Ultimate Token Dashboard",
        "-srcfolder", str(app_path),
        "-ov", "-format", "UDZO",
        str(tmp_dmg),
    ])
    shutil.move(str(tmp_dmg), str(dmg_path))
    print(f"\n  DMG created: {dmg_path}")


def report():
    print("\n[4/4] Done.")
    dmg = DIST / DMG_NAME
    size_mb = dmg.stat().st_size / 1_048_576
    print(f"\n  Output : {dmg}")
    print(f"  Size   : {size_mb:.1f} MB")
    print("\n  To install: open the DMG, drag the app to Applications.")
    print("  To run from Terminal:  open /Applications/UltimateTokenDashboard.app")
    print()


if __name__ == "__main__":
    os.chdir(ROOT)
    clean()
    build_app()
    build_dmg()
    report()
