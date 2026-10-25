"""ZUVYR Studio CLI."""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path


def _bootstrap() -> None:
    src = Path(__file__).resolve().parents[1]
    if str(src.parent) not in sys.path:
        sys.path.insert(0, str(src.parent))


def main(argv: list[str] | None = None) -> int:
    _bootstrap()
    parser = argparse.ArgumentParser(prog="zuvyr", description="ZUVYR Studio — script to anime video pipeline")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("doctor", help="environment + engines health check")
    p.add_argument("--json", action="store_true", help="machine-readable engine matrix (for acceptance gates)")
    sub.add_parser("init", help="write default bibles/config and build cast assets")
    p = sub.add_parser("plan", help="script -> scene plan JSON (no render)")
    p.add_argument("--script", required=True)
    p.add_argument("--style", default=None, choices=["2d_anime", "3d_render"])
    p.add_argument("--format", default="long", choices=["long", "short"])
    p.add_argument("--out", default=None)
    p = sub.add_parser("generate", help="script -> final MP4")
    p.add_argument("--script", required=True)
    p.add_argument("--style", default=None, choices=["2d_anime", "3d_render"])
    p.add_argument("--format", default="long", choices=["long", "short"])
    p.add_argument("--title", default=None)
    p.add_argument("--id", default=None)
    p.add_argument("--lyrics", default=None)
    p.add_argument("--genre", default=None)
    p.add_argument("--no-intro", action="store_true")
    p.add_argument("--no-thumbs", action="store_true")
    p = sub.add_parser("resume", help="resume an interrupted job")
    p.add_argument("video_id")
    p = sub.add_parser("jobs", help="list jobs / show one")
    p.add_argument("video_id", nargs="?")
    p = sub.add_parser("scene", help="regenerate one scene of a job")
    p.add_argument("video_id")
    p.add_argument("scene_id")
    p = sub.add_parser("voices", help="list voices / build reference clips")
    p.add_argument("--build", action="store_true")
    p = sub.add_parser("thumbs", help="re-render thumbnails for a job")
    p.add_argument("video_id")
    p.add_argument("--text", default=None)
    p = sub.add_parser("portal", help="start the web UI")
    p.add_argument("--port", type=int, default=8787)
    p.add_argument("--host", default="0.0.0.0")
    sub.add_parser("mcp", help="run a minimal stdio MCP server (tools: plan/generate/status/...)")

    args = parser.parse_args(argv)

    if args.cmd == "doctor":
        return cmd_doctor(args)
    if args.cmd == "init":
        return cmd_init()
    if args.cmd == "plan":
        return cmd_plan(args)
    if args.cmd == "generate":
        return cmd_generate(args)
    if args.cmd == "resume":
        return cmd_resume(args)
    if args.cmd == "jobs":
        return cmd_jobs(args)
    if args.cmd == "scene":
        return cmd_scene(args)
    if args.cmd == "voices":
        return cmd_voices(args)
    if args.cmd == "thumbs":
        return cmd_thumbs(args)
    if args.cmd == "portal":
        return cmd_portal(args)
    if args.cmd == "mcp":
        return cmd_mcp()
    return 2


