"""ZUVYR Studio — script-to-anime-video pipeline.

Hexagonal layout mirroring the Automated-Video-Generator base app:
  src/zuvyr_studio/lib          -> pure helpers (no domain knowledge)
  src/zuvyr_studio/application  -> domain orchestration (planner, pipeline, jobs)
  src/zuvyr_studio/adapters     -> engines (voice, vision, music, song, lipsync, render, llm)
"""

__version__ = "1.0.0"
PRODUCT = "ZUVYR Studio"
