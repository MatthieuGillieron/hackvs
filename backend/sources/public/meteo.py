"""Météo : prévisions 16 jours via Open-Meteo (gratuit, sans clé, inclut les modèles MétéoSuisse).

https://api.open-meteo.com/v1/forecast
Un enregistrement par localité, avec la série journalière + indicateurs chantier
(jours de gel, fortes pluies, neige) qui retardent / déclenchent des travaux.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Optional

from ..core import http as _http
from ..core.record import record

URL = "https://api.open-meteo.com/v1/forecast"
DAILY = ["temperature_2m_max", "temperature_2m_min", "precipitation_sum", "snowfall_sum", "wind_gusts_10m_max"]

# Principales localités du Valais : (nom, n° OFS, lat, lon)
VS_TOWNS = [
    ("Monthey", 6153, 46.255, 6.954), ("Martigny", 6136, 46.102, 7.073), ("Sion", 6266, 46.233, 7.360),
    ("Sierre", 6248, 46.292, 7.535), ("Visp", 6297, 46.294, 7.882), ("Brig-Glis", 6002, 46.316, 7.988),
    ("Val de Bagnes", 6037, 46.083, 7.217), ("Crans-Montana", 6253, 46.311, 7.481),
    ("Zermatt", 6300, 46.020, 7.749), ("Conthey", 6023, 46.224, 7.302),
]


def fetch(towns: Optional[Sequence[tuple]] = None, days: int = 16) -> list[dict]:
    towns = towns or VS_TOWNS
    d = _http.get_json(URL, {
        "latitude": ",".join(str(t[2]) for t in towns),
        "longitude": ",".join(str(t[3]) for t in towns),
        "daily": ",".join(DAILY),
        "forecast_days": days,
        "timezone": "Europe/Zurich",
    }, ttl=3 * 3600)
    results = d if isinstance(d, list) else [d]
    out = []
    for (name, bfs, lat, lon), r in zip(towns, results):
        daily = r["daily"]
        days_ = [dict(zip(daily.keys(), vals)) for vals in zip(*daily.values())]
        frost = [x["time"] for x in days_ if (x["temperature_2m_min"] or 0) < 0]
        rain = [x["time"] for x in days_ if (x["precipitation_sum"] or 0) >= 10]
        snow = [x["time"] for x in days_ if (x["snowfall_sum"] or 0) >= 1]
        out.append(record(
            "meteo", bfs,
            kind="forecast",
            date=days_[0]["time"],
            title=f"Prévisions {days} jours — {name}",
            text=(f"{name}: {len(frost)} jours de gel, {len(rain)} jours de forte pluie (>=10mm), "
                  f"{len(snow)} jours de neige sur {days} jours."),
            url=f"https://open-meteo.com/en/docs?latitude={lat}&longitude={lon}",
            canton="VS",
            commune=name,
            bfs=bfs,
            lat=lat,
            lon=lon,
            extra={"frost_days": frost, "heavy_rain_days": rain, "snow_days": snow, "daily": days_},
        ))
    return out
