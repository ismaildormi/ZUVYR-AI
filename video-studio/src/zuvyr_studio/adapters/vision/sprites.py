"""Character sprites: chroma-key reference images into RGBA sprites.

The default cast references are generated on a flat green background, so the
keyer samples the border, estimates the key color and removes it with feathered
edges + green-spill suppression. Falls back to full-frame use if keying fails
(e.g. user-supplied non-green reference) — identity stays identical either way
because the same source image is reused in every scene.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def _load_rgb(path: Path) -> np.ndarray:
    img = Image.open(path).convert("RGB")
    return np.asarray(img).astype(np.float32)


def key_reference(path: str | Path, out_path: str | Path, feather: float = 1.6) -> tuple[Path, dict]:
    """Key a green-screen reference into an RGBA sprite. Returns (out, stats)."""
    path, out_path = Path(path), Path(out_path)
    rgb = _load_rgb(path)
    h, w, _ = rgb.shape

    # --- estimate key color from border ring
    b = max(2, int(min(h, w) * 0.02))
    border = np.concatenate([
        rgb[:b].reshape(-1, 3), rgb[-b:].reshape(-1, 3),
        rgb[:, :b].reshape(-1, 3), rgb[:, -b:].reshape(-1, 3),
    ])
    med = np.median(border, axis=0)
    is_green = med[1] > med[0] + 24 and med[1] > med[2] + 24  # border dominated by green?
    stats = {"key_color": med.tolist(), "green_screen": bool(is_green), "size": [w, h]}

    if not is_green:
        # No green screen: soft corner-based luminance key attempt, else keep whole frame
        Image.open(path).convert("RGBA").save(out_path)
        stats["mode"] = "full_frame"
        return out_path, stats

    # --- green dominance mask
    mx = np.maximum(rgb[..., 0], rgb[..., 2])
    green_excess = rgb[..., 1] - mx  # >0 means greener than both R and B
    dist_bg = np.linalg.norm(rgb - med[None, None, :], axis=2)
    mask_fg = ((green_excess < 28) | (dist_bg > 110)).astype(np.float32)
    # remove isolated noise
    m = Image.fromarray((mask_fg * 255).astype(np.uint8))
    m = m.filter(ImageFilter.MedianFilter(3))
    mask = (np.asarray(m).astype(np.float32) / 255.0 > 0.5).astype(np.float32)

    # coverage sanity: subject should occupy 8-75% of the frame
    coverage = float(mask.mean())
    stats["coverage"] = round(coverage, 4)
    if coverage < 0.05 or coverage > 0.92:
        Image.open(path).convert("RGBA").save(out_path)
        stats["mode"] = "full_frame_fallback"
        return out_path, stats

    # --- feather edges + despill
    m_img = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(feather))
    alpha = np.asarray(m_img).astype(np.float32) / 255.0

    # keep only the largest connected subject blob (kills stray green-noise islands)
    try:
        from scipy import ndimage

        solid = alpha > 0.5
        labels, nlab = ndimage.label(solid)
        if nlab > 1:
            sizes = ndimage.sum(solid, labels, range(1, nlab + 1))
            keep = int(np.argmax(sizes)) + 1
            keep_mask = (labels == keep).astype(np.float32)
            # dilate slightly to retain feathered edges near the subject
            keep_mask = ndimage.binary_dilation(keep_mask, iterations=6).astype(np.float32)
            alpha = alpha * keep_mask
    except Exception:
        pass

    out = np.dstack([rgb, alpha[..., None] * 255.0]).astype(np.uint8)
    # despill: where green excess, clamp G toward max(R,B)
    g_ex = np.clip(rgb[..., 1] - mx, 0, None)
    out[..., 1] = np.clip(rgb[..., 1] - g_ex * 0.65, 0, 255)

    # crop to content bbox with margin
    ys, xs = np.where(alpha > 0.35)
    if len(ys):
        y0, y1 = max(0, ys.min() - 8), min(h, ys.max() + 9)
        x0, x1 = max(0, xs.min() - 8), min(w, xs.max() + 9)
        out = out[y0:y1, x0:x1]
        stats["bbox"] = [int(x0), int(y0), int(x1), int(y1)]

    Image.fromarray(out, "RGBA").save(out_path)
    stats["mode"] = "keyed"
    return out_path, stats


def load_sprite(path: str | Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def build_all_sprites(bible, force: bool = False) -> list[dict]:
    """Key every character reference. Idempotent (skips existing sprites)."""
    results = []
    for spec in bible.all():
        ref = Path(spec.reference)
        if not ref.exists():
            results.append({"id": spec.id, "ok": False, "error": "no reference image"})
            continue
        out = Path(spec.sprite)
        if out.exists() and not force:
            results.append({"id": spec.id, "ok": True, "cached": True})
            continue
        _, stats = key_reference(ref, out)
        results.append({"id": spec.id, "ok": True, **{k: v for k, v in stats.items() if k != "key_color"}})
    return results
