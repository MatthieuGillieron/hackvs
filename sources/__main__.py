"""CLI.

    python -m sources list                      # sources + état des snapshots
    python -m sources check                     # 1 appel léger par source : l'API répond-elle ?
    python -m sources stats                     # qualité des snapshots (volume, fraîcheur, champs remplis)
    python -m sources fetch all                 # rafraîchit tout (paramètres par défaut)
    python -m sources fetch simap jobroom --days 30 --canton VS
    python -m sources fetch all --offline       # reconstruit depuis le cache, zéro réseau
    python -m sources show permis_construire -n 3
    python -m sources rubrics VS                # rubriques Amtsblatt d'un canton (+ FOSC)
"""
from __future__ import annotations

import argparse
import inspect
import json
import os
import sys
import time

from . import SOURCES, amtsblatt, jobroom, load, path, simap
from . import fetch as fetch_source
from ._http import get_json, get_text


def cmd_list(_):
    for name, (_fn, desc) in SOURCES.items():
        if path(name).exists():
            meta = load(name, with_meta=True)
            state = f"{meta['count']:>5} records · {meta['fetched_at']}"
        else:
            state = "    — pas encore récupéré"
        print(f"{name:<18} {state:<40} {desc}")


def cmd_check(_):
    from . import _http
    os.environ.pop("SOURCES_OFFLINE", None)
    _http.FORCE_REFRESH = True
    checks = {
        "amtsblatt": lambda: amtsblatt.search(sub_rubrics=("BA-VS05",), max_items=1) and "ok",
        "simap": lambda: simap.search(max_items=1) and "ok",
        "jobroom": lambda: jobroom.search(days=7, max_items=1) and "ok",
        "flexsis": lambda: "offres-emploi" in get_text("https://www.flexsis.ch/offres-emploi-valais/", ttl=0) and "ok",
        "meteo": lambda: get_json("https://api.open-meteo.com/v1/forecast",
                                  {"latitude": 46.23, "longitude": 7.36, "daily": "temperature_2m_max"}, ttl=0) and "ok",
        "communes": lambda: get_json("https://api3.geo.admin.ch/rest/services/api/SearchServer",
                                     {"searchText": "Sion", "type": "locations", "origins": "gg25"}, ttl=0) and "ok",
        "jobup": lambda: get_json("https://www.jobup.ch/api/v1/public/search", {"location": "Valais", "rows": 1},
                                  ttl=0).get("documents") and "ok",
        "zefix": lambda: get_json("https://www.zefix.ch/ZefixREST/api/v1/firm/search.json", method="POST", ttl=0,
                                  json_body={"name": "Weibel", "searchType": "exact", "maxEntries": 1}).get("list") and "ok",
        "stattab": lambda: get_json("https://www.pxweb.bfs.admin.ch/api/v1/fr/px-x-1003020000_101/px-x-1003020000_101.px",
                                    ttl=0).get("variables") and "ok",
        "meteosuisse": lambda: "station_abbr" in get_text(
            "https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/ogd-smn_meta_stations.csv", ttl=0)[:200] and "ok",
        "openholidays": lambda: get_json("https://openholidaysapi.org/PublicHolidays", {
            "countryIsoCode": "CH", "subdivisionCode": "CH-VS", "validFrom": "2026-01-01", "validTo": "2026-12-31"},
            ttl=0) and "ok",
        "nouvelliste": lambda: "<urlset" in get_text("https://www.lenouvelliste.ch/news-sitemap.xml", ttl=0)[:500] and "ok",
        "canal9": lambda: "<rss" in get_text("https://canal9.ch/feed/", ttl=0)[:300] and "ok",
        "rhonefm": lambda: "/valais/" in get_text("https://www.rhonefm.ch/valais/", ttl=0) and "ok",
        "vs.ch": lambda: "com-et-media" in get_text("https://www.vs.ch/fr/web/communication", ttl=0) and "ok",
        "arbeit.swiss": lambda: "liste des genres" in get_text(
            "https://www.arbeit.swiss/fr/employeurs/obligation-dannoncer-les-postes-vacants", ttl=0).lower() and "ok",
    }
    bad = 0
    for name, fn in checks.items():
        t = time.time()
        try:
            res = fn() or "réponse vide"
        except Exception as e:
            res, bad = f"ÉCHEC : {e}", bad + 1
        print(f"{name:<10} {res}  ({time.time() - t:.1f}s)")
    sys.exit(1 if bad else 0)


