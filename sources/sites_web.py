"""Sites web : pages "actualités", "projets/réalisations", "carrière/emplois", "avis/enquêtes".

Crawler léger (1 niveau) : depuis la page d'accueil, suit les liens internes dont l'URL ou le
texte évoque une catégorie utile, puis extrait le texte de chaque page.
Les sites sont listés dans `sites_web.json` (à côté de ce fichier) :
    {"communes": [{"name": "Sion", "url": "https://www.sion.ch/", "bfs": 6266}, ...],
     "entreprises": [{"name": "Exemple SA", "url": "https://www.exemple.ch/"}, ...]}
-> ajouter les sites des entreprises clientes (liste fournie par Flexsis) dans "entreprises".
Respecter les robots.txt / CGU des sites ; pas de crawl massif.
"""
from __future__ import annotations

import html
import json
import re
import urllib.parse
from pathlib import Path
from typing import Optional

from . import _http
from ._record import record

CONFIG = Path(__file__).parent / "sites_web.json"
CATEGORIES = {
    "actualites": r"actualit|news|nouvelles|aktuell|communiqu|medien|presse",
    "projets": r"projet|r[ée]alisation|chantier|r[ée]f[ée]rence|projekt|baustelle|portfolio",
    "carriere": r"carri[eè]re|emploi|jobs?\b|offres?-d|stellen|karriere|recrut|postuler",
    "avis": r"enqu[eê]te|mise-a-l|mise à l|avis|pilier|publication|baugesuch|travaux|amtlich|bauprojekt",
}
_A = re.compile(r'<a\b[^>]*href="([^"#]+)"[^>]*>(.*?)</a>', re.S | re.I)


def page_text(page: str, limit: int = 5000) -> tuple[Optional[str], str]:
    title = re.search(r"<title[^>]*>(.*?)</title>", page, re.S | re.I)
    body = re.sub(r"<(script|style|noscript|svg|nav|footer|header)\b.*?</\1>", " ", page, flags=re.S | re.I)
    body = re.sub(r"<(br|/p|/div|/li|/h\d)[^>]*>", "\n", body, flags=re.I)
    body = html.unescape(re.sub(r"<[^>]+>", " ", body))
    body = "\n".join(l.strip() for l in re.sub(r"[ \t]+", " ", body).splitlines() if len(l.strip()) > 2)
    return (html.unescape(title.group(1)).strip() if title else None), body[:limit]


def links(base: str, page: str) -> dict[str, list[str]]:
    host = urllib.parse.urlparse(base).netloc.replace("www.", "")
    found: dict[str, list[str]] = {c: [] for c in CATEGORIES}
    for href, label in _A.findall(page):
        url = urllib.parse.urljoin(base, html.unescape(href))
        if urllib.parse.urlparse(url).netloc.replace("www.", "") != host or re.search(r"\.(pdf|jpe?g|png|zip|docx?)$", url, re.I):
            continue
        hay = url.lower() + " " + re.sub(r"<[^>]+>", " ", label).lower()
        for cat, pat in CATEGORIES.items():
            if re.search(pat, hay) and url not in found[cat]:
                found[cat].append(url)
                break
    return found


def crawl(site: dict, kind: str, per_category: int = 3) -> list[dict]:
    home = _http.get_text(site["url"], ttl=86400)
    targets = [(cat, u) for cat, urls in links(site["url"], home).items() for u in urls[:per_category]]
    pages = _http.pmap(lambda t: _http.get_text(t[1], ttl=86400), targets, workers=3)
    out = []
    for (cat, url), page in zip(targets, pages):
        if not page:
            continue
        title, text = page_text(page)
        out.append(record(
            "sites_web", url,
            kind=cat,
            title=title,
            text=f"[{site['name']} — {cat}] {title}\n{text}",
            url=url,
            canton=site.get("canton", "VS"),
            commune=site.get("commune") or (site["name"] if kind == "communes" else None),
            bfs=site.get("bfs"),
            company=site["name"] if kind == "entreprises" else None,
            extra={"site": site["url"], "site_type": kind, "category": cat},
        ))
    return out


def fetch(per_category: int = 3, config: Optional[str] = None) -> list[dict]:
    cfg = json.loads(Path(config or CONFIG).read_text("utf-8"))
    out = []
    for kind in ("communes", "entreprises"):
        for site in cfg.get(kind, []):
            try:
                recs = crawl(site, kind, per_category)
                print(f"  sites_web: {site['name']} → {len(recs)} pages")
                out += recs
            except Exception as e:
                print(f"  ! sites_web {site['name']}: {e}")
    return out
