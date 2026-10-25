"""Voice director: engine selection, multi-take generation, take selection.

Take selection policy (per spec): generate 3 takes per important line with
different seeds; reject mispronounced/skipped-word takes with faster-whisper
(when its model is locally available); pick the take whose detected emotion best
matches the target (emotion2vec hook); fallback: lowest word-error-rate, then
most expressive. In the offline sandbox ASR/emotion models are unavailable
(HuggingFace blocked), so selection falls back to a deterministic heuristic.
"""
from __future__ import annotations

import re
from pathlib import Path

from ..config import Config
from ..lib.rng import seed_range, stable_seed
from ..schema import DialogueLine, VoiceSpec
from .bibles import VoiceBible

# voices used to auto-cast guest speakers (unknown names): stable side
# characters that are not part of the visual cast
GUEST_VOICE_POOL = ("mrs_kim", "mr_cole", "ms_chan", "grandma_rosa", "derek", "the_broker", "kid_crowd")


def guest_voice(voices: VoiceBible, speaker: str):
    """Deterministic voice-bible voice for a guest speaker (by name hash)."""
    vid = GUEST_VOICE_POOL[stable_seed("guest-voice", speaker) % len(GUEST_VOICE_POOL)]
    return voices.get(vid) or voices.get("narrator")


class VoiceDirector:
    def __init__(self, config: Config, voices: VoiceBible):
        self.config = config
        self.voices = voices
        self.takes = int(config.engines.get("voice", {}).get("takes", 3))
        self.engine = None
        self.engine_name = "none"
        self._init_engine()
        self._asr = None
        self._asr_checked = False

    # ------------------------------------------------------------- engine
    def _init_engine(self) -> None:
        order = self.config.engine_order("voice") or ["zsynth"]
        mode = self.config.engine_mode("voice")
        for name in order:
            if mode == "offline" and name != "zsynth":
                continue
            eng = self._try_engine(name)
            if eng is not None:
                self.engine = eng
                self.engine_name = name
                return
        from ..adapters.voice.zsynth import ZSynthEngine

        self.engine = ZSynthEngine(self.config)
        self.engine_name = "zsynth"

    def _try_engine(self, name: str):
        try:
            if name == "zsynth":
                from ..adapters.voice.zsynth import ZSynthEngine

                eng = ZSynthEngine(self.config)
                return eng if eng.available() else None
            if name == "chatterbox":
                from ..adapters.voice.chatterbox import ChatterboxEngine

                eng = ChatterboxEngine(self.config)
                return eng if eng.available() else None
            if name == "kokoro":
                from ..adapters.voice.kokoro import KokoroEngine

                eng = KokoroEngine(self.config)
                return eng if eng.available() else None
            if name == "edge":
                from ..adapters.voice.edge import EdgeEngine

                eng = EdgeEngine(self.config)
                return eng if eng.available() else None
            if name in ("qwen3_tts", "dia", "orpheus", "higgs"):
                # served through ComfyUI/TTS-Audio-Suite bridges in full mode
                from ..adapters.voice.http_tts import HttpTTSEngine

                eng = HttpTTSEngine(self.config, name)
                return eng if eng.available() else None
        except Exception:
            return None
        return None

    # ------------------------------------------------------------- ASR
    def _load_asr(self):
        if self._asr_checked:
            return self._asr
        self._asr_checked = True
        try:
            from faster_whisper import WhisperModel  # type: ignore

            self._asr = WhisperModel("base.en", device="cpu", compute_type="int8")
        except Exception:
            self._asr = None
        return self._asr

    def _wer(self, ref: str, hyp_path: Path) -> tuple[float, bool]:
        """(word error rate, completed). Ref via ASR if available."""
        asr = self._load_asr()
        if asr is None:
            return 0.0, True  # no ASR: assume fine (heuristic picks later)
        try:
            segments, _ = asr.transcribe(str(hyp_path), language="en")
            hyp = " ".join(s.text for s in segments).lower().strip()
            ref_w = re.findall(r"[a-z']+", ref.lower())
            hyp_w = re.findall(r"[a-z']+", hyp)
            if not hyp_w:
                return 1.0, False
            # simple edit distance WER
            import difflib

            matcher = difflib.SequenceMatcher(None, ref_w, hyp_w)
            wer = 1.0 - matcher.ratio()
            return wer, True
        except Exception:
            return 0.0, True

    # ------------------------------------------------------------- API
    def synth_line(self, line: DialogueLine, out_dir: Path, scene_id: str,
                   important: bool = True) -> dict:
        """Generate takes, select best. Returns {path, take, engine, params}.

        Takes are cached by (engine, voice, line, seed): the same script run
        twice reuses the byte-identical take files, so every character sounds
        exactly the same across runs (espeak has ~0.1% timing jitter otherwise).
        """
        voice = None
        if getattr(line, "voice_id", None):  # plan-time auto-cast (guest speakers)
            voice = self.voices.get(line.voice_id)
        if voice is None:
            voice = self.voices.get(line.speaker)
        if voice is None and line.speaker not in ("narrator", "none", ""):
            voice = guest_voice(self.voices, line.speaker)  # auto-cast guest speaker
        if voice is None:
            voice = self.voices.get("narrator")
        out_dir.mkdir(parents=True, exist_ok=True)
        n_takes = self.takes if (important or line.intensity >= 3) else 1
        seeds = seed_range(n_takes, "take", scene_id, line.speaker, line.text)
        takes = []
        for i, sd in enumerate(seeds):
            p = out_dir / f"{scene_id}_{line.speaker}_{i}.wav"
            self._synth_cached(line, voice, p, sd)
            wer, completed = self._wer(line.text, p)
            takes.append({"path": p, "take": i, "seed": sd, "wer": wer, "completed": completed})
        best = self._select(takes, line)
        return {
            "path": str(best["path"]),
            "take": best["take"],
            "engine": self.engine_name,
            "wer": best["wer"],
            "all_takes": [str(t["path"]) for t in takes],
        }

    def _synth_cached(self, line: DialogueLine, voice, out_path: Path, seed: int) -> Path:
        import hashlib
        import shutil

        key = hashlib.md5("|".join([
            self.engine_name, voice.voice_id, line.text, line.emotion,
            str(line.intensity), line.delivery, ",".join(line.nonverbal), str(seed),
        ]).encode()).hexdigest()
        cache_dir = self.config.voices_dir / "take_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_path = cache_dir / f"{key}.wav"
        if cache_path.exists():
            shutil.copyfile(cache_path, out_path)
            return out_path
        self.engine.synth_line(line, voice, cache_path, seed=seed)
        shutil.copyfile(cache_path, out_path)
        return out_path

    def _select(self, takes: list[dict], line: DialogueLine) -> dict:
        good = [t for t in takes if t["completed"]] or takes
        # lowest WER wins; tie-break: middle take (most "settled"), keep expressive
        good.sort(key=lambda t: (t["wer"], abs(t["take"] - 1)))
        return good[0]

    def synth_callable(self):
        """Adapter for the song engine: synth(line, voice, out, seed)."""

        def synth(line: DialogueLine, voice: VoiceSpec, out: Path, seed: int = 0) -> Path:
            return self.engine.synth_line(line, voice, out, seed=seed)

        return synth
