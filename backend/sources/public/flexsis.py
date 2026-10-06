"""flexsis.ch : offres publiées par Flexsis (proxy de la demande qu'ils servent).

Pas d'API : scraping HTML de https://www.flexsis.ch/offres-emploi-<region>/page/<n>/
Régions : valais, vaud, geneve, fribourg, neuchatel, lausanne, canton-berne, bale,
mittelland, suisse-centrale, suisse-orientale, tessin, zurich-schaffhouse.
"""
from __future__ import annotations

import html
import json
import re
from typing import Optional

from ..core import http as _http
from ..core.record import record, strip_html

BASE = "https://www.flexsis.ch"

_JOB = re.compile(r'<li class="job[ "].*?</li>\s*(?=<li class="job[ "]|</ul>)', re.S)
_URL = re.compile(r'href="(https://www\.flexsis\.ch/emploi/(\d+)-[^"]+)"')
_TITLE = re.compile(r"<h3[^>]*>\s*(?:<strong>)?\s*(.*?)\s*(?:</strong>)?\s*</h3>", re.S)
_TIME = re.compile(r'<time[^>]*datetime="([^"]+)"')
_KEYWORDS = re.compile(r'<p class="[^"]*keywords[^"]*">\s*(.*?)\s*</p>', re.S)


def _clean(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>|\s+", " ", s)).strip()


def parse_page(page_html: str) -> list[dict]:
    jobs = []
    for block in _JOB.findall(page_html):
        m = _URL.search(block)
        if not m:
            continue
        kw = [_clean(k) for k in _KEYWORDS.findall(block)]
        t = _TITLE.search(block)
        tm = _TIME.search(block)
        # kw = [lieu, catégorie, type de contrat, référence] (ordre observé sur le site)
        jobs.append({
            "id": m.group(2),
            "url": m.group(1),
            "title": _clean(t.group(1)) if t else None,
            "datetime": tm.group(1) if tm else None,
            "location": kw[0] if kw else None,
            "category": kw[1] if len(kw) > 1 else None,
            "contract": kw[2] if len(kw) > 2 else None,
            "reference": kw[3] if len(kw) > 3 else None,
        })
    return jobs


_LDJSON = re.compile(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', re.S)


def job_posting(url: str) -> Optional[dict]:
    """Bloc schema.org JobPosting de la page de détail (localité, NPA, description complète)."""
    for raw in _LDJSON.findall(_http.get_text(url, ttl=None)):
        try:
            d = json.loads(raw, strict=False)
        except ValueError:
            continue
        if isinstance(d, dict) and d.get("@type") == "JobPosting":
            return d
    return None


def fetch(region: str = "valais", max_pages: int = 40, details: bool = True) -> list[dict]:
    seen: dict[str, dict] = {}
    for page in range(1, max_pages + 1):
        url = f"{BASE}/offres-emploi-{region}/" + (f"page/{page}/" if page > 1 else "")
        try:
            jobs = parse_page(_http.get_text(url))
        except Exception as e:
            if "404" in str(e):
                break
            raise
        new = [j for j in jobs if j["id"] not in seen]
        if not new:
            break
        seen.update((j["id"], j) for j in new)
    print(f"  flexsis: {len(seen)} offres ({region})" + (", téléchargement des fiches…" if details else ""))
    jobs = list(seen.values())
    postings = _http.pmap(lambda j: job_posting(j["url"]), jobs) if details else [None] * len(jobs)
    out = []
    for j, jp in zip(jobs, postings):
        contract = j["contract"] or ""
        addr = ((jp or {}).get("jobLocation") or {}).get("address") or {}
        desc = strip_html((jp or {}).get("description"))
        out.append(record(
            "flexsis", j["id"],
            kind=contract.split(" - ")[0] or None,
            date=(j["datetime"] or "")[:10] or None,
            title=j["title"],
            text="\n".join(x for x in (
                " | ".join(x for x in (j["title"], addr.get("addressLocality") or j["location"], j["category"], contract) if x),
                desc) if x),
            url=j["url"],
            canton="VS" if region == "valais" else None,
            commune=addr.get("addressLocality"),
            company="Flexsis",
            extra={
                "region": region,
                "area": j["location"],
                "postal_code": addr.get("postalCode"),
                "category": j["category"] or (jp or {}).get("industry") or None,
                "contract": contract,
                "employment_type": (jp or {}).get("employmentType"),
                "reference": j["reference"],
            },
        ))
    return out