# ------------------------------------------------------------------ commands
def cmd_doctor(args=None) -> int:
    _bootstrap()
    import json as _json

    want_json = bool(getattr(args, "json", False))
    from .config import Config
    from .lib.fs import ROOT
    from .lib.ffmpeg import ffmpeg_path, probe

    if want_json:
        # machine-readable engine matrix (acceptance gates / CI)
        import shutil as _shutil

        cfg = Config()
        from .application.bibles import CharacterBible, VoiceBible
        from .application.planner import Planner
        from .application.takes import VoiceDirector

        cast, voices = CharacterBible(cfg), VoiceBible(cfg)
        planner = Planner(cfg, cast, voices)
        try:
            director = VoiceDirector(cfg, voices)
            voice_engine = director.engine_name
        except Exception:
            voice_engine = "error"
        try:
            from .adapters.vision.comfyui import ComfyUIClient

            comfy = ComfyUIClient(cfg).available()
        except Exception:
            comfy = False
        gpu = None
        try:
            import subprocess as _sp

            r = _sp.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
                        capture_output=True, text=True, timeout=10)
            if r.returncode == 0:
                gpu = r.stdout.strip()
        except Exception:
            pass
        out = {
            "root": str(ROOT),
            "ffmpeg": None,
            "gpu": gpu,
            "disk_free_gb": round(_shutil.disk_usage(ROOT).free / 1e9, 1),
            "cast": [c.id for c in cast.all()],
            "voices": [v.voice_id for v in voices.all()],
            "reference_clips": sum(1 for v in voices.all() if Path(v.reference_clip).exists()),
            "sprites": sum(1 for c in cast.all() if Path(c.sprite).exists()),
            "engines": {
                "brain": planner.engine_name,
                "voice": voice_engine,
                "vision": "comfyui" if comfy else "offline-sprites",
                "comfyui_online": comfy,
            },
        }
        try:
            out["ffmpeg"] = ffmpeg_path()
        except Exception:
            pass
        print(_json.dumps(out, indent=2))
        return 0

    print("ZUVYR Studio doctor")
    print("-" * 60)
    print(f"root        : {ROOT}")
    try:
        print(f"ffmpeg      : {ffmpeg_path()}")
    except Exception as e:
        print(f"ffmpeg      : MISSING ({e})")
    gpu = "none"
    try:
        import subprocess

        r = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
                           capture_output=True, text=True, timeout=10)
        if r.returncode == 0:
            gpu = r.stdout.strip()
    except Exception:
        pass
    print(f"gpu         : {gpu}")
    import shutil

    print(f"disk free   : {shutil.disk_usage(ROOT).free / 1e9:.1f} GB")

    cfg = Config()
    from .application.bibles import CharacterBible, VoiceBible
    from .application.planner import Planner
    from .application.takes import VoiceDirector

    cast, voices = CharacterBible(cfg), VoiceBible(cfg)
    print(f"cast        : {len(cast.all())} characters ({', '.join(c.id for c in cast.all())})")
    print(f"voices      : {len(voices.all())} voices")
    for c in cast.all():
        ref = Path(c.reference)
        spr = Path(c.sprite)
        print(f"  - {c.id:10s} ref={'Y' if ref.exists() else 'N'} sprite={'Y' if spr.exists() else 'N'} seed={c.seed}")

    planner = Planner(cfg, cast, voices)
    print(f"brain       : {planner.engine_name}" + ("  (offline deterministic fallback — no Ollama at "
          + cfg.engines['brain']['ollama']['url'] + ")" if planner.engine_name == "offline" else ""))
    try:
        director = VoiceDirector(cfg, voices)
        print(f"voice engine: {director.engine_name}" + ("  (offline)" if director.engine_name == "zsynth" else ""))
    except Exception as e:
        print(f"voice engine: ERROR {e}")
    try:
        from .adapters.vision.comfyui import ComfyUIClient

        client = ComfyUIClient(cfg)
        print(f"comfyui     : {'ONLINE at ' + client.url if client.available() else 'offline (procedural visuals)'}")
    except Exception:
        print("comfyui     : offline (procedural visuals)")
    print("-" * 60)
    print("degraded mode is fully functional: espeak voices + procedural score/SFX + sprite renderer")
    return 0


def cmd_init() -> int:
    _bootstrap()
    from .adapters.vision.sprites import build_all_sprites
    from .application.bibles import CharacterBible, VoiceBible
    from .config import Config

    cfg = Config()
    cast, voices = CharacterBible(cfg), VoiceBible(cfg)
    cast.save()
    voices.save()
    print(f"character_bible.json: {len(cast.all())} characters")
    print(f"voice_bible.json   : {len(voices.all())} voices")
    for r in build_all_sprites(cast):
        print(f"sprite: {r}")
    print("init done")
    return 0


def cmd_plan(args) -> int:
    _bootstrap()
    from .application.bibles import CharacterBible, VoiceBible
    from .application.planner import Planner
    from .config import Config

    cfg = Config()
    cast, voices = CharacterBible(cfg), VoiceBible(cfg)
    planner = Planner(cfg, cast, voices)
    script = Path(args.script).read_text(encoding="utf-8")
    plan, engine = planner.plan(script, "plan-preview", style=args.style, fmt=args.format)
    out = Path(args.out) if args.out else Path(args.script).with_suffix(".plan.json")
    out.write_text(plan.model_dump_json(indent=2), encoding="utf-8")
    print(f"planned by {engine}: {len(plan.scenes)} scenes, {plan.total_duration_s:.1f}s -> {out}")
    for s in plan.scenes:
        print(f"  {s.scene_id} [{s.role:9s}] {s.duration_s:5.1f}s cam={s.camera.shot}/{s.camera.movement} "
              f"chars={','.join(s.characters_present) or '-'} lines={len(s.dialogue)}")
    return 0


