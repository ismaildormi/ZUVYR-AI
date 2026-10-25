"""Minimal stdio MCP server (JSON-RPC 2.0) exposing the pipeline to MCP hosts
(Claude Desktop / Claude Code / the base app's MCP surface).

Tools: zuvyr_doctor, zuvyr_plan, zuvyr_generate, zuvyr_job_status, zuvyr_list_jobs,
zuvyr_regenerate_scene, zuvyr_list_characters, zuvyr_list_voices.
Write tools require the same ALLOW_UNSAFE_MCP_TOOLS=1 gate as the base app.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

TOOLS = [
    {"name": "zuvyr_doctor", "description": "Health check: engines, cast, voices, ffmpeg, GPU",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "zuvyr_list_characters", "description": "List the recurring cast", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "zuvyr_list_voices", "description": "List the voice bible", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "zuvyr_plan", "description": "Script text -> scene plan JSON (no rendering)",
     "inputSchema": {"type": "object", "properties": {"script": {"type": "string"}, "style": {"type": "string"}}, "required": ["script"]}},
    {"name": "zuvyr_generate", "description": "Script text -> final MP4 (write tool, needs ALLOW_UNSAFE_MCP_TOOLS=1)",
     "inputSchema": {"type": "object", "properties": {"script": {"type": "string"}, "style": {"type": "string"},
                                                      "format": {"type": "string"}, "title": {"type": "string"},
                                                      "video_id": {"type": "string"}}, "required": ["script"]}},
    {"name": "zuvyr_job_status", "description": "Progress of a job", "inputSchema": {"type": "object", "properties": {"video_id": {"type": "string"}}, "required": ["video_id"]}},
    {"name": "zuvyr_list_jobs", "description": "List all jobs", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "zuvyr_regenerate_scene", "description": "Regenerate one scene (write tool)",
     "inputSchema": {"type": "object", "properties": {"video_id": {"type": "string"}, "scene_id": {"type": "string"}}, "required": ["video_id", "scene_id"]}},
]
WRITE_TOOLS = {"zuvyr_generate", "zuvyr_regenerate_scene"}


def _resp(result, id_):
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": id_, "result": result}) + "\n")
    sys.stdout.flush()


def _err(code, message, id_):
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": id_, "error": {"code": code, "message": message}}) + "\n")
    sys.stdout.flush()


def _handle(name: str, args: dict) -> dict:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1].parent))
    from zuvyr_studio.application.bibles import CharacterBible, VoiceBible
    from zuvyr_studio.application.pipeline import Pipeline
    from zuvyr_studio.config import Config
    from zuvyr_studio.lib.fs import read_json

    cfg = Config()
    if name == "zuvyr_doctor":
        from zuvyr_studio.cli import cmd_doctor
        import io
        from contextlib import redirect_stdout

        buf = io.StringIO()
        with redirect_stdout(buf):
            cmd_doctor()
        return {"content": [{"type": "text", "text": buf.getvalue()}]}
    if name == "zuvyr_list_characters":
        cast = CharacterBible(cfg)
        return {"content": [{"type": "text", "text": json.dumps([c.model_dump() for c in cast.all()], indent=1)}]}
    if name == "zuvyr_list_voices":
        voices = VoiceBible(cfg)
        return {"content": [{"type": "text", "text": json.dumps([v.model_dump() for v in voices.all()], indent=1)}]}
    if name == "zuvyr_plan":
        cast, voices = CharacterBible(cfg), VoiceBible(cfg)
        from zuvyr_studio.application.planner import Planner

        plan, engine = Planner(cfg, cast, voices).plan(args["script"], "mcp-plan", style=args.get("style"))
        return {"content": [{"type": "text", "text": plan.model_dump_json(indent=1)}], "engine": engine}
    if name == "zuvyr_generate":
        Pipeline(cfg).generate(args["script"], video_id=args.get("video_id"), style=args.get("style"),
                               fmt=args.get("format", "long"), title=args.get("title"))
        d = read_json(cfg.jobs_dir / (args.get("video_id") or "") / "job.json") or {}
        return {"content": [{"type": "text", "text": json.dumps(d.get("outputs", {}))}]}
    if name == "zuvyr_job_status":
        d = read_json(cfg.jobs_dir / args["video_id"] / "job.json")
        return {"content": [{"type": "text", "text": json.dumps(d or {"error": "not found"})}]}
    if name == "zuvyr_list_jobs":
        jobs = [read_json(j) or {} for j in sorted(cfg.jobs_dir.glob("*/job.json"))]
        return {"content": [{"type": "text", "text": json.dumps([{k: j.get(k) for k in ("video_id", "status", "outputs")} for j in jobs], indent=1)}]}
    if name == "zuvyr_regenerate_scene":
        Pipeline(cfg).regenerate_scene(args["video_id"], args["scene_id"])
        return {"content": [{"type": "text", "text": "regenerated"}]}
    raise ValueError(f"unknown tool {name}")


def serve_mcp() -> None:
    allow_writes = os.environ.get("ALLOW_UNSAFE_MCP_TOOLS") == "1"
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception:
            continue
        method = req.get("method")
        id_ = req.get("id")
        if method == "initialize":
            _resp({"protocolVersion": "2024-11-05", "capabilities": {"tools": {}},
                   "serverInfo": {"name": "zuvyr-studio", "version": "1.0.0"}}, id_)
        elif method == "tools/list":
            tools = TOOLS if allow_writes else [t for t in TOOLS if t["name"] not in WRITE_TOOLS]
            _resp({"tools": tools}, id_)
        elif method == "tools/call":
            name = req["params"]["name"]
            if name in WRITE_TOOLS and not allow_writes:
                _err(-32000, "write tool blocked: set ALLOW_UNSAFE_MCP_TOOLS=1", id_)
                continue
            try:
                _resp(_handle(name, req["params"].get("arguments", {})), id_)
            except Exception as e:
                _err(-32000, str(e), id_)
        elif method == "notifications/initialized" or method == "ping":
            if id_ is not None:
                _resp({}, id_)
        elif id_ is not None:
            _err(-32601, f"unknown method {method}", id_)
