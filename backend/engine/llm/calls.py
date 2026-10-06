"""Fiches « Préparer l'appel » : faits de l'alerte + guide d'appel rédigé par LLM, pré-générés pour la démo.

Pour chaque alerte AGIR / PRÉPARER : qui appeler (entreprise, ou entreprises probables d'une zone), pourquoi
maintenant (signaux publics), relation Flexsis (missions, dernier contact, demandes non pourvues), concurrence
(agences qui recrutent les mêmes métiers dans le district), délais de placement par métier, puis un guide :
accroche, questions de découverte, objections probables, prochaine étape. Le LLM n'utilise que ces faits.
Relation, contacts, vivier et KPIs sont FICTIFS (`fictif: true`).

    python3 -m engine export && python3 -m engine.llm.calls [--limit 3] [--force]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from collections import defaultdict
from datetime import date, datetime, timedelta

from sources import communes, flexsis_fictif, load

from ..config import TODAY
from ..signals import norm_company
from .emails import LANG_DE, OUT, SENDER, _ch
from .extract import _env, call, pmap

# Contacts FICTIFS : noms génériques tirés d'une liste, téléphone en 027 000 … (préfixe non attribué).
PRENOMS_FR = ["Laurent", "Nathalie", "Stéphane", "Sandrine", "Pascal", "Valérie", "Nicolas", "Sophie", "David", "Carole"]
NOMS_FR = ["Rey", "Fournier", "Bonvin", "Michellod", "Rudaz", "Pralong", "Carron", "Favre", "Gay", "Délèze"]
PRENOMS_DE = ["Thomas", "Andrea", "Martin", "Sandra", "Daniel", "Claudia", "Stefan", "Nicole", "Marco", "Corinne"]
NOMS_DE = ["Imboden", "Zenklusen", "Kalbermatten", "Schmid", "Imstepf", "Heinzmann", "Lehner", "Truffer", "Seiler"]
FONCTIONS = ["Conducteur de travaux", "Responsable RH", "Chef de chantier", "Directeur technique"]

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "objectif": {"type": "string", "description": "Objectif de l'appel, 12 mots max."},
        "duree_min": {"type": "integer", "description": "Durée réaliste de l'appel en minutes (3 à 8)."},
        "accroche": {"type": "string", "description": "35 mots max : se présenter, citer le projet public de "
                                                      "l'entreprise, dire qu'on a anticipé et qu'on a déjà des "
                                                      "profils prêts pour ce chantier."},
        "demander": {"type": "string", "description": "Qui demander au standard, 15 mots max."},
        "annonce_profils": {"type": "string", "description": "Transition orale avant de lister les profils, "
                                                             "20 mots max (« J'ai trois profils prêts pour… »)."},
        "pitch_profils": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "properties": {"id": {"type": "string"},
                           "pitch": {"type": "string", "description": "20 mots max, à dire au téléphone : pourquoi "
                                                                     "CE profil convient à CE projet (atouts fournis). "
                                                                     "Sans nom ni tarif."}},
            "required": ["id", "pitch"]},
            "description": "Un pitch par profil prêt, dans l'ordre de la fiche (même id)."},
        "questions": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "properties": {
                "question": {"type": "string", "description": "15 mots max, telle qu'on la pose."},
                "pourquoi": {"type": "string", "description": "20 mots max : ce qu'on cherche à savoir et le fait "
                                                              "de la fiche qui la justifie."},
                "a_noter": {"type": "string", "description": "12 mots max : l'info précise à noter."}},
            "required": ["question", "pourquoi", "a_noter"]},
            "description": "3 questions, pour ajuster les profils au besoin réel."},
        "objections": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "properties": {"objection": {"type": "string"},
                           "reponse": {"type": "string", "description": "25 mots max, appuyée sur un fait."}},
            "required": ["objection", "reponse"]},
            "description": "2 ou 3 objections probables pour cette entreprise."},
        "prochaine_etape": {"type": "string", "description": "Conclusion orale, 30 mots max : proposer d'envoyer "
                                                             "les profils par email aujourd'hui (ou de les réserver)."},
        "email_profils": {
            "type": "object", "additionalProperties": False,
            "properties": {"objet": {"type": "string", "description": "60 caractères max."},
                           "corps": {"type": "string", "description": "90 mots max, dans la langue de l'entreprise, "
                                                                     "vouvoiement : rappel de l'échange, profils "
                                                                     "listés (atouts, sans nom, sans identifiant, sans tarif), "
                                                                     "suite. "
                                                                     "Signature de l'expéditrice."}},
            "required": ["objet", "corps"],
            "description": "Email à envoyer juste après l'appel si l'interlocuteur est intéressé."},
        "faits_utilises": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["objectif", "duree_min", "accroche", "demander", "annonce_profils", "pitch_profils", "questions",
                 "objections", "prochaine_etape", "email_profils", "faits_utilises"],
}

PROMPT = """Tu prépares un appel pour une consultante d'une agence de travail temporaire du bâtiment en Valais.
Posture : ce n'est PAS du démarchage (« nous sommes la meilleure agence »). La consultante a vu le projet de
l'entreprise, a anticipé son besoin et a DÉJÀ sélectionné des profils prêts pour ce chantier. Le message :
« j'ai pensé à vous, vous n'aurez pas à chercher dans l'urgence ». Personnel, concret, rassurant.
Style : oral, phrases courtes, aucun jargon commercial, respecte strictement les limites de mots.
- Appuie chaque pitch de profil sur ses atouts pour CE projet (distance au chantier, disponibilité avant le
  démarrage, missions déjà faites chez ce client, certification, expérience).
