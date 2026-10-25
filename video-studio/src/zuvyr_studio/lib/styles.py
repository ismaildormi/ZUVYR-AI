"""Style presets, palettes, and shared constants."""
from __future__ import annotations

STYLE_PREFIXES = {
    "2d_anime": (
        "Masterpiece 2D anime style, vibrant cel-shaded colors, dramatic cinematic "
        "lighting, deep shadows, My Story Animated aesthetic"
    ),
    "3d_render": (
        "High quality 3D animated film render, soft cinematic lighting, expressive characters"
    ),
}

SHOT_TYPES = [
    "wide", "medium", "close-up", "extreme close-up",
    "over-the-shoulder", "low angle", "high angle",
]
CAMERA_MOVES = [
    "static", "push_in", "pull_out", "zoom_in", "zoom_out", "pan_left", "pan_right",
    "tilt_up", "tilt_down", "whip_pan", "orbit", "handheld",
]

EMOTIONS = [
    "neutral", "sad", "joyful", "greedy", "fearful", "angry", "jealous", "guilty",
    "sarcastic", "tender", "panicked", "determined", "excited", "ashamed",
    "relieved", "menacing", "proud", "nervous",
]
DELIVERIES = ["normal", "whisper", "shout", "trembling", "breaking", "cold", "rap", "narration"]
NONVERBAL = ["laugh", "sigh", "gasps", "sob", "breath", "gulp", "cheer", "gasp"]

LOCATION_BG_HINTS = {
    "street": ["bg_city_dusk"],
    "city": ["bg_city_dusk"],
    "school": ["bg_school_hallway"],
    "hallway": ["bg_school_hallway"],
    "apartment": ["bg_apartment_livingroom"],
    "home": ["bg_apartment_livingroom"],
    "living room": ["bg_apartment_livingroom"],
    "room": ["bg_apartment_livingroom"],
    "rooftop": ["bg_rooftop_dusk"],
    "roof": ["bg_rooftop_dusk"],
    "alley": ["bg_alley_graffiti"],
    "graffiti": ["bg_alley_graffiti"],
}

PALETTES = {
    "teal": {"accent": (46, 196, 182), "deep": (7, 39, 55), "pop": (255, 209, 102)},
    "magenta": {"accent": (214, 51, 108), "deep": (42, 12, 32), "pop": (255, 183, 3)},
    "amber": {"accent": (255, 159, 28), "deep": (48, 27, 6), "pop": (95, 211, 148)},
    "violet": {"accent": (150, 95, 255), "deep": (24, 14, 48), "pop": (0, 229, 255)},
}

THUMB_STYLES = [
    {"layout": "left_char", "palette": "amber", "text_style": "yellow_red"},
    {"layout": "right_char", "palette": "magenta", "text_style": "white_blue"},
    {"layout": "center_char", "palette": "violet", "text_style": "gradient"},
]
