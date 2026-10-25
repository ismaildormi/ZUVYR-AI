"""Character bible and voice bible: load, save, defaults, builders."""
from __future__ import annotations

from pathlib import Path

from ..config import Config
from ..lib.fs import ensure_dir, read_json, write_json
from ..lib.rng import stable_seed
from ..schema import CharacterSpec, VoiceSpec

# ------------------------------------------------------------------ default cast
DEFAULT_CAST: list[dict] = [
    {
        "id": "mika",
        "name": "Mika Sato",
        "age": 16,
        "role": "protagonist — teen girl with a sketchbook and a plan",
        "gender": "female",
        "appearance": {
            "hair": "long dark navy hair with one bright teal streak",
            "eyes": "large amber eyes",
            "outfit": "denim jacket over a mustard-yellow t-shirt, dark pleated skirt, white sneakers",
            "body": "slim, average height",
            "signature": "always carries a sketchbook",
        },
        "token_block": (
            "Mika Sato, 16-year-old Japanese-American girl, long dark navy hair with one bright "
            "teal streak, large amber eyes, slim build, denim jacket over a mustard-yellow "
            "t-shirt, dark pleated skirt, white sneakers, carrying a sketchbook"
        ),
        "voice_id": "mika",
        "accent_color": "#2EC4B6",
        "height": 1.0,
        "personality": "kind, artistic, quietly stubborn; carries everyone's hopes in her sketchbook",
        "tags": ["protagonist", "teen", "lead"],
    },
    {
        "id": "jayden",
        "name": "Jayden Cole",
        "age": 15,
        "role": "best friend — emcee with golden headphones",
        "gender": "male",
        "appearance": {
            "hair": "short curly black hair",
            "eyes": "warm brown eyes",
            "outfit": "oversized green hoodie, gold headphones around neck, khaki cargo pants, red sneakers",
            "body": "tall, lanky",
            "signature": "gold wireless headphones around his neck",
        },
        "token_block": (
            "Jayden Cole, 15-year-old African-American boy, short curly black hair, warm brown "
            "eyes, tall lanky build, oversized green hoodie, gold headphones around his neck, "
            "khaki cargo pants, red sneakers"
        ),
        "voice_id": "jayden",
        "accent_color": "#7CB518",
        "height": 1.06,
        "personality": "loyal, quick with a rhyme, keeps the crew laughing",
        "tags": ["crew", "rapper", "lead-emcee"],
    },
    {
        "id": "rico",
        "name": "Rico Vega",
        "age": 14,
        "role": "crew — street dancer, hype machine",
        "gender": "male",
        "appearance": {
            "hair": "black curly fade, red cap worn backwards",
            "eyes": "dark brown eyes",
            "outfit": "white tank top, open red-and-black flannel, black track pants with white stripe",
            "body": "small, springy, athletic",
            "signature": "always mid-dance, one arm up",
        },
        "token_block": (
            "Rico Vega, 14-year-old Latino boy, black curly fade haircut, red baseball cap worn "
            "backwards, dark brown eyes, small springy athletic build, white tank top, open "
            "red-and-black checkered flannel, black track pants with a white stripe, white sneakers"
        ),
        "voice_id": "rico",
        "accent_color": "#FF6B35",
        "height": 0.94,
        "personality": "hype, fearless, dances before he thinks",
        "tags": ["crew", "dancer"],
    },
    {
        "id": "zoe",
        "name": "Zoe Reyes",
        "age": 15,
        "role": "rival-turned-ally emcee",
        "gender": "female",
        "appearance": {
            "hair": "magenta bob with undercut side",
            "eyes": "sharp violet eyes",
            "outfit": "black-and-gold varsity jacket over white crop top, gold chain, ripped black jeans",
            "body": "athletic, confident stance",
            "signature": "arms crossed, cocky smirk",
        },
        "token_block": (
            "Zoe Reyes, 15-year-old girl, magenta pink bob haircut with undercut side, sharp "
            "violet eyes, athletic build, black-and-gold varsity jacket over a white crop top, "
            "thin gold chain, ripped black jeans, black-and-white sneakers"
        ),
        "voice_id": "zoe",
        "accent_color": "#D6336C",
        "height": 1.0,
        "personality": "sharp, competitive, secretly generous",
        "tags": ["crew", "rapper", "rival"],
    },
    {
        "id": "mr_grimm",
        "name": "Howard Grimm",
        "age": 52,
        "role": "antagonist — greedy landlord",
        "gender": "male",
        "appearance": {
            "hair": "greasy brown combover",
            "eyes": "narrow calculating eyes",
            "outfit": "rumpled brown suit, loosened red tie, gold rings",
            "body": "heavyset, slow-moving",
            "signature": "counts gold coins in one hand",
        },
        "token_block": (
            "Mr. Howard Grimm, 52-year-old pale man, greasy brown combover hair, thin mustache, "
            "narrow calculating eyes, smug cold smile, rumpled brown suit with a loosened red "
            "tie, brown trousers, gold rings, counting gold coins in one cupped hand"
        ),
        "voice_id": "mr_grimm",
        "accent_color": "#8B5A2B",
        "height": 1.02,
        "personality": "greedy, patient, never raises his voice while raising the rent",
        "tags": ["villain", "adult"],
    },
    {
        "id": "tommy",
        "name": "Tommy Kim",
        "age": 10,
        "role": "neighbor kid — the heart of the block",
        "gender": "male",
        "appearance": {
            "hair": "messy black hair",
            "eyes": "big worried eyes behind huge round glasses",
            "outfit": "oversized light-blue sweater with a white star, dark blue shorts, long gray socks",
            "body": "small, hunched, nervous",
            "signature": "hands clasped in front of his chest",
        },
        "token_block": (
            "Tommy Kim, 10-year-old boy, messy black hair, huge round glasses, big worried "
            "innocent eyes, small build, oversized light-blue knitted sweater with a white star, "
            "dark blue shorts, long gray socks, worn sneakers, hunched nervous posture"
        ),
        "voice_id": "tommy",
        "accent_color": "#4D96FF",
        "height": 0.8,
        "personality": "scared of everything except his friends",
        "tags": ["kid", "neighbor"],
    },
]

