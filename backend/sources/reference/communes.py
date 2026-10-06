"""Référentiel des communes (OFS) avec district et coordonnées : la table de jointure.

- Liste officielle : https://www.agvchapp.bfs.admin.ch/api/communes/snapshot?date=DD-MM-YYYY (CSV)
- Coordonnées : geo.admin.ch SearchServer (origine gg25 = communes), featureId = n° OFS

Utilisation : `communes.index()` -> {n° OFS: rec, "nom normalisé": rec} pour rattacher
n'importe quel signal (commune en texte libre ou n° OFS) à un district / un point sur la carte.
"""
from __future__ import annotations

import csv
import io
import re
import unicodedata
from datetime import date
from typing import Optional

from ..core import http as _http
from ..core.record import record

SNAPSHOT = "https://www.agvchapp.bfs.admin.ch/api/communes/snapshot"
GEO = "https://api3.geo.admin.ch/rest/services/api/SearchServer"


# Localités / anciennes communes fusionnées -> commune actuelle (Valais). À compléter au besoin.
ALIASES = {
    "verbier": "Val de Bagnes", "bagnes": "Val de Bagnes", "volleges": "Val de Bagnes", "le chable": "Val de Bagnes",
    "granges": "Sierre", "noes": "Sierre", "chippis": "Chippis", "euseigne": "Hérémence",
    "gamsen": "Brig-Glis", "glis": "Brig-Glis", "brig": "Brig-Glis", "loeche": "Leuk", "loeche les bains": "Leukerbad",
    "charrat": "Martigny", "mission": "Anniviers", "vissoie": "Anniviers", "grimentz": "Anniviers",
    "haute nendaz": "Nendaz", "montana": "Crans-Montana", "crans": "Crans-Montana", "uvrier": "Sion",
    "bramois": "Sion", "salins": "Sion", "les agettes": "Sion", "champlan": "Grimisuat",
    "chateauneuf": "Sion", "pont de la morge": "Sion", "ovronnaz": "Leytron", "torgon": "Vionnaz",
    "les marecottes": "Salvan", "le bouveret": "Port-Valais", "bouveret": "Port-Valais",
    "viege": "Visp", "brigue": "Brig-Glis", "sierre siders": "Sierre", "sion sitten": "Sion",
    "collombey": "Collombey-Muraz", "muraz": "Collombey-Muraz", "bruson": "Val de Bagnes", "ravoire": "Martigny-Combe",
    "erde": "Conthey", "steg": "Steg-Hohtenn", "chatelard": "Finhaut", "naters": "Naters",
}


def normalize(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    s = re.sub(r"^st (?=\w)", "saint ", re.sub(r"^ste (?=\w)", "sainte ", s))
    return s


def _geocode(c: dict) -> Optional[tuple[float, float]]:
    d = _http.get_json(GEO, {"searchText": c["ShortName"] or c["Name"], "type": "locations",
                             "origins": "gg25", "sr": 4326}, ttl=None)
    for r in d.get("results", []):
        a = r["attrs"]
        if str(a.get("featureId")) == c["BfsCode"]:
            return a["lat"], a["lon"]
    return None


def fetch(canton: str = "VS") -> list[dict]:
    text = _http.get_text(SNAPSHOT, {"date": date.today().strftime("%d-%m-%Y")}, ttl=30 * 86400)
    rows = list(csv.DictReader(io.StringIO(text)))
    cantons = {r["HistoricalCode"] for r in rows if r["Level"] == "1" and r["ShortName"] == canton}
    districts = {r["HistoricalCode"]: r["Name"] for r in rows if r["Level"] == "2" and r["Parent"] in cantons}
    communes = [r for r in rows if r["Level"] == "3" and r["Parent"] in districts]
    print(f"  communes: {len(communes)} communes {canton}, géocodage…")
    coords = _http.pmap(_geocode, communes)
    out = []
    for c, xy in zip(communes, coords):
        out.append(record(
            "communes", c["BfsCode"],
            kind="commune",
            title=c["Name"],
            text=f"{c['Name']} ({canton}), {districts[c['Parent']]}",
            url=f"https://www.agvchapp.bfs.admin.ch/fr/communes/results?BfsNr={c['BfsCode']}",
            canton=canton,
            commune=c["Name"],
            bfs=int(c["BfsCode"]),
            lat=xy[0] if xy else None,
            lon=xy[1] if xy else None,
            extra={"district": districts[c["Parent"]]},
        ))
    return out


def index(records: Optional[list[dict]] = None) -> dict:
    """{bfs:int -> rec, nom normalisé:str -> rec}. Charge data/snapshots/communes.json par défaut."""
    if records is None:
        from .. import load
        records = load("communes")
    idx: dict = {}
    for r in records:
        idx[r["bfs"]] = r
        idx[normalize(r["commune"])] = r
    return idx


def lookup(name_or_bfs, idx: Optional[dict] = None) -> Optional[dict]:
    idx = idx if idx is not None else index()
    if isinstance(name_or_bfs, int) or (isinstance(name_or_bfs, str) and name_or_bfs.isdigit()):
        return idx.get(int(name_or_bfs))
    name = name_or_bfs or ""
    # "Les Condémines (Nendaz)" -> essaie aussi "Nendaz" ; "Brig-Glis & Naters" -> "Brig-Glis"
    candidates = [name, *re.findall(r"\((.*?)\)", name), *re.split(r"\s*(?:&|/|,| et | und )\s*", name)]
    for c in candidates:
        n = normalize(c)
        hit = idx.get(n) or (idx.get(normalize(ALIASES[n])) if n in ALIASES else None)
        if hit:
            return hit
    return None
