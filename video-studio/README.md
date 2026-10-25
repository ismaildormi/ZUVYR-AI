# ZUVYR Studio

Fully self-hosted script-to-video pipeline for anime-style YouTube videos
(long 16:9 1920×1080, Shorts 9:16 1080×1920, thumbnails, multi-character
voice acting, original songs, captions). You write `script.txt`; the studio
splits, casts, voices, scores, shoots, lip-syncs, mixes and assembles the
final MP4 — on your machine, with no paid APIs.

Built as a new subsystem on the hexagonal architecture of
[itsPremkumar/Automated-Video-Generator](https://github.com/itsPremkumar/Automated-Video-Generator) (MIT)
— see `docs/ARCHITECTURE.md` for how the modules map onto it.

---

## Quick start (degraded mode — CPU-only, no downloads, ~5 minutes)

Works on any 2-core box with ~4 GB RAM. Voices are the built-in espeak-ng DSP
engine, visuals are the fixed per-character sprites composited over
generated/painted backgrounds with Ken Burns motion, music/SFX are original
procedural compositions. Output specs (1080p24, H.264+AAC, ~−14 LUFS,
SRT captions, 3 thumbnails) are identical to full mode.

```bash
cd video-studio

# 1) create a venv and install the few runtime deps (PyPI only)
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 2) health check (engines, cast, voices, ffmpeg, GPU detection)
.venv/bin/python bin/zuvyr doctor

# 3) generate your first video from a script
.venv/bin/python bin/zuvyr generate --script path/to/script.txt --format long --title "My Episode"

# outputs land in output/<video_id>/ :
#   <video_id>_long.mp4   final video
#   <video_id>.srt        captions (speaker-prefixed)
#   thumbnails/thumb_{a,b,c}.png   1280x720 click-bait variants (long format)
```

### Generate a Short

```bash
.venv/bin/python bin/zuvyr generate --script scripts/samples/sample_short.txt --format short
```

Same cast and voice bible as the long format; rendered natively 1080×1920.

### Web UI

```bash
.venv/bin/python bin/zuvyr portal --port 8787
# open http://localhost:8787 — script upload, style switch (2d/3d),
# character selection (restricts auto-casting; named cast always keeps its
# voice), live per-scene progress, scene audio preview, regenerate-one-scene,
# download MP4 + thumbnails + SRT.
```

### MCP server (Claude Desktop / any MCP host)

```bash
.venv/bin/python bin/zuvyr mcp          # stdio JSON-RPC; read tools only
ALLOW_UNSAFE_MCP_TOOLS=1 .venv/bin/python bin/zuvyr mcp   # + zuvyr_generate / regenerate
```

Tools: `zuvyr_doctor`, `zuvyr_list_characters`, `zuvyr_list_voices`,
`zuvyr_plan`, `zuvyr_job_status`, `zuvyr_list_jobs` (and the two gated write
tools).

### All CLI commands

```
bin/zuvyr doctor     health check
bin/zuvyr init       write default config (zuvyr.json), fonts, dirs
bin/zuvyr plan       script -> validated scene plan JSON (no render)
bin/zuvyr generate   script -> final MP4   (--script, --format long|short,
                                            --style 2d_anime|3d_render,
                                            --title, --video-id)
bin/zuvyr jobs       list jobs + per-scene status
bin/zuvyr resume     resume an interrupted/finished job (cached scenes skipped)
bin/zuvyr scene      inspect one scene of a job
bin/zuvyr voices     list the voice bible (--build to regenerate reference clips)
bin/zuvyr thumbs     regenerate the 3 thumbnail variants for a finished job
bin/zuvyr portal     web UI
bin/zuvyr mcp        stdio MCP server
```

---

## Writing scripts

Plain text, one scene per blank-line-separated block. Optional stage
directions in brackets are honoured but never re-worded — the LLM/planner
brain only *splits and annotates*, it never rewrites your story or dialogue.

```
[Visual: rainy alley, neon reflections]
MIKA: We can't let Grimm take the arcade. (determined)
JAYDEN: Then we take it back tonight.

NARRATOR: By sunrise, the whole street knew their names.
[SFX: door slam]
```

* `MIKA:` / `NARRATOR:` — speaker lines (cast lives in `characters/`, voice
  bible in `voices/`). Unknown speakers (e.g. `SHOPKEEPER:`) become **guest
  characters**: the label is never spoken aloud, the original name is kept in
  the captions, and a stable voice from the voice bible is auto-cast (from
  your selected characters if you passed a character selection).
* `[Visual: ...]` — forces the scene's look.
* `[SFX: ...]` — sound effect cue.
* Parenthetical delivery notes — mapped to the emotion pipeline
  (delivery/emotion/intensity/nonverbal); stage directions like `(chuckle)`
  become nonverbal annotations and are never read aloud.
* Optional `lyrics.txt` + `genre.txt` next to the script (or `--lyrics` /
  `--genre` flags) produce an original song scene with lip-synced vocal
  placements.

Style is a config flag (`2d_anime` default, `3d_render` alternative) — the
cast, prompts and audio chain are identical. Narration language is
configurable too (`"narration_language"` in `zuvyr.json`, or
`ZUVYR_LANGUAGE`; default `en`).

## Resuming / regenerating

Every job is checkpointed per scene under `jobs/<video_id>/`. Interrupted
renders resume and skip finished scenes; `bin/zuvyr resume <video_id>`
re-assembles a finished job without re-rendering cached scenes. One bad scene?
`POST /api/jobs/<id>/scenes/<scene_id>/regenerate` (portal) or the gated MCP
tool re-renders just that scene and re-assembles.

## Full mode (GPU — generative everything)

On a machine with an NVIDIA GPU (≥16 GB VRAM recommended) run:

```bash
bash scripts/setup_full_mode.sh     # clones ComfyUI + custom nodes, huggingface-cli downloads
```

This wires the adapters that are dormant in degraded mode:
ComfyUI headless (:8188) with AnimateDiff-Evolved, IPAdapter_plus,
VideoHelperSuite, controlnet_aux and ComfyUI-audio; SDXL + anime LoRA frames
with per-character fixed seeds/IP-Adapter FaceID; LTX-2 motion on key shots;
Kokoro narration with Chatterbox(-Turbo) character voices, Dia multi-speaker
and Higgs Audio V2 long dialogue; MusicGen score, AudioGen SFX and YuE
original songs; MuseTalk lip-sync (LatentSync/Wav2Lip fallbacks); the Ollama
(qwen3-class) planner brain. Every engine is capability-detected at runtime
and the pipeline degrades per-component, never hard-fails. Model list, VRAM
notes and licenses: `docs/FULL_MODE.md` and `docs/LICENSES.md`.

## Layout

```
video-studio/
  bin/zuvyr                 CLI launcher
  src/zuvyr_studio/         hexagonal package (config/schema/lib/application/adapters/portal)
  characters/<id>/          reference.png + keyed sprite.png (fixed identity, reused forever)
  voices/reference_clips/   model-generated 8-10s neutral clips (clone refs — never real people)
  scripts/samples/          the three sample scripts used in the test report
  samples/                  rendered deliverables (MP4/SRT/thumbnails)
  tests/                    pytest: schema, unit, and full 640x360 E2E pipeline
  jobs/ output/ take_cache/  working dirs (gitignored)
```

## Tests

```bash
.venv/bin/python -m pytest tests/ -q
```

29 tests: scene-schema validation, planner/brain units (word preservation,
guest auto-casting, language config, Title handling), DSP/voice/limiter/reverb
units, loudness regression, and three end-to-end pipeline renders (long +
short + guest speaker) with loudness verification at 640×360.

## Samples

`samples/long/sample_60s_1080p.mp4` (63.3 s, 1080p24, I=−14.5 LUFS),
`samples/short/sample_short_9x16.mp4` (31.3 s, 1080×1920, I=−14.4),
`samples/dialogue/dialogue_test_30s.mp4` (31.7 s, 3 characters × emotions,
I=−14.4) and `samples/thumbnails/thumb_{a,b,c}.png`. All rendered by the
exact code in this repo on a CPU-only box; two independent renders of the
dialogue test produce byte-identical MP4s. Full verification matrix:
`docs/ACCEPTANCE.md`, details in `docs/REPORT.md`.

## License notes

Pipeline code: see repository license. Component/model licenses are audited
in `docs/LICENSES.md` — every engine used is commercial-YouTube-safe
(Apache-2.0/MIT preferred; ComfyUI custom nodes are GPL-3.0 which is fine for
tooling). Music/lyrics/vocals are 100% model-generated originals; no real
person's voice is ever cloned. **Never use Higgs Audio V3 or Fish Audio S2
Pro** (non-commercial licenses) — the adapters refuse them by default.
