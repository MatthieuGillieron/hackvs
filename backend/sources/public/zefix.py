"""Zefix : registre du commerce central (fiche officielle d'une entreprise).

API REST interne du site zefix.ch (publique, sans clé) :
  POST /ZefixREST/api/v1/firm/search.json   {"name": "...", "registryOffices": [621], ...}
  GET  /ZefixREST/api/v1/firm/{ehraid}.json  but, adresse, statut, succursales, publications FOSC
L'API "officielle" (ZefixPublicREST) exige un compte : inutile ici.
Offices du registre du Valais : 600 (Haut-Valais), 621 (Valais central), 626 (Bas-Valais).

`fetch()` enrichit les entreprises déjà vues dans les autres snapshots
(lauréats SIMAP, requérants des permis, employeurs job-room).
"""
from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable
from typing import Optional

from ..core import http as _http
from ..core.record import record, strip_html

BASE = "https://www.zefix.ch/ZefixREST/api/v1"
OFFICES = {"VS": [600, 621, 626]}
LEGAL_RE = re.compile(r"\b(SA|S\.A\.|Sàrl|Sarl|S\.à r\.l\.|AG|GmbH|Cie|Holding|Coopérative|Genossenschaft)\b", re.I)


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()


def search(name: str, canton: Optional[str] = None, max_entries: int = 30) -> list[dict]:
    body = {"name": name, "searchType": "exact", "maxEntries": max_entries, "languageKey": "fr",
            "deletedFirms": False}
    if canton:
        body["registryOffices"] = OFFICES[canton]
    try:
        return _http.get_json(f"{BASE}/firm/search.json", method="POST", json_body=body, ttl=7 * 86400).get("list") or []
    except Exception as e:
        if "400" in str(e) or "404" in str(e):
            return []
        raise


def firm(ehraid: int) -> dict:
    return _http.get_json(f"{BASE}/firm/{ehraid}.json", ttl=7 * 86400)


def best_match(name: str, canton: str = "VS") -> Optional[dict]:
    """Nom normalisé identique (sinon None : pas de rapprochement hasardeux),
    inscrit dans le canton de préférence, sinon ailleurs (siège hors canton / succursale)."""
    target = _norm(name)
    same = [h for h in search(name) if _norm(h["name"]) == target]
    local = [h for h in same if h.get("registerOfficeId") in OFFICES.get(canton, [])]
    return (local or same or [None])[0]


def _normalize(name_seen: str, f: dict) -> dict:
    addr = f.get("address") or {}
    pubs = f.get("shabPub") or []
    last_pubs = sorted(pubs, key=lambda p: p.get("shabDate") or "", reverse=True)[:5]
    purpose = strip_html(f.get("purpose"))
    return record(
        "zefix", f.get("uidFormatted") or f["ehraid"],
        kind=f.get("status"),
        date=(last_pubs[0].get("shabDate") if last_pubs else None),
        title=f.get("name"),
        text="\n".join(x for x in (
            f"{f.get('name')} — {f.get('legalSeat')} ({f.get('uidFormatted')})",
            f"But : {purpose}" if purpose else "",
            *(f"FOSC {p.get('shabDate')} : {strip_html(p.get('message'))[:600]}" for p in last_pubs),
        ) if x),
        url=f.get("cantonalExcerptWeb") or f"https://www.zefix.ch/fr/search/entity/list/firm/{f['ehraid']}",
        commune=f.get("legalSeat"),
        bfs=f.get("legalSeatId"),
        company=f.get("name"),
        extra={
            "name_seen": name_seen,
            "uid": f.get("uidFormatted"),
            "ehraid": f.get("ehraid"),
            "legal_form_id": f.get("legalFormId"),
            "register_office": f.get("registerOfficeId"),
            "purpose": purpose,
            "address": " ".join(str(addr.get(k) or "") for k in ("street", "houseNumber", "swissZipCode", "town")).strip(),
            "branch_offices": [b.get("name") + " (" + str(b.get("legalSeat")) + ")" for b in f.get("branchOffices") or []],
            "main_offices": [b.get("name") for b in f.get("mainOffices") or []],
            "shab_publications": len(pubs),
            "last_shab_dates": [p.get("shabDate") for p in last_pubs],
        },
    )


def companies_from_snapshots(limit: int = 400) -> list[str]:
    """Noms d'entreprises (personnes morales) vus dans simap, permis_construire et jobroom."""
    from .. import load, path

    seen: Counter = Counter()
    if path("simap").exists():
        for r in load("simap"):
            for w in r["extra"].get("winners") or []:
                if w.get("name"):
                    seen[w["name"]] += 5
    if path("permis_construire").exists():
        for r in load("permis_construire"):
            for n in r["extra"].get("applicants") or []:
                seen[n] += 2
    if path("jobroom").exists():
        for r in load("jobroom"):
            if r["company"] and not r["extra"].get("is_staffing_agency") and not r["extra"].get("is_job_board"):
                seen[r["company"]] += 1
    return [n for n, _ in seen.most_common() if LEGAL_RE.search(n)][:limit]


def fetch(names: Optional[Iterable[str]] = None, canton: str = "VS", limit: int = 400) -> list[dict]:
    names = list(names) if names is not None else companies_from_snapshots(limit)
    print(f"  zefix: {len(names)} entreprises à rechercher…")

    def one(name):
        m = best_match(name, canton)
        return (name, firm(m["ehraid"])) if m else None

    out, seen = [], set()
    for res in _http.pmap(one, names, workers=4):
        if res and res[1].get("ehraid") not in seen:
            seen.add(res[1].get("ehraid"))
            out.append(_normalize(*res))
    return out
