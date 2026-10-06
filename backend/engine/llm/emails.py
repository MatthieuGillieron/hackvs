"""Emails de prospection rédigés par LLM, pré-générés pour la démo (hors ligne).

Une alerte AGIR / PRÉPARER ciblant une entreprise -> un email court : le fait public déclencheur, 2–3 profils
du vivier (anonymisés), une proposition d'appel. Le LLM n'utilise que les faits fournis ; il liste ceux qu'il a
repris (traçabilité). Vivier, expéditrice et relation client sont FICTIFS -> `fictif: true`.

    python3 -m engine export && python3 -m engine.llm.emails [--limit 3] [--force]
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime

from ..config import WEB_DATA as OUT
from .extract import _env, call, pmap

SENDER = {"nom": "Julie Martin", "fonction": "Consultante", "agence": "Flexsis"}  # fictif

SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "objet": {"type": "string", "description": "Objet de l'email, 70 caractères max."},
        "corps": {"type": "string", "description": "Corps complet avec salutation et signature, sauts de ligne \\n."},
        "faits_utilises": {"type": "array", "items": {"type": "string"},
                           "description": "Faits de la fiche repris dans l'email, recopiés tels quels."},
    },
    "required": ["objet", "corps", "faits_utilises"],
}

PROMPT = """Tu rédiges un email de prospection pour une consultante d'une agence de travail temporaire du bâtiment
en Valais. Règles :
- Langue demandée dans la fiche ; vouvoiement ; ton direct, cordial, professionnel suisse ; 120 mots max.
- Ouvre sur UN fait public de la fiche (adjudication, mise à l'enquête, annonce d'emploi…) en une phrase naturelle
  et positive (félicitations pour un marché, intérêt pour un projet), sans donner l'impression de surveiller
  l'entreprise ni supposer à sa place qu'elle manque de personnel.
- Propose les profils fournis (métier, expérience, atouts, disponibilité), sans nom, sans tarif.
- Termine par une proposition concrète : un court appel cette semaine.
- N'invente aucun fait, chiffre, date, nom de contact ou projet absent de la fiche. Pas de « Madame, Monsieur X » :
  utilise « Madame, Monsieur » (ou « Sehr geehrte Damen und Herren »).
- Signature : nom, fonction, agence de l'expéditrice."""

LANG_DE = "Bezirk"  # districts du Haut-Valais -> email en allemand


def _ch(d: str | None) -> str:
    return f"{d[8:10]}.{d[5:7]}.{d[:4]}" if d and len(d) >= 10 else ""


def _profile(c: dict) -> str:
    bits = [c["metierLabel"].split(" / ")[0], f"{c['experience_ans']} ans d'expérience"]
    if c.get("certifications"):
        bits.append("certifications : " + ", ".join(c["certifications"]))
    if c.get("vehicule"):
        bits.append("véhiculé")
    bits.append(f"basé à {c['commune']}")
    bits.append(f"disponible dès le {_ch(c['disponible_des'])}" if c.get("disponible_des") else "disponible")
    return " · ".join(bits)


def facts(o: dict, cands: dict) -> dict:
    public = [s for s in o["signals"] if not s["fictif"]]
    public.sort(key=lambda s: ({"projet": 0, "recrutement": 1}.get(s["family"], 2), -(int((s["date"] or "0")[:4]))))
    profiles = [_profile(cands[i]) for i in (o["pool"]["disponibles"] + o["pool"]["bientot"])[:3] if i in cands]
    return {
        "langue": "allemand" if (o["district"] or "").startswith(LANG_DE) else "français",
        "entreprise": o["company"],
        "lieu": o.get("place") or o["district"] or "Valais",
        "metiers_concernes": o["metiers"][:4],
        "besoin_estime": f"{o['need'][0]:.0f} à {o['need'][2]:.0f} personnes en renfort",
        "faits_publics": [f"{_ch(s['date'])} — {s['label']}" for s in public[:5]],
        "deja_client": "historique" in o["families"],
        "profils_disponibles": profiles,
        "expeditrice": SENDER,
    }


def main(limit: int | None = None, force: bool = False) -> None:
    env = _env()
    opps = json.loads((OUT / "opportunities.json").read_text("utf-8"))
    cands = {c["id"]: c for c in json.loads((OUT / "candidates.json").read_text("utf-8"))}
    path = OUT / "emails.json"
    cache = json.loads(path.read_text("utf-8")) if path.exists() else {}

    targets = [o for o in opps if o["kind"] == "entreprise" and o["level"] in ("AGIR", "PRÉPARER")]
    jobs = []
    for o in targets:
        f = facts(o, cands)
        h = hashlib.sha1(json.dumps(f, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]
        if force or cache.get(o["key"], {}).get("hash") != h:
            jobs.append((o["key"], f, h))
    jobs = jobs[:limit] if limit else jobs
    print(f"emails : {len(targets)} alertes entreprise AGIR/PRÉPARER, {len(jobs)} à rédiger ({env.get('OPENAI_MODEL')})")

    def one(job):
        key, f, h = job
        mail = call(PROMPT, json.dumps(f, ensure_ascii=False, indent=1), SCHEMA, "email", env)
        return key, {**mail, "langue": f["langue"], "hash": h, "model": env.get("OPENAI_MODEL"),
                     "genere_le": datetime.now().isoformat(timespec="seconds"), "fictif": True}

    for res in pmap(one, jobs, workers=8):
        if res:
            cache[res[0]] = res[1]
    live = {o["key"] for o in targets}
    cache = {k: v for k, v in cache.items() if k in live}  # alertes disparues -> email retiré
    path.write_text(json.dumps(cache, ensure_ascii=False, indent=1), "utf-8")
    print(f"ok : {len(cache)} emails -> frontend/public/data/emails.json")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    main(a.limit, a.force)
