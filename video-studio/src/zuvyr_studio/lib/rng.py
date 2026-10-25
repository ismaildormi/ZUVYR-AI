"""Deterministic seeding. Every generative decision in the pipeline is a pure
function of (video_id, scene_id, purpose, salt) so that re-runs and
scene-regenerations are reproducible."""
import hashlib


def stable_seed(*parts: str) -> int:
    h = hashlib.sha256("::".join(str(p) for p in parts).encode("utf-8")).digest()
    return int.from_bytes(h[:8], "big") & 0x7FFFFFFF


def seed_range(n: int, *parts: str) -> list[int]:
    base = stable_seed(*parts)
    out = []
    for i in range(n):
        h = hashlib.sha256(f"{base}:{i}".encode()).digest()
        out.append(int.from_bytes(h[:8], "big") & 0x7FFFFFFF)
    return out