- Pour une zone : l'appel vise l'entreprise probable indiquée, parle du projet de la zone.
- Guide en français ; l'email dans la langue de l'entreprise.
- N'invente aucun fait, chiffre, nom ou date absent de la fiche. Pas de tarif."""


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    (la1, lo1), (la2, lo2) = [(math.radians(x), math.radians(y)) for x, y in (a, b)]
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre",
        "décembre"]


def _oral(d: str) -> str:
    """2026-10-03 -> « 3 octobre » (dates dites au téléphone)."""
    return f"{int(d[8:10])} {MOIS[int(d[5:7]) - 1]}"


def match_profiles(o: dict, cands: dict, missions: list[dict], site: tuple[float, float] | None,
                   company: str | None, today: str, n: int = 4) -> list[dict]:
    """Profils du vivier classés pour CE projet ; chaque profil garde ses atouts concrets (faits, pas de score)."""
    wanted = set(o["metiers"])
    start = o["window"][0]
    ncomp = norm_company(company) if company else None
    scored = []
    # vivier du moteur (métier principal) + candidats disponibles des autres métiers de l'alerte
    ids = list(dict.fromkeys(o["pool"]["disponibles"] + o["pool"]["bientot"] + [
        c["id"] for c in cands.values() if c["metierLabel"] in wanted and c["statut"] == "disponible"
        and (not c.get("disponible_des") or c["disponible_des"] <= o["window"][1])]))
    for cid in ids:
        c = cands.get(cid)
        if not c:
            continue
        atouts, score = [], 0.0
        main = c["metierLabel"] in wanted
        score += 3 if main else 1
        atouts.append(c["metierLabel"].split(" / ")[0] + ("" if main else " (métier secondaire)"))
        atouts.append(f"{c['experience_ans']} ans d'expérience")
        score += min(c["experience_ans"], 20) / 10
        if site and c.get("lat") is not None:
            d = _km(site, (c["lat"], c["lon"]))
            if d <= c["rayon_km"]:
                score += 2 - d / 50
                atouts.append(f"habite à {d:.0f} km du chantier ({c['commune']})" if d >= 3 else f"habite sur place ({c['commune']})")
        dispo = c.get("disponible_des")
        if not dispo or dispo <= today:
            score += 2
            atouts.append("disponible tout de suite")
        elif dispo <= start:
            score += 2
            atouts.append(f"disponible dès le {_oral(dispo)}, avant le démarrage")
        else:
            atouts.append(f"disponible dès le {_oral(dispo)}")
        if ncomp:
            here = [m for m in missions if m["candidat_id"] == cid and norm_company(m["client"]) == ncomp]
            if here:
                score += 3
                notes = [m["evaluation_client"] for m in here if m.get("evaluation_client")]
                avg = sum(notes) / len(notes) if notes else None
                atouts.append(f"déjà {len(here)} mission{'s' if len(here) > 1 else ''} chez {company}"
                              + (f" (note {avg:.1f}/5)".replace(".", ",") if avg and avg >= 4 else ""))
        if c.get("certifications"):
            score += 0.5
            atouts.append(", ".join(c["certifications"]))
        if c.get("vehicule"):
            atouts.append("véhiculé")
        scored.append((score, c["metierLabel"], {"id": cid, "atouts": atouts}))
    scored.sort(key=lambda x: -x[0])
    # le meilleur profil de chaque métier recherché d'abord (dans l'ordre de l'alerte), puis les meilleurs restants
    picked, seen = [], set()
    for m in o["metiers"]:
        best = next((x for x in scored if x[1] == m), None)
        if best and len(picked) < n:
            picked.append(best)
            seen.add(best[2]["id"])
    picked += [x for x in scored if x[2]["id"] not in seen][: n - len(picked)]
    picked.sort(key=lambda x: -x[0])
    return [p for _, _, p in picked]


