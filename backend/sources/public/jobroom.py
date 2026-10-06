"""job-room.ch (SECO / ORP) : offres d'emploi agrégées (jobs.ch, jobup, ORP, agences...).

API JSON interne (non documentée, repérée via DevTools) :
  POST https://www.job-room.ch/jobadservice/api/jobAdvertisements/_search?page=0&size=100
Body : {"cantonCodes": ["VS"], "keywords": ["maçon"], "onlineSince": 30, ...}
Total dans l'en-tête X-Total-Count.
`communalCode` = n° OFS de la commune, `avamOccupationCode` = code métier AVAM.
"""
from __future__ import annotations

import json
import re
from collections.abc import Sequence

from ..core import http as _http
from ..core.record import record, strip_html

URL = "https://www.job-room.ch/jobadservice/api/jobAdvertisements/_search"
PAGE_SIZE = 100

# Heuristique : annonces publiées par des agences de placement (concurrents de Flexsis).
AGENCY_RE = re.compile(
    r"personal|personnel|int[ée]rim|interiman|flexsis|adecco|manpower|randstad|kelly|\btemp|"
    r"recrut|staffing|placement|work ?power|\bteam\b|leteam|agence|ressources humaines|\bRH\b|"
    r"careers?|talent|jobs? ?(service|partner|center)|\bjob ?link|universal[- ]job|valjob|pro ?job|emploi|yv-jobs|proman",
    re.I,
)
# Annonceurs qui sont des job boards (l'employeur réel est masqué).
JOBBOARD_RE = re.compile(r"^(jobup|jobs\.ch|jobscout24|indeed|monster)\b", re.I)


def search(*, cantons: Sequence[str] = ("VS",), keywords: Sequence[str] = (), days: int = 30,
           profession_codes: Sequence[str] = (), communal_codes: Sequence[str] = (),
           max_items: int = 3000) -> list[dict]:
    body = {
        "workloadPercentageMin": 0,
        "workloadPercentageMax": 100,
        "permanent": None,
        "companyName": None,
        "onlineSince": days,
        "displayRestricted": False,
        "keywords": list(keywords),
        "professionCodes": [{"type": "AVAM", "value": c} for c in profession_codes],
        "communalCodes": list(communal_codes),
        "cantonCodes": list(cantons),
    }
    out: list[dict] = []
    page = 0
    while len(out) < max_items:
        text, headers = _http.request(URL, {"page": page, "size": PAGE_SIZE, "sort": "date_desc"},
                                      method="POST", json_body=body)
        items = json.loads(text)
        out += [i["jobAdvertisement"] for i in items]
        total = int(headers.get("x-total-count") or 0)
        if not items or len(out) >= total:
            break
        page += 1
    return out[:max_items]


def _normalize(ad: dict) -> dict:
    c = ad.get("jobContent") or {}
    desc = next(iter(c.get("jobDescriptions") or []), {})
    company = c.get("company") or {}
    loc = c.get("location") or {}
    emp = c.get("employment") or {}
    coords = loc.get("coordinates") or {}
    title = strip_html(desc.get("title"))
    pub = ad.get("publication") or {}
    name = company.get("name")
    return record(
        "jobroom", ad["id"],
        kind="permanent" if emp.get("permanent") else "temporaire" if emp.get("permanent") is False else None,
        date=pub.get("startDate") or (ad.get("createdTime") or "")[:10] or None,
        title=title,
        text=f"{title}\n{name} — {loc.get('city')}\n{strip_html(desc.get('description'))}",
        url=c.get("externalUrl") or f"https://www.job-room.ch/job-search/{ad['id']}",
        canton=loc.get("cantonCode"),
        commune=loc.get("city"),
        bfs=loc.get("communalCode") or None,
        company=name,
        lat=float(coords["lat"]) if coords.get("lat") else None,
        lon=float(coords["lon"]) if coords.get("lon") else None,
        extra={
            "postal_code": loc.get("postalCode"),
            "region_code": loc.get("regionCode"),
            "avam_codes": [o.get("avamOccupationCode") for o in c.get("occupations") or []],
            "number_of_jobs": c.get("numberOfJobs"),
            "workload": [emp.get("workloadPercentageMin"), emp.get("workloadPercentageMax")],
            "start_date": emp.get("startDate"),
            "end_date": emp.get("endDate"),
            "immediately": emp.get("immediately"),
            "short_employment": emp.get("shortEmployment"),
            "is_staffing_agency": bool(name and AGENCY_RE.search(name)),
            "is_job_board": bool(name and JOBBOARD_RE.search(name)),
            "source_system": ad.get("sourceSystem"),
            "reporting_obligation": ad.get("reportingObligation"),
            "jobroom_url": f"https://www.job-room.ch/job-search/{ad['id']}",
        },
    )


def fetch(days: int = 30, canton: str = "VS", keywords: Sequence[str] = (), max_items: int = 3000) -> list[dict]:
    ads = search(cantons=(canton,), keywords=keywords, days=days, max_items=max_items)
    print(f"  jobroom: {len(ads)} annonces")
    return [_normalize(a) for a in ads]