def cmd_fetch(args):
    if args.offline:
        os.environ["SOURCES_OFFLINE"] = "1"
    names = list(SOURCES) if "all" in args.names else args.names
    for name in names:
        if name not in SOURCES:
            sys.exit(f"source inconnue : {name} (voir `python -m sources list`)")
        fn, _ = SOURCES[name]
        accepted = inspect.signature(fn).parameters
        kwargs = {k: v for k, v in (("days", args.days), ("canton", args.canton)) if v is not None and k in accepted}
        t = time.time()
        print(f"→ {name} {kwargs or ''}")
        try:
            recs = fetch_source(name, **kwargs)
            print(f"  ✓ {len(recs)} records → {path(name)} ({time.time() - t:.0f}s)")
        except Exception as e:
            print(f"  ✗ {name} : {e}")


# Fraîcheur attendue (jours sans nouvelle publication avant alerte) ; None = statistique/statique.
FRESHNESS = {"fosc_capital": 30, "penurie": None, "hesta": None, "construction_ofs": None, "emplois_ofs": None,
             "salaires": None, "places_vacantes": None, "calendrier": None, "communes": None, "metiers": None}
NO_URL = {"metiers", "calendrier"}  # + toutes les sources fx_* (données internes fictives)


def cmd_stats(_):
    """Qualité des snapshots : volume, fraîcheur, taux de remplissage des champs clés."""
    from datetime import date, datetime

    fields = ("text", "url", "date", "company", "commune", "bfs", "lat")
    print(f"{'source':<18} {'records':>7}  {'dernière pub.':<13} {'âge snap.':<9} "
          + " ".join(f"{f:>7}" for f in fields) + "  alertes")
    for name in SOURCES:
        if not path(name).exists():
            print(f"{name:<18} {'—':>7}  pas de snapshot -> python -m sources fetch {name}")
            continue
        meta = load(name, with_meta=True)
        recs = meta["records"]
        n = len(recs) or 1
        pct = {f: 100 * sum(1 for r in recs if r.get(f) not in (None, "", [])) / n for f in fields}
        dates = sorted(r["date"] for r in recs if r.get("date"))
        last = dates[-1] if dates else "—"
        age_h = (datetime.now() - datetime.fromisoformat(meta["fetched_at"])).total_seconds() / 3600
        alerts = []
        if not recs:
            alerts.append("VIDE")
        fresh = None if name.startswith("fx_") else FRESHNESS.get(name, 7)
        if fresh and dates and (date.today() - date.fromisoformat(last[:10])).days > fresh:
            alerts.append(f"rien depuis {fresh} j")
        if pct["text"] < 95:
            alerts.append("text manquant")
        if pct["url"] < 95 and name not in NO_URL and not name.startswith("fx_"):
            alerts.append("url manquante")
        if age_h > 48:
            alerts.append("snapshot > 48 h")
        print(f"{name:<18} {len(recs):>7}  {last[:10]:<13} {age_h:>6.1f} h  "
              + " ".join(f"{pct[f]:>6.0f}%" for f in fields) + "  " + (", ".join(alerts) or "ok"))


def cmd_show(args):
    for r in load(args.name)[: args.n]:
        print(json.dumps(r, ensure_ascii=False, indent=1)[:3000])
        print("-" * 60)


def cmd_rubrics(args):
    tenants = {f"kab{args.canton.lower()}", "shab"}
    for r in amtsblatt.rubrics():
        if r["tenantId"] in tenants:
            print(f"{r['code']:<8} {r['name']['fr']}")
            for s in r["subRubrics"]:
                print(f"   {s['code']:<10} {s['name']['fr']}")


def main():
    p = argparse.ArgumentParser(prog="python -m sources", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list").set_defaults(func=cmd_list)
    sub.add_parser("check").set_defaults(func=cmd_check)
    sub.add_parser("stats").set_defaults(func=cmd_stats)
    f = sub.add_parser("fetch")
    f.add_argument("names", nargs="+")
    f.add_argument("--days", type=int)
    f.add_argument("--canton")
    f.add_argument("--offline", action="store_true")
    f.set_defaults(func=cmd_fetch)
    s = sub.add_parser("show")
    s.add_argument("name")
    s.add_argument("-n", type=int, default=2)
    s.set_defaults(func=cmd_show)
    r = sub.add_parser("rubrics")
    r.add_argument("canton", nargs="?", default="VS")
    r.set_defaults(func=cmd_rubrics)
    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
