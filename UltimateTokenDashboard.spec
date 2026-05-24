# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['/Users/stephanhack/token-dashboard/cli.py'],
    pathex=[],
    binaries=[],
    datas=[('/Users/stephanhack/token-dashboard/web', 'web'), ('/Users/stephanhack/token-dashboard/pricing.json', '.')],
    hiddenimports=['token_dashboard.scanner', 'token_dashboard.server', 'token_dashboard.db', 'token_dashboard.pricing'],
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
