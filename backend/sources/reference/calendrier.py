"""Calendrier : jours fériés, vacances scolaires, saisons, congés du bâtiment, grands événements.

- Jours fériés + vacances scolaires : OpenHolidays API (officiel, sans clé)
  https://openholidaysapi.org/PublicHolidays?countryIsoCode=CH&subdivisionCode=CH-VS&...
- Saisons / congés / événements : liste curée À LA MAIN, dates APPROXIMATIVES
  (extra.confidence = "approx", extra.a_verifier = True). Les vérifier avant de s'en servir
  dans une démo. La saisonnalité touristique réelle se mesure avec `hesta` (nuitées par mois).
"""
from __future__ import annotations

from datetime import date

from ..core import http as _http
from ..core.record import i18n, record

API = "https://openholidaysapi.org"

# (id, kind, titre, (mois, jour) début, (mois, jour) fin, impact recrutement, url de référence)
# fin < début => la période chevauche le nouvel an.
CURATED = [
    ("saison-ski", "saison", "Saison de ski (stations valaisannes)", (12, 5), (4, 15),
     "Pic hôtellerie/restauration, remontées, nettoyage ; chantiers d'altitude à l'arrêt", None),
    ("saison-ete", "saison", "Haute saison touristique d'été", (7, 1), (8, 31),
     "Pic hôtellerie/restauration ; rénovations d'hôtels avant/après saison", None),
    ("intersaison-printemps", "saison", "Intersaison printemps (rénovations en station)", (4, 15), (6, 15),
     "Fenêtre de travaux dans les stations fermées", None),
    ("intersaison-automne", "saison", "Intersaison automne (rénovations en station)", (10, 1), (12, 5),
     "Fenêtre de travaux avant l'hiver ; rush pour fermer les chantiers d'altitude", None),
    ("vendanges", "saison", "Vendanges en Valais", (9, 10), (10, 20),
     "Besoin de main-d'œuvre agricole/cave ; concurrence sur les profils manœuvres", None),
    ("conges-batiment-hiver", "congé collectif", "Congés de fin d'année du bâtiment", (12, 22), (1, 6),
     "Chantiers fermés ; reprise début janvier = vague de demandes", None),
    ("conges-batiment-ete", "congé collectif", "Vacances d'été du bâtiment (Suisse romande)", (7, 18), (8, 10),
     "Chantiers fermés ~3 semaines ; dates exactes selon CCT/entreprise, à confirmer avec Flexsis", None),
    ("foire-du-valais", "événement", "Foire du Valais (Martigny)", (10, 2), (10, 11),
     "Montage/démontage, logistique, restauration", "https://www.foireduvalais.ch"),
    ("verbier-festival", "événement", "Verbier Festival", (7, 15), (8, 2), "Hôtellerie, logistique, sécurité", None),
    ("sion-festival", "événement", "Sion Festival", (8, 20), (9, 10), "Événementiel", None),
    ("openair-gampel", "événement", "Open Air Gampel", (8, 13), (8, 16), "Montage scène, sécurité, restauration", None),
    ("european-masters", "événement", "Omega European Masters (golf, Crans-Montana)", (8, 27), (8, 30),
     "Hôtellerie, logistique", None),
    ("caprices-festival", "événement", "Caprices Festival (Crans-Montana)", (4, 9), (4, 12), "Événementiel", None),
    ("zermatt-unplugged", "événement", "Zermatt Unplugged", (4, 7), (4, 11), "Événementiel, hôtellerie", None),
    ("combat-reines", "événement", "Finale cantonale des combats de reines (Aproz)", (5, 7), (5, 10),
     "Événementiel", None),
]


def _holidays(kind: str, canton: str, year_from: int, year_to: int) -> list[dict]:
    data = _http.get_json(f"{API}/{kind}", {
        "countryIsoCode": "CH", "subdivisionCode": f"CH-{canton}", "languageIsoCode": "FR",
        "validFrom": f"{year_from}-01-01", "validTo": f"{year_to}-12-31",
    }, ttl=30 * 86400)
    out = []
    for h in data:
        name = i18n({n["language"].lower(): n["text"] for n in h.get("name", [])})
        # VS : calendriers scolaires distincts (francophone / germanophone / communes touristiques)
        zone = i18n({c["language"].lower(): c["text"] for c in h.get("comment") or []})
        if zone:
            name = f"{name} ({zone})"
        out.append(record(
            "calendrier", h["id"],
            kind="jour férié" if kind == "PublicHolidays" else "vacances scolaires",
            date=h["startDate"],
            title=name,
            text=f"{name} : {h['startDate']} → {h['endDate']} ({canton})",
            url=f"{API}/{kind}?countryIsoCode=CH&subdivisionCode=CH-{canton}",
            canton=canton,
            extra={"start": h["startDate"], "end": h["endDate"], "nationwide": h.get("nationwide"),
                   "zone": zone, "confidence": "officiel"},
        ))
    return out


def _curated(canton: str, year_from: int, year_to: int) -> list[dict]:
    out = []
    for year in range(year_from, year_to + 1):
        for cid, kind, title, (m1, d1), (m2, d2), impact, url in CURATED:
            start = date(year, m1, d1)
            end = date(year + 1 if (m2, d2) < (m1, d1) else year, m2, d2)
            out.append(record(
                "calendrier", f"{cid}-{year}",
                kind=kind,
                date=start.isoformat(),
                title=f"{title} {year}",
                text=f"{title} : ~{start.isoformat()} → ~{end.isoformat()} (dates approximatives). Impact : {impact}",
                url=url,
                canton=canton,
                extra={"start": start.isoformat(), "end": end.isoformat(), "impact": impact,
                       "confidence": "approx", "a_verifier": True},
            ))
    return out


def fetch(canton: str = "VS", years: int = 2) -> list[dict]:
    y0 = date.today().year
    y1 = y0 + years - 1
    recs = (_holidays("PublicHolidays", canton, y0, y1) + _holidays("SchoolHolidays", canton, y0, y1)
            + _curated(canton, y0, y1))
    return sorted(recs, key=lambda r: r["date"] or "")
