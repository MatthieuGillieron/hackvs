"""Données INTERNES Flexsis — 100 % FICTIVES, générées (graine fixe, reproductible).

Ces données n'existent pas en open data : missions, demandes clients, candidats,
disponibilités, compétences/certifications, mobilité, CRM, placements, KPIs.
Le générateur fixe le SCHÉMA : si Flexsis fournit ses vraies données au kickoff, il suffit
de les convertir dans ces mêmes champs et tout le reste du projet fonctionne.

Sources produites (toutes avec extra.fictif = True et un préfixe "fx_") :
  fx_clients     entreprises clientes (secteur, commune, potentiel)
  fx_candidats   vivier : métier(s), commune, rayon de mobilité, permis, certifications, langues,
                 statut (disponible / en mission / ancien / indisponible), disponible_des
  fx_demandes    historique des demandes clients (métier, nb postes, délai, issue, délai de placement)
  fx_missions    historique des missions (= placements réussis) : candidat, client, dates, heures, note
  fx_contacts    CRM : appels / visites / mails avec les clients
  fx_kpis        délai moyen de placement et taux de couverture par métier, par district, mobilité

real_clients=True : les clients prennent les noms d'entreprises réelles vues dans les snapshots
publics (SIMAP, permis) — pratique pour une démo, mais les historiques restent INVENTÉS.
"""
from __future__ import annotations

import math
import random
from collections import defaultdict
from datetime import date, timedelta
from statistics import mean
from typing import Optional

from ..core.record import record
from ..reference import metiers as _metiers

SEED = 42
DISCLAIMER = "DONNÉES FICTIVES (générées) — ne représentent aucune personne ni entreprise réelle"

PRENOMS = ["Luca", "Mathieu", "João", "Pedro", "Kevin", "Nicolas", "Julien", "David", "Marco", "Tiago", "Bruno",
           "Florian", "Yannick", "Rui", "Miguel", "Sébastien", "Alexandre", "Damien", "Fabio", "Arben", "Driton",
           "Laura", "Sofia", "Ana", "Céline", "Sarah", "Inês", "Marta", "Elodie", "Jonas", "Samuel", "Adrien"]
NOMS = ["Albasini-X", "Dubois-X", "Moreira-X", "Pereira-X", "Martin-X", "Rossi-X", "Silva-X", "Costa-X",
        "Lambert-X", "Gashi-X", "Krasniqi-X", "Fontaine-X", "Ferreira-X", "Marchand-X", "Bianchi-X", "Rochat-X",
        "Garcia-X", "Lopes-X", "Muller-X", "Berisha-X", "Santos-X", "Girard-X", "Rey-X", "Morand-X"]
CLIENT_PREFIX = ["Alpibat", "Rhodania", "Valtec", "Sedunum", "Octodure", "Montagnard", "Chablatec", "Noblebat",
                 "Rhônebau", "Matterbau", "Vispa Tech", "Agaune", "Grand-Combin", "Bietsch", "Lonzia", "Derborence"]
CLIENT_ACTIVITY = {
    "bâtiment": ["Constructions SA", "Bâtiment & Génie civil SA", "Maçonnerie Sàrl", "Charpente SA",
                 "Électricité SA", "Sanitaire-Chauffage Sàrl", "Peinture & Plâtrerie Sàrl", "Toitures SA"],
    "industrie": ["Industries SA", "Mécanique de précision SA", "Métal Sàrl"],
    "logistique": ["Logistique SA", "Transports Sàrl"],
}
CERTIFS = {
    "*": ["Premiers secours", "SUVA sécurité chantier"],
    "macon": ["CFC maçon", "AFP aide-maçon"], "coffreur": ["CFC constructeur de routes", "Coffrage glissant"],
    "grutier": ["Permis grue cat. A", "Permis grue cat. B"], "machiniste": ["Permis machiniste M1-M6"],
    "electricien": ["CFC installateur-électricien", "OIBT autorisation"], "soudeur": ["EN ISO 9606-1", "TIG/MIG-MAG"],
    "cariste": ["Permis cariste R389"], "echafaudeur": ["Formation échafaudage SUVA"],
    "chauffeur": ["Permis C", "Permis CE", "OACP"], "couvreur": ["Travail en hauteur EPI"],
    "chef_chantier": ["Brevet fédéral chef de chantier"], "polymecanicien": ["CFC polymécanicien"],
}
LANGUES = ["fr", "de", "it", "pt", "es", "sq", "en"]
STATUTS = ["disponible", "en mission", "ancien", "indisponible"]
CONSULTANTS = ["Consultant A (fictif)", "Consultant B (fictif)", "Consultant C (fictif)", "Consultant D (fictif)"]
CONCURRENTS = ["Agence concurrente 1", "Agence concurrente 2", "Agence concurrente 3", "Recrutement direct client"]

