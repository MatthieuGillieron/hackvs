"""Export des données pour le front (web/public/data/*.json).

    python3 -m prototype.export

Fichiers produits :
  meta.json           date, utilisateur (fictif), météo du jour
  opportunities.json  les fiches (niveau, familles, raisons + sources, besoin, vivier, action)
  candidates.json     vivier (FICTIF)
  clients.json        clients (FICTIF) + nombre d'alertes en cours
  sources.json        état des sources (volume, fraîcheur, remplissage, catégorie, usage moteur)
  missions.json       historique des missions (FICTIF) : activité et performance des candidats
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

from sources import SOURCES, load, path
from sources.metiers import by_id

from . import images
from .scoring import LEVELS, TODAY, build
from .signals import norm_company

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
LABELS = {k: v["label"] for k, v in by_id().items()}
USER = {"name": "Julie Martin", "role": "Consultante", "initials": "JM", "fictif": True}


def _write(name: str, data) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False), "utf-8")
    print(f"  ✓ {name}.json")


def _companies() -> dict[str, dict]:
    """Fiche registre du commerce (Zefix) par nom normalisé, pour l'onglet Entreprise."""
    if not path("zefix").exists():
        return {}
    out = {}
    for r in load("zefix"):
        x = r["extra"]
        out[norm_company(r["company"] or r["title"])] = {
            "name": r["title"], "uid": x.get("uid"), "commune": r["commune"], "address": x.get("address"),
            "purpose": x.get("purpose"), "branches": len(x.get("branch_offices") or []),
            "lastPublications": (x.get("last_shab_dates") or [])[:3], "url": r["url"],
        }
    return out


def opportunities(opps) -> list[dict]:
    companies = _companies()
    rows = []
    for i, (o, img, logo) in enumerate(zip(opps, images.build(opps), images.logos(opps))):
        sigs = sorted(o.signals, key=lambda s: (s.fictif, -s.weight))
        rows.append({
            "id": i,
            "key": "|".join(map(str, o.key)),  # stable d'un export à l'autre (tâches enregistrées côté front)
            "level": o.level,
            "levelPublic": o.level_public,
            "kind": "entreprise" if o.company else "zone",
            "target": o.target,
            "company": o.company,
            "registry": companies.get(norm_company(o.company)) if o.company else None,
            "district": o.district,
            "place": img["place"] if img else None,
            "image": img,
            "logo": logo,
            "metiers": [LABELS.get(m, m) for m in (o.metiers_all or [o.metier])],
            "families": o.families,
            "window": [o.window[0].isoformat(), o.window[1].isoformat()],
            "weeks": max(0, (o.window[0] - TODAY).days) // 7,
            "need": list(o.need),
            "team": [round(x, 1) for x in o.team],
            "vivier": o.vivier,
            "pool": o.pool,
            "action": o.action,
            "probable": [{"company": c, "share": round(p, 2)} for c, p in o.probable_companies],
            "signals": [{
                "family": s.family, "type": s.type, "label": s.label, "url": s.url, "date": s.date,
                "fictif": s.fictif, "window": [s.window[0].isoformat(), s.window[1].isoformat()],
                "phase": s.meta.get("phase"),
                "metiers": [LABELS.get(m, m) for m in s.metiers],
                **({"detail": s.meta["detail"]} if s.meta.get("detail") else {}),
                **({"ia": True, "preuve": s.meta["preuve"]} if s.meta.get("ia") else {}),
            } for s in sigs],
        })
    return rows


def candidates(fx) -> list[dict]:
    return [{**c, "metierLabel": LABELS.get(c["metier"], c["metier"]),
             "metiersSecondaires": [LABELS.get(m, m) for m in c["metiers_secondaires"]], "fictif": True}
            for c in fx["fx_candidats"]]


def missions(fx) -> list[dict]:
    """Missions (FICTIVES) allégées : la page Candidats en tire l'activité et la performance."""
    return [{"id": m["id"], "candidat": m["candidat_id"], "client": m["client"], "metier": LABELS.get(m["metier"], m["metier"]),
             "debut": m["debut"], "fin": m["fin"], "heures": m["heures"], "taux": m["taux_facture"],
             "statut": m["statut"], "note": m["evaluation_client"], "district": m.get("district"), "fictif": True}
            for m in fx["fx_missions"]]


