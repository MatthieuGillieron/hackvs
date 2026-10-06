"""jobup.ch : offres d'emploi (Suisse romande), API JSON publique du site.

GET https://www.jobup.ch/api/v1/public/search?location=Valais&query=maçon&rows=20&page=N
(20 résultats max par page). Recoupe en partie job-room, mais donne le vrai nom
d'employeur et le segment d'entreprise (kmu = PME, pdl = agence de placement).
"""
from __future__ import annotations

from typing import Optional

from ..core import http as _http
from ..core.record import record

URL = "https://www.jobup.ch/api/v1/public/search"
SEGMENTS = {"kmu": "PME", "pdl": "agence de placement", "gu": "grande entreprise"}
EMPLOYMENT_TYPES = {"1": "temporaire", "5": "fixe", "2": "durée déterminée", "3": "stage", "4": "apprentissage"}
LOCATIONS = {"VS": "Valais", "VD": "Vaud", "GE": "Genève", "FR": "Fribourg", "NE": "Neuchâtel", "JU": "Jura"}


def search(location: str = "Valais", query: Optional[str] = None, max_pages: int = 60) -> list[dict]:
    out: list[dict] = []
    for page in range(1, max_pages + 1):
        d = _http.get_json(URL, {"location": location, "query": query, "rows": 20, "page": page})
        docs = d.get("documents") or []
        out += docs
        if not docs or page >= (d.get("num_pages") or 0):
            break
    return out


def _normalize(doc: dict, canton: str) -> dict:
    links = doc.get("_links") or {}
    url = ((links.get("detail_fr") or links.get("detail_de") or {}).get("href")
           or f"https://www.jobup.ch/fr/emplois/detail/{doc['job_id']}/")
    coords = doc.get("coordinates") or {}
    types = [EMPLOYMENT_TYPES.get(str(t), str(t)) for t in doc.get("employment_type_ids") or []]
    seg = doc.get("company_segmentation")
    return record(
        "jobup", doc["job_id"],
        kind=types[0] if types else None,
        date=(doc.get("publication_date") or "")[:10] or None,
        title=doc.get("title"),
        text=f"{doc.get('title')}\n{doc.get('company_name')} — {doc.get('place')}\n{doc.get('preview') or ''}".strip(),
        url=url,
        canton=canton,
        commune=doc.get("place"),
        company=doc.get("company_name"),
        lat=coords.get("lat"),
        lon=coords.get("lon"),
        extra={
            "company_id": doc.get("company_id"),
            "company_logo": doc.get("company_logo_file"),  # logo publié par l'entreprise sur jobup
            "company_segment": SEGMENTS.get(seg, seg),
            "is_staffing_agency": seg == "pdl",
            "employment_types": types,
            "workload": doc.get("employment_grades"),
            "initial_publication_date": (doc.get("initial_publication_date") or "")[:10] or None,
            "category_ids": [c.get("path") for c in doc.get("categories") or []],
        },
    )


def fetch(canton: str = "VS", query: Optional[str] = None) -> list[dict]:
    docs = search(LOCATIONS.get(canton, canton), query)
    print(f"  jobup: {len(docs)} annonces")
    return [_normalize(d, canton) for d in docs]
