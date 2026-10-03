"""Vignettes des alertes : vue aérienne SWISSIMAGE réelle du lieu (web/public/img/alertes/)
et logo réel de l'entreprise quand elle en publie un sur jobup (web/public/img/logos/).

Appelé par `python3 -m prototype.export`. Une image déjà présente n'est pas retéléchargée (démo hors ligne).

Lieu retenu pour une fiche, du plus précis au plus vague :
  parcelle  coordonnées LV95 citées dans la mise à l'enquête (« Coordonnées: 2'579'324 1'104'027 »)
  commune   centroïde de la commune du signal (SIMAP, annonce, permis sans coordonnées)
  district  vignette du chef-lieu déjà produite par `python3 -m prototype.geo` (fiches de zone)
Aucune image n'est inventée : sans lieu connu, la fiche n'a pas d'image.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Optional

from sources import _http, load
from sources.communes import lookup

from .geo import ROOT, _wms, wgs84_to_lv95
from .signals import norm_company

DIR = ROOT / "img" / "alertes"
LOGOS = ROOT / "img" / "logos"
MAGIC = {b"\x89PNG": "png", b"\xff\xd8": "jpg", b"GIF8": "gif", b"RIFF": "webp", b"<svg": "svg", b"<?xm": "svg"}
COORD_RE = re.compile(r"Coordonn[ée]es\s*:\s*(\d[\d'’]{6,})\s+(\d[\d'’]{6,})")
HALF = {"parcelle": (300, 225), "commune": (900, 675)}  # demi-emprise (m) : 600 × 450 m autour d'une parcelle
CREDIT = "© swisstopo"


def _num(s: str) -> float:
    return float(re.sub(r"[^\d]", "", s))


def _permit_coords() -> dict[str, tuple[float, float]]:
    out = {}
    for r in load("permis_construire"):
        m = COORD_RE.search(r["text"] or "")
        if m:
            e, n = _num(m.group(1)), _num(m.group(2))
            if 2_480_000 < e < 2_840_000 and 1_070_000 < n < 1_300_000:
                out[r["id"]] = (e, n)
    return out


def _districts() -> dict[str, dict]:
    geo = ROOT / "data" / "geo.json"
    if not geo.exists():
        return {}
    return {d["district"]: d for d in json.loads(geo.read_text("utf-8"))["districts"]}


def _locate(o, permits: dict, districts: dict) -> Optional[dict]:
    """(précision, nom du lieu, E, N) du lieu le plus précis de la fiche, ou vignette de district."""
    sigs = sorted((s for s in o.signals if not s.fictif), key=lambda s: -s.weight)
    if o.company:
        for s in sigs:
            pid = s.meta.get("permis_id")
            if pid in permits:
                return {"precision": "parcelle", "place": s.meta.get("commune"), "en": permits[pid]}
        for s in sigs:
            c = lookup(s.meta.get("commune") or "")
            if c and c.get("lat"):
                return {"precision": "commune", "place": c["commune"], "en": wgs84_to_lv95(c["lat"], c["lon"])}
    d = districts.get(o.district or "")
    if d:
        return {"precision": "district", "place": d["town"]["name"], "src": d["image"]}
    return None


def build(opps) -> list[Optional[dict]]:
    """Pour chaque fiche : {src, place, precision, credit} ou None. Télécharge les vignettes manquantes."""
    permits, districts = _permit_coords(), _districts()
    out, fetched = [], 0
    for o in opps:
        loc = _locate(o, permits, districts)
        if not loc:
            out.append(None)
            continue
        if "en" in loc:
            e, n = (round(x) for x in loc["en"])
            name = f"{e}_{n}_{loc['precision'][0]}.jpg"
            dest = DIR / name
            if not dest.exists():
                hx, hy = HALF[loc["precision"]]
                try:
                    _wms("ch.swisstopo.swissimage", (e - hx, n - hy, e + hx, n + hy), 320, 240, dest)
                    fetched += 1
                except Exception as exc:  # hors ligne ou WMS indisponible : pas d'image plutôt qu'une fausse
                    print(f"  ! vignette {name} : {exc}")
                    out.append(None)
                    continue
            loc["src"] = f"/img/alertes/{name}"
        out.append({"src": loc["src"], "place": loc["place"], "precision": loc["precision"], "credit": CREDIT})
    print(f"  ✓ vignettes ({sum(1 for x in out if x)} fiches, {fetched} téléchargées)")
    return out


def _logo_urls() -> dict[str, str]:
    """Nom normalisé -> URL du logo publié par l'entreprise avec ses annonces jobup."""
    out = {}
    for r in load("jobup"):
        url = r["extra"].get("company_logo")
        if url and r["company"]:
            out.setdefault(norm_company(r["company"]), url)
    return out


def logos(opps) -> list[Optional[dict]]:
    """Pour chaque fiche entreprise : {src, credit} du logo réel, ou None. Téléchargé une fois (démo hors ligne)."""
    urls = _logo_urls()
    out, fetched = [], 0
    for o in opps:
        url = urls.get(norm_company(o.company)) if o.company else None
        if not url:
            out.append(None)
            continue
        key = hashlib.sha1(url.encode()).hexdigest()[:16]
        found = next(LOGOS.glob(f"{key}.*"), None) if LOGOS.exists() else None
        if not found:
            try:
                data = _http.download(url).read_bytes()
            except Exception as exc:
                print(f"  ! logo {o.company} : {exc}")
                out.append(None)
                continue
            ext = next((e for m, e in MAGIC.items() if data.startswith(m)), None)
            if not ext:
                out.append(None)
                continue
            LOGOS.mkdir(parents=True, exist_ok=True)
            found = LOGOS / f"{key}.{ext}"
            found.write_bytes(data)
            fetched += 1
        out.append({"src": f"/img/logos/{found.name}", "credit": "Logo publié sur jobup.ch"})
    print(f"  ✓ logos ({sum(1 for x in out if x)} entreprises, {fetched} téléchargés)")
    return out
