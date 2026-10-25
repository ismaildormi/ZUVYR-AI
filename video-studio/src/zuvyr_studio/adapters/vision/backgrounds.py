"""Backgrounds: asset images (AI-generated anime scenery) with procedural fallback.

Both 16:9 and 9:16 are served: vertical frames use blurred-fill + center crop
of the wide asset, or a procedural vertical gradient scene.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from ...lib.rng import stable_seed
from ...lib.styles import LOCATION_BG_HINTS


def pick_asset(config, location: str, vertical: bool = False) -> Path | None:
    bg_dir = config.assets_dir / "backgrounds"
    if not bg_dir.exists():
        return None
    names = LOCATION_BG_HINTS.get(location.lower().split()[0] if location.split() else "street", [])
    if vertical:
        names = [n.replace("bg_", "bgv_") for n in names]
    for n in names:
        for ext in (".png", ".jpg", ".jpeg", ".webp"):
            p = bg_dir / (n + ext)
            if p.exists():
                return p
    # any vertical asset for vertical frames
    if vertical:
        cands = sorted(bg_dir.glob("bgv_*"))
        if cands:
            return cands[0]
    return None


# ------------------------------------------------------------------ procedural
def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def procedural_background(location: str, tod: str, w: int, h: int, seed: int = 0) -> Image.Image:
    rng = np.random.default_rng(stable_seed("bg", location, tod, str(seed)))
    sky_colors = {
        "dawn": ((64, 58, 118), (255, 154, 118)), "morning": ((120, 180, 230), (220, 240, 250)),
        "noon": ((100, 160, 230), (200, 230, 250)), "afternoon": ((110, 150, 210), (250, 210, 150)),
        "dusk": ((30, 26, 70), (255, 130, 70)), "sunset": ((50, 20, 60), (255, 100, 60)),
        "night": ((6, 8, 24), (30, 40, 90)), "day": ((110, 170, 230), (210, 235, 250)),
    }
    top, bottom = sky_colors.get(tod, sky_colors["dusk"])
    grad = np.zeros((h, w, 3), dtype=np.uint8)
    for y in range(h):
        t = y / max(1, h - 1)
        grad[y, :] = _lerp(top, bottom, t)
    img = Image.fromarray(grad)
    d = ImageDraw.Draw(img, "RGBA")

    loc = (location or "street").lower()
    horizon = int(h * 0.62)

    # stars at night
    if tod in ("night",):
        for _ in range(90):
            x, y = int(rng.uniform(0, w)), int(rng.uniform(0, horizon * 0.8))
            r = int(rng.uniform(0.6, 1.8))
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 240, 160))
        # moon
        mx, my, mr = int(w * 0.78), int(h * 0.16), int(w * 0.05)
        d.ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=(250, 248, 220, 255))
        d.ellipse([mx - mr * 0.35, my - mr * 0.5, mx + mr * 0.7, my + mr * 0.4], fill=(*_lerp(top, bottom, 0.4), 255))

    if any(k in loc for k in ("street", "city", "outside", "block")):
        # skyline silhouettes (2 layers)
        for layer, (base_y, alpha, shade) in enumerate([(horizon + 10, 255, (20, 22, 44)), (horizon - 30, 200, (36, 38, 66))]):
            x = -int(rng.uniform(0, 60))
            while x < w:
                bw = int(rng.uniform(w * 0.06, w * 0.16))
                bh = int(rng.uniform(h * 0.12, h * (0.34 if layer else 0.24)))
                y0 = base_y - bh
                d.rectangle([x, y0, x + bw, base_y + 40], fill=(*shade, alpha))
                # windows
                if layer == 0 and tod in ("night", "dusk", "sunset"):
                    for _ in range(int(bw * bh / 2600)):
                        wx = x + int(rng.uniform(6, max(7, bw - 10)))
                        wy = y0 + int(rng.uniform(8, max(9, bh - 12)))
                        if rng.random() < 0.55:
                            d.rectangle([wx, wy, wx + 5, wy + 7], fill=(255, 214, 120, 235))
                x += bw + int(rng.uniform(8, 30))
        d.rectangle([0, horizon + 40, w, h], fill=(26, 28, 46, 255))  # ground
        for i in range(6):  # road markings
            x = int(w * (0.1 + 0.15 * i))
            d.rectangle([x, int(h * 0.86), x + 26, int(h * 0.87)], fill=(255, 255, 255, 90))
    elif any(k in loc for k in ("school", "hallway")):
        vp_x = w // 2
        d.rectangle([0, 0, w, h], fill=(64, 58, 96, 255))
        # floor
        d.polygon([(0, h), (w, h), (vp_x + 90, int(h * 0.62)), (vp_x - 90, int(h * 0.62))], fill=(120, 100, 130, 255))
        # lockers walls
        for side in (-1, 1):
            x0 = vp_x + side * int(w * 0.16)
            d.polygon([(x0, int(h * 0.62)), (x0 + side * int(w * 0.4), 0), (x0 + side * int(w * 0.4), int(h * 0.14)), (x0, int(h * 0.52))], fill=(88, 110, 160, 255))
            for i in range(4):
                lx = x0 + side * int(i * w * 0.09)
                d.rectangle([min(lx, lx + 26), int(h * 0.2), max(lx, lx + 26) + 26, int(h * 0.55)], fill=(70, 90, 150, 255))
        d.rectangle([vp_x - 60, int(h * 0.3), vp_x + 60, int(h * 0.62)], fill=(250, 240, 200, 40))
    elif any(k in loc for k in ("rooftop", "roof")):
        d.rectangle([0, int(h * 0.74), w, int(h * 0.78)], fill=(70, 76, 96, 255))  # roof edge
        d.rectangle([0, int(h * 0.78), w, h], fill=(52, 56, 74, 255))
        for x in range(0, w, 44):  # railing
            d.rectangle([x, int(h * 0.66), x + 6, int(h * 0.78)], fill=(90, 96, 120, 255))
        d.rectangle([0, int(h * 0.66), w, int(h * 0.67)], fill=(110, 116, 140, 255))
        # water tower silhouette
        d.rectangle([int(w * 0.1), int(h * 0.42), int(w * 0.2), int(h * 0.6)], fill=(40, 42, 60, 255))
        d.polygon([(int(w * 0.09), int(h * 0.42)), (int(w * 0.15), int(h * 0.34)), (int(w * 0.21), int(h * 0.42))], fill=(40, 42, 60, 255))
    elif any(k in loc for k in ("apartment", "home", "room", "living")):
        d.rectangle([0, 0, w, h], fill=(96, 74, 66, 255))  # wall
        d.rectangle([0, int(h * 0.7), w, h], fill=(84, 60, 52, 255))  # floor
        # window
        d.rectangle([int(w * 0.62), int(h * 0.18), int(w * 0.9), int(h * 0.52)], fill=(40, 44, 80, 255))
        d.rectangle([int(w * 0.62), int(h * 0.18), int(w * 0.9), int(h * 0.52)], outline=(230, 220, 190, 255), width=8)
        d.line([int(w * 0.76), int(h * 0.18), int(w * 0.76), int(h * 0.52)], fill=(230, 220, 190, 255), width=5)
        # sofa
        d.rounded_rectangle([int(w * 0.08), int(h * 0.56), int(w * 0.42), int(h * 0.72)], 18, fill=(160, 88, 70, 255))
    else:  # alley / default
        d.rectangle([0, 0, w, h], fill=(70, 62, 72, 255))
        for i in range(8):  # graffiti blobs
            x, y = int(rng.uniform(0, w)), int(rng.uniform(int(h * 0.2), int(h * 0.8)))
            c = tuple(int(v) for v in rng.uniform([180, 60, 120], [255, 240, 90]))
            d.rounded_rectangle([x, y, x + int(rng.uniform(30, 130)), y + int(rng.uniform(16, 60))], 12, fill=(*c, 120))
        d.rectangle([0, int(h * 0.82), w, h], fill=(40, 38, 46, 255))
    return img


def vertical_from_wide(img: Image.Image, w: int, h: int) -> Image.Image:
    """9:16 from a 16:9 asset: blurred fill + center crop."""
    cover = img.resize((w, int(img.height * w / img.width)), Image.LANCZOS)
    if cover.height < h:
        cover = img.resize((int(img.width * h / img.height), h), Image.LANCZOS)
    bg = cover.crop(((cover.width - w) // 2, max(0, (cover.height - h) // 2), (cover.width - w) // 2 + w, min(cover.height, (cover.height - h) // 2 + h)))
    blur = bg.filter(ImageFilter.GaussianBlur(26)).resize((w, h))
    # center sharp slice
    side = int(w * 1.0)
    cx = img.width // 2
    slice_h = int(img.height * (h / max(1.0, w / img.width * img.height / h)))
    sharp = img.resize((w, int(img.width * h / w * (img.height / img.width)) + h), Image.LANCZOS) if img.width < w * 3 else img
    sh = int(w * img.height / img.width)
    if sh >= h:
        sharp = img.resize((w, sh), Image.LANCZOS)
        top = max(0, (sh - h) // 2)
        sharp = sharp.crop((0, top, w, top + h))
        blur.alpha_composite(sharp)
    return blur


def get_background(config, location: str, tod: str, w: int, h: int, seed: int = 0, vertical: bool = False) -> Image.Image:
    asset = pick_asset(config, location, vertical=vertical)
    if asset is not None:
        img = Image.open(asset).convert("RGB")
        # cover-fit
        scale = max(w / img.width, h / img.height)
        nw, nh = int(img.width * scale) + 1, int(img.height * scale) + 1
        img = img.resize((nw, nh), Image.LANCZOS)
        x0 = (nw - w) // 2
        y0 = (nh - h) // 2
        return img.crop((x0, y0, x0 + w, y0 + h))
    if vertical:
        wide = procedural_background(location, tod, 1280, 720, seed)
        return vertical_from_wide(wide, w, h)
    return procedural_background(location, tod, w, h, seed)
