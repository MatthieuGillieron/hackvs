"""Extraction LLM : texte brut d'une publication -> fiche structurée, citée, mise en cache.

Le LLM ne décide rien : il lit le texte et remplit une fiche (type de projet, ampleur, corps de métier,
entreprise qui exécute…) avec la phrase du texte qui le justifie. Niveaux, volumes et fenêtres restent
calculés par signals.py / scoring.py à partir de ces faits et des ASSUMPTIONS.

Cache : sources/_data/llm/<source>.json, indexé par id + empreinte du texte (versionné -> démo hors ligne).

    python3 -m prototype.extract permis [--limit 40] [--sample] [--force]
    python3 -m prototype.extract eval   [--limit 40]      # compare LLM vs regex sur les permis en cache
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import threading
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

from sources import load
from sources._http import DATA_DIR, pmap

ROOT = Path(__file__).resolve().parent.parent
LLM_DIR = DATA_DIR / "llm"
SCHEMA_VERSION = 2

BTP_METIERS = ["macon", "coffreur", "ferrailleur", "manoeuvre", "grutier", "machiniste", "charpentier", "menuisier",
               "electricien", "sanitaire", "chauffage", "ventilation", "peintre", "platrier", "carreleur", "couvreur",
               "isoleur", "echafaudeur", "serrurier", "chef_chantier", "paysagiste"]


def _env() -> dict:
    env = {}
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text("utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return {**env, **{k: v for k, v in os.environ.items() if k.startswith("OPENAI_")}}


# ------------------------------------------------------------------ PERMIS

PERMIS_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "resume": {"type": "string", "description": "Résumé du projet en français, 80 caractères max."},
        "type_projet": {"type": "string", "enum": [
            "construction_neuve", "renovation_transformation", "agrandissement", "demolition_reconstruction",
            "infrastructure_genie_civil", "installation_technique", "amenagement_exterieur", "autre"]},
        "ampleur": {"type": "string", "enum": ["mineur", "villa", "moyen", "grand"],
                    "description": "mineur = PAC, panneaux solaires, antenne, enseigne, abri, clôture, piscine, "
                                   "fenêtres… ; villa = maison individuelle ou chalet ; moyen = petit immeuble "
                                   "(2–5 logements), commerce, rénovation lourde d'un bâtiment ; grand = 6+ logements, "
                                   "plusieurs immeubles, halle, hôtel, école, EMS, bâtiment industriel."},
        "certitude": {"type": "string", "enum": ["haute", "faible"],
                      "description": "faible si le texte est trop vague pour juger l'ampleur (ex. « Umbau » seul)."},
        "logements": {"type": ["integer", "null"], "description": "Nombre de logements créés si indiqué."},
        "batiment": {"type": "string", "description": "Ce qui est construit / transformé, en français, court."},
        "corps_de_metier": {"type": "array", "items": {"type": "string", "enum": BTP_METIERS},
                            "description": "Tous les métiers d'exécution que ces travaux mobiliseront, sur l'ensemble du "
                                           "chantier (une construction neuve mobilise gros œuvre, toiture, technique "
                                           "et finitions). Vide seulement pour un projet mineur."},
        "entreprise_travaux": {"type": ["string", "null"],
                               "description": "Entreprise de construction qui exécute (entreprise générale, "
                                              "maçonnerie, charpente…) si nommée. Jamais un promoteur, une "
                                              "société immobilière, un bureau d'architecte ou d'ingénieurs, "
                                              "ni un particulier."},
        "modification": {"type": "boolean",
                         "description": "Modification / régularisation d'un projet déjà mis à l'enquête."},
        "genere_emploi": {"type": "boolean",
                          "description": "Le chantier mobilise une équipe d'ouvriers du bâtiment pendant "
                                         "plusieurs semaines (pas une simple pose d'équipement)."},
        "preuve": {"type": "string", "description": "Extrait exact du texte qui justifie type et ampleur."},
    },
    "required": ["resume", "type_projet", "ampleur", "certitude", "logements", "batiment", "corps_de_metier",
                 "entreprise_travaux", "modification", "genere_emploi", "preuve"],
}

PERMIS_PROMPT = """Tu analyses des mises à l'enquête publique (permis de construire) du Bulletin officiel du Valais,
en français ou en allemand, pour une agence d'intérim du bâtiment. Remplis la fiche en t'appuyant uniquement
sur le texte : n'invente rien, mets null si l'information est absente. En cas de doute sur l'ampleur, choisis
la plus petite plausible et mets certitude = faible. Réponds en français."""


def _permis_input(r: dict) -> str:
    return (r["text"] or r["title"] or "")[:3000]


TASKS = {
    "permis": {"source": "permis_construire", "schema": PERMIS_SCHEMA, "prompt": PERMIS_PROMPT, "input": _permis_input},
}


# ------------------------------------------------------------------ appel + cache

def _hash(s: str) -> str:
    return hashlib.sha1(f"{SCHEMA_VERSION}|{s}".encode()).hexdigest()[:12]


def call(system: str, user: str, schema: dict, name: str, env: dict) -> dict:
    body = {
        "model": env.get("OPENAI_MODEL") or "gpt-4.1-mini",
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "response_format": {"type": "json_schema", "json_schema": {"name": name, "strict": True, "schema": schema}},
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions", json.dumps(body).encode(),
        {"Authorization": f"Bearer {env['OPENAI_API_KEY']}", "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.load(resp)
            return json.loads(data["choices"][0]["message"]["content"])
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 3:
                threading.Event().wait(2 ** attempt * 3)
                continue
            raise RuntimeError(f"OpenAI {e.code}: {e.read().decode()[:300]}") from None


def cache_path(task: str) -> Path:
    return LLM_DIR / f"{task}.json"


def load_cache(task: str) -> dict:
    p = cache_path(task)
    return json.loads(p.read_text("utf-8"))["items"] if p.exists() else {}


def save_cache(task: str, items: dict, model: str) -> None:
    LLM_DIR.mkdir(parents=True, exist_ok=True)
    cache_path(task).write_text(json.dumps({
        "task": task, "schema_version": SCHEMA_VERSION, "model": model,
        "updated_at": datetime.now().isoformat(timespec="seconds"), "count": len(items), "items": items,
    }, ensure_ascii=False, indent=1), "utf-8")


def extracted(task: str) -> dict:
    """id -> fiche, pour les enregistrements dont le texte n'a pas changé depuis l'extraction."""
    t = TASKS[task]
    cache = load_cache(task)
    out = {}
    for r in load(t["source"]):
        c = cache.get(r["id"])
        if c and c["hash"] == _hash(t["input"](r)):
            out[r["id"]] = c["data"]
    return out


def run(task: str, limit: int | None = None, sample: bool = False, force: bool = False, workers: int = 8) -> None:
    env = _env()
    if not env.get("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY manquant (fichier .env à la racine)")
    t = TASKS[task]
    records = load(t["source"])
    if sample:
        random.Random(7).shuffle(records)
    cache = load_cache(task)
    todo = [r for r in records if force or cache.get(r["id"], {}).get("hash") != _hash(t["input"](r))]
    if limit:
        todo = todo[:limit]
    print(f"{task} : {len(records)} enregistrements, {len(todo)} à extraire ({env.get('OPENAI_MODEL')})")
    lock = threading.Lock()
    done = [0]

    def one(r):
        data = call(t["prompt"], t["input"](r), t["schema"], task, env)
        with lock:
            cache[r["id"]] = {"hash": _hash(t["input"](r)), "data": data}
            done[0] += 1
            if done[0] % 25 == 0:
                save_cache(task, cache, env.get("OPENAI_MODEL"))
                print(f"  {done[0]}/{len(todo)}")
        return data

    res = pmap(one, todo, workers=workers)
    save_cache(task, cache, env.get("OPENAI_MODEL"))
    print(f"ok : {sum(x is not None for x in res)}/{len(todo)} extraits -> {cache_path(task).relative_to(ROOT)}")


# ------------------------------------------------------------------ évaluation vs regex

LLM_TO_CLASS = {"mineur": None, "villa": "villa", "moyen": "moyen", "grand": "grand"}


def evaluate(limit: int = 40) -> None:
    from collections import Counter

    from prototype import signals as S
    llm = extracted("permis")
    recs = [r for r in load("permis_construire") if r["id"] in llm][:limit]
    agree, rows = 0, []
    for r in recs:
        project = r["extra"].get("project") or r["title"]
        rx = S.permit_class(project)
        f = llm[r["id"]]
        lc = LLM_TO_CLASS[f["ampleur"]]
        if f["type_projet"] in ("renovation_transformation", "agrandissement") and lc in ("moyen", "grand"):
            lc = "renovation"
        rx_contractor = S.named_contractor(r)
        same = rx == lc
        agree += same
        rows.append((same, rx, lc, f, project, rx_contractor, r))
    print(f"{len(recs)} permis comparés — classe identique : {agree}/{len(recs)}\n")
    print("Écarts (regex -> LLM) :", Counter((rx, lc) for same, rx, lc, *_ in rows if not same).most_common())
    for same, rx, lc, f, project, rxc, r in rows:
        if same and not (f["entreprise_travaux"] and f["entreprise_travaux"] != rxc):
            continue
        print(f"\n[{r['extra'].get('language')}] {project[:110]}")
        print(f"  regex : {rx!s:10} | LLM : {lc!s:10} ({f['type_projet']}, {f['ampleur']}, {f['certitude']}, emploi={f['genere_emploi']})")
        print(f"  LLM   : {f['resume']} · métiers={','.join(f['corps_de_metier']) or '-'}")
        if f["entreprise_travaux"] or rxc:
            print(f"  entreprise : regex={rxc} | LLM={f['entreprise_travaux']}")
        print(f"  preuve : « {f['preuve'][:120]} »")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("task", choices=[*TASKS, "eval"])
    ap.add_argument("--limit", type=int)
    ap.add_argument("--sample", action="store_true", help="ordre aléatoire (graine fixe)")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--workers", type=int, default=8)
    a = ap.parse_args()
    if a.task == "eval":
        evaluate(a.limit or 40)
    else:
        run(a.task, a.limit, a.sample, a.force, a.workers)
