"""OFS STAT-TAB (PxWeb) : statistiques officielles, requêtables par API.

API : https://www.pxweb.bfs.admin.ch/api/v1/fr/{table}/{table}.px
  GET  -> métadonnées (variables + valeurs possibles)
  POST -> données ({"query": [...], "response": {"format": "json-stat2"}})
Attention : limite de débit (HTTP 429), d'où le cache permanent sur les métadonnées.

Tables branchées (presets) :
  hesta           px-x-1003020000_101  nuitées hôtelières par commune et par mois (HESTA)
  construction    px-x-0904010000_201  dépenses de construction + réserves de travail, par commune
  emplois         px-x-0602010000_102  établissements / emplois / EPT par commune et secteur (STATENT)
  salaires        px-x-0304010000_205  salaire mensuel brut par groupe de professions (ISCO), région lémanique
  places_vacantes px-x-0602000000_104  places vacantes par grande région, par trimestre
Pour en trouver d'autres : `stattab.tables()` liste toutes les bases.
"""
from __future__ import annotations

import re
from itertools import product
from typing import Callable, Optional, Union

from ..core import http as _http
from ..core.record import record

BASE = "https://www.pxweb.bfs.admin.ch/api/v1/fr"
Selection = Union[list, Callable[[str, str], bool], None]


def tables() -> list[str]:
    return [d["dbid"] for d in _http.get_json(f"{BASE}/", ttl=None)]


def meta(table: str) -> dict:
    return _http.get_json(f"{BASE}/{table}/{table}.px", ttl=7 * 86400)


def query(table: str, selection: dict[str, Selection]) -> list[dict]:
    """selection : {code_variable: [valeurs] | fonction(code, libellé)->bool | None (= tout)}.
    Renvoie des lignes {variable: (code, libellé), ..., "value": float|None}."""
    m = meta(table)
    q = []
    for v in m["variables"]:
        sel = selection.get(v["code"], None)
        if callable(sel):
            values = [c for c, t in zip(v["values"], v["valueTexts"]) if sel(c, t)]
        elif sel is None:
            values = v["values"]
        else:
            values = [str(x) for x in sel]
        q.append({"code": v["code"], "selection": {"filter": "item", "values": values}})
    d = _http.get_json(f"{BASE}/{table}/{table}.px", method="POST",
                       json_body={"query": q, "response": {"format": "json-stat2"}}, ttl=7 * 86400)
    dims = d["id"]
    cats = []
    for dim in dims:
        c = d["dimension"][dim]["category"]
        order = sorted(c["index"], key=lambda k: c["index"][k])
        cats.append([(k, c["label"][k]) for k in order])
    values = d["value"]
    rows = []
    for i, combo in enumerate(product(*cats)):
        row = {dim: kv for dim, kv in zip(dims, combo)}
        row["value"] = values[i] if not isinstance(values, dict) else values.get(str(i))
        rows.append(row)
    return rows


def _last(n: int):
    """Sélecteur : les n dernières valeurs (années, trimestres) de la variable."""
    def pick(table: str, code: str) -> list[str]:
        v = next(v for v in meta(table)["variables"] if v["code"] == code)
        return sorted(v["values"])[-n:]
    return pick


def _vs_commune(code: str, label: str) -> bool:
    return code.isdigit() and 6000 <= int(code) <= 6399


def _clean_label(label: str) -> str:
    return re.sub(r"^[.\s-]*(\d{3,4}\s+)?", "", label).strip()