def cmd_generate(args) -> int:
    _bootstrap()
    from .application.pipeline import Pipeline
    from .config import Config

    cfg = Config()
    pipe = Pipeline(cfg)
    script = Path(args.script).read_text(encoding="utf-8")
    # explicit flags win; otherwise auto-detect lyrics.txt / genre.txt next to
    # the script (spec: optional sidecar inputs)
    sdir = Path(args.script).parent
    lyrics_path = Path(args.lyrics) if args.lyrics else sdir / "lyrics.txt"
    genre_path = Path(args.genre) if args.genre else sdir / "genre.txt"
    lyrics = lyrics_path.read_text(encoding="utf-8") if lyrics_path.exists() else None
    genre = genre_path.read_text(encoding="utf-8").strip() if genre_path.exists() else None
    result = pipe.generate(
        script, video_id=args.id, style=args.style, fmt=args.format, title=args.title,
        lyrics=lyrics, genre=genre, intro_card=not args.no_intro, thumbnails=not args.no_thumbs,
    )
    print("\nRESULT:")
    for k, v in result.items():
        print(f"  {k}: {v}")
    return 0


def cmd_resume(args) -> int:
    _bootstrap()
    from .application.pipeline import Pipeline
    from .config import Config

    Pipeline(Config()).resume(args.video_id)
    return 0


def cmd_jobs(args) -> int:
    _bootstrap()
    from .lib.fs import read_json
    from .config import Config

    cfg = Config()
    if args.video_id:
        data = read_json(cfg.jobs_dir / args.video_id / "job.json")
        if not data:
            print(f"no job {args.video_id}")
            return 1
        print(data if isinstance(data, str) else __import__("json").dumps(data, indent=2))
        return 0
    for j in sorted(cfg.jobs_dir.glob("*/job.json")):
        d = read_json(j)
        print(f"{d.get('video_id'):28s} {d.get('status','?'):10s} "
              f"scenes={sum(1 for s in d.get('scenes', []) if s.get('status') == 'done')}/{len(d.get('scenes', []))} "
              f"{(d.get('outputs') or {}).get('video', '')}")
    return 0


def cmd_scene(args) -> int:
    _bootstrap()
    from .application.pipeline import Pipeline
    from .config import Config

    Pipeline(Config()).regenerate_scene(args.video_id, args.scene_id)
    return 0


def cmd_voices(args) -> int:
    _bootstrap()
    from .adapters.voice.zsynth import ZSynthEngine, build_reference_clip
    from .application.bibles import VoiceBible
    from .config import Config

    cfg = Config()
    voices = VoiceBible(cfg)
    if not args.build:
        for v in voices.all():
            clip = "clip:Y" if Path(v.reference_clip).exists() else "clip:N"
            print(f"{v.voice_id:14s} {v.gender:8s} {v.age_range:12s} engine={v.engine:9s} {clip}  {v.timbre}")
        return 0
    eng = ZSynthEngine(cfg)
    import hashlib

    for v in voices.all():
        p = Path(v.reference_clip)
        build_reference_clip(eng, v, p)
        h = hashlib.md5(p.read_bytes()).hexdigest()[:10]
        print(f"built {v.voice_id:14s} -> {p.name}  md5={h}")
    voices.save()
    return 0


def cmd_thumbs(args) -> int:
    _bootstrap()
    import json as _json

    from .adapters.vision.sprites import build_all_sprites, load_sprite
    from .application.bibles import CharacterBible
    from .application.thumbnails import render_thumbnails
    from .config import Config
    from .schema import validate_plan

    cfg = Config()
    cast = CharacterBible(cfg)
    job_dir = cfg.jobs_dir / args.video_id
    plan = validate_plan(_json.loads((job_dir / "plan.json").read_text()))
    build_all_sprites(cast)
    sprites = {c.id: load_sprite(Path(c.sprite)) for c in cast.all() if Path(c.sprite).exists()}
    paths = render_thumbnails(cfg, plan, sprites, cfg.output_dir / args.video_id / "thumbnails", cast, text=args.text)
    for p in paths:
        print(p)
    return 0


def cmd_portal(args) -> int:
    _bootstrap()
    from .portal.server import run_portal

    run_portal(host=args.host, port=args.port)
    return 0


def cmd_mcp() -> int:
    _bootstrap()
    from .portal.mcp import serve_mcp

    serve_mcp()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