# poids de chaque métier dans l'activité (bâtiment surreprésenté, comme Flexsis)
WEIGHTS = {"macon": 10, "manoeuvre": 10, "coffreur": 6, "ferrailleur": 3, "electricien": 7, "sanitaire": 5,
           "chauffage": 3, "peintre": 5, "platrier": 4, "carreleur": 3, "couvreur": 4, "charpentier": 4,
           "menuisier": 3, "grutier": 2, "machiniste": 3, "echafaudeur": 2, "chef_chantier": 2, "paysagiste": 3,
           "isoleur": 2, "serrurier": 2, "soudeur": 3, "polymecanicien": 3, "mecanicien": 3, "operateur": 4,
           "cariste": 3, "logisticien": 3, "chauffeur": 3, "nettoyage": 3, "automaticien": 1, "dessinateur": 1,
           "ventilation": 1}
# saisonnalité bâtiment : facteur par mois (creux en janvier et en août, pic au printemps)
SEASON = {1: .5, 2: .8, 3: 1.2, 4: 1.4, 5: 1.4, 6: 1.3, 7: 1.0, 8: .6, 9: 1.2, 10: 1.2, 11: 1.0, 12: .5}

FALLBACK_TOWNS = [("Sion", 6266, 46.233, 7.360, "District de Sion"), ("Sierre", 6248, 46.292, 7.535, "District de Sierre"),
                  ("Martigny", 6136, 46.102, 7.073, "District de Martigny"), ("Monthey", 6153, 46.255, 6.954, "District de Monthey"),
                  ("Brig-Glis", 6002, 46.316, 7.988, "Bezirk Brig"), ("Visp", 6297, 46.294, 7.882, "Bezirk Visp"),
                  ("Conthey", 6023, 46.224, 7.302, "District de Conthey"), ("Val de Bagnes", 6037, 46.083, 7.217, "District d'Entremont")]


def _km(a, b) -> float:
    (la1, lo1), (la2, lo2) = a, b
    x = (lo2 - lo1) * math.cos(math.radians((la1 + la2) / 2))
    return 111.2 * math.hypot(la2 - la1, x)


def _towns() -> list[tuple]:
    from .. import load, path
    if not path("communes").exists():
        return FALLBACK_TOWNS
    big = {6266: 8, 6248: 6, 6136: 6, 6153: 5, 6002: 4, 6297: 3, 6023: 3, 6037: 3}
    out = []
    for c in load("communes"):
        if c["lat"] is None:
            continue
        out += [(c["commune"], c["bfs"], c["lat"], c["lon"], c["extra"]["district"])] * big.get(c["bfs"], 1)
    return out


def _real_client_names() -> list[str]:
    from ..public.zefix import companies_from_snapshots
    return companies_from_snapshots(limit=200)


_CACHE: dict = {}