# ------------------------------------------------------------------ default voices
DEFAULT_VOICES: list[dict] = [
    {
        "voice_id": "narrator", "character": "Narrator", "age_range": "adult", "gender": "male",
        "pitch": "low", "pace": "measured", "accent": "neutral American", "timbre": "warm, storytelling",
        "personality": "calm omniscient storyteller", "default_emotion": "neutral",
        "engine": "zsynth", "params": {"espeak_voice": "en-us", "rate": 168, "pitch": 28, "range": 30,
                                       "semitones": -2.5, "eq": "dark", "reverb": "small_room", "volume": 100, "wordgap": 6},
        "design_prompt": "a warm deep male narrator voice, calm and measured, like a documentary storyteller",
    },
    {
        "voice_id": "mika", "character": "Mika Sato", "age_range": "teen", "gender": "female",
        "pitch": "medium-high", "pace": "medium-fast", "accent": "neutral American", "timbre": "bright, expressive",
        "personality": "hopeful and earnest", "default_emotion": "determined",
        "engine": "zsynth", "params": {"espeak_voice": "en-us+f4", "rate": 184, "pitch": 62, "range": 55,
                                       "semitones": 1.5, "eq": "bright", "reverb": "small_room", "volume": 100, "wordgap": 2},
        "design_prompt": "a bright 16-year-old girl, expressive and earnest, medium-fast pace",
    },
    {
        "voice_id": "jayden", "character": "Jayden Cole", "age_range": "teen", "gender": "male",
        "pitch": "medium", "pace": "fast", "accent": "neutral American", "timbre": "warm, gritty",
        "personality": "hype and loyal", "default_emotion": "excited",
        "engine": "zsynth", "params": {"espeak_voice": "en-us+m2", "rate": 186, "pitch": 40, "range": 48,
                                       "semitones": -1.0, "eq": "rap", "reverb": "small_room", "volume": 100, "wordgap": 2},
        "design_prompt": "an energetic 15-year-old boy, fast pace, warm gritty timbre, rapper flow",
    },
    {
        "voice_id": "rico", "character": "Rico Vega", "age_range": "teen", "gender": "male",
        "pitch": "high", "pace": "very fast", "accent": "slight Latino", "timbre": "hype, bouncy",
        "personality": "fearless hype-man", "default_emotion": "excited",
        "engine": "zsynth", "params": {"espeak_voice": "en-us+m1", "rate": 198, "pitch": 58, "range": 60,
                                       "semitones": 2.5, "eq": "bright", "reverb": "small_room", "volume": 100, "wordgap": 1},
        "design_prompt": "a playful 14-year-old boy, very fast bouncy pace, dancer energy",
    },
    {
        "voice_id": "zoe", "character": "Zoe Reyes", "age_range": "teen", "gender": "female",
        "pitch": "medium", "pace": "sharp", "accent": "neutral American", "timbre": "edgy, confident",
        "personality": "competitive emcee", "default_emotion": "determined",
        "engine": "zsynth", "params": {"espeak_voice": "en-us+f5", "rate": 180, "pitch": 48, "range": 44,
                                       "semitones": 0.5, "eq": "rap", "reverb": "small_room", "volume": 100, "wordgap": 2},
        "design_prompt": "a sharp 15-year-old girl, confident and punchy, rapper cadence",
    },
    {
        "voice_id": "mr_grimm", "character": "Mr. Grimm", "age_range": "older adult", "gender": "male",
        "pitch": "low", "pace": "slow", "accent": "neutral American", "timbre": "oily, smug",
        "personality": "greedy and patient", "default_emotion": "greedy",
        "engine": "zsynth", "params": {"espeak_voice": "en-us+m6", "rate": 134, "pitch": 22, "range": 26,
                                       "semitones": -4.0, "eq": "dark", "reverb": "hallway", "volume": 100, "wordgap": 8},
        "design_prompt": "a slow oily 52-year-old man, smug and calculating, greedy undertone",
    },
    {
        "voice_id": "tommy", "character": "Tommy Kim", "age_range": "child", "gender": "male",
        "pitch": "very high", "pace": "quick", "accent": "neutral American", "timbre": "small, nervous",
        "personality": "scared but brave with friends", "default_emotion": "fearful",
        "engine": "zsynth", "params": {"espeak_voice": "en-us+m1", "rate": 172, "pitch": 74, "range": 52,
                                       "semitones": 4.0, "eq": "bright", "reverb": "small_room", "volume": 95, "wordgap": 3},
        "design_prompt": "a small nervous 10-year-old boy, quick pace, high voice",
    },
    {
        "voice_id": "mrs_kim", "character": "Mrs. Kim (Tommy's mother)", "age_range": "adult", "gender": "female",
        "pitch": "medium", "pace": "gentle", "accent": "neutral American", "timbre": "warm, kind",
        "personality": "loving mother", "default_emotion": "tender",
        "engine": "zsynth", "params": {"espeak_voice": "en-us+f2", "rate": 158, "pitch": 46, "range": 34,
                                       "semitones": 0.0, "eq": "flat", "reverb": "small_room", "volume": 100, "wordgap": 5},
        "design_prompt": "a kind 42-year-old mother, gentle warm voice, slow smile in her words",
    },
    {
        "voice_id": "mr_cole", "character": "Mr. Cole (Jayden's father)", "age_range": "adult", "gender": "male",
        "pitch": "low", "pace": "firm", "accent": "neutral American", "timbre": "stern, deep",
        "personality": "strict but fair", "default_emotion": "neutral",
        "engine": "zsynth", "params": {"espeak_voice": "en-us+m5", "rate": 146, "pitch": 26, "range": 30,
                                       "semitones": -3.5, "eq": "dark", "reverb": "small_room", "volume": 100, "wordgap": 7},
        "design_prompt": "a stern 46-year-old father, firm deep voice, few words",
    },
    {
        "voice_id": "ms_chan", "character": "Ms. Chan (teacher)", "age_range": "adult", "gender": "female",
        "pitch": "medium", "pace": "even", "accent": "neutral American", "timbre": "clear, authoritative",
        "personality": "firm teacher who cares", "default_emotion": "neutral",
        "engine": "zsynth", "params": {"espeak_voice": "en-us+f3", "rate": 150, "pitch": 42, "range": 36,
                                       "semitones": -0.5, "eq": "flat", "reverb": "hallway", "volume": 100, "wordgap": 4},
        "design_prompt": "a clear 36-year-old female teacher, even authoritative pace",
    },
    {
        "voice_id": "grandma_rosa", "character": "Grandma Rosa", "age_range": "senior", "gender": "female",
        "pitch": "low", "pace": "slow", "accent": "slight Latino", "timbre": "raspy, sweet",
        "personality": "block grandmother", "default_emotion": "tender",
        "engine": "zsynth", "params": {"espeak_voice": "en-us+f1", "rate": 136, "pitch": 34, "range": 24,
                                       "semitones": -2.0, "eq": "dark", "reverb": "small_room", "volume": 100, "wordgap": 9},
        "design_prompt": "a raspy 74-year-old grandmother, slow and sweet",
    },
    {
        "voice_id": "the_broker", "character": "The Broker", "age_range": "adult", "gender": "male",
        "pitch": "very low", "pace": "very slow", "accent": "neutral American", "timbre": "calm, menacing",
        "personality": "quiet villain", "default_emotion": "menacing",
        "engine": "zsynth", "params": {"espeak_voice": "en-us+m7", "rate": 124, "pitch": 18, "range": 18,
                                       "semitones": -5.5, "eq": "dark", "reverb": "hallway", "volume": 96, "wordgap": 10},
        "design_prompt": "a calm menacing 40-year-old man, very slow, quiet threat in every word",
    },
    {
        "voice_id": "derek", "character": "Derek (bully)", "age_range": "teen", "gender": "male",
        "pitch": "medium-high", "pace": "taunting", "accent": "neutral American", "timbre": "nasal, mocking",
        "personality": "school bully", "default_emotion": "sarcastic",
        "engine": "zsynth", "params": {"espeak_voice": "en-us+m3", "rate": 174, "pitch": 52, "range": 46,
                                       "semitones": 1.0, "eq": "nasal", "reverb": "hallway", "volume": 100, "wordgap": 3},
        "design_prompt": "a taunting 17-year-old bully, nasal mocking voice",
    },
    {
        "voice_id": "kid_crowd", "character": "Crowd of kids (extras)", "age_range": "teen", "gender": "mixed",
        "pitch": "mixed", "pace": "chant", "accent": "neutral American", "timbre": "group chant",
        "personality": "the whole block cheering", "default_emotion": "excited",
        "engine": "zsynth", "params": {"espeak_voice": "en-us", "rate": 176, "pitch": 50, "range": 40,
                                       "semitones": 0.0, "eq": "outdoors", "reverb": "outdoors", "volume": 100, "wordgap": 2},
        "design_prompt": "a crowd of excited teenagers chanting together",
    },
]


