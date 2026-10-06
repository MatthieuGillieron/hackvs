"""SIMAP : marchés publics suisses (appels d'offres, adjudications, avis préalables).

API publique, sans clé. Spec OpenAPI : https://www.simap.ch/api/specifications/simap.yaml
- GET /publications/v2/project/project-search   (pagination "rolling" via lastItem)
- GET /publications/v1/project/{projectId}/publication-details/{publicationId}

Les adjudications ("award") donnent l'entreprise lauréate + le montant : signal fort
qu'une entreprise va avoir besoin de bras.
project_sub_types : construction, service, supply, project_competition, ...
pub_types (newestPubTypes) : tender, award_tender, advance_notice, direct_award, ...
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Optional

from ..core import http as _http
from ..core.record import i18n, record, since_date, strip_html

BASE = "https://www.simap.ch/api/publications"


def search(
    *,
    sub_types: Sequence[str] = ("construction",),
    cantons: Sequence[str] = ("VS",),
    since: Optional[str] = None,
    until: Optional[str] = None,
    text: Optional[str] = None,
    pub_types: Sequence[str] = (),
    cpv_codes: Sequence[str] = (),
    max_items: int = 2000,
) -> list[dict]:
    out: list[dict] = []
    last = None
    while len(out) < max_items:
        d = _http.get_json(f"{BASE}/v2/project/project-search", {
            "search": text,
            "projectSubTypes": list(sub_types),
            "orderAddressCantons": list(cantons),
            "newestPublicationFrom": since,
            "newestPublicationUntil": until,
            "newestPubTypes": list(pub_types),
            "cpvCodes": list(cpv_codes),
            "lastItem": last,
        })
        out += d.get("projects") or []
        nxt = (d.get("pagination") or {}).get("lastItem")
        if not d.get("projects") or not nxt or nxt == last:
            break
        last = nxt
    return out[:max_items]


def detail(project_id: str, publication_id: str) -> dict:
    return _http.get_json(f"{BASE}/v1/project/{project_id}/publication-details/{publication_id}", ttl=None)


def _find_all(obj: Any, key: str) -> list:
    """Toutes les valeurs d'une clé, à n'importe quelle profondeur (lots compris)."""
    found = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key:
                found.append(v)
            found += _find_all(v, key)
    elif isinstance(obj, list):
        for v in obj:
            found += _find_all(v, key)
    return found


def _normalize(p: dict, d: Optional[dict]) -> dict:
    d = d or {}
    proc = d.get("procurement") or {}
    addr = p.get("orderAddress") or {}
    winners = []
    for vendors in _find_all(d, "vendors"):
        for v in vendors or []:
            price = (v.get("price") or {}).get("price")
            winners.append({
                "name": v.get("vendorName"),
                "city": (v.get("vendorAddress") or {}).get("city"),
                "canton": (v.get("vendorAddress") or {}).get("cantonId"),
                "price_chf": price,
            })
    title = i18n(p.get("title"))
    buyer = i18n(p.get("procOfficeName"))
    description = strip_html(i18n(proc.get("orderDescription")))
    cpv = proc.get("cpvCode") or {}
    deadlines = {k: v for k, v in ((k, _find_all(d, k)) for k in ("offerDeadline", "awardDecisionDate")) if v}

    lines = [title or "", f"Adjudicateur : {buyer}", f"Lieu : {i18n(addr.get('city'))} ({addr.get('cantonId')})",
             f"Type : {p.get('pubType')} / {p.get('processType')}"]
    if cpv:
        lines.append(f"CPV : {cpv.get('code')} {i18n(cpv.get('label'))}")
    if description:
        lines.append(description)
    for w in winners:
        lines.append(f"Adjudicataire : {w['name']} ({w['city']}) — CHF {w['price_chf']}")

    return record(
        "simap", p["id"],
        kind=p.get("pubType"),
        date=p.get("publicationDate"),
        title=title,
        text="\n".join(lines),
        url=f"{BASE}/v1/project/{p['id']}/publication-details/{p.get('publicationId')}",
        canton=addr.get("cantonId"),
        commune=i18n(addr.get("city")),
        company=winners[0]["name"] if winners else None,
        extra={
            "project_number": p.get("projectNumber"),
            "publication_number": p.get("publicationNumber"),
            "project_type": p.get("projectType"),
            "sub_type": p.get("projectSubType"),
            "process_type": p.get("processType"),
            "buyer": buyer,
            "postal_code": addr.get("postalCode"),
            "construction_type": proc.get("constructionType"),
            "construction_category": proc.get("constructionCategory"),
            "cpv": cpv.get("code"),
            "bkp_codes": proc.get("bkpCodes") or [],
            "winners": winners,
            "number_of_submissions": next(iter(_find_all(d, "numberOfSubmissions")), None),
            "dates": deadlines,
        },
    )


def fetch(days: int = 365, canton: str = "VS", sub_types: Sequence[str] = ("construction",),
          max_items: int = 1000) -> list[dict]:
    projects = search(sub_types=sub_types, cantons=(canton,), since=since_date(days), max_items=max_items)
    print(f"  simap: {len(projects)} projets, téléchargement des détails…")
    details = _http.pmap(lambda p: detail(p["id"], p["publicationId"]), projects, workers=6)
    return [_normalize(p, d) for p, d in zip(projects, details)]