def generate(n_clients: int = 60, n_candidats: int = 350, years: int = 3, ref: Optional[date] = None,
             real_clients: bool = False) -> dict[str, list[dict]]:
    key = (n_clients, n_candidats, years, ref, real_clients)
    if key in _CACHE:
        return _CACHE[key]
    rnd = random.Random(SEED)
    ref = ref or date.today()
    start = ref - timedelta(days=365 * years)
    towns = _towns()
    met = _metiers.by_id()
    met_ids = list(WEIGHTS)
    met_w = [WEIGHTS[m] for m in met_ids]

    # ---------------------------------------------------------------- clients
    real = _real_client_names() if real_clients else []
    clients = []
    for i in range(n_clients):
        sector = rnd.choices(["bâtiment", "industrie", "logistique"], [7, 2, 1])[0]
        name = real[i] if i < len(real) else f"{rnd.choice(CLIENT_PREFIX)} {rnd.choice(CLIENT_ACTIVITY[sector])}"
        t = rnd.choice(towns)
        pool = [m for m in met_ids if met[m]["sector"] == sector] or met_ids
        clients.append({
            "id": f"CL{i + 1:03d}", "name": name, "sector": sector, "commune": t[0], "bfs": t[1],
            "lat": t[2], "lon": t[3], "district": t[4], "size": rnd.choice(["TPE", "PME", "PME", "grande"]),
            "metiers": rnd.sample(pool, k=min(len(pool), rnd.randint(2, 5))),
            "since": (start - timedelta(days=rnd.randint(0, 2000))).isoformat(),
            "consultant": rnd.choice(CONSULTANTS), "potential": rnd.choice(["A", "B", "B", "C"]),
        })

    # ---------------------------------------------------------------- candidats
    cands = []
    for i in range(n_candidats):
        m = rnd.choices(met_ids, met_w)[0]
        t = rnd.choice(towns)
        statut = rnd.choices(STATUTS, [30, 30, 32, 8])[0]
        certs = [c for c in CERTIFS.get(m, []) if rnd.random() < .6] + [c for c in CERTIFS["*"] if rnd.random() < .4]
        langs = ["fr"] + rnd.sample([l for l in LANGUES if l != "fr"], k=rnd.choice([0, 1, 1, 2]))
        if t[4].startswith("Bezirk"):
            langs = ["de"] + [l for l in langs if l not in ("de",)][:2]
        cands.append({
            "id": f"CA{i + 1:04d}", "prenom": rnd.choice(PRENOMS), "nom": rnd.choice(NOMS), "metier": m,
            "metiers_secondaires": rnd.sample(met_ids, k=rnd.choice([0, 0, 1, 2])),
            "experience_ans": rnd.randint(0, 30), "commune": t[0], "bfs": t[1], "lat": t[2], "lon": t[3],
            "district": t[4], "rayon_km": rnd.choice([15, 25, 40, 40, 60, 80]),
            "permis": rnd.choices(["aucun", "B", "B", "B", "C", "CE"], k=1)[0], "vehicule": rnd.random() < .7,
            "certifications": certs, "langues": langs, "statut": statut,
            "taux_horaire_souhaite": round(rnd.uniform(28, 48), 1), "note_consultant": rnd.randint(2, 5),
            "inscrit_le": (start + timedelta(days=rnd.randint(-700, 365 * years - 10))).isoformat(),
        })

    # ---------------------------------------------------------------- demandes + missions
    demandes, missions = [], []
    cand_by_met = defaultdict(list)
    for c in cands:
        for m in [c["metier"], *c["metiers_secondaires"]]:
            cand_by_met[m].append(c)
    busy_until: dict[str, date] = {}
    d = start
    did = mid = 0
    while d < ref:
        per_day = 1.1 * SEASON[d.month] * (0 if d.weekday() >= 5 else 1)
        for _ in range(int(per_day) + (rnd.random() < per_day % 1)):
            cl = rnd.choice(clients)
            m = rnd.choice(cl["metiers"]) if rnd.random() < .85 else rnd.choices(met_ids, met_w)[0]
            n = rnd.choices([1, 2, 3, 4, 6], [45, 25, 15, 10, 5])[0]
            lead = rnd.choices([1, 3, 7, 14, 21, 35], [20, 25, 25, 15, 10, 5])[0]
            wanted = d + timedelta(days=lead)
            did += 1
            # candidats compatibles : bon métier, à portée, libres à la date voulue
            pool = [c for c in cand_by_met[m] if _km((c["lat"], c["lon"]), (cl["lat"], cl["lon"])) <= c["rayon_km"]
                    and busy_until.get(c["id"], date.min) < wanted]
            rnd.shuffle(pool)
            # plus le délai est court, moins on arrive à pourvoir
            p_fill = min(.95, .35 + .03 * lead)
            filled = [c for c in pool[:n] if rnd.random() < p_fill]
            delay = None
            if filled:
                delay = max(0, min(lead, int(rnd.gammavariate(2, 1.5 + lead / 6))))
            status = ("pourvue" if len(filled) == n else "partielle" if filled else
                      rnd.choices(["non pourvue", "annulée"], [80, 20])[0])
            demandes.append({
                "id": f"DE{did:05d}", "client_id": cl["id"], "client": cl["name"], "metier": m, "nb_postes": n,
                "date_demande": d.isoformat(), "debut_souhaite": wanted.isoformat(), "delai_prevenance_j": lead,
                "urgence": "urgent" if lead <= 3 else "normal" if lead <= 14 else "anticipé",
                "statut": status, "nb_pourvus": len(filled), "delai_placement_j": delay,
                "perdu_face_a": rnd.choice(CONCURRENTS) if status in ("non pourvue", "partielle") else None,
                "commune": cl["commune"], "bfs": cl["bfs"], "district": cl["district"], "lat": cl["lat"], "lon": cl["lon"],
                "consultant": cl["consultant"],
            })
            for c in filled:
                mid += 1
                dur = rnd.choices([5, 10, 20, 40, 65, 120], [15, 20, 25, 20, 12, 8])[0]
                end = wanted + timedelta(days=dur)
                busy_until[c["id"]] = end
                hours = dur * 5 / 7 * rnd.choice([8, 8.5, 9])
                missions.append({
                    "id": f"MI{mid:05d}", "demande_id": f"DE{did:05d}", "candidat_id": c["id"],
                    "candidat": f"{c['prenom']} {c['nom']}", "client_id": cl["id"], "client": cl["name"], "metier": m,
                    "debut": wanted.isoformat(), "fin": end.isoformat(), "heures": round(hours),
                    "taux_facture": round(c["taux_horaire_souhaite"] * rnd.uniform(1.35, 1.6), 2),
                    "statut": "en cours" if end >= ref else "terminée",
                    "evaluation_client": rnd.choices([2, 3, 4, 5], [5, 20, 45, 30])[0] if end < ref else None,
                    "commune": cl["commune"], "bfs": cl["bfs"], "district": cl["district"],
                    "lat": cl["lat"], "lon": cl["lon"],
                })
        d += timedelta(days=1)

    # statut des candidats cohérent avec les missions
    last_end = {}
    for mi in missions:
        last_end[mi["candidat_id"]] = max(last_end.get(mi["candidat_id"], ""), mi["fin"])
    for c in cands:
        le = last_end.get(c["id"])
        c["derniere_mission_fin"] = le
        if le and le >= ref.isoformat():
            c["statut"], c["disponible_des"] = "en mission", (date.fromisoformat(le) + timedelta(days=1)).isoformat()
        elif c["statut"] == "en mission":
            c["statut"] = "disponible"
        if c["statut"] == "disponible":
            c["disponible_des"] = (ref + timedelta(days=rnd.choice([0, 0, 3, 7, 14]))).isoformat()
        elif c["statut"] == "indisponible":
            c["disponible_des"] = (ref + timedelta(days=rnd.randint(30, 180))).isoformat()
        elif c["statut"] == "ancien":
            c["disponible_des"] = None  # à réactiver

    # ---------------------------------------------------------------- contacts CRM
    contacts = []
    for i in range(int(len(clients) * years * 9)):
        cl = rnd.choice(clients)
        day = start + timedelta(days=rnd.randint(0, 365 * years - 1))
        typ = rnd.choices(["appel", "visite", "mail", "rdv chantier"], [50, 15, 30, 5])[0]
        contacts.append({
            "id": f"CO{i + 1:05d}", "client_id": cl["id"], "client": cl["name"], "date": day.isoformat(), "type": typ,
            "consultant": cl["consultant"],
            "objet": rnd.choice(["Point besoins", "Relance", "Présentation candidats", "Suivi mission",
                                 "Négociation tarifs", "Prospection", "Retour satisfaction"]),
            "resultat": rnd.choice(["positif", "neutre", "à relancer", "besoin identifié", "pas de besoin"]),
            "commune": cl["commune"], "bfs": cl["bfs"],
        })

    # ---------------------------------------------------------------- KPIs
    kpis = []

    def kpi_group(key: str, label: str):
        groups = defaultdict(list)
        for de in demandes:
            if de["statut"] != "annulée":
                groups[de[key]].append(de)
        for g, items in groups.items():
            asked = sum(x["nb_postes"] for x in items)
            got = sum(x["nb_pourvus"] for x in items)
            delays = [x["delai_placement_j"] for x in items if x["delai_placement_j"] is not None]
            avail = sum(1 for c in cands if (c["metier"] if key == "metier" else c["district"]) == g
                        and c["statut"] == "disponible")
            kpis.append({"dimension": label, "valeur": g, "demandes": len(items), "postes_demandes": asked,
                         "postes_pourvus": got, "taux_couverture": round(got / asked, 3) if asked else None,
                         "delai_moyen_placement_j": round(mean(delays), 1) if delays else None,
                         "candidats_disponibles": avail})

    kpi_group("metier", "métier")
    kpi_group("district", "district")
    dist = [_km((c["lat"], c["lon"]), (cl["lat"], cl["lon"])) for mi in missions
            for c in [next(x for x in cands if x["id"] == mi["candidat_id"])]
            for cl in [next(x for x in clients if x["id"] == mi["client_id"])]]
    kpis.append({"dimension": "mobilité", "valeur": "distance domicile-chantier (km)",
                 "moyenne": round(mean(dist), 1) if dist else None,
                 "rayon_moyen_declare": round(mean(c["rayon_km"] for c in cands), 1),
                 "part_avec_vehicule": round(sum(c["vehicule"] for c in cands) / len(cands), 3)})

    res = {"fx_clients": clients, "fx_candidats": cands, "fx_demandes": demandes, "fx_missions": missions,
           "fx_contacts": contacts, "fx_kpis": kpis}
    _CACHE[key] = res
    return res


