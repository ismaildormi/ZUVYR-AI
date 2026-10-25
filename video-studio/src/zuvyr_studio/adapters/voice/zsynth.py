"""zsynth — the always-available offline voice engine.

Pipeline: espeak-ng synth (per-character voice persona) -> numpy/ffmpeg DSP
chain (pitch shift, EQ, tremolo/vibrato, dynamics) -> per-line take files.

Fully deterministic: same (voice_id, line, seed) -> byte-identical audio.
"""
from __future__ import annotations

import threading
from pathlib import Path

import numpy as np

from ...lib import audio as A
from ...lib.ffmpeg import ffmpeg_path, run as ff_run
from ...lib.rng import stable_seed
from ...schema import DialogueLine, VoiceSpec
from ...application.emotion import line_params

_LOCK = threading.Lock()  # espeak global state


class ZSynthEngine:
    name = "zsynth"
    full_mode = False  # offline degraded engine

    def __init__(self, config) -> None:
        self.config = config
        self._espeak = None
        self._voice_cache: dict[str, dict] = {}

    # ------------------------------------------------------------- espeak
    @staticmethod
    def _lang_voice(lang: str) -> str:
        """Config narration_language -> espeak-ng voice (en default)."""
        lang = (lang or "en").lower().strip()
        return {
            "en": "en-us", "en-us": "en-us", "us": "en-us", "en-gb": "en", "gb": "en", "uk": "en",
            "fr": "fr", "fr-fr": "fr", "es": "es", "es-es": "es", "de": "de", "it": "it",
            "pt": "pt", "nl": "nl", "pl": "pl", "ru": "ru", "hi": "hi", "ar": "ar",
        }.get(lang, "en-us")

    def _es(self):
        if self._espeak is None:
            from .espeak_core import Espeak

            self._espeak = Espeak()
        return self._espeak

    def _persona(self, voice: VoiceSpec) -> dict:
        p = dict(voice.params or {})
        p.setdefault("espeak_voice", self._lang_voice(self.config.language))
        p.setdefault("rate", 170)
        p.setdefault("pitch", 45)
        p.setdefault("range", 40)
        p.setdefault("volume", 100)
        p.setdefault("wordgap", 4)
        p.setdefault("semitones", 0.0)          # DSP pitch shift after synth
        p.setdefault("eq", "flat")
        p.setdefault("reverb", "none")
        return p

    # ------------------------------------------------------------- synth
    def synth_line(self, line: DialogueLine, voice: VoiceSpec, out_wav: Path, seed: int | None = None) -> Path:
        seed = seed if seed is not None else stable_seed("take", voice.voice_id, line.text)
        # cache: espeak has ~0.1% timing jitter run-to-run; the cache guarantees
        # byte-identical takes for identical (voice, line, seed) across runs.
        import hashlib
        import shutil

        key = hashlib.md5("|".join([voice.voice_id, line.text, line.emotion, str(line.intensity),
                                    line.delivery, ",".join(line.nonverbal), str(seed)]).encode()).hexdigest()
        cache_dir = self.config.voices_dir / "take_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_path = cache_dir / f"{key}.wav"
        if cache_path.exists():
            shutil.copyfile(cache_path, out_wav)
            return out_wav
        self._synth_uncached(line, voice, out_wav, seed)
        shutil.copyfile(out_wav, cache_path)
        return out_wav

    def _synth_uncached(self, line: DialogueLine, voice: VoiceSpec, out_wav: Path, seed: int) -> Path:
        persona = self._persona(voice)
        emo = line_params(line)
        take_seed = stable_seed("take", voice.voice_id, line.text, str(seed))

        # take jitter: deterministic small variations so 3 takes differ
        rng = np.random.default_rng(take_seed)
        rate_jitter = 1.0 + float(rng.uniform(-0.03, 0.03))
        pitch_jitter = 1.0 + float(rng.uniform(-0.02, 0.02))

        rate = int(np.clip(persona["rate"] * emo["rate_mult"] * rate_jitter, 80, 450))
        pitch = int(np.clip(persona["pitch"] * emo["pitch_mult"] * pitch_jitter, 0, 100))
        range_ = int(np.clip(persona["range"] * emo["range_mult"], 0, 100))
        volume = int(np.clip(persona["volume"] * emo["vol_mult"], 10, 200))
        wordgap = int(np.clip(persona["wordgap"] + emo.get("wordgap_ms", 0) / 10.0, 0, 40))

        with _LOCK:
            sr, samples = self._es().synth(
                line.text,
                voice=persona["espeak_voice"],
                rate=rate,
                pitch=pitch,
                range_=range_,
                volume=volume,
                wordgap=wordgap,
            )
        arr = np.array(samples, dtype=np.float32) / 32768.0
        arr = A.resample(arr, sr, A.SR)

        # whisper trick: espeak variant + heavy noise floor blend
        if emo.get("whisper"):
            persona_voice = persona["espeak_voice"]
            if "+" not in persona_voice:
                with _LOCK:
                    sr2, wsamples = self._es().synth(
                        line.text, voice=persona_voice + "+whisper", rate=rate, pitch=pitch,
                        range_=max(5, range_ // 3), volume=max(5, volume // 3), wordgap=wordgap,
                    )
                warr = np.array(wsamples, dtype=np.float32) / 32768.0
                warr = A.resample(warr, sr2, A.SR)
                if len(warr) >= len(arr):
                    arr = 0.6 * warr[: len(arr)] + 0.4 * arr

        # nonverbal overlays (before DSP so they share the chain)
        from ..music.procedural import synth_sfx
        nv_tail: list[np.ndarray] = []
        for nv in line.nonverbal:
            snd = synth_sfx(f"voice_{nv}", seed=stable_seed("nv", voice.voice_id, nv, line.text))
            nv_tail.append(A.fade(snd, fin_s=0.01, fout_s=0.12))

        out = A.trim_silence(arr)
        if out.size == 0:
            out = arr
        if nv_tail:
            gap = A.silence(0.18)
            for snd in nv_tail:
                out = np.concatenate([out, gap, snd])

        # pause_before handled by pipeline placement, but keep small lead-in
        lead = A.silence(0.06)
        tail = A.silence(0.10)
        out = np.concatenate([lead, out, tail])

        out = self._dsp(out, voice, emo, persona)
        A.write_wav(out_wav, out)
        return out_wav

    # ------------------------------------------------------------- DSP
    def _dsp(self, arr: np.ndarray, voice: VoiceSpec, emo: dict, persona: dict) -> np.ndarray:
        """Pitch shift + character EQ + emotion modulations + room."""
        sr = A.SR
        # 1) pitch shift (semitones persona + emotion) via resample + ffmpeg atempo
        semis = persona.get("semitones", 0.0)
        if emo.get("pitch_mult", 1.0) != 1.0:
            semis += 12.0 * np.log2(max(0.25, emo["pitch_mult"]))
        if abs(semis) > 0.05:
            factor = float(2 ** (semis / 12.0))
            import tempfile

            with tempfile.TemporaryDirectory() as td:
                src = Path(td) / "in.wav"
                dst = Path(td) / "out.wav"
                A.write_wav(src, arr, sr)
                ff_run([
                    "-i", str(src),
                    "-af", f"asetrate={sr}*{factor:.4f},aresample={sr},atempo={1/factor:.4f}",
                    "-ar", str(sr), str(dst),
                ])
                _, arr = A.read_wav(dst)

        # 2) amplitude modulations (numpy)
        vib = emo.get("vibrato")
        if vib:
            f, d = vib
            t = np.arange(len(arr), dtype=np.float32) / sr
            mod = 1.0 - d / 2 + (d / 2) * np.sin(2 * np.pi * f * t)
            arr = arr * mod.astype(np.float32)
        trem = emo.get("tremolo")
        if trem:
            f, d = trem
            t = np.arange(len(arr), dtype=np.float32) / sr
            arr = arr * (1.0 - d * (0.5 + 0.5 * np.sin(2 * np.pi * f * t))).astype(np.float32)

        # 3) character EQ / dynamics (ffmpeg filter chain)
        chain = []
        eq = persona.get("eq", "flat")
        if eq == "bright":
            chain += ["highshelf=f=3500:g=4", "lowshelf=f=180:g=-2"]
        elif eq == "dark":
            chain += ["lowshelf=f=260:g=4", "highshelf=f=3800:g=-5"]
        elif eq == "rap":
            chain += ["highpass=f=110", "equalizer=f=2500:g=3:w=1.0"]
        elif eq == "whisper":
            chain += ["highpass=f=260", "lowpass=f=7000"]
        elif eq == "nasal":
            chain += ["equalizer=f=1100:g=5:w=1.2", "equalizer=f=4400:g=3:w=1.2"]
        rev = persona.get("reverb", "none")
        if rev == "small_room":
            chain.append("aecho=0.6:0.25:12|22:0.12|0.08")
        elif rev == "hallway":
            chain.append("aecho=0.5:0.3:30|48:0.10|0.06")
        elif rev == "outdoors":
            chain.append("aecho=0.25:0.15:80:0.04")
        if emo.get("limiter"):
            chain.append("alimiter=limit=0.9:level=false")
        # gentle compression + de-ess for every character (audio post spec)
        chain += ["acompressor=threshold=-19dB:ratio=2.6:attack=8:release=140:makeup=3", "deesser=f=0.5:s=0.4"]
        if chain:
            import tempfile

            with tempfile.TemporaryDirectory() as td:
                src = Path(td) / "in.wav"
                dst = Path(td) / "out.wav"
                A.write_wav(src, arr, sr)
                ff_run(["-i", str(src), "-af", ",".join(chain), "-ar", str(sr), str(dst)])
                _, arr = A.read_wav(dst)
        return arr.astype(np.float32)

    # ------------------------------------------------------------- health
    def available(self) -> bool:
        try:
            self._es()
            return True
        except Exception:
            return False


def build_reference_clip(engine: ZSynthEngine, voice: VoiceSpec, out_path: Path, text: str | None = None) -> Path:
    """8-10 s neutral reference clip; reused as cloning reference in full mode."""
    text = text or (
        f"Hi, {voice.character} here. This is my voice. "
        "Same voice, same heart, every single time. That is a promise."
    )
    line = DialogueLine(speaker=voice.voice_id, text=text, emotion="neutral", intensity=2, delivery="normal")
    return engine.synth_line(line, voice, out_path, seed=stable_seed("refclip", voice.voice_id))
