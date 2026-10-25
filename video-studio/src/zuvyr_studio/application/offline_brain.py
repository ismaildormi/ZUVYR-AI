"""Offline deterministic "brain": script -> validated ScenePlan.

Rule-based scene splitting, speaker resolution, emotion annotation
(lexicon + punctuation + context), camera scheduling, SFX/music cues.
It never rewrites the user's dialogue — it only splits, labels and schedules.
"""
from __future__ import annotations

import re

from ..config import Config
from ..lib.rng import stable_seed
from ..lib.styles import STYLE_PREFIXES
from ..schema import Camera, DialogueLine, MusicCue, Scene, ScenePlan, SongSegment
from .bibles import CharacterBible, VoiceBible
from .takes import GUEST_VOICE_POOL

# ---------------------------------------------------------------- lexicons
EMOTION_LEXICON: dict[str, list[str]] = {
    "sad": ["sad", "cry", "tears", "goodbye", "lost", "alone", "miss", "gone", "broken", "sorrow", "leave", "leaving", "sold", "sorry"],
    "joyful": ["happy", "smile", "laugh", "yay", "amazing", "wonderful", "love", "joy", "celebrate", "cheer", "won", "win", "best"],
    "greedy": ["money", "cash", "gold", "coins", "profit", "deal", "sell", "rent", "double", "rich", "greed", "price", "pay", "buy", "contract", "sign"],
    "fearful": ["scared", "afraid", "fear", "terrified", "nightmare", "hide", "monster", "dark", "help", "trembling", "shaking"],
    "angry": ["angry", "furious", "mad", "hate", "yell", "scream", "enough", "stop", "never", "fight", "rage", "how dare"],
    "jealous": ["jealous", "better than", "why her", "why him", "always you", "unfair"],
    "guilty": ["guilty", "my fault", "blame", "shouldn't have", "i lied", "forgive", "mistake"],
    "sarcastic": ["sure", "whatever", "obviously", "yeah right", "as if", "good luck"],
    "tender": ["sweet", "gentle", "hug", "care", "safe", "warm", "little one", "dear"],
    "panicked": ["hurry", "run", "quick", "now now", "no time", "fast", "hurry up", "oh no"],
    "determined": ["will", "promise", "together", "fight for", "never give up", "plan", "save", "we can", "must"],
    "excited": ["omg", "wow", "incredible", "did you see", "check it", "let's go", "party", "show"],
    "ashamed": ["embarrass", "shame", "sorry i", "hide my face", "look away"],
    "relieved": ["safe now", "finally", "thank goodness", "over", "made it", "breathe"],
    "menacing": ["or else", "last warning", "you'll regret", "belongs to me", "take it all", "sign it", "no choice"],
    "proud": ["my work", "look what", "built", "earned", "our block", "our home"],
    "nervous": ["um", "uh", "maybe", "i think", "not sure", "what if"],
}

ACTION_WORDS = ["run", "ran", "chase", "racing", "slam", "crash", "jump", "dodge", "grab", "dash", "hurry", "escape", "burst", "swipe", "swing", "kick", "storm", "rush"]
DIALOGUE_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9_' \-\.]{1,28}?)\s*(?:\(([^)]{2,40})\))?\s*:\s*(.+)$", re.S)
TAG_RE = re.compile(r"^\s*\[\s*(\w+)\s*:\s*(.+?)\s*\]\s*$")
SONG_RE = re.compile(r"^\s*<\s*(song|music)\s*[:\(]?\s*([^>]*)>\s*$", re.I)
SONG_END_RE = re.compile(r"^\s*</\s*(song|music)\s*>\s*$", re.I)
SCENE_RE = re.compile(r"^\s*#{1,3}\s*(.+)$|^\s*\[\s*(scene[\w\s\d\-—:]*)\]\s*$|^\s*(scene\s+\d+\s*[:\-—].*)$", re.I)
DELIVERY_WORDS = {"whisper": "whisper", "whispers": "whisper", "whispering": "whisper", "shout": "shout", "shouts": "shout",
                  "shouting": "shout", "yell": "shout", "screaming": "shout", "trembling": "trembling", "trembles": "trembling",
                  "breaking": "breaking", "voice breaking": "breaking", "cold": "cold", "coldly": "cold", "rap": "rap",
                  "rapping": "rap", "narrating": "narration", "narration": "narration"}
