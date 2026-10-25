"""Bridge to the base app (itsPremkumar/Automated-Video-Generator, MIT).

When the base app checkout exists (scripts/setup_full_mode.sh clones it to
external/Automated-Video-Generator) we can reuse:
  * its Voicebox speech service (Kokoro) for narration  -> POST /api/tts
  * its Remotion renderer for final composition          -> npm run remotion:render
  * its MCP server (61 tools) for external orchestration

The bridge is optional: ZUVYR Studio is fully functional standalone.
"""
from __future__ import annotations

import json
import subprocess
import urllib.request
from pathlib import Path


class BaseAppBridge:
    def __init__(self, config):
        self.root = (config.external_dir / "Automated-Video-Generator").resolve()
        self.portal_url = "http://127.0.0.1:3001"

    def available(self) -> bool:
        return (self.root / "package.json").exists()

    # ---------------------------------------------------------------- Voicebox
    def voicebox_tts(self, text: str, voice: str = "af_heart", out_wav: Path = None) -> Path:
        payload = json.dumps({"text": text, "voice": voice, "format": "wav"}).encode()
        req = urllib.request.Request(self.portal_url + "/api/tts", data=payload,
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
        out_wav = out_wav or Path("voicebox.wav")
        out_wav.write_bytes(data)
        return out_wav

    # ---------------------------------------------------------------- Remotion
    def remotion_render(self, composition: str, props: dict, out_mp4: Path) -> Path:
        cmd = ["npx", "tsx", "src/render.ts", "--composition", composition,
               "--props", json.dumps(props), "--out", str(out_mp4)]
        subprocess.run(cmd, cwd=self.root, check=True, timeout=7200)
        return out_mp4