def _contact(client: dict, german: bool) -> dict:
    h = int(hashlib.sha1(client["id"].encode()).hexdigest(), 16)
    pre, nom = (PRENOMS_DE, NOMS_DE) if german else (PRENOMS_FR, NOMS_FR)
    return {"nom": f"{pre[h % len(pre)]} {nom[(h >> 8) % len(nom)]}", "fonction": FONCTIONS[(h >> 16) % len(FONCTIONS)],
            "telephone": f"027 000 {(h >> 24) % 90 + 10:02d} {(h >> 32) % 90 + 10:02d}", "fictif": True}


def _relation(client: dict | None, fx: dict, today: date) -> dict | None:
    if not client:
        return None
    cid = client["id"]
    since_12m = (today - timedelta(days=365)).isoformat()
    missions = [m for m in fx["fx_missions"] if m["client_id"] == cid]
    notes = [m["evaluation_client"] for m in missions if m.get("evaluation_client")]
    contacts = sorted((c for c in fx["fx_contacts"] if c["client_id"] == cid), key=lambda c: c["date"])
    labels = {m["id"]: m["title"].split(" / ")[0] for m in load("metiers")}
    ratees = sorted((d for d in fx["fx_demandes"] if d["client_id"] == cid and d["statut"] in ("non pourvue", "partielle")
                     and d["date_demande"] >= (today - timedelta(days=730)).isoformat()),
                    key=lambda d: d["date_demande"], reverse=True)[:3]
    last = contacts[-1] if contacts else None
    return {
        "depuis": client["since"],
        "missions_12m": sum(m["debut"] >= since_12m for m in missions),
        "missions_total": len(missions),
        "note_moyenne": round(sum(notes) / len(notes), 1) if notes else None,
        "dernier_contact": {"date": last["date"], "type": last["type"], "objet": last["objet"],
                            "resultat": last["resultat"]} if last else None,
        "demandes_non_pourvues": [{"date": d["date_demande"], "metier": labels.get(d["metier"], d["metier"]),
                                   "postes": d["nb_postes"], "pourvus": d["nb_pourvus"],
                                   "perdu_face_a": d.get("perdu_face_a")} for d in ratees],
        "fictif": True,
    }


NOT_COMPETITOR = r"flexsis|interiman|jobup|job-room|jobroom|indeed|jobs\.ch|jobscout"


def _competitors(o: dict, zone_signals: dict) -> list[str]:
    names = set()
    for m in o["metiers"]:
        for s in zone_signals.get((o["district"], m), []):
            hit = re.match(r"Agence (.+?) recrute", s["label"])
            if hit and not re.search(NOT_COMPETITOR, hit[1], re.I):
                names.add(hit[1])
    return sorted(names)[:5]


