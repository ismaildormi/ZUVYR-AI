"""Pipeline orchestrator: script -> plan -> per-scene audio+visuals -> assemble.

Stages per scene: audio (voice takes / song / SFX / music) -> frames -> encode.
Global stages: plan, cast, assemble (concat + mix + loudnorm), thumbnails, srt.
Resumable: every stage writes its outputs and marks state; completed work is
skipped on re-run, single scenes can be regenerated.
"""
from __future__ import annotations

import shutil
import time
from pathlib import Path

import numpy as np

from ..config import Config
from ..lib import audio as A
from ..lib.ffmpeg import normalize_lufs, run as ff_run
from ..lib.rng import stable_seed
from ..schema import ScenePlan, validate_plan
from .bibles import CharacterBible, VoiceBible
from .jobs import JobStore
from .planner import Planner
from .takes import VoiceDirector, guest_voice

# scene.location -> reverb room (audio-post spec: per-location reverb)
LOCATION_ROOMS = {
    "rooftop": "street", "street": "street", "alley": "street", "city": "street", "outside": "street",
    "hallway": "hallway", "school": "hallway", "corridor": "hallway",
    "room": "small", "apartment": "small", "home": "small", "bedroom": "small", "store": "small",
    "hall": "hall", "gym": "hall", "stage": "hall", "arcade": "hall",
}


