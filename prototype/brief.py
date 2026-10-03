"""Brief de la semaine (terminal) + export JSON.

    python3 -m prototype.brief            # top 10
    python3 -m prototype.brief -n 25 --zones
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from .scoring import LABELS, TODAY, build

OUT = Path(__file__).parent / "out"


def fmt(o, i: int) -> str:
    w0, w1 = o.window
    weeks = max(0, (w0 - TODAY).days) // 7
    when = "en cours / immédiat" if weeks == 0 else f"dans ~{weeks} sem."
    v = o.vivier
    lines = [
        f"#{i} {o.level:<10} {o.target} — "
        + (", ".join(LABELS.get(m, m) for m in o.metiers_all) if o.metiers_all else LABELS.get(o.metier, o.metier))
        + f"  [{o.district}]",
        f"   Familles  : {' + '.join(o.families)}",
        f"   Quand     : {when} ({w0.isoformat()} → {w1.isoformat()})",
        f"   Besoin    : renfort {o.need[0]}–{o.need[2]} (≈{o.need[1]})"
        + (f" · équipe estimée {o.team[0]:.0f}–{o.team[2]:.0f}" if o.team[1] else ""),
        f"   Vivier    : {v['disponibles']} dispo · {v['bientot']} bientôt · {v['anciens']} anciens · à sourcer {v['a_sourcer']}",
        "   Pourquoi  :",
    ]
    shown = Counter()
    for s in sorted(o.signals, key=lambda s: -s.weight):
        if shown[s.type] >= 2:
            continue
        shown[s.type] += 1
        lines.append(f"     - [{s.family}] {s.label}" + (f"\n       {s.url}" if s.url else ""))
    extra = len(o.signals) - sum(shown.values())
    if extra:
        lines.append(f"     … +{extra} autre(s) signal(aux)")
    if o.company is None:
        if o.probable_companies:
            best = o.probable_companies[0][1]
            conf = "élevée" if best >= .5 else "moyenne" if best >= .3 else "faible"
            lines.append(f"   Entreprises probables (antécédents dans la zone, confiance {conf}) : "
                         + ", ".join(f"{c} {p:.0%}" for c, p in o.probable_companies))
        else:
            lines.append("   Entreprises probables : aucune donnée → cibler les clients Flexsis du district")
    lines.append(f"   Action    : {o.action}")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-n", type=int, default=10)
    ap.add_argument("--zones", action="store_true", help="inclure les opportunités de zone dans le top")
    ap.add_argument("--fictional-clients", action="store_true", help="clients fictifs (pas de noms réels)")
    ap.add_argument("--key", choices=["entreprise_metier", "entreprise"], default="entreprise")
    ap.add_argument("--no-zone-context", action="store_true", help="ne pas transmettre la tension de zone aux entreprises")
    args = ap.parse_args()

    opps, _ = build(real_clients=not args.fictional_clients, key_mode=args.key, zone_context=not args.no_zone_context)
    lv = Counter(o.level for o in opps)
    agir = [o for o in opps if o.level == "AGIR"]
    print(f"BRIEF FlexRadar — semaine du {TODAY.isoformat()}   (historique client et vivier = DONNÉES FICTIVES)")
    print(f"Opportunités : {len(opps)}  ·  AGIR {lv['AGIR']}  ·  PRÉPARER {lv['PRÉPARER']}  ·  SURVEILLER {lv['SURVEILLER']}")
    print(f"Postes anticipés (AGIR+PRÉPARER) : {sum(o.need[1] for o in opps if o.level != 'SURVEILLER')}"
          f"  ·  à sourcer : {sum(o.vivier['a_sourcer'] for o in opps if o.level != 'SURVEILLER')}")
    print(f"Familles des AGIR : {Counter('+'.join(o.families) for o in agir).most_common(4)}\n")

    top = [o for o in opps if args.zones or o.company][: args.n]
    for i, o in enumerate(top, 1):
        print(fmt(o, i))
        print()

    OUT.mkdir(exist_ok=True)
    data = [{
        "level": o.level, "target": o.target, "company": o.company, "district": o.district, "metier": o.metier,
        "families": o.families, "window": [o.window[0].isoformat(), o.window[1].isoformat()],
        "need": o.need, "team": [round(x, 1) for x in o.team], "vivier": o.vivier, "action": o.action,
        "probable_companies": [{"company": c, "share": round(p, 2)} for c, p in o.probable_companies],
        "signals": [{"family": s.family, "type": s.type, "label": s.label, "url": s.url, "date": s.date,
                     "fictif": s.fictif} for s in o.signals],
    } for o in opps]
    (OUT / "opportunities.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), "utf-8")
    print(f"→ {len(data)} opportunités exportées dans {OUT / 'opportunities.json'}")


if __name__ == "__main__":
    main()