def main(limit: int | None = None, force: bool = False) -> None:
    env = _env()
    opps = json.loads((OUT / "opportunities.json").read_text("utf-8"))
    meta = json.loads((OUT / "meta.json").read_text("utf-8"))
    today = date.fromisoformat(meta["today"])
    cands = {c["id"]: c for c in json.loads((OUT / "candidates.json").read_text("utf-8"))}
    fx = flexsis_fictif.generate(real_clients=True, ref=TODAY)
    clients = {norm_company(c["name"]): c for c in fx["fx_clients"]}
    label_to_id = {m["title"]: m["id"] for m in load("metiers")}
    kpis = {k["valeur"]: k for k in fx["fx_kpis"] if k["dimension"] == "métier"}

    zone_signals = defaultdict(list)  # (district, métier) -> signaux d'agences concurrentes
    for z in opps:
        if z["kind"] == "zone":
            for m in z["metiers"]:
                zone_signals[(z["district"], m)] += [s for s in z["signals"] if s["type"] == "agences_concurrentes"]

    path = OUT / "calls.json"
    cache = json.loads(path.read_text("utf-8")) if path.exists() else {}
    targets = [o for o in opps if o["level"] in ("AGIR", "PRÉPARER") and (o["kind"] == "entreprise" or o["probable"])]
    jobs = []
    for o in targets:
        german = (o["district"] or "").startswith(LANG_DE)
        public = [s for s in o["signals"] if not s["fictif"]]
        public.sort(key=lambda s: s["date"] or "", reverse=True)  # les plus récents d'abord
        if o["kind"] == "entreprise":
            client = clients.get(norm_company(o["company"]))
            appeler = [{"entreprise": o["company"], "part": None, "client": bool(client),
                        "contact": _contact(client, german) if client else None,
                        "relation": _relation(client, fx, today)}]
        else:
            appeler = []
            for p in o["probable"][:3]:
                client = clients.get(norm_company(p["company"]))
                appeler.append({"entreprise": p["company"], "part": p["share"], "client": bool(client),
                                "contact": _contact(client, german) if client else None,
                                "relation": _relation(client, fx, today)})
        hit = communes.lookup(o.get("place") or "")
        site = (hit["lat"], hit["lon"]) if hit and hit.get("lat") is not None else None
        facts = {
            "type": o["kind"], "cible": o["target"], "lieu": o.get("place") or o["district"],
            "langue_entreprise": "allemand" if german else "français",
            "niveau": o["level"], "metiers": o["metiers"][:4],
            "debut_besoin": f"entre le {_ch(o['window'][0])} et le {_ch(o['window'][1])}",
            "renfort_estime": f"{o['need'][0]:.0f} à {o['need'][2]:.0f} personnes (estimation)",
            "faits_publics": [{"date": s["date"], "texte": s["label"], "url": s["url"]} for s in public[:5]],
            "a_appeler": appeler,
            "agences_concurrentes": _competitors(o, zone_signals),
            "profils_prets": match_profiles(o, cands, fx["fx_missions"], site,
                                            appeler[0]["entreprise"] if appeler else None, meta["today"]),
            "delais_placement": [{"metier": m.split(" / ")[0],
                                  "delai_moyen_j": kpis[label_to_id[m]]["delai_moyen_placement_j"],
                                  "couverture": kpis[label_to_id[m]]["taux_couverture"]}
                                 for m in o["metiers"][:4] if label_to_id.get(m) in kpis],
            "expeditrice": SENDER,
        }
        h = hashlib.sha1(json.dumps(facts, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]
        if force or cache.get(o["key"], {}).get("hash") != h:
            jobs.append((o["key"], facts, h))
    jobs = jobs[:limit] if limit else jobs
    print(f"appels : {len(targets)} alertes AGIR/PRÉPARER, {len(jobs)} guides à rédiger ({env.get('OPENAI_MODEL')})")

    def one(job):
        key, facts, h = job
        guide = call(PROMPT, json.dumps(facts, ensure_ascii=False, indent=1), SCHEMA, "guide_appel", env)
        return key, {"faits": facts, "guide": guide, "hash": h, "model": env.get("OPENAI_MODEL"),
                     "genere_le": datetime.now().isoformat(timespec="seconds")}

    for res in pmap(one, jobs, workers=8):
        if res:
            cache[res[0]] = res[1]
    live = {o["key"] for o in targets}
    cache = {k: v for k, v in cache.items() if k in live}
    path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), "utf-8")
    print(f"ok : {len(cache)} fiches d'appel -> frontend/public/data/calls.json")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    main(a.limit, a.force)
