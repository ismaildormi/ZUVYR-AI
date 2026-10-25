"""Job store: resumable per-scene state, progress, timings."""
from __future__ import annotations

import time
from pathlib import Path

from ..config import Config
from ..lib.fs import read_json, write_json


class JobStore:
    def __init__(self, config: Config, video_id: str):
        self.config = config
        self.video_id = video_id
        self.dir = config.jobs_dir / video_id
        self.dir.mkdir(parents=True, exist_ok=True)
        self.path = self.dir / "job.json"
        data = read_json(self.path, None)
        if data is None:
            data = {
                "video_id": video_id,
                "status": "queued",  # queued|planning|running|assembling|done|error
                "created": time.time(),
                "updated": time.time(),
                "stages": {},
                "scenes": [],
                "timings": {},
                "engines": {},
                "error": None,
                "outputs": {},
            }
        self._data = data
        self.save()

    # ------------------------------------------------------------ access
    def get(self, key, default=None):
        return self._data.get(key, default)

    def set(self, key, value) -> None:
        self._data[key] = value
        self._data["updated"] = time.time()
        self.save()

    def stage(self, name: str) -> dict:
        return self._data["stages"].setdefault(name, {"status": "pending", "ts": None})

    def set_stage(self, name: str, status: str, **extra) -> None:
        st = self.stage(name)
        st.update({"status": status, "ts": time.time(), **extra})
        self.save()

    def init_scenes(self, scene_ids: list[str]) -> None:
        have = {s.get("scene_id") for s in self._data["scenes"]}
        for sid in scene_ids:
            if sid not in have:
                self._data["scenes"].append({
                    "scene_id": sid, "status": "pending",
                    "audio": None, "video": None, "frames": None, "duration_s": None,
                })
        self.save()

    def scene(self, scene_id: str) -> dict:
        for s in self._data["scenes"]:
            if s["scene_id"] == scene_id:
                return s
        raise KeyError(scene_id)

    def set_scene(self, scene_id: str, **kv) -> None:
        s = self.scene(scene_id)
        s.update(kv)
        s["ts"] = time.time()
        self.save()

    def progress(self) -> dict:
        scenes = self._data["scenes"]
        done = sum(1 for s in scenes if s.get("status") == "done")
        return {
            "video_id": self.video_id,
            "status": self._data["status"],
            "scenes_total": len(scenes),
            "scenes_done": done,
            "percent": int(100 * done / len(scenes)) if scenes else 0,
            "stage": next((k for k, v in reversed(list(self._data["stages"].items())) if v.get("status") == "running"), None),
            "error": self._data.get("error"),
            "outputs": self._data.get("outputs", {}),
        }

    def save(self) -> None:
        write_json(self.path, self._data)

    # ------------------------------------------------------------ resume
    def reset_scene(self, scene_id: str) -> None:
        try:
            s = self.scene(scene_id)
        except KeyError:
            return
        s.update({"status": "pending", "audio": None, "video": None, "frames": None})
        self._data["status"] = "running"
        self.save()
