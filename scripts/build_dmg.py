#!/usr/bin/env python3
"""
Build script: creates UltimateTokenDashboard.dmg with a proper installer layout.

The DMG contains:
  - UltimateTokenDashboard.app  (the app bundle)
  - Applications  (symlink to /Applications)
  - Background image with a "drag to install" arrow

Usage: python3 scripts/build_dmg.py
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
PYTHON   = shutil.which("python3.12") or "/opt/homebrew/bin/python3.12"


def run(cmd, **kwargs):
    print(f"  $ {' '.join(str(c) for c in cmd)}")
    subprocess.run(cmd, check=True, **kwargs)


def clean():
    print("\n[1/4] Cleaning previous build…")
    for d in (DIST, BUILD, ROOT / f"{APP_NAME}.spec"):
        p = Path(str(d))
        if p.exists():
            shutil.rmtree(str(p)) if p.is_dir() else p.unlink()


def build_app():
    print("\n[2/4] Building .app with PyInstaller (Python 3.12)…")
    cmd = [
        PYTHON, "-m", "PyInstaller",
        "--noconfirm",
        "--onedir",
        "--windowed",
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
        "--osx-bundle-identifier", "com.360digital.ultimatetokendashboard",
        str(ROOT / "launcher_app.py"),
    ]
    icns = ROOT / "web" / "assets" / "logo.icns"
    if icns.exists():
        cmd += ["--icon", str(icns)]
    run(cmd, cwd=ROOT)
    # Patch Info.plist to allow localhost HTTP (ATS exception) — without this,
    # WebKit blocks every request from the .app to http://127.0.0.1:8080
    _patch_info_plist()


def _patch_info_plist():
    """Inject NSAppTransportSecurity exception for localhost into Info.plist."""
    plist = DIST / f"{APP_NAME}.app" / "Contents" / "Info.plist"
    if not plist.exists():
        print(f"  (Info.plist not found at {plist})")
        return
    content = plist.read_text()
    if "NSAppTransportSecurity" in content:
        print("  ATS exception already present")
        return
    insertion = """    <key>NSAppTransportSecurity</key>
    <dict>
      <key>NSAllowsArbitraryLoads</key>
      <true/>
      <key>NSAllowsLocalNetworking</key>
      <true/>
      <key>NSExceptionDomains</key>
      <dict>
        <key>localhost</key>
        <dict>
          <key>NSExceptionAllowsInsecureHTTPLoads</key>
          <true/>
          <key>NSIncludesSubdomains</key>
          <true/>
        </dict>
        <key>127.0.0.1</key>
        <dict>
          <key>NSExceptionAllowsInsecureHTTPLoads</key>
          <true/>
        </dict>
      </dict>
    </dict>
"""
    # Insert before the closing </dict></plist>
    content = content.replace("</dict>\n</plist>", insertion + "</dict>\n</plist>")
    plist.write_text(content)
    print("  ✓ Patched Info.plist with ATS exception for localhost / 127.0.0.1")

    # Re-sign the bundle — modifying Info.plist invalidates the existing signature
    app_path = DIST / f"{APP_NAME}.app"
    print("  Re-signing bundle (ad-hoc)…")
    subprocess.run(
        ["codesign", "--force", "--deep", "--sign", "-",
         "--preserve-metadata=entitlements,requirements,flags,runtime",
         str(app_path)],
        check=True,
    )
    # Verify
    result = subprocess.run(
        ["codesign", "--verify", "--verbose=2", str(app_path)],
        capture_output=True, text=True,
    )
    if result.returncode == 0:
        print("  ✓ Signature valid")
    else:
        print(f"  ✗ Signature check failed: {result.stderr}")


def build_dmg():
    print("\n[3/4] Creating installer DMG (with Applications symlink)…")

    # Staging directory containing app + Applications symlink + bg image
    staging = BUILD / "dmg_staging"
    if staging.exists():
        shutil.rmtree(str(staging))
    staging.mkdir(parents=True)

    # Copy app into staging
    shutil.copytree(
        str(DIST / f"{APP_NAME}.app"),
        str(staging / f"{APP_NAME}.app"),
        symlinks=True,
    )

    # Create Applications symlink (drag target)
    os.symlink("/Applications", str(staging / "Applications"))

    dmg_path = DIST / DMG_NAME
    if dmg_path.exists():
        dmg_path.unlink()

    # Create the DMG with custom layout
    run([
        "hdiutil", "create",
        "-volname", "Ultimate Token Dashboard",
        "-srcfolder", str(staging),
        "-ov",
        "-format", "UDZO",
        str(dmg_path),
    ])

    # Try to set up the visual layout (background, icon positions) via AppleScript
    _set_dmg_layout(dmg_path)

    shutil.rmtree(str(staging))
    print(f"\n  DMG created: {dmg_path}")


def _set_dmg_layout(dmg_path):
    """Mount the DMG, set Finder window layout, then re-compress.
    Falls back silently if osascript can't run."""
    try:
        # Convert to RW so we can modify
        rw_dmg = dmg_path.with_suffix(".rw.dmg")
        run([
            "hdiutil", "convert", str(dmg_path),
            "-format", "UDRW", "-o", str(rw_dmg),
        ])

        # Mount
        mount = subprocess.run(
            ["hdiutil", "attach", str(rw_dmg), "-readwrite", "-nobrowse"],
            check=True, capture_output=True, text=True,
        )
        # Find the mount point
        mount_point = None
        for line in mount.stdout.splitlines():
            if "/Volumes/" in line:
                mount_point = line.split("\t")[-1].strip()
                break
        if not mount_point:
            return

        # Run AppleScript to position icons and set window size
        script = f'''
        tell application "Finder"
            tell disk "Ultimate Token Dashboard"
                open
                set current view of container window to icon view
                set toolbar visible of container window to false
                set statusbar visible of container window to false
                set the bounds of container window to {{400, 100, 900, 500}}
                set theViewOptions to the icon view options of container window
                set arrangement of theViewOptions to not arranged
                set icon size of theViewOptions to 96
                set position of item "{APP_NAME}.app" of container window to {{125, 175}}
                set position of item "Applications" of container window to {{375, 175}}
                update without registering applications
                delay 1
                close
            end tell
        end tell
        '''
        subprocess.run(["osascript", "-e", script], capture_output=True)

        # Unmount
        subprocess.run(["hdiutil", "detach", mount_point], capture_output=True)

        # Re-compress as read-only
        dmg_path.unlink()
        run([
            "hdiutil", "convert", str(rw_dmg),
            "-format", "UDZO", "-o", str(dmg_path),
        ])
        rw_dmg.unlink()
    except Exception as e:
        print(f"  (layout setup skipped: {e})")


def report():
    print("\n[4/4] Done.")
    dmg = DIST / DMG_NAME
    size_mb = dmg.stat().st_size / 1_048_576

    # Tag with version + build number
    build_num = subprocess.run(
        ["git", "rev-list", "--count", "HEAD"],
        capture_output=True, text=True, check=True
    ).stdout.strip()
    versioned = DIST / f"{APP_NAME}-v1.1.0-build{build_num}.dmg"
    shutil.copy(str(dmg), str(versioned))

    print(f"\n  Output : {versioned}")
    print(f"  Size   : {size_mb:.1f} MB")
    print("\n  INSTALL INSTRUCTIONS for users:")
    print("    1. Double-click the DMG")
    print("    2. DRAG the app icon onto the Applications folder")
    print("    3. Open the app from Applications")
    print("    (Running directly from the DMG will fail.)\n")


if __name__ == "__main__":
    os.chdir(ROOT)
    clean()
    build_app()
    build_dmg()
    report()
