"""Fond de carte du Valais pour la page Carte (web/public/data/geo.json + web/public/img/).

    python3 -m prototype.geo

À lancer une fois (le résultat est versionné, la démo reste hors ligne) :
  geo.json                     districts (contour simplifié en SVG, centre, chef-lieu), contour du canton
  img/valais-relief.jpg        relief ombré swisstopo (fond de carte), même emprise que le SVG
  img/districts/<n° OFS>.jpg   vue aérienne SWISSIMAGE du chef-lieu (vignette du panneau)

Sources : geo.admin.ch (swissBOUNDARIES3D, SWISSIMAGE, relief) — © swisstopo, données ouvertes.
Le SVG est en kilomètres LV95 : x = E - E0, y = N0 - N (viewBox "0 0 W H").
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from sources import _http, load
from sources.communes import normalize

ROOT = Path(__file__).resolve().parent.parent / "web" / "public"
API = "https://api3.geo.admin.ch/rest/services/api/MapServer"
WMS = "https://wms.geo.admin.ch/"
CANTON = 23
DISTRICTS = range(2301, 2314)
# Chef-lieu de chaque district (commune actuelle) : la vignette aérienne est centrée dessus.
CHEF_LIEU = {
    2301: "Brig-Glis", 2302: "Conthey", 2303: "Sembrancher", 2304: "Goms", 2305: "Vex", 2306: "Leuk",
    2307: "Martigny", 2308: "Monthey", 2309: "Raron", 2310: "Saint-Maurice", 2311: "Sierre", 2312: "Sion",
    2313: "Visp",
}
# Districts dont la bulle est posée sur le chef-lieu plutôt qu'au centre (sinon elle chevauche une voisine).
CENTER_AT_TOWN = {2310}
E0, N0, E1, N1 = 2545000, 1170000, 2683000, 1075000  # emprise (m) : canton + marge
TOL = 120  # tolérance de simplification (m)
RELIEF_W = 1600


def wgs84_to_lv95(lat: float, lon: float) -> tuple[float, float]:
    """Formules approchées swisstopo (précision ~1 m)."""
    p = (lat * 3600 - 169028.66) / 10000
    l = (lon * 3600 - 26782.5) / 10000
    e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3
    n = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3
    return e, n


def _feature(layer: str, fid: int) -> dict:
    return _http.get_json(f"{API}/{layer}/{fid}", {"geometryFormat": "geojson", "sr": 2056}, ttl=None)["feature"]


def _simplify(pts: list, tol: float) -> list:
    """Douglas-Peucker itératif."""
    if len(pts) < 4:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1e-9
        best, idx = 0.0, -1
        for i in range(a + 1, b):
            d = abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / norm
            if d > best:
                best, idx = d, i
        if best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def _xy(e: float, n: float) -> tuple[float, float]:
    return round((e - E0) / 1000, 2), round((N0 - n) / 1000, 2)


def _path(geom: dict) -> str:
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    out = []
    for poly in polys:
        for ring in poly:
            # Anneau fermé : on le coupe en deux pour que Douglas-Peucker ait deux extrémités distinctes.
            mid = len(ring) // 2
            ring = _simplify(ring[:mid + 1], TOL)[:-1] + _simplify(ring[mid:], TOL)
            if len(ring) < 4:
                continue
            out.append("M" + "L".join("%g,%g" % _xy(*p) for p in ring[:-1]) + "Z")
    return "".join(out)


def _centroid(geom: dict) -> tuple[float, float]:
    """Centre de gravité du plus grand polygone (anneau extérieur)."""
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    best = (0.0, 0.0, 0.0)
    for poly in polys:
        ring = poly[0]
        a = cx = cy = 0.0
        for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
            c = x0 * y1 - x1 * y0
            a += c
            cx += (x0 + x1) * c
            cy += (y0 + y1) * c
        if abs(a) > abs(best[0]):
            best = (a, cx / (3 * a), cy / (3 * a))
    return _xy(best[1], best[2])


def _wms(layer: str, bbox: tuple, w: int, h: int, dest: Path) -> None:
    url = _http.build_url(WMS, {"SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap", "LAYERS": layer,
                                "STYLES": "", "CRS": "EPSG:2056", "BBOX": ",".join(map(str, bbox)),
                                "WIDTH": w, "HEIGHT": h, "FORMAT": "image/jpeg"})
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(_http.download(url, ".jpg").read_bytes())


def main():
    communes = {normalize(r["commune"]): r for r in load("communes")}
    districts = []
    for fid in DISTRICTS:
        f = _feature("ch.swisstopo.swissboundaries3d-bezirk-flaeche.fill", fid)
        name = f["properties"]["name"]
        # Nom tel qu'il apparaît dans les données (« District de Sion », « Bezirk Visp »).
        full = next(r["extra"]["district"] for r in communes.values() if normalize(r["extra"]["district"]).endswith(normalize(name)))
        town = communes[normalize(CHEF_LIEU[fid])]
        e, n = wgs84_to_lv95(town["lat"], town["lon"])
        img = f"img/districts/{fid}.jpg"
        _wms("ch.swisstopo.swissimage", (round(e - 1400), round(n - 1050), round(e + 1400), round(n + 1050)), 480, 360,
             ROOT / img)
        cx, cy = _xy(e, n) if fid in CENTER_AT_TOWN else _centroid(f["geometry"])
        districts.append({"id": fid, "name": name, "district": full, "path": _path(f["geometry"]),
                          "center": [cx, cy], "town": {"name": town["commune"], "xy": list(_xy(e, n))},
                          "image": "/" + img})
        print(f"  ✓ {name}")
    canton = _feature("ch.swisstopo.swissboundaries3d-kanton-flaeche.fill", CANTON)
    w, h = (E1 - E0) / 1000, (N0 - N1) / 1000
    _wms("ch.swisstopo.leichte-basiskarte_reliefschattierung", (E0, N1, E1, N0), RELIEF_W, round(RELIEF_W * h / w),
         ROOT / "img" / "valais-relief.jpg")
    out = {"viewBox": [0, 0, w, h], "canton": _path(canton["geometry"]), "relief": "/img/valais-relief.jpg",
           "credit": "© swisstopo", "districts": districts}
    (ROOT / "data" / "geo.json").write_text(json.dumps(out, ensure_ascii=False), "utf-8")
    print(f"  ✓ geo.json ({len(districts)} districts)")


if __name__ == "__main__":
    main()
