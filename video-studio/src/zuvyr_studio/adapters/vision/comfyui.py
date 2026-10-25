"""ComfyUI adapter (image + motion engine) — full mode.

Talks to a headless ComfyUI API (default http://127.0.0.1:8188):
  POST /prompt {prompt: graph, client_id}  -> prompt_id
  GET  /history/{prompt_id}                -> outputs
  GET  /view?filename=...                  -> image bytes

Workflow builders included:
  * sdxl_ipadapter_workflow — SDXL base + anime/3D style LoRA + IP-Adapter
    FaceID (fixed identity from the character bible reference) + optional
    ControlNet (OpenPose/Canny/Depth via controlnet_aux preprocessors)
  * animatediff_workflow — AnimateDiff v3 (SDXL beta checkpoint) with chainable
    Motion LoRAs (pan/zoom/tilt/roll at ~0.75) for cinematic camera moves
    (only for key shots; stills + Ken Burns cover the rest of long videos)

Character consistency: every character's fixed prompt-token block + reference
image + fixed seed are injected into EVERY image request.
"""
from __future__ import annotations

import json
import urllib.request
import uuid
from pathlib import Path


class ComfyUIClient:
    def __init__(self, config):
        cfg = config.engines.get("vision", {}).get("comfyui", {})
        self.url = cfg.get("url", "http://127.0.0.1:8188").rstrip("/")
        self.timeout = cfg.get("timeout_s", 900)
        self.client_id = str(uuid.uuid4())

    def available(self) -> bool:
        try:
            with urllib.request.urlopen(self.url + "/system_stats", timeout=4):
                return True
        except Exception:
            return False

    def queue(self, workflow: dict) -> str:
        payload = json.dumps({"prompt": workflow, "client_id": self.client_id}).encode()
        req = urllib.request.Request(self.url + "/prompt", data=payload,
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())["prompt_id"]

    def wait(self, prompt_id: str, poll_s: float = 2.0) -> dict:
        import time

        while True:
            with urllib.request.urlopen(self.url + f"/history/{prompt_id}", timeout=30) as r:
                hist = json.loads(r.read())
            entry = hist.get(prompt_id)
            if entry is not None:
                status = entry.get("status", {})
                if status.get("completed") or entry.get("outputs"):
                    return entry
                if status.get("status_str") == "error":
                    raise RuntimeError(f"ComfyUI error: {json.dumps(status)[:800]}")
            time.sleep(poll_s)

    def fetch_output_images(self, entry: dict, out_dir: Path) -> list[Path]:
        out_dir.mkdir(parents=True, exist_ok=True)
        paths = []
        for node_out in entry.get("outputs", {}).values():
            for img in node_out.get("images", []):
                q = f"filename={img['filename']}&subfolder={img.get('subfolder','')}&type={img.get('type','output')}"
                with urllib.request.urlopen(self.url + f"/view?{q}", timeout=120) as r:
                    data = r.read()
                p = out_dir / img["filename"]
                p.write_bytes(data)
                paths.append(p)
        return paths

    def generate_image(self, workflow: dict, out_dir: Path) -> list[Path]:
        pid = self.queue(workflow)
        entry = self.wait(pid)
        return self.fetch_output_images(entry, out_dir)