# ------------------------------------------------------------------ records communs

def _rec(source: str, row: dict, *, kind, date_, title, text, company=None) -> dict:
    return record(
        source, row.get("id") or f"{row.get('dimension')}:{row.get('valeur')}",
        kind=kind, date=date_, title=title, text=f"[FICTIF] {text}", url=None, canton="VS",
        commune=row.get("commune"), bfs=row.get("bfs"), company=company, lat=row.get("lat"), lon=row.get("lon"),
        extra={**row, "fictif": True, "disclaimer": DISCLAIMER},
    )


def _labels():
    return {k: v["label"] for k, v in _metiers.by_id().items()}


def fetch_clients(**kw) -> list[dict]:
    return [_rec("fx_clients", c, kind=c["sector"], date_=c["since"], title=c["name"], company=c["name"],
                 text=f"Client {c['name']} ({c['sector']}, {c['size']}) à {c['commune']} — métiers : {', '.join(c['metiers'])}")
            for c in generate(**kw)["fx_clients"]]


def fetch_candidats(**kw) -> list[dict]:
    lab = _labels()
    return [_rec("fx_candidats", c, kind=c["statut"], date_=c.get("disponible_des"),
                 title=f"{c['prenom']} {c['nom']} — {lab.get(c['metier'], c['metier'])}",
                 text=(f"{lab.get(c['metier'])} {c['experience_ans']} ans d'exp., {c['commune']} (rayon {c['rayon_km']} km, "
                       f"permis {c['permis']}), {c['statut']}, dispo {c.get('disponible_des') or 'à réactiver'} ; "
                       f"certifs : {', '.join(c['certifications']) or '—'} ; langues : {', '.join(c['langues'])}"))
            for c in generate(**kw)["fx_candidats"]]


