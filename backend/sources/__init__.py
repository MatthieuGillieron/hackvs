"""Bibliothèque de sources de données publiques suisses, prête à copier dans un projet.

    from sources import load, fetch, SOURCES
    permis = load("permis_construire")          # lit le snapshot data/snapshots/permis_construire.json
    fresh  = fetch("simap", days=30)            # réseau (ou cache), puis sauvegarde

CLI : python -m sources --help
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Callable

from .core.paths import DATA_DIR
from .public import amtsblatt, flexsis, jobroom, jobup, meteo, meteosuisse, penurie, presse, simap, sites_web, stattab, zefix
from .reference import calendrier, communes, metiers
from .simulated import flexsis_fictif

# nom -> (fonction, description). Toutes les fonctions acceptent des kwargs optionnels.
# L'ordre compte pour `fetch all` : référentiels d'abord, puis sources, puis ce qui dépend des snapshots.
SOURCES: dict[str, tuple[Callable[..., list], str]] = {
    # référentiels
    "communes": (communes.fetch, "Référentiel communes OFS + district + coordonnées"),
    "calendrier": (calendrier.fetch, "Jours fériés, vacances scolaires (officiel) + saisons/congés/événements (approx)"),
    # chantiers & projets
    "permis_construire": (amtsblatt.fetch_permis_construire, "Mises à l'enquête (Bulletin officiel, BA-xx05)"),
    "grands_projets": (amtsblatt.fetch_grands_projets, "Plans en consultation, approbations trafic/énergie"),
    "simap": (simap.fetch, "Marchés publics : appels d'offres et adjudications (lauréat + montant)"),
    # entreprises
    "registre_commerce": (amtsblatt.fetch_registre_commerce, "FOSC : créations / mutations / radiations"),
    "faillites": (amtsblatt.fetch_faillites, "FOSC : faillites et concordats"),
    "fosc_capital": (amtsblatt.fetch_capital, "FOSC : augmentations de capital et communications d'entreprises"),
    # emploi
    "jobroom": (jobroom.fetch, "Offres d'emploi job-room.ch (tout le marché)"),
    "jobup": (jobup.fetch, "Offres d'emploi jobup.ch (employeur + segment PME/agence)"),
    "flexsis": (flexsis.fetch, "Offres publiées sur flexsis.ch"),
    "emplois_publics": (amtsblatt.fetch_emplois_publics, "Offres d'emploi au Bulletin officiel"),
    "penurie": (penurie.fetch, "SECO : professions à chômage >= 5 % (obligation d'annonce)"),
    # statistiques OFS (STAT-TAB)
    "hesta": (stattab.fetch_hesta, "OFS HESTA : arrivées et nuitées hôtelières par commune et par mois"),
    "construction_ofs": (stattab.fetch_construction, "OFS : dépenses de construction + réserves de travail par commune"),
    "emplois_ofs": (stattab.fetch_emplois, "OFS STATENT : établissements / emplois / EPT par commune et secteur"),
    "salaires": (stattab.fetch_salaires, "OFS LSE : salaire mensuel brut par groupe de professions (ISCO)"),
    "places_vacantes": (stattab.fetch_places_vacantes, "OFS : places vacantes par grande région et trimestre"),
    # météo
    "meteo": (meteo.fetch, "Prévisions 16 jours + jours de gel/pluie/neige (Open-Meteo)"),
    "meteosuisse": (meteosuisse.fetch, "MétéoSuisse : mesures journalières des stations VS"),
    # presse & web
    "presse": (presse.fetch_presse, "Le Nouvelliste, Canal9, Rhône FM (titres + chapeaux)"),
    "communiques_vs": (presse.fetch_communiques_vs, "Communiqués de l'État du Valais"),
    "sites_web": (sites_web.fetch, "Sites des communes / entreprises : actualités, projets, carrière, avis"),
    # dépend des snapshots ci-dessus
    "zefix": (zefix.fetch, "Zefix : fiche officielle des entreprises vues dans simap/permis/jobroom"),
    "metiers": (metiers.fetch, "Référentiel métiers (ISCO, détection) + pénurie SECO + salaires OFS"),
    # données internes Flexsis : FICTIVES
    "fx_clients": (flexsis_fictif.fetch_clients, "[FICTIF] Clients Flexsis"),
    "fx_candidats": (flexsis_fictif.fetch_candidats, "[FICTIF] Vivier : compétences, certifs, mobilité, dispo"),
    "fx_demandes": (flexsis_fictif.fetch_demandes, "[FICTIF] Historique des demandes clients"),
    "fx_missions": (flexsis_fictif.fetch_missions, "[FICTIF] Historique des missions / placements réussis"),
    "fx_contacts": (flexsis_fictif.fetch_contacts, "[FICTIF] CRM : contacts commerciaux"),
    "fx_kpis": (flexsis_fictif.fetch_kpis, "[FICTIF] Délai moyen, taux de couverture par métier/district, mobilité"),
}


def path(name: str):
    return DATA_DIR / f"{name}.json"


def save(name: str, records: list[dict], params: dict | None = None) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": name,
        "fetched_at": datetime.now().isoformat(timespec="seconds"),
        "params": params or {},
        "count": len(records),
        "records": records,
    }
    path(name).write_text(json.dumps(payload, ensure_ascii=False, indent=1), "utf-8")


def load(name: str, with_meta: bool = False):
    """Lit le snapshot local. with_meta=True renvoie aussi fetched_at / params."""
    payload = json.loads(path(name).read_text("utf-8"))
    return payload if with_meta else payload["records"]


def load_all() -> list[dict]:
    """Tous les snapshots disponibles concaténés (même format de record)."""
    return [r for n in SOURCES if path(n).exists() for r in load(n)]


JOB_SOURCES = {"jobroom", "jobup", "flexsis", "emplois_publics"}


def enrich(records: list[dict]) -> list[dict]:
    """Complète bfs / lat / lon / extra.district via le référentiel `communes` (si présent),
    et extra.metiers (ids du référentiel `metiers`) sur les offres d'emploi."""
    for r in records:
        if r["source"] in JOB_SOURCES:
            r["extra"]["metiers"] = metiers.detect(r["title"])
    if not path("communes").exists():
        return records
    idx = communes.index()
    for r in records:
        if r["source"] == "communes":
            continue
        c = communes.lookup(r["bfs"], idx) if r["bfs"] else None
        c = c or communes.lookup(r["commune"] or "", idx)
        if c:
            r["bfs"] = r["bfs"] or c["bfs"]
            r["lat"] = r["lat"] if r["lat"] is not None else c["lat"]
            r["lon"] = r["lon"] if r["lon"] is not None else c["lon"]
            r["extra"]["district"] = c["extra"]["district"]
    return records


def fetch(name: str, save_result: bool = True, **kwargs) -> list[dict]:
    fn, _ = SOURCES[name]
    records = enrich(fn(**kwargs))
    if save_result:
        save(name, records, kwargs)
    return records