class Pipeline:
    def __init__(self, config: Config | None = None):
        self.config = config or Config()
        self.cast = CharacterBible(self.config)
        self.voices = VoiceBible(self.config)
        self.planner = Planner(self.config, self.cast, self.voices)
        self.director = VoiceDirector(self.config, self.voices)

    # ================================================================= public
    def generate(self, script_text: str, video_id: str | None = None, *,
                 style: str | None = None, fmt: str = "long", title: str | None = None,
                 lyrics: str | None = None, genre: str | None = None,
                 characters: list[str] | None = None,
                 intro_card: bool = True, thumbnails: bool = True,
                 job: JobStore | None = None, log=print) -> dict:
        t0 = time.time()
        style = style or self.config.style
        video_id = video_id or f"vid-{int(time.time())}"
        job = job or JobStore(self.config, video_id)
        job.set("status", "running")
        job.set("params", {"style": style, "format": fmt, "title": title, "intro_card": intro_card,
                           "characters": characters or None})
        job.set("engines", {
            # ACTUAL engines used by the render path (not aspiration): the
            # full-mode adapters (ComfyUI / comfy_audio / YuE / MuseTalk)
            # exist but are NOT yet wired into this pipeline — see
            # docs/ACCEPTANCE.md section B for wiring + blocker status.
            "brain": self.planner.engine_name,
            "voice": self.director.engine_name,
            "vision": "offline-sprites",
            "music": "procedural",
            "song": "procedural",
            "lipsync": "procedural-envelope",
            "render": "ffmpeg-pillow",
        })
        log(f"[pipeline] engines: brain={self.planner.engine_name} voice={self.director.engine_name}")

        # ---------------------------------------------------------- 1. plan
        job.set_stage("plan", "running")
        plan_path = job.dir / "plan.json"
        if plan_path.exists():
            plan = validate_plan(__import__("json").loads(plan_path.read_text()))
            log(f"[pipeline] loaded cached plan: {len(plan.scenes)} scenes")
        else:
            plan, brain = self.planner.plan(script_text, video_id, title, style, fmt, lyrics, genre,
                                            allowed=characters)
            plan_path.write_text(plan.model_dump_json(indent=2), encoding="utf-8")
            log(f"[pipeline] planned {len(plan.scenes)} scenes via {brain}: "
                f"{[s.role for s in plan.scenes]}")
        job.set_stage("plan", "done", engine=self.planner.engine_name, scenes=len(plan.scenes))
        job.init_scenes([s.scene_id for s in plan.scenes])
        job.set("title", plan.title)

        # ---------------------------------------------------------- 2. cast
        job.set_stage("cast", "running")
        sprites = self._load_sprites()
        job.set_stage("cast", "done", characters=len(sprites))

        # ---------------------------------------------------------- 3. scenes
        scene_offsets: list[float] = []
        srt_entries: list[dict] = []
        g_dialogue = A.silence(1.0)
        g_sfx = A.silence(1.0)
        g_music = A.silence(1.0)
        offset = 0.0
        videos: list[Path] = []

        if intro_card or (job.dir / "intro.mp4").exists():
            job.set_stage("intro", "running")
            intro_dir = job.dir / "intro"
            intro_mp4 = job.dir / "intro.mp4"
            if not intro_mp4.exists():
                from ..adapters.render.frames import render_title_card

                frames = render_title_card(self.config, plan, sprites, intro_dir / "frames")
                encode_frames(frames, intro_mp4, self.config.fps, self.config, duration_s=2.6)
                shutil.rmtree(intro_dir, ignore_errors=True)
            videos.append(intro_mp4)
            scene_offsets.append(0.0)
            offset += 2.6
            g_music = A.mix_at(g_music, self._music_for("hopeful", 2.6, stable_seed("intro", "music")), 0.0)
            job.set_stage("intro", "done")

        for si, scene in enumerate(plan.scenes):
            st = job.scene(scene.scene_id)
            scene_dir = job.dir / "scenes" / scene.scene_id
            cached = st.get("status") == "done" and st.get("video") and Path(st["video"]).exists()
            line_times: list[dict] = []
            if cached:
                scene.duration_s = st.get("duration_s") or scene.duration_s
                videos.append(Path(st["video"]))
                scene_offsets.append(offset)
                line_times = self._load_cached_lines(scene, scene_dir)
                log(f"[pipeline] scene {scene.scene_id} (cached)")
            else:
                job.set_scene(scene.scene_id, status="running")
                ts = time.time()
                scene_dir.mkdir(parents=True, exist_ok=True)

                # ------------------------------ 3a. audio
                audio_wav = scene_dir / "audio.wav"
                line_meta_path = scene_dir / "lines.json"
                if audio_wav.exists() and line_meta_path.exists():
                    line_times = self._load_cached_lines(scene, scene_dir, audio=True)
                    _, sc_audio = A.read_wav(audio_wav)
                else:
                    sc_audio, line_times = self._scene_audio(scene, scene_dir, job, log)
                scene.duration_s = max(scene.duration_s, len(sc_audio) / A.SR + 0.2)
                job.set_scene(scene.scene_id, duration_s=scene.duration_s)

                # ------------------------------ 3b. video frames + encode
                video_mp4 = scene_dir / "video.mp4"
                if not video_mp4.exists():
                    from ..adapters.render.frames import SceneRenderer

                    vertical = plan.format == "short"
                    renderer = SceneRenderer(self.config, plan, scene, sprites, line_times=line_times,
                                             vertical=vertical)
                    renderer.attach_cast(self.cast)
                    frames_dir = scene_dir / "frames"
                    tfr = time.time()
                    renderer.render_all_jpeg(frames_dir)
                    encode_frames_dir(frames_dir, video_mp4, self.config.fps, self.config, duration_s=scene.duration_s)
                    shutil.rmtree(frames_dir, ignore_errors=True)
                    log(f"[pipeline] scene {scene.scene_id}: rendered {renderer.n_frames} frames in {time.time()-tfr:.1f}s")
                videos.append(video_mp4)
                scene_offsets.append(offset)
                job.set_scene(scene.scene_id, status="done", video=str(video_mp4), audio=str(scene_dir / "audio.wav"),
                              duration_s=scene.duration_s, secs=round(time.time() - ts, 1))

            # ------------------------------ 3c. global buses (cached + fresh)
            room = LOCATION_ROOMS.get((scene.location or "street").lower(), "small")
            for lt in line_times:
                if not Path(lt["clip"]).exists():
                    continue
                _, clip = A.read_wav(lt["clip"])
                clip = A.normalize_peak(clip, -6.0)
                if room != "none" and lt.get("speaker") != "narrator":
                    clip = A.room_reverb(clip, A.SR, room)  # per-location reverb
                g_dialogue = A.mix_at(g_dialogue, clip, offset + lt["start_s"])
                srt_entries.append({
                    "start_s": offset + lt["start_s"], "end_s": offset + lt["end_s"],
                    "speaker": lt["speaker"], "text": lt["text"],
                })
            for name, snd in self._scene_sfx(scene):
                g_sfx = A.mix_at(g_sfx, snd * 0.8, offset + 0.2)
            g_music = A.mix_at(g_music, self._music_for(scene.music_cue.mood, scene.duration_s,
                                                        stable_seed(scene.scene_id, "music")), offset)
            offset += scene.duration_s

        # persist re-timed durations so resume/assembly stays aligned
        plan_path.write_text(plan.model_dump_json(indent=2), encoding="utf-8")

        # ---------------------------------------------------------- 4. assemble
        job.set_stage("assemble", "running")
        total = offset
        g_dialogue = g_dialogue[: int(total * A.SR)]
        g_sfx = g_sfx[: int(total * A.SR)]
        g_music = g_music[: int(total * A.SR)]
        from ..adapters.render.assemble import duck_music, finalize_mix

        mix = finalize_mix(g_dialogue, g_sfx, g_music, A.SR, duck_db=self.config.audio_cfg.get("duck_db", 10.0))
        master = job.dir / "master.wav"
        A.write_wav(master, mix)
        audio_norm = job.dir / "master_norm.m4a"
        normalize_lufs(master, audio_norm, target_i=self.config.audio_cfg.get("target_lufs", -14.0),
                       tp=self.config.audio_cfg.get("peak_db", -1.5))

        silent_video = job.dir / "video_all.mp4"
        from ..adapters.render.assemble import concat_videos

        concat_videos(videos, silent_video, job.dir / "tmp_concat")
        final = self.config.output_dir / video_id / f"{video_id}_{plan.format}.mp4"
        final.parent.mkdir(parents=True, exist_ok=True)
        from ..adapters.render.assemble import mux

        mux(silent_video, audio_norm, final)
        job.set_stage("assemble", "done")

        # ---------------------------------------------------------- 5. captions
        srt_path = self.config.output_dir / video_id / f"{video_id}.srt"
        from ..adapters.render.assemble import write_srt

        write_srt(srt_entries, srt_path)
        job.set("outputs", {
            "video": str(final), "srt": str(srt_path),
            "duration_s": round(total, 2), "title": plan.title,
        })

        # ---------------------------------------------------------- 6. thumbnails
        if thumbnails and plan.format == "long":
            job.set_stage("thumbnails", "running")
            from .thumbnails import render_thumbnails

            tdir = self.config.output_dir / video_id / "thumbnails"
            paths = render_thumbnails(self.config, plan, sprites, tdir, self.cast)
            outs = dict(job.get("outputs", {}))
            outs["thumbnails"] = [str(p) for p in paths]
            job.set("outputs", outs)
            job.set_stage("thumbnails", "done")

        job.set("status", "done")
        job.set("timings", {"total_s": round(time.time() - t0, 1)})
        log(f"[pipeline] DONE {video_id}: {final} ({total:.1f}s video, {time.time()-t0:.1f}s wall)")
        return {"video_id": video_id, "video": str(final), "srt": str(srt_path), "duration_s": total}

    # ================================================================= scenes
    def _scene_audio(self, scene, scene_dir: Path, job: JobStore, log) -> tuple[np.ndarray, list[dict]]:
        """Build scene audio timeline; returns (audio, line_times)."""
        if scene.role == "song" and scene.song_segment and scene.song_segment.enabled:
            from ..adapters.song.procedural_song import render_song

            voices = {}
            for cid in scene.characters_present:
                if cid == "narrator":
                    continue
                v = self.voices.get(cid)
                if v is None:
                    v = guest_voice(self.voices, cid)  # guest speaker in a song
                if v:
                    voices[cid] = v
            if not voices:
                voices = {"jayden": self.voices.get("jayden")}
            wav, placements = render_song(scene, voices, self.director.synth_callable(),
                                          scene_dir / "song.wav")
            _, audio = A.read_wav(wav)
            line_times = []
            from ..adapters.lipsync.procedural import mouth_envelope

            for pl in placements:
                d = pl["end_s"] - pl["start_s"]
                line_times.append({
                    "speaker": pl["line"].speaker, "text": pl["line"].text,
                    "start_s": pl["start_s"], "end_s": pl["end_s"], "dur": d,
                    "clip": str(wav), "mouth": mouth_envelope(wav, pl["start_s"], pl["end_s"]),
                    "line": pl["line"],
                })
            scene.duration_s = len(audio) / A.SR
            import json as _json

            _json_dump_lines(line_times, scene_dir / "lines.json")
            A.write_wav(scene_dir / "audio.wav", audio)
            return audio, line_times

        # dialogue / narration scene
        takes_dir = scene_dir / "takes"
        line_times = []
        t = 0.0
        clips = []
        for ln in scene.dialogue:
            t += ln.pause_before_ms / 1000.0
            take = self.director.synth_line(ln, takes_dir, scene.scene_id, important=ln.intensity >= 3)
            _, clip = A.read_wav(take["path"])
            from ..adapters.lipsync.procedural import mouth_envelope

            line_times.append({
                "speaker": ln.speaker, "text": ln.text, "start_s": t, "end_s": t + len(clip) / A.SR,
                "dur": len(clip) / A.SR, "clip": str(take["path"]), "take": take["take"],
                "engine": take["engine"], "mouth": mouth_envelope(take["path"], 0, len(clip) / A.SR),
                "line": ln,
            })
            clips.append(clip)
            t += len(clip) / A.SR + 0.08
        dur = max(scene.duration_s, t + 0.4)
        audio = A.silence(dur)
        for lt in line_times:
            _, clip = A.read_wav(lt["clip"])
            audio = A.mix_at(audio, clip, lt["start_s"])
        _json_dump_lines(line_times, scene_dir / "lines.json")
        A.write_wav(scene_dir / "audio.wav", audio)
        return audio, line_times

    def _load_cached_lines(self, scene, scene_dir: Path, audio: bool = False) -> list[dict]:
        import json as _json

        from ..adapters.lipsync.procedural import mouth_envelope

        lm = scene_dir / "lines.json"
        if not lm.exists():
            return []
        out = []
        for slim in _json.loads(lm.read_text()):
            slim = dict(slim)
            match = next((l for l in scene.dialogue if l.speaker == slim["speaker"] and l.text == slim["text"]), None)
            if match is not None:
                slim["line"] = match.model_copy()
            if Path(slim["clip"]).exists():
                slim["mouth"] = mouth_envelope(slim["clip"], 0, slim["dur"])
                out.append(slim)
        return out

    def _scene_sfx(self, scene):
        from ..adapters.music.procedural import sfx_from_prompt

        out = []
        for prompt in scene.sfx_prompt:
            for name, snd in sfx_from_prompt(prompt, seed=stable_seed("sfx", scene.scene_id, prompt)):
                out.append((name, A.normalize_peak(snd, -18.0)))
        return out

    def _music_for(self, mood: str, dur: float, seed: int) -> np.ndarray:
        from ..adapters.music.procedural import compose_score

        return compose_score(mood, duration_s=dur, seed=seed)

    # ================================================================= misc
    def _load_sprites(self) -> dict:
        from ..adapters.vision.sprites import build_all_sprites, load_sprite

        build_all_sprites(self.cast)
        out = {}
        for spec in self.cast.all():
            p = Path(spec.sprite)
            if p.exists():
                out[spec.id] = load_sprite(p)
        return out

    # ================================================================= regen
    def regenerate_scene(self, video_id: str, scene_id: str, log=print) -> dict:
        job = JobStore(self.config, video_id)
        plan_path = job.dir / "plan.json"
        if not plan_path.exists():
            raise RuntimeError(f"job {video_id} has no plan")
        plan = validate_plan(__import__("json").loads(plan_path.read_text()))
        scene = next((s for s in plan.scenes if s.scene_id == scene_id), None)
        if scene is None:
            raise RuntimeError(f"scene {scene_id} not in plan")
        scene_dir = job.dir / "scenes" / scene_id
        shutil.rmtree(scene_dir, ignore_errors=True)
        job.reset_scene(scene_id)
        # re-run generate with same plan (cached scenes skip, this one reruns)
        return self.generate_script_only(job, plan, log)

    def generate_script_only(self, job: JobStore, plan: ScenePlan, log=print):
        """Re-assemble an existing job from its plan (used by regenerate + resume)."""
        script = plan  # plan already cached on disk; call generate with plan reuse
        import json as _json

        return self.generate("", video_id=job.video_id, style=plan.style, fmt=plan.format,
                             title=plan.title, intro_card=False, thumbnails=True, job=job, log=log)

    def resume(self, video_id: str, log=print) -> dict:
        job = JobStore(self.config, video_id)
        if job.get("status") == "done":
            return job.get("outputs")
        plan_path = job.dir / "plan.json"
        if not plan_path.exists():
            raise RuntimeError(f"job {video_id} has no plan to resume")
        return self.generate("", video_id=video_id, intro_card=job.get("params", {}).get("intro_card", True),
                             job=job, log=log)


def encode_frames(frames: list[Path], out_mp4: Path, fps: int, config: Config,
                  duration_s: float | None = None) -> Path:
    first = frames[0]
    d = first.parent
    return encode_frames_dir(d, out_mp4, fps, config, duration_s)


def encode_frames_dir(frames_dir: Path, out_mp4: Path, fps: int, config: Config,
                      duration_s: float | None = None) -> Path:
    from ..adapters.render.assemble import encode_scene_video

    return encode_scene_video(frames_dir, out_mp4, fps,
                              crf=config.get("video", {}).get("crf", 27),
                              preset=config.get("video", {}).get("preset", "veryfast"),
                              duration_s=duration_s)


def _json_dump_lines(line_times: list[dict], path: Path) -> None:
    import json as _json

    slim = [{k: v for k, v in lt.items() if k not in ("line", "mouth")} for lt in line_times]
    path.write_text(_json.dumps(slim, indent=1), encoding="utf-8")