def _records(source: str, table: str, rows: list[dict], *, place_dim: Optional[str], date_fn, kind_dims: list[str]) -> list[dict]:
    out = []
    for r in rows:
        if r["value"] is None:
            continue
        dims = {k: v for k, v in r.items() if k != "value"}
        place_code, place_label = dims[place_dim] if place_dim else (None, None)
        bfs = int(place_code) if place_code and place_code.isdigit() and int(place_code) < 9999 else None
        kind = " · ".join(dims[k][1] for k in kind_dims)
        out.append(record(
            source, "|".join(c for c, _l in dims.values()),
            kind=kind,
            date=date_fn(r),
            title=f"{kind} — {_clean_label(place_label) if place_label else ''}".strip(" —"),
            text=", ".join(_clean_label(lbl) for _c, lbl in dims.values()) + f" : {r['value']}",
            url=f"https://www.pxweb.bfs.admin.ch/pxweb/fr/{table}/-/{table}.px/",
            canton="VS",
            commune=_clean_label(place_label) if bfs else None,
            bfs=bfs,
            extra={"value": r["value"], "table": table, **{k: _clean_label(lbl) for k, (_c, lbl) in dims.items()}},
        ))
    return out


def fetch_hesta(years: int = 3) -> list[dict]:
    t = "px-x-1003020000_101"
    rows = query(t, {"Jahr": _last(years)(t, "Jahr"), "Monat": [str(i) for i in range(1, 13)],
                     "Gemeinde": _vs_commune, "Herkunftsland": ["0"], "Indikator": ["1", "2"]})
    return _records("hesta", t, rows, place_dim="Gemeinde", kind_dims=["Indikator"],
                    date_fn=lambda r: f"{r['Jahr'][0]}-{int(r['Monat'][0]):02d}-01")


def fetch_construction(years: int = 5) -> list[dict]:
    t = "px-x-0904010000_201"
    place = next(v["code"] for v in meta(t)["variables"] if v["code"].startswith("Grossregion"))
    rows = query(t, {place: lambda c, l: c == "VS" or _vs_commune(c, l), "Art der Auftraggeber": None,
                     "Art der Bauwerke": ["0"], "Art der Arbeiten": ["0", "4"],
                     "Beobachtungseinheit": ["kost_j", "arbv_k"], "Jahr": _last(years)(t, "Jahr")})
    return _records("construction_ofs", t, rows, place_dim=place,
                    kind_dims=["Beobachtungseinheit", "Art der Arbeiten", "Art der Auftraggeber"],
                    date_fn=lambda r: f"{r['Jahr'][0]}-01-01")


def fetch_emplois(years: int = 3) -> list[dict]:
    t = "px-x-0602010000_102"
    rows = query(t, {"Jahr": _last(years)(t, "Jahr"), "Gemeinde": _vs_commune,
                     "Wirtschaftssektor": None, "Beobachtungseinheit": ["1", "2", "5"]})
    return _records("emplois_ofs", t, rows, place_dim="Gemeinde",
                    kind_dims=["Beobachtungseinheit", "Wirtschaftssektor"],
                    date_fn=lambda r: f"{r['Jahr'][0]}-01-01")


def fetch_salaires(years: int = 2) -> list[dict]:
    t = "px-x-0304010000_205"
    rows = query(t, {"Jahr": _last(years)(t, "Jahr"), "Grossregion": ["-1", "1"], "Berufsgruppe": None,
                     "Lebensalter": ["-1"], "Geschlecht": ["-1"],
                     "Zentralwert und andere Perzentile": ["1", "3", "4"]})
    recs = _records("salaires", t, rows, place_dim=None,
                    kind_dims=["Berufsgruppe", "Zentralwert und andere Perzentile"],
                    date_fn=lambda r: f"{r['Jahr'][0]}-01-01")
    for r in recs:
        r["canton"] = None
        m = re.match(r"[>\s]*(\d+)", r["extra"]["Berufsgruppe"])
        r["extra"]["isco"] = m.group(1) if m else None
    return recs


def fetch_places_vacantes(quarters: int = 12) -> list[dict]:
    t = "px-x-0602000000_104"
    rows = query(t, {"Offene Stellen": None, "Grossregion": ["0", "1"], "Quartal": _last(quarters)(t, "Quartal")})

    def qdate(r):
        y, q = r["Quartal"][0].split("Q")
        return f"{y}-{(int(q) - 1) * 3 + 1:02d}-01"

    recs = _records("places_vacantes", t, rows, place_dim=None, kind_dims=["Offene Stellen", "Grossregion"], date_fn=qdate)
    for r in recs:
        r["canton"] = None
    return recs