def clients(fx, opps) -> list[dict]:
    alerts = defaultdict(list)
    for o in opps:
        if o.company and o.level != "SURVEILLER":
            alerts[norm_company(o.company)].append(o)
    last_contact = {}
    for c in fx["fx_contacts"]:
        if c["date"] > last_contact.get(c["client_id"], {}).get("date", ""):
            last_contact[c["client_id"]] = c
    companies = _companies()
    out = []
    for c in fx["fx_clients"]:
        ops = sorted(alerts.get(norm_company(c["name"]), []), key=lambda o: LEVELS.index(o.level))
        lv = [o.level for o in ops]
        lc = last_contact.get(c["id"])
        out.append({**c, "metiers": [LABELS.get(m, m) for m in c["metiers"]],
                    "alerts": len(lv), "bestLevel": lv[0] if lv else None,
                    "alertKeys": ["|".join(map(str, o.key)) for o in ops],
                    "lastContact": {"date": lc["date"], "type": lc["type"], "objet": lc["objet"]} if lc else None,
                    "registry": companies.get(norm_company(c["name"])), "fictif": True})
    return out


# Catégorie, site d'origine et rôle dans le moteur de chaque source (page Admin › Sources).
# usage : famille de signaux alimentée, "vivier"/"contexte" si elle sert sans créer de signal, None si collectée seulement.
SOURCE_INFO: dict[str, tuple[str, str | None, str | None]] = {
    "communes": ("Référentiels", "https://www.agvchapp.bfs.admin.ch/", "contexte"),
    "calendrier": ("Référentiels", "https://www.vs.ch/web/se/vacances-scolaires", None),
    "permis_construire": ("Chantiers & projets", "https://www.vs.ch/web/bo", "projet"),
    "grands_projets": ("Chantiers & projets", "https://www.vs.ch/web/bo", "projet"),
    "simap": ("Chantiers & projets", "https://www.simap.ch/", "projet"),
    "registre_commerce": ("Entreprises", "https://www.shab.ch/", "entreprise"),
    "faillites": ("Entreprises", "https://www.shab.ch/", None),
    "fosc_capital": ("Entreprises", "https://www.shab.ch/", None),
    "zefix": ("Entreprises", "https://www.zefix.ch/", "contexte"),
    "jobroom": ("Emploi", "https://www.job-room.ch/", "recrutement"),
    "jobup": ("Emploi", "https://www.jobup.ch/", "recrutement"),
    "flexsis": ("Emploi", "https://www.flexsis.ch/", None),
    "emplois_publics": ("Emploi", "https://www.vs.ch/web/bo", None),
    "penurie": ("Emploi", "https://www.arbeit.swiss/", None),
    "metiers": ("Référentiels", None, "contexte"),
    "hesta": ("Statistiques OFS", "https://www.pxweb.bfs.admin.ch/", None),
    "construction_ofs": ("Statistiques OFS", "https://www.pxweb.bfs.admin.ch/", None),
    "emplois_ofs": ("Statistiques OFS", "https://www.pxweb.bfs.admin.ch/", None),
    "salaires": ("Statistiques OFS", "https://www.pxweb.bfs.admin.ch/", None),
    "places_vacantes": ("Statistiques OFS", "https://www.pxweb.bfs.admin.ch/", None),
    "meteo": ("Météo", "https://open-meteo.com/", "contexte"),
    "meteosuisse": ("Météo", "https://www.meteosuisse.admin.ch/", None),
    "presse": ("Presse & web", "https://www.lenouvelliste.ch/", "projet"),
    "communiques_vs": ("Presse & web", "https://www.vs.ch/", "projet"),
    "sites_web": ("Presse & web", None, None),
    "fx_clients": ("Interne Flexsis (simulé)", None, "contexte"),
    "fx_candidats": ("Interne Flexsis (simulé)", None, "vivier"),
    "fx_demandes": ("Interne Flexsis (simulé)", None, "historique"),
    "fx_missions": ("Interne Flexsis (simulé)", None, "contexte"),
    "fx_contacts": ("Interne Flexsis (simulé)", None, "contexte"),
    "fx_kpis": ("Interne Flexsis (simulé)", None, None),
}