EMOTION_WORDS = {e: [e, e + "s", e + "ly"] for e in EMOTION_LEXICON}
NONVERBAL_WORDS = {"laugh": "laugh", "laughs": "laugh", "laughed": "laugh", "laughing": "laugh", "chuckle": "laugh",
                   "chuckles": "laugh", "chuckled": "laugh", "giggle": "laugh", "giggles": "laugh",
                   "sigh": "sigh", "sighs": "sigh", "sighed": "sigh", "sighing": "sigh",
                   "gasp": "gasp", "gasps": "gasp", "gasped": "gasp", "gasping": "gasp",
                   "sob": "sob", "sobs": "sob", "sobbed": "sob", "sobbing": "sob", "crying": "sob", "cried": "sob",
                   "breath": "breath", "breathes": "breath", "breathed": "breath",
                   "gulp": "gulp", "gulps": "gulp", "gulped": "gulp",
                   "cheer": "cheer", "cheers": "cheer", "cheered": "cheer"}

INLINE_PAREN_RE = re.compile(r"\(([^)]{2,30})\)")


def classify_emotion(text: str, default: str = "neutral", context_emotion: str | None = None,
                     strict: bool = False) -> tuple[str, int, list[str]]:
    """Return (emotion, intensity 1-5, nonverbal list) for a line."""
    low = text.lower()
    words = re.findall(r"[a-z']+", low)
    scores: dict[str, float] = {}
    for emo, kws in EMOTION_LEXICON.items():
        s = 0.0
        for kw in kws:
            if " " in kw:
                if kw in low:
                    s += 2.0
            else:
                s += sum(1.0 for w in words if w == kw or (len(w) > 4 and kw in w))
        if s:
            scores[emo] = s
    nonverbal: list[str] = []
    for w in words:
        if w in NONVERBAL_WORDS and NONVERBAL_WORDS[w] not in nonverbal:
            nonverbal.append(NONVERBAL_WORDS[w])
    emotion = max(scores, key=scores.get) if scores else (context_emotion or default)
    if strict and scores and max(scores.values()) < 2.0:
        emotion = default  # weak evidence -> keep the voice's default emotion
    intensity = 3
    ex = low.count("!")
    caps = sum(1 for w in re.findall(r"\b[A-Z]{3,}\b", text))
    q = low.count("?")
    score = max(scores.values()) if scores else 0
    intensity = min(5, 2 + int(min(3, score * 0.7)) + (1 if ex + caps > 1 else 0))
    if ex >= 2 or caps >= 2:
        intensity = 5
    elif q >= 2 and emotion in ("fearful", "nervous", "panicked"):
        intensity = max(intensity, 4)
    return emotion, intensity, nonverbal


def detect_delivery(qualifier: str | None, text: str) -> str:
    if qualifier:
        low = qualifier.lower()
        for w, d in DELIVERY_WORDS.items():
            if w in low:
                return d
        for e in EMOTION_LEXICON:
            if e in low:
                return "normal"
    if re.search(r"\b[A-Z]{4,}\b", text) and "!" in text:
        return "shout"
    return "normal"


