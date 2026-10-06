"""Réglages communs du moteur : date de référence et chemins de sortie.

La date de référence fixe « aujourd'hui » pour tout le moteur (fenêtres de besoin, signaux expirés, données
simulées, fraîcheur des sources). Elle est figée sur le jour de la démo pour que deux exports des mêmes
snapshots donnent exactement les mêmes fichiers.

    FLEXRADAR_TODAY=2026-10-10 python3 -m engine build   # autre date
    FLEXRADAR_TODAY=live       python3 -m engine build   # date et heure réelles (après un fetch frais)
"""
from __future__ import annotations

import os
from datetime import datetime

from sources.core.paths import REPO_ROOT, ROOT

DEMO_NOW = datetime(2026, 10, 4, 11, 0)  # HackVS, Foire du Valais


def _now() -> datetime:
    v = os.environ.get("FLEXRADAR_TODAY", "").strip()
    if v == "live":
        return datetime.now().replace(microsecond=0)
    if v:
        return datetime.fromisoformat(v).replace(hour=DEMO_NOW.hour) if len(v) == 10 else datetime.fromisoformat(v)
    return DEMO_NOW


NOW = _now()
TODAY = NOW.date()

WEB_PUBLIC = REPO_ROOT / "frontend" / "public"
WEB_DATA = WEB_PUBLIC / "data"  # JSON lus par le front
ENV_FILE = ROOT / ".env"