# Nom lisible affiché dans Admin › Sources (l'identifiant technique reste `name`).
SOURCE_TITLES = {
    "communes": "Communes OFS", "calendrier": "Calendrier & vacances", "permis_construire": "Mises à l'enquête",
    "grands_projets": "Grands projets", "simap": "SIMAP · marchés publics", "registre_commerce": "Registre du commerce (FOSC)",
    "faillites": "Faillites (FOSC)", "fosc_capital": "Capital & fusions (FOSC)", "zefix": "Zefix",
    "jobroom": "Job-Room", "jobup": "jobup.ch", "flexsis": "Offres flexsis.ch", "emplois_publics": "Emplois publics (BO)",
    "penurie": "Pénurie SECO", "metiers": "Référentiel métiers", "hesta": "Tourisme (HESTA)",
    "construction_ofs": "Construction (OFS)", "emplois_ofs": "Emplois (STATENT)", "salaires": "Salaires (LSE)",
    "places_vacantes": "Places vacantes (OFS)", "meteo": "Prévisions météo", "meteosuisse": "MétéoSuisse",
    "presse": "Presse régionale", "communiques_vs": "Communiqués de l'État", "sites_web": "Sites web",
    "fx_clients": "Clients", "fx_candidats": "Candidats", "fx_demandes": "Demandes clients",
    "fx_missions": "Missions", "fx_contacts": "Contacts CRM", "fx_kpis": "Indicateurs",
}


def sources_status() -> list[dict]:
    out = []
    for name, (_fn, desc) in SOURCES.items():
        category, site, usage = SOURCE_INFO.get(name, ("Autres", None, None))
        info = {"title": SOURCE_TITLES.get(name, name), "category": category, "site": site, "usage": usage}
        if not path(name).exists():
            out.append({"name": name, "description": desc, "count": 0, "status": "absent", **info})
            continue
        meta = load(name, with_meta=True)
        recs = meta["records"]
        n = len(recs) or 1
        dates = sorted(r["date"] for r in recs if r.get("date"))
        fill = {f: round(100 * sum(1 for r in recs if r.get(f) not in (None, "", [])) / n)
                for f in ("text", "url", "company", "commune", "bfs")}
        age_h = (datetime.now() - datetime.fromisoformat(meta["fetched_at"])).total_seconds() / 3600
        out.append({"name": name, "description": desc, "count": len(recs), "fetchedAt": meta["fetched_at"],
                    "ageHours": round(age_h, 1), "lastDate": dates[-1][:10] if dates else None, "fill": fill,
                    "fictif": name.startswith("fx_"),
                    "status": "vide" if not recs else "ancien" if age_h > 48 else "ok", **info})
    return out


def weather() -> dict | None:
    if not path("meteo").exists():
        return None
    sion = next((r for r in load("meteo") if r["commune"] == "Sion"), None)
    if not sion:
        return None
    today = next((d for d in sion["extra"]["daily"] if d["time"] == TODAY.isoformat()), sion["extra"]["daily"][0])
    return {"place": "Sion", "tmax": today["temperature_2m_max"], "tmin": today["temperature_2m_min"],
            "precip": today["precipitation_sum"], "frostDays": len(sion["extra"]["frost_days"])}


def main():
    opps, fx = build(real_clients=True, key_mode="entreprise", zone_context=True)
    print(f"Export → {OUT}")
    _write("meta", {"today": TODAY.isoformat(), "generatedAt": datetime.now().isoformat(timespec="seconds"),
                    "user": USER, "weather": weather(),
                    "counts": dict(Counter(o.level for o in opps))})
    _write("opportunities", opportunities(opps))
    _write("candidates", candidates(fx))
    _write("clients", clients(fx, opps))
    _write("missions", missions(fx))
    _write("sources", sources_status())


if __name__ == "__main__":
    main()
