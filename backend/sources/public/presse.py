"""Presse locale valaisanne + communiqués de l'État du Valais.

- Le Nouvelliste : news-sitemap (titre, date, mots-clés ; articles souvent payants)
    https://www.lenouvelliste.ch/news-sitemap.xml
- Canal9 : flux RSS https://canal9.ch/feed/
- Rhône FM : rubrique https://www.rhonefm.ch/valais/ + balises og: de chaque article
- État du Valais (communiqués) : https://www.vs.ch/web/communication + og: de chaque communiqué
Le texte est un titre + chapeau : suffisant pour détecter un projet, un chantier, une
fermeture/ouverture d'entreprise. Pour l'article complet, ouvrir `url`.
"""
from __future__ import annotations

import html
import re
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from typing import Optional

from ..core import http as _http
from ..core.record import record, strip_html

NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9", "news": "http://www.google.com/schemas/sitemap-news/0.9"}


def og(url: str) -> dict:
    """Balises <meta property="og:*"> + description + date de publication éventuelle."""
    page = _http.get_text(url, ttl=None)
    meta = {}
    for m in re.finditer(r"<meta\b[^>]*>", page):
        tag = m.group(0)
        key = re.search(r'(?:property|name)="([^"]+)"', tag)
        val = re.search(r'content="([^"]*)"', tag)
        if key and val:
            meta.setdefault(key.group(1), html.unescape(val.group(1)))
    t = re.search(r'<time[^>]*datetime="([^"]+)"', page) or re.search(r'"datePublished"\s*:\s*"([^"]+)"', page)
    meta["_published"] = t.group(1) if t else meta.get("article:published_time")
    return meta


def _clean_desc(s: Optional[str]) -> str:
    return re.sub(r"\s*\|\s*Rhône FM.*$", "", s or "").strip()


def nouvelliste(valais_only: bool = True) -> list[dict]:
    root = ET.fromstring(_http.get_text("https://www.lenouvelliste.ch/news-sitemap.xml", ttl=3600).encode())
    out = []
    for u in root.findall("sm:url", NS):
        loc = u.findtext("sm:loc", namespaces=NS)
        if valais_only and "/valais/" not in loc:
            continue
        n = u.find("news:news", NS)
        title = n.findtext("news:title", namespaces=NS)
        kw = n.findtext("news:keywords", namespaces=NS) or ""
        pub = n.findtext("news:publication_date", namespaces=NS) or ""
        parts = loc.split("/valais/")[-1].split("/")
        out.append(record(
            "presse", loc.rsplit("-", 1)[-1],
            kind="Le Nouvelliste",
            date=pub[:10] or None,
            title=title,
            text=f"{title}\nMots-clés : {kw}",
            url=loc,
            canton="VS",
            extra={"media": "Le Nouvelliste", "keywords": [k.strip() for k in kw.split(",") if k.strip()],
                   "section": parts[0] if len(parts) > 1 else None},
        ))
    return out


def canal9() -> list[dict]:
    root = ET.fromstring(_http.get_text("https://canal9.ch/feed/", ttl=3600).encode())
    out = []
    for it in root.iter("item"):
        link = it.findtext("link")
        try:
            d = parsedate_to_datetime(it.findtext("pubDate")).date().isoformat()
        except Exception:
            d = None
        title = html.unescape(it.findtext("title") or "")
        desc = strip_html(it.findtext("description"))
        out.append(record(
            "presse", link,
            kind="Canal9",
            date=d,
            title=title,
            text=f"{title}\n{desc}",
            url=link,
            canton="VS",
            extra={"media": "Canal9", "categories": [c.text for c in it.findall("category") if c.text]},
        ))
    return out


def rhonefm(max_articles: int = 40) -> list[dict]:
    page = _http.get_text("https://www.rhonefm.ch/valais/", ttl=3600)
    links = list(dict.fromkeys(re.findall(r'href="(/valais/[a-z0-9-]+-\d{6,})"', page)))[:max_articles]
    metas = _http.pmap(lambda p: og("https://www.rhonefm.ch" + p), links, workers=4)
    out = []
    for path, m in zip(links, metas):
        if not m:
            continue
        title = m.get("og:title")
        desc = _clean_desc(m.get("og:description"))
        out.append(record(
            "presse", path.rsplit("-", 1)[-1],
            kind="Rhône FM",
            date=(m.get("_published") or "")[:10] or None,
            title=title,
            text=f"{title}\n{desc}",
            url="https://www.rhonefm.ch" + path,
            canton="VS",
            extra={"media": "Rhône FM"},
        ))
    return out


def fetch_presse() -> list[dict]:
    out = []
    for name, fn in (("nouvelliste", nouvelliste), ("canal9", canal9), ("rhonefm", rhonefm)):
        try:
            recs = fn()
            print(f"  presse/{name}: {len(recs)} articles")
            out += recs
        except Exception as e:  # un média en panne ne bloque pas les autres
            print(f"  ! presse/{name}: {e}")
    return out


def fetch_communiques_vs(max_items: int = 60) -> list[dict]:
    page = _http.get_text("https://www.vs.ch/fr/web/communication", ttl=3600)
    # Chaque carte : ... Communiqué | 01.10.2026 | Archéologie | Titre ... href=".../com-et-media/10108/<id>"
    links = list(dict.fromkeys(re.findall(r'href="(https://www\.vs\.ch/fr/web/communication/e/com-et-media/\d+/\d+)"', page)))
    links = links[:max_items]
    metas = _http.pmap(og, links, workers=4)
    out = []
    for url, m in zip(links, metas):
        if not m:
            continue
        i = page.find(url)
        card = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " | ", page[max(0, i - 1500):i]))
        dm = re.findall(r"(\d{2})\.(\d{2})\.(\d{4})", card)
        d = f"{dm[-1][2]}-{dm[-1][1]}-{dm[-1][0]}" if dm else (m.get("_published") or "")[:10] or None
        title = m.get("og:title")
        out.append(record(
            "communiques_vs", url.rsplit("/", 1)[-1],
            kind="communiqué",
            date=d,
            title=title,
            text=f"{title}\n{m.get('og:description') or ''}",
            url=url,
            canton="VS",
            extra={"emitter": "État du Valais"},
        ))
    print(f"  communiques_vs: {len(out)} communiqués")
    return out
