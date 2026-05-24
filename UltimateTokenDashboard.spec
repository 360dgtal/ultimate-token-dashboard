# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

datas = [('/Users/stephanhack/token-dashboard/web', 'web'), ('/Users/stephanhack/token-dashboard/pricing.json', '.')]
binaries = []
hiddenimports = ['token_dashboard.scanner', 'token_dashboard.server', 'token_dashboard.db', 'token_dashboard.pricing', 'webview', 'webview.platforms.cocoa']
tmp_ret = collect_all('webview')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]


a = Analysis(
    ['/Users/stephanhack/token-dashboard/launcher_app.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='UltimateTokenDashboard',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='UltimateTokenDashboard',
)
app = BUNDLE(
    coll,
    name='UltimateTokenDashboard.app',
    icon=None,
    bundle_identifier=None,
)