class OfflineBrain:
    name = "offline"
    deterministic = True

    def __init__(self, config: Config, cast: CharacterBible, voices: VoiceBible):
        self.config = config
        self.cast = cast
        self.voices = voices

    # ------------------------------------------------------------ parse
    def plan(self, script_text: str, video_id: str, title: str | None = None,
             style: str | None = None, fmt: str = "long", lyrics: str | None = None,
             genre: str | None = None, allowed: list[str] | None = None) -> ScenePlan:
        style = style or self.config.style
        prefix = STYLE_PREFIXES[style]
        title = title or self._guess_title(script_text)

        blocks = self._split_blocks(script_text)
        groups = self._group_blocks(blocks)
        raw_scenes: list[dict] = []
        song_buf: list[dict] | None = None

        for grp in groups:
            first = grp[0] if grp else {"kind": "break"}
            kind = first["kind"]
            if kind == "song_open" and song_buf is None:
                song_buf = {"lines": grp, "meta": first.get("meta", ""), "hint": first.get("hint", "")}
                continue
            if kind == "song_close" and song_buf is not None:
                raw_scenes.append({"kind": "song", **song_buf})
                song_buf = None
                continue
            if song_buf is not None:
                song_buf["lines"].extend(grp)
                if any(b["kind"] == "song_close" for b in grp):
                    song_buf["lines"] = [b for b in song_buf["lines"] if b["kind"] != "song_close"]
                    raw_scenes.append({"kind": "song", **song_buf})
                    song_buf = None
                continue
            raw_scenes.append({"kind": "group", "lines": grp})

        if song_buf:  # unclosed song block
            song_buf["lines"] = [b for b in song_buf["lines"] if b["kind"] != "song_close"]
            raw_scenes.append({"kind": "song", **song_buf})
        if lyrics:  # standalone lyrics file -> song scene appended
            raw_scenes.append({"kind": "song", "lines": [{"kind": "narration", "text": lyrics}], "meta": genre or "", "hint": ""})

        scenes: list[Scene] = []
        for raw in raw_scenes:
            scene = self._build_scene(len(scenes) + 1, raw, prefix, style)
            if scene:
                scenes.append(scene)

        if not scenes:
            scenes = [self._narration_scene(0, "Once upon a time, a story was waiting to be told.", prefix, style, "street")]

        # auto-cast guest speakers: stable voice per name (restricted to the
        # selected cast when the caller passes `allowed` — web UI character
        # selection). Explicitly named cast characters always keep their voice.
        pool = [c for c in (allowed or []) if self.voices.get(c)] or list(GUEST_VOICE_POOL)
        for s in scenes:
            for ln in s.dialogue:
                if ln.speaker != "narrator" and not ln.voice_id and self.voices.get(ln.speaker) is None:
                    ln.voice_id = pool[stable_seed("guest-voice", ln.speaker) % len(pool)]

        # renumber
        for i, s in enumerate(scenes, 1):
            s.scene_id = f"s{i:03d}"
            s.seed = stable_seed(s.scene_id, "scene")
        cast_used = sorted({c for s in scenes for c in s.characters_present})
        voices_used = sorted({ln.speaker for s in scenes for ln in s.dialogue})
        plan = ScenePlan(
            video_id=video_id, title=title, style=style, format=fmt,
            language=self.config.language, cast=cast_used, voices_used=voices_used, scenes=scenes,
        )
        return plan

    @staticmethod
    def _group_blocks(blocks: list[dict]) -> list[list[dict]]:
        """Group blocks into scenes: blank lines and scene headers start new groups."""
        groups: list[list[dict]] = []
        cur: list[dict] = []
        for b in blocks:
            k = b["kind"]
            if k == "break":
                if cur:
                    groups.append(cur)
                cur = []
                continue
            if k == "header" and cur:
                groups.append(cur)
                cur = [b]
                continue
            if k == "song_open" and cur:
                groups.append(cur)
                cur = [b]
                continue
            if k == "song_close":
                cur.append(b)
                groups.append(cur)
                cur = []
                continue
            cur.append(b)
        if cur:
            groups.append(cur)
        return [g for g in groups if any(b["kind"] not in ("header",) for b in g) or len(g) > 1] or groups

    # ------------------------------------------------------------ helpers
    def _guess_title(self, script: str) -> str:
        for line in script.splitlines():
            line = line.strip()
            if line.lower().startswith("title:"):
                return line.split(":", 1)[1].strip().strip('"')
            if line and not line.startswith(("[", "#", "<")):
                return line[:60]
        return "Untitled Story"

    def _split_blocks(self, script: str) -> list[dict]:
        """Split the script into typed blocks: header / dialogue / narration / tag / song markers."""
        blocks: list[dict] = []
        current_narration: list[str] = []

        def flush_narration():
            nonlocal current_narration
            if current_narration:
                text = " ".join(x.strip() for x in current_narration).strip()
                if text:
                    blocks.append({"kind": "narration", "text": text})
                current_narration = []

        for raw in script.splitlines():
            line = raw.rstrip()
            stripped = line.strip()
            if not stripped:
                flush_narration()
                blocks.append({"kind": "break"})
                continue
            m = SONG_RE.match(stripped)
            if m:
                flush_narration()
                blocks.append({"kind": "song_open", "meta": (m.group(2) or "").strip(), "hint": ""})
                continue
            if SONG_END_RE.match(stripped):
                flush_narration()
                blocks.append({"kind": "song_close"})
                continue
            if stripped.startswith("[") and stripped.endswith("]"):
                flush_narration()
                tm = TAG_RE.match(stripped)
                if tm:
                    blocks.append({"kind": "tag", "tag": tm.group(1).lower(), "value": tm.group(2).strip()})
                continue
            if SCENE_RE.match(stripped):
                flush_narration()
                blocks.append({"kind": "header", "text": SCENE_RE.match(stripped).group(1).strip()})
                continue
            if stripped.startswith("Title:"):
                continue
            dm = DIALOGUE_RE.match(stripped)
            if dm:
                speaker = self._resolve_speaker(dm.group(1))
                if speaker is None:
                    speaker = self._guest_speaker(dm.group(1))
                if speaker is not None:
                    flush_narration()
                    blocks.append({"kind": "dialogue", "speaker": speaker, "qualifier": dm.group(2), "text": dm.group(3).strip()})
                    continue
            current_narration.append(stripped)
        flush_narration()
        return blocks

    def _resolve_speaker(self, name: str) -> str | None:
        if not name:
            return None
        low = name.strip().lower()
        if low in ("narrator", "voice over", "voiceover", "vo", "n"):
            return "narrator"
        if self.cast.resolve(low):
            return self.cast.resolve(low)
        # voice-bible-only characters (mrs_kim, derek, ...) speak but have no sprite
        if self.voices.get(low):
            return low
        return None

    @staticmethod
    def _guest_speaker(name: str) -> str | None:
        """Unknown speaker -> guest character id (slug), else None (narration).

        A guest keeps its original name for captions and is auto-cast a stable
        voice from the voice bible (see takes.guest_voice). Only plausible
        speaker labels (1-2 capitalized words) become guests so narration
        prose containing a colon is left untouched.
        """
        name = (name or "").strip()
        if not name:
            return None
        words = name.split()
        if not (1 <= len(words) <= 2) or len(name) > 20:
            return None
        if not all(w[:1].isupper() for w in words):
            return None
        if not all(c.isalnum() or c in "_-' " for c in name):
            return None
        slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
        return slug or None

    def _build_scene(self, idx: int, raw: dict, prefix: str, style: str) -> Scene | None:
        sid = f"s{idx:03d}"
        seed = stable_seed(self.__class__.__name__, sid)
        if raw["kind"] == "song":
            return self._song_scene(idx, raw, prefix, style)
        lines_meta: list[dict] = []
        narration_text = ""
        location = "street"
        tod = "dusk"
        visual_hint = ""
        sfx_tags: list[str] = []
        music_mood: str | None = None
        pending_tags: list[dict] = []
        header_loc = None

        for blk in raw.get("lines", [raw]) if isinstance(raw, dict) else [raw]:
            k = blk["kind"]
            if k == "header":
                low = blk["text"].lower()
                for key in ("rooftop", "school", "hallway", "apartment", "alley", "street", "room", "home", "city"):
                    if key in low:
                        header_loc = key
                        break
                for t in ("dawn", "morning", "noon", "afternoon", "dusk", "sunset", "night"):
                    if t in low:
                        tod = t
                pending_tags.append({"kind": "header"})
            elif k == "tag":
                t, v = blk["tag"], blk["value"]
                if t in ("visual", "v"):
                    visual_hint = v
                elif t in ("sfx", "sound"):
                    sfx_tags.append(v)
                elif t in ("music", "mood"):
                    music_mood = v.split()[0].strip(",").lower()
                elif t in ("location", "loc"):
                    location = v.lower()
                elif t in ("time", "tod"):
                    tod = v.lower()
            elif k == "dialogue":
                lines_meta.append(blk)
            elif k == "narration":
                narration_text += (" " if narration_text else "") + blk["text"]

        if not lines_meta and not narration_text:
            return None
        if header_loc:
            location = header_loc

        # group into one scene; the planner splits further below if too long
        dialogue: list[DialogueLine] = []
        context_emo = None
        for blk in lines_meta:
            # strip inline stage directions like "(chuckle)" from the spoken text,
            # keeping them as nonverbal annotations (never read aloud)
            text = blk["text"]
            inline_nonverbal = []

            def _grab(m):
                low = m.group(1).strip().lower()
                for w in low.replace(",", " ").split():
                    if w in NONVERBAL_WORDS and NONVERBAL_WORDS[w] not in inline_nonverbal:
                        inline_nonverbal.append(NONVERBAL_WORDS[w])
                if low in DELIVERY_WORDS:
                    blk.setdefault("_inline_delivery", DELIVERY_WORDS[low])
                return " "

            text = INLINE_PAREN_RE.sub(_grab, text)
            text = re.sub(r"\s{2,}", " ", text).strip()
            blk["text"] = text or blk["text"]
            blk["_inline_nonverbal"] = inline_nonverbal
            strict = blk["speaker"] == "narrator"
            emotion, intensity, nonverbal = classify_emotion(blk["text"], default=self._default_emotion(blk["speaker"]),
                                                            context_emotion=None if strict else context_emo, strict=strict)
            delivery = detect_delivery(blk.get("qualifier"), blk["text"])
            if blk.get("qualifier"):
                q = blk["qualifier"].lower()
                for w in NONVERBAL_WORDS:
                    if w in q and NONVERBAL_WORDS[w] not in nonverbal:
                        nonverbal.append(NONVERBAL_WORDS[w])
                for e in EMOTION_LEXICON:
                    if re.search(rf"\b{e}\b", q):
                        emotion, intensity = e, max(3, intensity)
                        break
            for nv in blk.get("_inline_nonverbal", []):
                if nv not in nonverbal:
                    nonverbal.append(nv)
            if blk.get("_inline_delivery") and delivery == "normal":
                delivery = blk["_inline_delivery"]
            if emotion in ("sad", "fearful", "guilty") and intensity >= 4:
                delivery = delivery if delivery != "normal" else "trembling"
            if emotion in ("angry", "panicked") and intensity >= 4 and delivery == "normal":
                delivery = "shout" if "!" in blk["text"] or blk["text"].isupper() else delivery
            if emotion == "menacing" and delivery == "normal":
                delivery = "cold"
            pause = 180 if emotion in ("sad", "menacing", "guilty") and intensity >= 3 else 90
            dialogue.append(DialogueLine(
                speaker=blk["speaker"], text=blk["text"], emotion=emotion, intensity=intensity,
                delivery=delivery, pause_before_ms=pause, nonverbal=nonverbal,
            ))
            context_emo = emotion
        if narration_text and not dialogue:
            emotion = "neutral"
            delivery = "narration"
            speaker = "narrator"
            dialogue = [DialogueLine(speaker=speaker, text=narration_text, emotion=emotion, intensity=2, delivery=delivery)]
        elif narration_text and dialogue:
            dialogue.insert(0, DialogueLine(speaker="narrator", text=narration_text, emotion="neutral", intensity=2, delivery="narration"))

        # duration estimate (pipeline re-times scenes from synthesized audio)
        return self._assemble_scene(sid, dialogue, [], location, tod, visual_hint, sfx_tags, music_mood, prefix, style, idx)

    def _default_emotion(self, speaker: str) -> str:
        if speaker == "narrator":
            return "neutral"
        v = self.voices.get(speaker)
        return v.default_emotion if v else "neutral"

    def _assemble_scene(self, sid, dialogue, extra_narr, location, tod, visual_hint, sfx_tags, music_mood, prefix, style, idx) -> Scene:
        wps = 2.7
        dur = sum(max(1.1, len(l.text.split()) / wps) + l.pause_before_ms / 1000.0 + 0.35 * len(l.nonverbal) for l in dialogue) + 0.8
        dur = max(2.5, min(45.0, dur))
        chars = sorted({l.speaker for l in dialogue if l.speaker != "narrator"})
        role = "dialogue" if chars else "narration"
        text_all = " ".join(l.text for l in dialogue).lower()
        if any(re.search(rf"\b{w}\b", text_all) for w in ACTION_WORDS):
            role = "action"
        camera = self._camera_for(role, idx, len(dialogue))
        if not sfx_tags:
            sfx_tags = self._auto_sfx(text_all, role)
        mood = music_mood or self._auto_mood(role, dialogue)
        visual_prompt = self._build_prompt(prefix, chars, camera, location, tod, visual_hint, role)
        scene = Scene(
            scene_id=sid, duration_s=dur, characters_present=chars,
            voice_over_narration=" ".join(l.text for l in dialogue if l.speaker == "narrator"),
            dialogue=dialogue, visual_prompt=visual_prompt, camera=camera,
            motion_directions=self._motion_for(camera, role),
            sfx_prompt=sfx_tags[:4], music_cue=MusicCue(mood=mood, intensity=0.5 if role != "action" else 0.75),
            lip_sync=role in ("dialogue", "song"), location=location, time_of_day=tod,
            visual_hint=visual_hint, role=role, seed=stable_seed(sid, "scene"),
        )
        return scene

    def _camera_for(self, role: str, idx: float, n_lines: int) -> Camera:
        if role == "action":
            opts = [("wide", "zoom_out"), ("medium", "whip_pan"), ("low angle", "push_in")]
        elif role == "song":
            opts = [("wide", "orbit"), ("medium", "handheld")]
        elif n_lines > 1:
            opts = [("medium", "static"), ("over-the-shoulder", "push_in"), ("close-up", "pull_out")]
        else:
            opts = [("medium", "push_in"), ("wide", "pan_right"), ("close-up", "push_in")]
        shot, move = opts[int(idx) % len(opts)]
        return Camera(shot=shot, movement=move)

    def _motion_for(self, camera: Camera, role: str) -> str:
        m = {
            "push_in": "slow dolly in on the subject, subtle parallax, background layers drift back",
            "pull_out": "smooth dolly out revealing the environment",
            "zoom_out": "fast zoom out from close detail to wide shot, motion blur",
            "whip_pan": "fast horizontal whip pan with motion blur and speed lines",
            "pan_left": "steady pan left with layered parallax",
            "pan_right": "steady pan right with layered parallax",
            "tilt_up": "tilt up from feet to face",
            "tilt_down": "tilt down from sky to subject",
            "orbit": "slow orbit around the performers, confetti drifting",
            "handheld": "handheld camera bob following the beat",
            "static": "locked-off shot with gentle character idle motion",
            "zoom_in": "slow zoom in, tension building",
        }
        return m.get(camera.movement, "subtle camera drift")

    def _auto_sfx(self, text: str, role: str) -> list[str]:
        tags = []
        for kw, sfx in (("rain", "rain"), ("thunder", "thunder"), ("door", "door slam"), ("run|ran|chase|rush", "footsteps"),
                        ("heart", "heartbeat"), ("cheer|crowd|party", "crowd cheer"), ("sparkle|magic", "sparkle")):
            if re.search(kw, text):
                tags.append(sfx)
        if not tags and role == "action":
            tags = ["whoosh", "footsteps"]
        return tags[:3]

    def _auto_mood(self, role: str, dialogue: list[DialogueLine]) -> str:
        emos = [l.emotion for l in dialogue]
        if role == "song":
            return "hype"
        if any(e in ("joyful", "excited") for e in emos):
            return "hopeful"
        if any(e in ("sad", "guilty", "ashamed") for e in emos):
            return "melancholic"
        if any(e in ("fearful", "panicked", "nervous") for e in emos):
            return "tense"
        if any(e in ("menacing", "greedy", "angry") for e in emos):
            return "menacing"
        if role == "action":
            return "tense"
        return "hopeful"

    def _build_prompt(self, prefix: str, chars: list[str], camera: Camera, location: str, tod: str, hint: str, role: str) -> str:
        tokens = []
        for cid in chars:
            spec = self.cast.get(cid)
            if spec:
                tokens.append(spec.token_block)
        framing = f"{camera.shot} shot" + (", " + camera.movement.replace("_", " ") if camera.movement != "static" else "")
        loc_txt = f"{location} at {tod}, cinematic anime scenery"
        parts = [prefix, ", ".join(tokens) if tokens else "expressive anime cast", framing, loc_txt]
        if hint:
            parts.append(hint)
        if role == "action":
            parts.append("dynamic action pose, motion blur, speed lines")
        return ", ".join(parts)

    def _song_scene(self, idx: int, raw: dict, prefix: str, style: str) -> Scene:
        sid = f"s{idx + 1:03d}"
        meta = (raw.get("meta") or "").strip()
        hint = (raw.get("hint") or "").strip()
        lyrics_lines: list[DialogueLine] = []
        text_accum: list[str] = []
        genre = "hip hop, trap, street, young male voice"
        title = "Rooftop Anthem"
        leads: list[str] = []
        # meta like: "Rooftop Anthem – hip hop, trap – leads: jayden, zoe"
        if meta:
            parts = [p.strip() for p in meta.split("–") if p.strip()] or [p.strip() for p in meta.split("-") if p.strip()]
            if parts:
                title = parts[0]
            if len(parts) > 1:
                genre = parts[1]
            for p in parts:
                m = re.search(r"leads?\s*:\s*(.+)", p, re.I)
                if m:
                    leads = [self.cast.resolve(x) or x.strip().lower() for x in m.group(1).split(",") if x.strip()]
        for blk in raw["lines"]:
            if blk["kind"] == "dialogue":
                lyrics_lines.append(DialogueLine(speaker=blk["speaker"], text=blk["text"], emotion="excited",
                                                  intensity=4, delivery="rap", pause_before_ms=100))
            elif blk["kind"] == "tag" and blk["tag"] == "visual":
                hint = blk["value"]
            elif blk["kind"] == "narration":
                text_accum.append(blk["text"])
        if not lyrics_lines and text_accum:
            # plain lyrics text -> attribute to lead voices round-robin
            lead_ids = leads or [c.id for c in self.cast.all() if "rapper" in c.tags][:2]
            for i, ln in "\n".join(text_accum).splitlines():
                ln = ln.strip()
                if ln:
                    lyrics_lines.append(DialogueLine(speaker=lead_ids[i % len(lead_ids)], text=ln, emotion="excited",
                                                      intensity=4, delivery="rap", pause_before_ms=80))
        if not leads:
            leads = sorted({l.speaker for l in lyrics_lines if l.speaker != "narrator"}) or ["jayden"]
        n_bars = max(4, (len(lyrics_lines) + 3) // 2)
        bpm = 140
        dur = n_bars * 4 * 60.0 / bpm + 1.2
        chars = sorted({l.speaker for l in lyrics_lines if l.speaker != "narrator"})
        camera = Camera(shot="wide", movement="orbit")
        song = SongSegment(enabled=True, title=title, genre=genre, lead_voices=leads,
                           lyrics="\n".join(l.text for l in lyrics_lines), bpm=bpm, bars=n_bars)
        visual_prompt = ", ".join([prefix] + [self.cast.get(c).token_block for c in chars if self.cast.get(c)] +
                                  ["wide shot, rooftop stage at dusk, string lights, crowd silhouettes, confetti, dynamic performance poses, speed lines"])
        scene = Scene(
            scene_id=sid, duration_s=dur, characters_present=chars,
            voice_over_narration="", dialogue=lyrics_lines, visual_prompt=visual_prompt,
            camera=camera, motion_directions=self._motion_for(camera, "song"),
            sfx_prompt=["crowd cheer", "sparkle"], music_cue=MusicCue(mood="hype", intensity=0.85),
            lip_sync=True, song_segment=song, location="rooftop", time_of_day="dusk",
            visual_hint=hint or "rap crew performing on a rooftop stage", role="song",
            seed=stable_seed(sid, "scene"),
        )
        return scene