# ------------------------------------------------------------------ workflows
def sdxl_ipadapter_workflow(*, positive: str, negative: str, width: int, height: int,
                            seed: int, steps: int = 28, cfg: float = 6.0,
                            style_lora: str | None = None, style_lora_strength: float = 0.85,
                            face_ref_image: str | None = None, ipadapter_weight: float = 0.85,
                            controlnet_image: str | None = None,
                            controlnet: str | None = None) -> dict:
    """SDXL + (optional) style LoRA + IP-Adapter FaceID + (optional) ControlNet.

    face_ref_image/controlnet_image: paths to upload via /upload/image first
    (see upload_image). Nodes: LoadImage -> IPAdapterFaceID / ControlNet apply.
    """
    g: dict[int, dict] = {}
    g[1] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sdxl_base_1.0.safetensors"}}
    g[2] = {"class_type": "CLIPTextEncode", "inputs": {"text": positive, "clip": ["1", 1]}}
    g[3] = {"class_type": "CLIPTextEncode", "inputs": {"text": negative or "lowres, bad anatomy, watermark, text, deformed", "clip": ["1", 1]}}
    g[4] = {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}}
    g[5] = {"class_type": "KSampler", "inputs": {"seed": seed, "steps": steps, "cfg": cfg,
                                                 "sampler_name": "dpmpp_2m", "scheduler": "karras",
                                                 "denoise": 1.0, "model": ["1", 0],
                                                 "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0]}}
    g[6] = {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}}
    g[7] = {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "zuvyr"}}

    model_src = ["1", 0]
    if style_lora:
        g[10] = {"class_type": "LoraLoader", "inputs": {"lora_name": style_lora, "strength_model": style_lora_strength,
                                                        "strength_clip": style_lora_strength, "model": ["1", 0], "clip": ["1", 1]}}
        model_src = ["10", 0]
        g[2]["inputs"]["clip"] = ["10", 1]
        g[3]["inputs"]["clip"] = ["10", 1]
    if face_ref_image:
        g[20] = {"class_type": "LoadImage", "inputs": {"image": face_ref_image}}
        g[21] = {"class_type": "IPAdapterFaceID", "inputs": {"model": model_src, "ipadapter": "FACEID_PLUSV2", "clip_vision": "CLIP-ViT-H",
                                                             "image": ["20", 0], "weight": ipadapter_weight,
                                                             "weight_faceidv2": 1.0, "weight_type": "linear", "start_at": 0.0, "end_at": 1.0}}
        g[5]["inputs"]["model"] = ["21", 0]
    if controlnet_image and controlnet:
        g[30] = {"class_type": "LoadImage", "inputs": {"image": controlnet_image}}
        g[31] = {"class_type": "ControlNetApplyAdvanced", "inputs": {"control_net": f"control_v11p_sd15_{controlnet}.pth" if "sd15" in controlnet else f"controlnet-{controlnet}-sdxl-1.0.safetensors",
                                                                     "strength": 0.8, "start_percent": 0.0, "end_percent": 0.8,
                                                                     "positive": ["2", 0], "negative": ["3", 0], "image": ["30", 0]}}
        g[5]["inputs"]["positive"] = ["31", 0]
        g[5]["inputs"]["negative"] = ["31", 1]
    return g


def animatediff_workflow(*, positive: str, negative: str, width: int, height: int, seed: int,
                         frames: int = 24, fps: int = 12, motion_loras: list[str] | None = None,
                         lora_strength: float = 0.75) -> dict:
    """AnimateDiff v3 (SDXL beta) + chainable Motion LoRAs for camera moves."""
    g: dict[int, dict] = {}
    g[1] = {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "mm_sdxl_v10_beta.ckpt"}}
    g[2] = {"class_type": "CLIPTextEncode", "inputs": {"text": positive, "clip": ["1", 1]}}
    g[3] = {"class_type": "CLIPTextEncode", "inputs": {"text": negative or "lowres, bad anatomy, flicker, watermark", "clip": ["1", 1]}}
    model_src = ["1", 0]
    for i, lora in enumerate(motion_loras or []):
        nid = 40 + i
        g[nid] = {"class_type": "LoraLoader", "inputs": {"lora_name": lora, "strength_model": lora_strength,
                                                         "strength_clip": 0.0, "model": model_src, "clip": ["1", 1]}}
        model_src = [str(nid), 0]
    g[4] = {"class_type": "ADE_AnimateDiffLoaderGen1", "inputs": {"model": model_src, "model_name": "mm_sdxl_v10_beta.ckpt",
                                                                  "beta_schedule": "sqrt_linear (AnimateDiff-SDXL)",
                                                                  "context_length": 16, "context_overlap": 4}}
    g[5] = {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": frames}}
    g[6] = {"class_type": "KSampler", "inputs": {"seed": seed, "steps": 24, "cfg": 6.5, "sampler_name": "dpmpp_2m",
                                                 "scheduler": "karras", "denoise": 1.0, "model": ["4", 0],
                                                 "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["5", 0]}}
    g[7] = {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}}
    g[8] = {"class_type": "VHS_VideoCombine", "inputs": {"images": ["7", 0], "frame_rate": fps, "loop_count": 0,
                                                          "filename_prefix": "zuvyr_ad", "format": "video/h264-mp4",
                                                          "pingpong": False, "save_output": True}}
    return g


def upload_image(client: ComfyUIClient, path: Path, name: str | None = None) -> str:
    """Upload a reference image (character face / controlnet input) to ComfyUI."""
    import urllib.parse

    boundary = "----zuvyr" + uuid.uuid4().hex[:8]
    name = name or path.name
    body = b""
    body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\n".encode()
    body += b"Content-Type: image/png\r\n\r\n" + path.read_bytes() + b"\r\n"
    body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(client.url + "/upload/image", data=body, method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())["name"]
