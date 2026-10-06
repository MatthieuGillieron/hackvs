"""MétéoSuisse Open Data : mesures réelles des stations automatiques (SwissMetNet).

STAC : https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-smn
Fichiers : https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/{abbr}/ogd-smn_{abbr}_d_recent.csv
  (_d_ = journalier, _recent = depuis le 1er janvier ; aussi _m mensuel, _h horaire, _historical)
Métadonnées : ogd-smn_meta_stations.csv (canton, coordonnées), ogd-smn_meta_parameters.csv
Complément d'Open-Meteo (`meteo`) : ici l'observé, là-bas la prévision.
"""
from __future__ import annotations

import csv
import io
from datetime import date, datetime, timedelta

from ..core import http as _http
from ..core.record import record

BASE = "https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn"
PARAMS = {
    "tre200dx": "temp_max",
    "tre200dn": "temp_min",
    "rre150d0": "precip_mm",
    "htoautd0": "snow_depth_cm",
    "fkl010d1": "gust_max_ms",
}


def _csv(url: str, ttl: float) -> list[dict]:
    text = _http.get_text(url, ttl=ttl, encoding="latin-1")
    return list(csv.DictReader(io.StringIO(text), delimiter=";"))


def stations(canton: str = "VS") -> list[dict]:
    return [s for s in _csv(f"{BASE}/ogd-smn_meta_stations.csv", 30 * 86400) if s["station_canton"] == canton]


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def fetch(canton: str = "VS", days: int = 60) -> list[dict]:
    sts = stations(canton)
    print(f"  meteosuisse: {len(sts)} stations {canton}")
    since = date.today() - timedelta(days=days)

    def one(s):
        abbr = s["station_abbr"].lower()
        return s, _csv(f"{BASE}/{abbr}/ogd-smn_{abbr}_d_recent.csv", 6 * 3600)

    out = []
    for res in _http.pmap(one, sts, workers=6):
        if not res:
            continue
        s, rows = res
        for row in rows:
            d = datetime.strptime(row["reference_timestamp"][:10], "%d.%m.%Y").date()
            if d < since:
                continue
            vals = {name: _num(row.get(code)) for code, name in PARAMS.items()}
            out.append(record(
                "meteosuisse", f"{s['station_abbr']}-{d.isoformat()}",
                kind="mesure journalière",
                date=d.isoformat(),
                title=f"{s['station_name']} — {d.isoformat()}",
                text=f"{s['station_name']} ({s['station_height_masl']} m) {d.isoformat()} : "
                     + ", ".join(f"{k}={v}" for k, v in vals.items() if v is not None),
                url=f"{BASE}/{s['station_abbr'].lower()}/ogd-smn_{s['station_abbr'].lower()}_d_recent.csv",
                canton=canton,
                commune=s["station_name"],
                lat=_num(s["station_coordinates_wgs84_lat"]),
                lon=_num(s["station_coordinates_wgs84_lon"]),
                extra={"station": s["station_abbr"], "altitude": _num(s["station_height_masl"]),
                       "frost": (vals["temp_min"] is not None and vals["temp_min"] < 0), **vals},
            ))
    return out