class CharacterBible:
    def __init__(self, config: Config):
        self.config = config
        self.path = config.characters_dir / "character_bible.json"
        data = read_json(self.path, {"characters": DEFAULT_CAST})
        if not data.get("characters"):
            data["characters"] = DEFAULT_CAST
        self.characters: dict[str, CharacterSpec] = {}
        for c in data["characters"]:
            spec = CharacterSpec.model_validate(c)
            if not spec.seed:
                spec.seed = stable_seed("character", spec.id)
            if not spec.reference:
                spec.reference = str(config.characters_dir / spec.id / "reference.png")
            if not spec.sprite:
                spec.sprite = str(config.characters_dir / spec.id / "sprite.png")
            self.characters[spec.id] = spec

    def get(self, cid: str) -> CharacterSpec | None:
        cid = cid.strip().lower().replace(" ", "_")
        if cid in self.characters:
            return self.characters[cid]
        for spec in self.characters.values():
            if spec.name.lower() == cid.replace("_", " "):
                return spec
        for spec in self.characters.values():
            if cid in spec.tags or cid in spec.id:
                return spec
        return None

    def resolve(self, name: str) -> str | None:
        spec = self.get(name)
        return spec.id if spec else None

    def all(self) -> list[CharacterSpec]:
        return list(self.characters.values())

    def save(self) -> None:
        write_json(self.path, {"characters": [c.model_dump() for c in self.characters.values()]})


class VoiceBible:
    def __init__(self, config: Config):
        self.config = config
        self.path = config.voices_dir / "voice_bible.json"
        data = read_json(self.path, {"voices": DEFAULT_VOICES})
        if not data.get("voices"):
            data["voices"] = DEFAULT_VOICES
        self.voices: dict[str, VoiceSpec] = {}
        for v in data["voices"]:
            spec = VoiceSpec.model_validate(v)
            if not spec.seed:
                spec.seed = stable_seed("voice", spec.voice_id)
            if not spec.reference_clip:
                spec.reference_clip = str(config.voices_dir / "reference_clips" / f"{spec.voice_id}.wav")
            self.voices[spec.voice_id] = spec

    def get(self, vid: str) -> VoiceSpec | None:
        vid = vid.strip().lower().replace(" ", "_")
        return self.voices.get(vid)

    def for_character(self, cid: str) -> VoiceSpec | None:
        return self.get(cid)

    def all(self) -> list[VoiceSpec]:
        return list(self.voices.values())

    def save(self) -> None:
        write_json(self.path, {"voices": [v.model_dump() for v in self.voices.values()]})