def fetch_demandes(**kw) -> list[dict]:
    lab = _labels()
    return [_rec("fx_demandes", d, kind=d["statut"], date_=d["date_demande"], company=d["client"],
                 title=f"{d['client']} — {d['nb_postes']} × {lab.get(d['metier'])}",
                 text=(f"Demande {d['client']} : {d['nb_postes']} {lab.get(d['metier'])} pour le {d['debut_souhaite']} "
                       f"(prévenance {d['delai_prevenance_j']} j) → {d['statut']} ({d['nb_pourvus']}/{d['nb_postes']})"))
            for d in generate(**kw)["fx_demandes"]]


def fetch_missions(**kw) -> list[dict]:
    lab = _labels()
    return [_rec("fx_missions", m, kind=m["statut"], date_=m["debut"], company=m["client"],
                 title=f"{m['candidat']} chez {m['client']}",
                 text=f"Mission {lab.get(m['metier'])} chez {m['client']} du {m['debut']} au {m['fin']} ({m['heures']} h)")
            for m in generate(**kw)["fx_missions"]]


def fetch_contacts(**kw) -> list[dict]:
    return [_rec("fx_contacts", c, kind=c["type"], date_=c["date"], company=c["client"],
                 title=f"{c['type']} — {c['client']}", text=f"{c['type']} {c['client']} : {c['objet']} → {c['resultat']}")
            for c in generate(**kw)["fx_contacts"]]


def fetch_kpis(**kw) -> list[dict]:
    lab = _labels()
    out = []
    for k in generate(**kw)["fx_kpis"]:
        name = lab.get(k["valeur"], k["valeur"])
        if k["dimension"] == "mobilité":
            txt = (f"Distance moyenne domicile-chantier {k['moyenne']} km, rayon déclaré moyen "
                   f"{k['rayon_moyen_declare']} km, {k['part_avec_vehicule'] * 100:.0f} % véhiculés")
        else:
            txt = (f"{k['dimension']} {name} : couverture {k['taux_couverture']}, délai moyen "
                   f"{k['delai_moyen_placement_j']} j, {k['candidats_disponibles']} candidats disponibles")
        out.append(_rec("fx_kpis", k, kind=k["dimension"], date_=date.today().isoformat(), title=name, text=txt))
    return out
