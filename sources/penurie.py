"""SECO : genres de professions soumis à l'obligation d'annoncer les postes vacants.

= professions dont le taux de chômage national dépasse 5 % (liste annuelle, PDF).
C'est la meilleure donnée publique de "chômage par profession" : chômeurs inscrits,
actifs occupés et taux, par code CH-ISCO-19. Lecture inverse : un métier ABSENT de la
liste a moins de 5 % de chômage, donc il est plus tendu (pénurie probable).
Page : https://www.arbeit.swiss/fr/employeurs/obligation-dannoncer-les-postes-vacants
Nécessite `pdftotext` (poppler) pour un rafraîchissement ; le snapshot JSON suffit sinon.
Complément par annonce : job-room `extra.reporting_obligation`.
"""
from __future__ import annotations

import re
import shutil
import subprocess

from . import _http
from ._record import record

PAGE = "https://www.arbeit.swiss/fr/employeurs/obligation-dannoncer-les-postes-vacants"
FILE_RE = re.compile(r'<a[^>]+href="([^"]*fileservice[^"]*\.pdf)"[^>]*>(.*?)</a>', re.S)
# codes ISCO en tête, puis libellé, puis (depuis la droite) chômeurs, actifs occupés ("50 931"), taux
ROW_RE = re.compile(r"^(\d{4,5}(?:\s*[;\-–]\s*\d{4,5})*)\s+(.+?)\s+(\d+)\s+(\d{1,3}(?: \d{3})+|\d+)\s+(\d+,\d)\s*%\s*$")


def _pdf_url() -> tuple[str, str]:
    page = _http.get_text(PAGE, ttl=7 * 86400)
    for href, label in FILE_RE.findall(page):
        text = re.sub(r"<[^>]+>|\s+", " ", label)
        if "liste des genres de professions" in text.lower():
            return "https://www.arbeit.swiss" + href if href.startswith("/") else href, text.strip()
    raise RuntimeError("PDF de la liste introuvable sur arbeit.swiss (structure du site changée ?)")


def _int(s: str) -> int:
    return int(re.sub(r"\D", "", s))


def fetch() -> list[dict]:
    if not shutil.which("pdftotext"):
        raise RuntimeError("pdftotext absent (brew install poppler / apt install poppler-utils)")
    url, label = _pdf_url()
    year = (re.search(r"20\d\d", label) or re.search(r"20\d\d", url)).group(0)
    pdf = _http.download(url, ".pdf")
    txt = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True).stdout
    out, pending = [], None
    for line in txt.splitlines():
        m = ROW_RE.match(line.strip())
        if m:
            codes, name, unemployed, employed, rate = m.groups()
            pending = record(
                "penurie", f"{year}-{codes}",
                kind="obligation d'annonce",
                date=f"{year}-01-01",
                title=name.strip(),
                text="",
                url=url,
                extra={"isco_codes": re.findall(r"\d{4,5}", codes), "isco_raw": codes,
                       "unemployed": _int(unemployed), "employed": _int(employed),
                       "unemployment_rate": float(rate.replace(",", ".")), "year": int(year)},
            )
            out.append(pending)
        elif pending and line.startswith(" " * 10) and line.strip() and not re.search(r"\d", line):
            pending["title"] += " " + line.strip()  # libellé sur 2 lignes
    for r in out:
        e = r["extra"]
        r["text"] = (f"{r['title']} (CH-ISCO {e['isco_raw']}) : taux de chômage {e['unemployment_rate']} % "
                     f"({e['unemployed']} chômeurs / {e['employed']} actifs) — soumis à l'obligation d'annonce {year}")
    print(f"  penurie: {len(out)} genres de profession (liste {year})")
    return out
