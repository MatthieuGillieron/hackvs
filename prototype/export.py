"""Export des données pour le front (web/public/data/*.json).

    python3 -m prototype.export

Fichiers produits :
  meta.json           date, utilisateur (fictif), météo du jour
  opportunities.json  les fiches (niveau, familles, raisons + sources, besoin, vivier, action)
  candidates.json     vivier (FICTIF)
  clients.json        clients (FICTIF) + nombre d'alertes en cours
  sources.json        état des sources (volume, fraîcheur, remplissage)
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import date, datetime
from pathlib import Path

from sources import SOURCES, load, path
from sources.metiers import by_id

from .scoring import LEVELS, TODAY, build
from .signals import norm_company

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
LABELS = {k: v["label"] for k, v in by_id().items()}
USER = {"name": "Julie Martin", "role": "Consultante", "initials": "JM", "fictif": True}


def _write(name: str, data) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False), "utf-8")
    print(f"  ✓ {name}.json")


def opportunities(opps) -> list[dict]:
    rows = []
    for i, o in enumerate(opps):
        sigs = sorted(o.signals, key=lambda s: (s.fictif, -s.weight))
        rows.append({
            "id": i,
            "level": o.level,
            "levelPublic": o.level_public,
            "kind": "entreprise" if o.company else "zone",
            "target": o.target,
            "company": o.company,
            "district": o.district,
            "metiers": [LABELS.get(m, m) for m in (o.metiers_all or [o.metier])],
            "families": o.families,
            "window": [o.window[0].isoformat(), o.window[1].isoformat()],
            "weeks": max(0, (o.window[0] - TODAY).days) // 7,
            "need": list(o.need),
            "team": [round(x, 1) for x in o.team],
            "vivier": o.vivier,
            "action": o.action,
            "probable": [{"company": c, "share": round(p, 2)} for c, p in o.probable_companies],
            "signals": [{
                "family": s.family, "type": s.type, "label": s.label, "url": s.url, "date": s.date,
                "fictif": s.fictif, "window": [s.window[0].isoformat(), s.window[1].isoformat()],
                "phase": s.meta.get("phase"),
            } for s in sigs],
        })
    return rows


def candidates(fx) -> list[dict]:
    return [{**c, "metierLabel": LABELS.get(c["metier"], c["metier"]),
             "metiersSecondaires": [LABELS.get(m, m) for m in c["metiers_secondaires"]], "fictif": True}
            for c in fx["fx_candidats"]]


def clients(fx, opps) -> list[dict]:
    alerts = defaultdict(list)
    for o in opps:
        if o.company and o.level != "SURVEILLER":
            alerts[norm_company(o.company)].append(o.level)
    last_contact = {}
    for c in fx["fx_contacts"]:
        if c["date"] > last_contact.get(c["client_id"], {}).get("date", ""):
            last_contact[c["client_id"]] = c
    out = []
    for c in fx["fx_clients"]:
        lv = alerts.get(norm_company(c["name"]), [])
        lc = last_contact.get(c["id"])
        out.append({**c, "metiers": [LABELS.get(m, m) for m in c["metiers"]],
                    "alerts": len(lv), "bestLevel": min(lv, key=LEVELS.index) if lv else None,
                    "lastContact": {"date": lc["date"], "type": lc["type"], "objet": lc["objet"]} if lc else None,
                    "fictif": True})
    return out


def sources_status() -> list[dict]:
    out = []
    for name, (_fn, desc) in SOURCES.items():
        if not path(name).exists():
            out.append({"name": name, "description": desc, "count": 0, "status": "absent"})
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
                    "status": "vide" if not recs else "ancien" if age_h > 48 else "ok"})
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
    _write("sources", sources_status())


if __name__ == "__main__":
    main()
