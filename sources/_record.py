"""Format commun à toutes les sources.

Chaque source renvoie une liste de dicts avec ces clés (None si inconnu) :

    source   str   nom de la source ("permis_construire", "simap", ...)
    id       str   identifiant unique dans la source
    kind     str   sous-type (ex. "Nouvelle inscription", "award", "Temporaire")
    date     str   date ISO de publication (YYYY-MM-DD)
    title    str   titre lisible
    text     str   texte complet en clair -> à donner tel quel à un LLM
    url      str   lien vers la publication d'origine (citer la source !)
    canton   str   "VS", ...
    commune  str   nom de commune
    bfs      int   numéro OFS de la commune (jointure avec la source "communes")
    company  str   entreprise principale concernée
    lat/lon  float coordonnées si connues
    extra    dict  champs structurés propres à la source
"""
from __future__ import annotations

import html
import re
from datetime import date, timedelta
from typing import Any, Optional


def record(source: str, id: Any, **fields) -> dict:
    rec = {
        "source": source,
        "id": str(id),
        "kind": None,
        "date": None,
        "title": None,
        "text": None,
        "url": None,
        "canton": None,
        "commune": None,
        "bfs": None,
        "company": None,
        "lat": None,
        "lon": None,
        "extra": {},
    }
    unknown = set(fields) - set(rec)
    if unknown:
        raise KeyError(f"champs inconnus : {unknown}")
    rec.update({k: v for k, v in fields.items() if v is not None})
    if rec["bfs"] is not None:
        rec["bfs"] = int(rec["bfs"])
    return rec


def strip_html(s: Optional[str]) -> str:
    if not s:
        return ""
    s = re.sub(r"<(br|/p|/li|/h\d)\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"<li[^>]*>", "- ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    return re.sub(r"\n\s*\n+", "\n", re.sub(r"[ \t]+", " ", s)).strip()


def since_date(days: int) -> str:
    return (date.today() - timedelta(days=days)).isoformat()


def i18n(d: Any, langs=("fr", "de", "it", "en")) -> Optional[str]:
    """Prend la première langue non vide d'un dict {fr,de,it,en}."""
    if not isinstance(d, dict):
        return d
    for lang in langs:
        if d.get(lang):
            return d[lang]
    return None
