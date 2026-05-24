#!/usr/bin/env python3
"""
Generate web/assets/logo.icns for the macOS app bundle.

Creates a 1024×1024 icon: dark gradient background matching the app
(#0A0E14 → #0F1419) with the 360Digital logo centred and padded.
Then converts to .icns via iconutil.
"""
import math
import os
import shutil
import subprocess
from pathlib import Path

from PIL import Image

ROOT     = Path(__file__).resolve().parent.parent
LOGO_SRC = ROOT / "web" / "assets" / "logo.png"
ICNS_OUT = ROOT / "web" / "assets" / "logo.icns"
TMP_DIR  = ROOT / "build" / "icon_tmp"

# App background colours
BG_DARK   = (10, 14, 20)       # #0A0E14
BG_PANEL  = (15, 20, 25)       # #0F1419
BG_PANEL2 = (19, 25, 34)       # #131922
ACCENT    = (74, 158, 255, 40) # #4A9EFF — subtle glow, low alpha

SIZES = [16, 32, 64, 128, 256, 512, 1024]


def make_gradient_background(size: int) -> Image.Image:
    """Radial gradient from panel-2 centre → bg-dark edges, matching the app."""
    img = Image.new("RGBA", (size, size))
    cx, cy = size / 2, size / 2
    max_r  = math.sqrt(cx**2 + cy**2)

    pixels = []
    for y in range(size):
        for x in range(size):
            dist = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            t    = min(dist / max_r, 1.0)          # 0 = centre, 1 = corner
            # Interpolate BG_PANEL2 → BG_DARK
            r = int(BG_PANEL2[0] + (BG_DARK[0] - BG_PANEL2[0]) * t)
            g = int(BG_PANEL2[1] + (BG_DARK[1] - BG_PANEL2[1]) * t)
            b = int(BG_PANEL2[2] + (BG_DARK[2] - BG_PANEL2[2]) * t)
            pixels.append((r, g, b, 255))

    img.putdata(pixels)
    return img


def add_accent_glow(bg: Image.Image, size: int) -> Image.Image:
    """Subtle top-left blue glow, matching the app's radial-gradient accent."""
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cx, cy = size * 0.2, size * 0.2      # top-left quadrant
    max_r  = size * 0.65

    pixels = []
    for y in range(size):
        for x in range(size):
            dist = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            t    = max(0.0, 1.0 - dist / max_r)
            a    = int(ACCENT[3] * t * t)          # quadratic falloff
            pixels.append((ACCENT[0], ACCENT[1], ACCENT[2], a))

    glow.putdata(pixels)
    return Image.alpha_composite(bg, glow)


def make_rounded_mask(size: int, radius_frac: float = 0.22) -> Image.Image:
    """macOS-style rounded-rectangle mask."""
    mask = Image.new("L", (size, size), 0)
    from PIL import ImageDraw
    draw = ImageDraw.Draw(mask)
    r = int(size * radius_frac)
    draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=r, fill=255)
    return mask


def compose_icon(size: int) -> Image.Image:
    # 1. background
    bg = make_gradient_background(size)
    bg = add_accent_glow(bg, size)

    # 2. apply rounded-rect mask
    mask = make_rounded_mask(size)
    bg.putalpha(mask)

    # 3. logo — centre it with comfortable padding (logo fills ~60% of canvas)
    logo = Image.open(LOGO_SRC).convert("RGBA")
    target = int(size * 0.60)
    logo.thumbnail((target, target), Image.LANCZOS)

    lw, lh = logo.size
    x = (size - lw) // 2
    y = (size - lh) // 2
    bg.paste(logo, (x, y), logo)

    return bg


def build_icns():
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    iconset = TMP_DIR / "logo.iconset"
    iconset.mkdir(exist_ok=True)

    # macOS iconset naming convention
    name_map = {
        16:   ("icon_16x16.png",      None),
        32:   ("icon_16x16@2x.png",   "icon_32x32.png"),
        64:   ("icon_32x32@2x.png",   None),
        128:  ("icon_128x128.png",    None),
        256:  ("icon_128x128@2x.png", "icon_256x256.png"),
        512:  ("icon_256x256@2x.png", "icon_512x512.png"),
        1024: ("icon_512x512@2x.png", None),
    }

    for size in SIZES:
        print(f"  composing {size}×{size}…")
        icon = compose_icon(size)
        for fname in name_map[size]:
            if fname:
                icon.save(iconset / fname)

    print("  running iconutil…")
    subprocess.run(
        ["iconutil", "-c", "icns", str(iconset), "-o", str(ICNS_OUT)],
        check=True,
    )
    shutil.rmtree(str(TMP_DIR))
    print(f"  saved → {ICNS_OUT}")


if __name__ == "__main__":
    print("\nGenerating app icon…")
    build_icns()
    print("Done.\n")
