"""Scene frame renderer (offline engine).

Composites per frame:
  background (asset or procedural, camera crop window) -> character sprites
  (chroma-keyed, idle bob / walk / emphasis pop / active-speaker focus) ->
  mouth animation (audio-envelope driven lip-sync) -> FX overlays (speed lines,
  rain, confetti, vignette, flash, grain) -> captions (burn-in).

Camera model: push_in/pull_out/pan/tilt/whip_pan/orbit/handheld implemented as a
moving crop window with eased curves — the Ken Burns/parallax stand-in for
AnimateDiff in degraded mode (full mode swaps in ComfyUI AnimateDiff clips).
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from ...lib.rng import stable_seed
from ...schema import Scene, ScenePlan

FONT_DIR = Path(__file__).resolve().parents[3] / "assets" / "fonts"


def _font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    for cand in (FONT_DIR / name, Path("/usr/share/fonts/truetype/dejavu") / name):
        if cand.exists():
            return ImageFont.truetype(str(cand), size)
    return ImageFont.load_default()


def _smoothstep(t: float) -> float:
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


# ================================================================= camera
CAM_ZOOM = {"push_in": (1.0, 1.16), "zoom_in": (1.0, 1.16), "pull_out": (1.16, 1.0),
            "zoom_out": (1.16, 1.0), "static": (1.03, 1.05), "pan_left": (1.10, 1.10),
            "pan_right": (1.10, 1.10), "tilt_up": (1.10, 1.10), "tilt_down": (1.10, 1.10),
            "whip_pan": (1.12, 1.12), "orbit": (1.10, 1.10), "handheld": (1.06, 1.06)}


class CameraTrack:
    """Crop-window trajectory over an oversized background."""

    def __init__(self, movement: str, bw: int, bh: int, w: int, h: int, seed: int = 0):
        self.move, self.bw, self.bh, self.w, self.h, self.seed = movement, bw, bh, w, h, seed
        self.z0, self.z1 = CAM_ZOOM.get(movement, (1.04, 1.10))

    def at(self, t01: float, frame_i: int) -> tuple[float, float, float, float, float]:
        """Return (cx, cy, zoom, rot_deg, blur_px)."""
        e = _smoothstep(t01)
        z = self.z0 + (self.z1 - self.z0) * e
        cx, cy = self.bw / 2, self.bh / 2
        move = self.move
        if move in ("pan_left", "whip_pan"):
            off = 0.055 * self.bw
            speed = e if move == "pan_left" else min(1.0, t01 * 3.2)
            cx = self.bw / 2 + off * (1 - 2 * speed)
        elif move == "pan_right":
            off = 0.055 * self.bw
            cx = self.bw / 2 - off * (1 - 2 * e)
        elif move == "tilt_up":
            off = 0.05 * self.bh
            cy = self.bh / 2 + off * (1 - 2 * e)
        elif move == "tilt_down":
            off = 0.05 * self.bh
            cy = self.bh / 2 - off * (1 - 2 * e)
        elif move == "orbit":
            a = 2 * math.pi * t01
            cx = self.bw / 2 + 0.03 * self.bw * math.cos(a)
            cy = self.bh / 2 + 0.02 * self.bh * math.sin(a)
        rot = 0.0
        blur = 0.0
        if move == "orbit":
            rot = 1.8 * math.sin(2 * math.pi * t01)
        if move == "handheld":
            ph = stable_seed("hh", str(self.seed)) % 100
            cx += 0.006 * self.bw * math.sin(2 * math.pi * (1.3 * t01) + ph)
            cy += 0.008 * self.bh * math.sin(2 * math.pi * (1.1 * t01) + ph * 2)
            rot = 0.5 * math.sin(2 * math.pi * 0.8 * t01 + ph)
        if move == "whip_pan":
            mid = abs(t01 - 0.5) * 2
            blur = 26 * max(0.0, 1 - mid * 1.15)
        return cx, cy, z, rot, blur


# ================================================================= renderer
class SceneRenderer:
    def __init__(self, config, plan: ScenePlan, scene: Scene, sprites: dict[str, Image.Image],
                 line_times: list[dict] | None = None, mouths: dict[str, np.ndarray] | None = None,
                 vertical: bool = False, srt: list | None = None):
        self.cfg = config
        self.plan = plan
        self.scene = scene
        self.sprites = sprites
        self.line_times = line_times or []
        self.mouths = mouths or {}
        self.vertical = vertical
        self.srt = srt or []
        fmt = "short" if vertical else "long"
        self.w, self.h = config.dims(fmt)
        self.fps = config.fps
        self.oversize = 1.38
        self.bw, self.bh = int(self.w * self.oversize), int(self.h * self.oversize)
        self.seed = scene.seed
        self.n_frames = max(2, int(round(scene.duration_s * self.fps)))
        self.rng = np.random.default_rng(self.seed)
        self.cam = CameraTrack(scene.camera.movement, self.bw, self.bh, self.w, self.h, self.seed)
        self.style = plan.style

        from ..vision.backgrounds import get_background
        self.bg = get_background(config, scene.location, scene.time_of_day, self.bw, self.bh,
                                 seed=self.seed, vertical=vertical)
        if self.bg.size != (self.bw, self.bh):
            self.bg = self.bg.resize((self.bw, self.bh), Image.LANCZOS)
        self._grain = self._make_grain()
        self._vignette = self._make_vignette()
        self._speedlines = self._make_speedlines()
        self._rain = self._make_rain()
        self._confetti = self._make_confetti()

    # ------------------------------------------------------------ assets
    def _make_grain(self) -> Image.Image:
        n = np.asarray(self.rng.normal(0, 9, (self.h // 2, self.w // 2)), dtype=np.float32)
        arr = np.clip(128 + n, 0, 255).astype(np.uint8)
        return Image.fromarray(arr, "L").resize((self.w, self.h))

    def _make_vignette(self) -> Image.Image:
        y, x = np.mgrid[0 : self.h, 0 : self.w]
        cx, cy = self.w / 2, self.h / 2
        d = np.sqrt(((x - cx) / (self.w * 0.72)) ** 2 + ((y - cy) / (self.h * 0.72)) ** 2)
        a = np.clip((d - 0.55) * 200, 0, 120).astype(np.uint8)
        return Image.fromarray(a, "L")

    def _make_speedlines(self) -> Image.Image:
        img = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        cx, cy = self.w / 2, self.h / 2
        rng = np.random.default_rng(stable_seed("sl", str(self.seed)))
        for _ in range(46):
            ang = rng.uniform(0, 2 * math.pi)
            r0 = rng.uniform(0.42, 0.55) * max(self.w, self.h)
            r1 = rng.uniform(0.75, 1.05) * max(self.w, self.h)
            wd = rng.uniform(1.5, 5.0)
            x0, y0 = cx + r0 * math.cos(ang), cy + r0 * math.sin(ang)
            x1, y1 = cx + r1 * math.cos(ang), cy + r1 * math.sin(ang)
            d.line([x0, y0, x1, y1], fill=(255, 255, 255, int(rng.uniform(60, 150))), width=int(wd))
        return img

    def _make_rain(self) -> Image.Image:
        img = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        rng = np.random.default_rng(stable_seed("rain", str(self.seed)))
        for _ in range(240):
            x, y = rng.uniform(0, self.w), rng.uniform(0, self.h)
            ln = rng.uniform(14, 34)
            d.line([x, y, x - 4, y + ln], fill=(200, 220, 255, int(rng.uniform(50, 110))), width=1)
        return img

    def _make_confetti(self) -> Image.Image:
        img = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        rng = np.random.default_rng(stable_seed("conf", str(self.seed)))
        cols = [(255, 209, 102), (46, 196, 182), (214, 51, 108), (150, 95, 255), (255, 255, 255)]
        for _ in range(160):
            x, y = rng.uniform(0, self.w), rng.uniform(0, self.h)
            s = rng.uniform(4, 10)
            d.polygon([(x, y), (x + s, y + s * 0.4), (x + s * 0.6, y + s), (x - s * 0.3, y + s * 0.5)],
                      fill=(*cols[int(rng.integers(0, len(cols)))], 170))
        return img

    # ------------------------------------------------------------ helpers
    def _accent(self, speaker: str) -> tuple[int, int, int]:
        spec = getattr(self, "_cast_lookup", {}).get(speaker)
        if spec:
            hexc = spec.accent_color.lstrip("#")
            return tuple(int(hexc[i : i + 2], 16) for i in (0, 2, 4))
        return (255, 209, 102)

    def attach_cast(self, cast) -> None:
        self._cast_lookup = {c.id: c for c in cast.all()}

    # ------------------------------------------------------------ frame
    def render_frame(self, i: int) -> Image.Image:
        t = i / self.fps
        t01 = i / max(1, self.n_frames - 1)
        cx, cy, z, rot, blur = self.cam.at(t01, i)

        # --- background crop window
        zw, zh = self.w / z, self.h / z
        x0 = int(cx - zw / 2)
        y0 = int(cy - zh / 2)
        x0 = max(0, min(self.bw - int(zw), x0))
        y0 = max(0, min(self.bh - int(zh), y0))
        frame = self.bg.crop((x0, y0, x0 + int(zw), y0 + int(zh))).resize((self.w, self.h), Image.LANCZOS)
        if abs(rot) > 0.05:
            frame = frame.rotate(rot, resample=Image.BILINEAR, fillcolor=None)
        frame = frame.convert("RGBA")
        par_dx = -(cx - self.bw / 2) * 0.10
        par_dy = -(cy - self.bh / 2) * 0.08

        # --- style treatment
        if self.style == "3d_render":
            frame = frame.filter(ImageFilter.GaussianBlur(0.6))
            frame = Image.blend(frame, frame.filter(ImageFilter.SMOOTH), 0.5)
        else:
            frame = frame.filter(ImageFilter.EDGE_ENHANCE())

        # --- active speaker + line state
        line = None
        for lt in self.line_times:
            if lt["start_s"] - 0.15 <= t <= lt["end_s"] + 0.35:
                line = lt
                break
        speaker = line["line"].speaker if line else None

        # --- characters
        chars = [c for c in self.scene.characters_present if c in self.sprites]
        n = len(chars)
        shot = self.scene.camera.shot
        base_h = {"wide": 0.62, "medium": 0.86, "close-up": 1.35, "extreme close-up": 1.9,
                  "over-the-shoulder": 0.95, "low angle": 0.95, "high angle": 0.9}.get(shot, 0.86)
        if self.vertical:
            base_h *= 1.22
        for k, cid in enumerate(chars):
            spr = self.sprites[cid]
            spec = self._cast_lookup.get(cid)
            hf = (spec.height if spec else 1.0)
            scale = (self.h * base_h * hf) / spr.height
            # action scenes: walk-in + run bob
            walk_x = 0.0
            if self.scene.role == "action":
                wprog = _smoothstep(min(1.0, t / max(0.8, self.scene.duration_s * 0.4)))
                walk_x = (1 - wprog) * (self.w * 0.5) * (1 if k % 2 == 0 else -1)
            if n == 1:
                bx = self.w * 0.5
            elif n == 2:
                bx = self.w * (0.32 if k == 0 else 0.68)
            else:
                bx = self.w * (0.22 + 0.28 * k) if n == 3 else self.w * (0.5 + 0.36 * (k / max(1, n - 1) - 0.5))
            if self.vertical:
                bx = self.w * (0.5 if n == 1 else (0.34 if k == 0 else 0.66)) if n <= 2 else self.w * (0.5 + 0.3 * (k / max(1, n - 1) - 0.5))
            by = self.h * (0.86 if not self.vertical else 0.80)
            if shot in ("close-up", "extreme close-up") and n == 1:
                by = self.h * (1.12 if shot == "close-up" else 1.45)
            if shot == "low angle":
                by = self.h * 0.95
            # idle bob + talking bob
            bob = 3.2 * math.sin(2 * math.pi * 0.55 * t + k * 1.7)
            open_m = 0.0
            if speaker == cid and line and "mouth" in line:
                open_m = self._mouth_open(line, t)
                bob += 2.6 * math.sin(2 * math.pi * 4.2 * t) * open_m
            # emphasis pop
            pop = 1.0
            if line and line["line"].speaker == cid and line["line"].intensity >= 4:
                dt = max(0.0, t - line["start_s"])
                pop = 1.0 + 0.05 * math.exp(-dt * 3.5)
            # active speaker focus
            dim = 1.0 if (speaker is None or speaker == cid or n == 1) else 0.72
            sw, sh = int(spr.width * scale * pop), int(spr.height * scale * pop)
            if sw < 2 or sh < 2:
                continue
            sprite = spr.resize((sw, sh), Image.LANCZOS)
            if dim < 1.0:
                sprite = Image.blend(sprite, Image.new("RGBA", sprite.size, (10, 10, 30, 0)), 0.35)
            px = int(bx - sw / 2 + par_dx * (0.7 + 0.3 * k) + walk_x)
            py = int(by - sh + par_dy + bob)
            # shadow
            shadow = Image.new("RGBA", frame.size, (0, 0, 0, 0))
            sd = ImageDraw.Draw(shadow)
            sd.ellipse([bx - sw * 0.28 + par_dx, by - 14, bx + sw * 0.28 + par_dx, by + 22], fill=(0, 0, 0, 90))
            frame.alpha_composite(shadow)
            frame.alpha_composite(sprite, (px, py))
            # mouth animation (lip-sync overlay)
            if speaker == cid and open_m > 0.05 and spec is not None:
                m = spec.mouth
                mw = int(sw * m["w"])
                mh = max(3, int(open_m * sh * m["h"] * 1.9))
                mx = px + int(sw * m["cx"]) - mw // 2
                my = py + int(sh * m["cy"]) - mh // 2
                md = ImageDraw.Draw(frame, "RGBA")
                md.ellipse([mx, my, mx + mw, my + mh], fill=(60, 20, 24, 190))

        # --- FX layers
        sfx_low = " ".join(self.scene.sfx_prompt).lower()
        if self.scene.role == "action" or "whip" in self.scene.camera.movement:
            a = 0.22 + 0.14 * math.sin(2 * math.pi * 0.8 * t)
            sl = self._speedlines.copy()
            sl.putalpha(sl.getchannel("A").point(lambda p, aa=a: int(p * aa)))
            frame.alpha_composite(sl)
        if "rain" in sfx_low:
            ry = int((t * 900) % 120)
            frame.alpha_composite(self._rain, (0, ry - 60))
            frame.alpha_composite(self._rain, (0, ry - 180))
        if self.scene.role == "song":
            frame.alpha_composite(self._confetti, (int((t * 40) % 60) - 30, int((t * 160) % 140) - 70))
        if line and line["line"].intensity >= 4 and 0 <= t - line["start_s"] <= 0.14:
            frame = Image.blend(frame, Image.new("RGBA", frame.size, (255, 255, 255, 255)), 0.5)
        frame = frame.convert("RGB")
        # vignette via composite
        black = Image.new("RGB", frame.size, (0, 0, 0))
        frame = Image.composite(black, frame, self._vignette)
        if blur > 1:
            frame = frame.filter(ImageFilter.GaussianBlur(min(6, blur / 5)))
        # grain
        frame = Image.blend(frame, Image.merge("RGB", (self._grain, self._grain, self._grain)), 0.05)

        # --- captions
        if line is not None:
            frame = self._draw_caption(frame, line, t)
        if self.scene.role == "song" and self.scene.song_segment:
            frame = self._draw_lower_third(frame, self.scene.song_segment.title, t)
        return frame

    def _mouth_open(self, line: dict, t: float) -> float:
        env = line.get("mouth")
        if env is None or env.size == 0:
            return 0.0
        hop = 0.02
        idx = int((t - line["start_s"]) / hop)
        if 0 <= idx < len(env):
            return float(min(1.0, env[idx] * 9.0))
        return 0.0

    def _draw_caption(self, frame: Image.Image, line: dict, t: float) -> Image.Image:
        ln = line["line"]
        text = ln.text
        accent = self._accent(ln.speaker)
        # chunk long narration lines
        chunks = _caption_chunks(text)
        span = max(0.2, line["end_s"] - line["start_s"])
        k = min(len(chunks) - 1, int((t - line["start_s"]) / span * len(chunks)))
        chunk = chunks[max(0, k)]
        fade = 1.0
        dt_in = t - (line["start_s"] + span * k / len(chunks))
        dt_out = (line["start_s"] + span * (k + 1) / len(chunks)) - t
        fade = min(1.0, dt_in / 0.12, dt_out / 0.12)

        shout = ln.delivery == "shout" or (ln.intensity >= 4 and ln.emotion in ("angry", "panicked", "excited"))
        base = 46 if not shout else 56
        if self.vertical:
            base = int(base * 0.72)
        font = _font(base)
        d = ImageDraw.Draw(frame, "RGBA")
        wrapped = _wrap(d, chunk, font, int(self.w * 0.86))
        lh = base + 10
        box_h = lh * len(wrapped) + 34
        maxw = max((d.textlength(s, font=font) for s in wrapped), default=10) + 44
        cx = self.w // 2
        y0 = int(self.h * (0.80 if not self.vertical else 0.60)) - box_h // 2
        # panel
        panel_a = int(150 * fade)
        d.rounded_rectangle([cx - maxw / 2, y0, cx + maxw / 2, y0 + box_h], 14, fill=(8, 10, 22, panel_a))
        d.rounded_rectangle([cx - maxw / 2, y0, cx - maxw / 2 + 8, y0 + box_h], 4, fill=(*accent, panel_a))
        # nameplate
        nf = _font(max(20, int(base * 0.44)))
        name = ln.speaker.replace("_", " ").upper()
        if ln.speaker != "narrator":
            nw = d.textlength(name, font=nf)
            d.rounded_rectangle([cx - nw / 2 - 12, y0 - 22, cx + nw / 2 + 12, y0 + 12], 8, fill=(*accent, int(230 * fade)))
            d.text((cx - nw / 2, y0 - 20), name, font=nf, fill=(12, 12, 20, 255))
        # text
        col = (255, 255, 255, int(255 * fade))
        if shout:
            col = (255, 224, 110, int(255 * fade))
        for j, s in enumerate(wrapped):
            wline = d.textlength(s, font=font)
            yy = y0 + 20 + j * lh
            shake = (0, 0)
            if shout and ln.intensity >= 4:
                shake = (int(2.4 * math.sin(t * 70)), int(2.4 * math.cos(t * 61)))
            d.text((cx - wline / 2 + shake[0], yy + shake[1]), s, font=font, fill=col,
                   stroke_width=max(2, base // 20), stroke_fill=(0, 0, 0, int(210 * fade)))
        if ln.nonverbal:
            tag = "♪ " + ", ".join(ln.nonverbal) + " ♪" if False else "(" + ", ".join(ln.nonverbal) + ")"
            tf = _font(22)
            tw2 = d.textlength(tag, font=tf)
            d.text((cx - tw2 / 2, y0 + box_h + 6), tag, font=tf, fill=(*accent, int(200 * fade)))
        return frame

    def _draw_lower_third(self, frame: Image.Image, title: str, t: float) -> Image.Image:
        d = ImageDraw.Draw(frame, "RGBA")
        fade = min(1.0, t / 0.4, max(0.0, (self.scene.duration_s - t) / 0.4))
        f = _font(40 if not self.vertical else 32)
        label = "♪ " + title.upper() + " ♪"
        w = d.textlength(label, font=f)
        x, y = (self.w - w) / 2, int(self.h * 0.06)
        d.rounded_rectangle([x - 26, y - 10, x + w + 26, y + 54], 12, fill=(20, 8, 34, int(200 * fade)))
        d.text((x, y), label, font=f, fill=(255, 209, 102, int(255 * fade)), stroke_width=2, stroke_fill=(0, 0, 0, 255))
        return frame

    # ------------------------------------------------------------ batch
    def render_all(self, out_dir: Path, prefix: str = "f") -> list[Path]:
        out_dir.mkdir(parents=True, exist_ok=True)
        paths = []
        for i in range(self.n_frames):
            p = out_dir / f"{prefix}_{i:05d}.png"
            self.render_frame(i).save(p, compress_level=1)
            paths.append(p)
        return paths

    def render_all_jpeg(self, out_dir: Path, quality: int = 92) -> list[Path]:
        out_dir.mkdir(parents=True, exist_ok=True)
        paths = []
        for i in range(self.n_frames):
            p = out_dir / f"f_{i:05d}.jpg"
            self.render_frame(i).save(p, quality=quality)
            paths.append(p)
        return paths


# ---------------------------------------------------------------- utils
def _wrap(d: ImageDraw.ImageDraw, text: str, font, max_w: int) -> list[str]:
    words = text.split()
    lines, cur = [], ""
    for w_ in words:
        cand = (cur + " " + w_).strip()
        if d.textlength(cand, font=font) <= max_w:
            cur = cand
        else:
            if cur:
                lines.append(cur)
            cur = w_
    if cur:
        lines.append(cur)
    return lines or [""]


def _caption_chunks(text: str, max_words: int = 9) -> list[str]:
    import re

    parts = re.split(r"(?<=[.!?,;])\s+", text.strip())
    chunks = []
    cur = []
    for p in parts:
        cur.append(p)
        if len(" ".join(cur).split()) >= max_words:
            chunks.append(" ".join(cur))
            cur = []
    if cur:
        chunks.append(" ".join(cur))
    return chunks or [text]


def render_title_card(config, plan: ScenePlan, sprites: dict[str, Image.Image], out_dir: Path,
                      duration_s: float = 2.6) -> list[Path]:
    """Channel intro / hook card."""
    w, h = config.dims("short" if plan.format == "short" else "long")
    fps = config.fps
    n = int(duration_s * fps)
    out_dir.mkdir(parents=True, exist_ok=True)
    bg = Image.new("RGB", (w, h))
    top, bottom = (24, 14, 52), (255, 130, 70)
    arr = np.zeros((h, w, 3), dtype=np.uint8)
    for y in range(h):
        t = y / (h - 1)
        arr[y, :] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    bg = Image.fromarray(arr).filter(ImageFilter.GaussianBlur(2))
    d = ImageDraw.Draw(bg, "RGBA")
    for i in range(60):  # speed bursts
        rng = np.random.default_rng(i)
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        d.line([x, y, x - rng.uniform(40, 140), y + rng.uniform(-8, 8)], fill=(255, 255, 255, 26), width=2)
    # cast silhouettes
    xs = np.linspace(0.16, 0.84, len(sprites) or 1)
    for k, (cid, spr) in enumerate(sprites.items()):
        sh = int(h * 0.52)
        sw = int(spr.width * sh / spr.height)
        s = spr.resize((sw, sh), Image.LANCZOS)
        sil = Image.new("RGBA", s.size, (10, 6, 24, 255))
        sil.putalpha(s.split()[3].point(lambda p: int(p * 0.85)))
        bg.paste(sil, (int(w * xs[k]) - sw // 2, int(h * 0.92) - sh), sil)
    paths = []
    title_f = _font(int(h * 0.085))
    sub_f = _font(int(h * 0.030))
    for i in range(n):
        frame = bg.copy()
        d = ImageDraw.Draw(frame, "RGBA")
        t01 = i / max(1, n - 1)
        a = int(255 * min(1.0, t01 * 2.2))
        pop = 1.0 + 0.04 * math.exp(-t01 * 4)
        tf = _font(int(h * 0.085 * pop))
        title = plan.title.upper()
        tw = d.textlength(title, font=tf)
        d.text(((w - tw) / 2, h * 0.30), title, font=tf, fill=(255, 255, 255, a), stroke_width=6, stroke_fill=(12, 8, 28, a))
        sub = "A ZUVYR STUDIOS ANIMATED STORY"
        sw = d.textlength(sub, font=sub_f)
        d.text(((w - sw) / 2, h * 0.30 + h * 0.105), sub, font=sub_f, fill=(255, 209, 102, a))
        if i < 4:
            frame = Image.blend(frame, Image.new("RGB", frame.size, (255, 255, 255)), 0.5 - i * 0.12)
        if i > n - 5:
            frame = Image.blend(frame, Image.new("RGB", frame.size, (0, 0, 0)), (i - (n - 5)) * 0.22)
        p = out_dir / f"f_{i:05d}.png"
        frame.save(p, compress_level=1)
        paths.append(p)
    return paths
