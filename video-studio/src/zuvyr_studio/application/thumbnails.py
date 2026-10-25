"""Thumbnails: 1280x720, 3 variants, same cast sprites + dramatic framing,
empty space for big text, text overlay via Pillow (Remotion-compatible assets)."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from ..lib.rng import stable_seed
from ..lib.styles import PALETTES, THUMB_STYLES
from ..schema import ScenePlan


def _font(size: int):
    from ..adapters.render.frames import _font as f

    return f(size, bold=True)


def _hex_rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def thumb_title(plan: ScenePlan, text: str | None = None) -> str:
    if text:
        return text.upper()
    t = plan.title.upper()
    words = t.split()
    if len(words) > 4:
        return " ".join(words[:4])
    return t or "UNTITLED"


def render_thumbnails(config, plan: ScenePlan, sprites: dict, out_dir: Path,
                      cast, text: str | None = None) -> list[Path]:
    from ..adapters.vision.backgrounds import get_background

    out_dir.mkdir(parents=True, exist_ok=True)
    w, h = config.get("thumbnail", {}).get("width", 1280), config.get("thumbnail", {}).get("height", 720)
    title = thumb_title(plan, text)
    paths = []

    # pick protagonist + one more char for variety
    leads = [c for c in plan.cast if c in sprites] or list(sprites)[:2]
    if not leads:
        leads = list(sprites)[:2]

    for vi, style in enumerate(THUMB_STYLES[:3]):
        pal = PALETTES[style["palette"]]
        seed = stable_seed("thumb", plan.video_id, str(vi))
        rng = np.random.default_rng(seed)
        char_id = leads[vi % len(leads)]
        spr = sprites[char_id]

        bg = get_background(config, "street", "dusk", w + 300, h + 200, seed=seed)
        bg = bg.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(2))
        frame = bg.convert("RGBA")
        d = ImageDraw.Draw(frame, "RGBA")

        # color grade toward palette
        ov = Image.new("RGBA", (w, h), (*pal["deep"], 110))
        frame.alpha_composite(ov)

        # character placement by layout
        layout = style["layout"]
        if layout == "left_char":
            cx, align = int(w * 0.30), "left"
        elif layout == "right_char":
            cx, align = int(w * 0.70), "right"
        else:
            cx, align = int(w * 0.5), "center"

        # zoomed character (bust framing)
        zoom = 1.65 if layout != "center_char" else 1.95
        sh = int(h * 0.98 * zoom)
        sw = int(spr.width * sh / spr.height)
        s = spr.resize((sw, sh), Image.LANCZOS)
        px = cx - sw // 2
        py = int(h * 0.92) - sh
        # radial speed lines behind char
        lines = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ld = ImageDraw.Draw(lines)
        for _ in range(40):
            ang = rng.uniform(0, 2 * np.pi)
            r0 = rng.uniform(0.2, 0.4) * w
            r1 = rng.uniform(0.7, 1.1) * w
            ld.line([cx + r0 * np.cos(ang), h / 2 + r0 * np.sin(ang),
                     cx + r1 * np.cos(ang), h / 2 + r1 * np.sin(ang)],
                    fill=(*pal["pop"], int(rng.uniform(40, 110))), width=int(rng.uniform(2, 6)))
        frame.alpha_composite(lines)
        frame.alpha_composite(s, (px, py))

        # accent glow ring
        glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.ellipse([cx - sw * 0.42, h * 0.18, cx + sw * 0.42, h * 1.02], outline=(*pal["accent"], 200), width=14)
        frame.alpha_composite(glow.filter(ImageFilter.GaussianBlur(9)))

        # ---- text zone
        d = ImageDraw.Draw(frame, "RGBA")
        words = title.split()
        lines = [words] if len(words) <= 3 else [words[: len(words) // 2], words[len(words) // 2 :]]
        fsize = 92 if layout != "center_char" else 84
        font = _font(fsize)
        tx = int(w * 0.60) if align == "left" else int(w * 0.06)
        if align == "center":
            ty = int(h * 0.06)
        else:
            ty = int(h * 0.24)
        text_color = (255, 214, 0) if style["text_style"] == "yellow_red" else (255, 255, 255)
        stroke = (180, 20, 20) if style["text_style"] == "yellow_red" else (20, 40, 120)
        for li, ws in enumerate(lines):
            s_ = " ".join(ws)
            tw = d.textlength(s_, font=font)
            if align == "center":
                xx = (w - tw) / 2
            elif align == "left":
                xx = tx
            else:
                xx = tx
            yy = ty + li * (fsize + 14)
            if align == "left":
                xx = max(xx, w * 0.5 + 10)
            # text shadow + stroke
            d.text((xx + 5, yy + 6), s_, font=font, fill=(0, 0, 0, 200), stroke_width=10, stroke_fill=(0, 0, 0, 200))
            d.text((xx, yy), s_, font=font, fill=text_color, stroke_width=9, stroke_fill=stroke)

        # bottom banner (episode vibe)
        if layout == "center_char":
            bf = _font(34)
            label = "A ZUVYR STUDIOS STORY"
            lw = d.textlength(label, font=bf)
            d.rounded_rectangle([(w - lw) / 2 - 24, h - 76, (w + lw) / 2 + 24, h - 18], 10, fill=(*pal["deep"], 235))
            d.text(((w - lw) / 2, h - 68), label, font=bf, fill=(255, 255, 255, 255))
        else:
            bf = _font(30)
            label = plan.style.replace("_", " ").upper() + " • NEW EPISODE"
            d.rounded_rectangle([24, 24, 24 + d.textlength(label, font=bf) + 28, 74], 8, fill=(*pal["accent"], 235))
            d.text((38, 32), label, font=bf, fill=(12, 12, 20, 255))

        out = out_dir / f"thumb_{chr(97 + vi)}.png"
        frame.convert("RGB").save(out)
        paths.append(out)
    return paths
