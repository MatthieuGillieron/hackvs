"""Emplacements des données du backend (`backend/data/`).

    data/snapshots/<source>.json   snapshots versionnés (démo hors ligne)
    data/cache/                    cache HTTP brut (gitignoré)
    data/config/                   configuration éditable (sites_web.json)
    data/llm/                      cache des extractions LLM (écrit par engine/llm)
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # backend/
REPO_ROOT = ROOT.parent
DATA_ROOT = ROOT / "data"
DATA_DIR = DATA_ROOT / "snapshots"
CACHE_DIR = DATA_ROOT / "cache"
CONFIG_DIR = DATA_ROOT / "config"
LLM_DIR = DATA_ROOT / "llm"
