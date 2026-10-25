"""Filesystem helpers."""
from __future__ import annotations

import json
import os
import shutil
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]  # .../video-studio


def p(root: Path | str, *parts: str) -> Path:
    return Path(root).joinpath(*parts)


def ensure_dir(path: Path | str) -> Path:
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_json(path: Path | str, data: Any, indent: int = 2) -> None:
    path = Path(path)
    ensure_dir(path.parent)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=indent, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def read_json(path: Path | str, default: Any = None) -> Any:
    path = Path(path)
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path | str) -> str:
    return Path(path).read_text(encoding="utf-8")


def latest_file(directory: Path | str, pattern: str = "*") -> Path | None:
    d = Path(directory)
    if not d.exists():
        return None
    files = [f for f in d.glob(pattern) if f.is_file()]
    return max(files, key=lambda f: f.stat().st_mtime) if files else None


def clear_dir(path: Path | str, keep: list[str] | None = None) -> None:
    keep = keep or []
    path = Path(path)
    if not path.exists():
        return
    for child in path.iterdir():
        if child.name in keep:
            continue
        if child.is_dir():
            shutil.rmtree(child, ignore_errors=True)
        else:
            child.unlink(missing_ok=True)


def fresh_dir(path: Path | str) -> Path:
    clear_dir(path)
    return ensure_dir(path)


def rel_to_root(path: Path | str) -> str:
    try:
        return str(Path(path).resolve().relative_to(ROOT.resolve()))
    except ValueError:
        return str(Path(path).resolve())


def stamp() -> str:
    return time.strftime("%Y%m%d-%H%M%S")


def fmt_ts(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, rem = divmod(ms, 3600000)
    m, rem = divmod(rem, 60000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"
