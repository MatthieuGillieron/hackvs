"""Référentiel des métiers (bâtiment, industrie, logistique) : la table de jointure "métier".

Chaque métier a : un id stable, des codes ISCO-08 (4 chiffres, jointure avec `salaires`
par les 2 premiers chiffres et avec `penurie` par préfixe), et une regex FR/DE pour
reconnaître le métier dans un titre d'annonce (jobroom, jobup, flexsis) ou un texte libre.
Codes ISCO attribués à la main : bons pour agréger, à affiner si besoin.

    from sources import metiers
    metiers.detect("Maçon CFC 100%")        -> ["macon"]
    metiers.fetch()                          -> records enrichis (pénurie SECO, salaires OFS si snapshots)
"""
from __future__ import annotations

import re
from typing import Optional

from ..core.record import record

# id, libellé, isco, secteur, regex de détection (titres FR/DE)
METIERS = [
    ("macon", "Maçon", "7112", "bâtiment", r"ma[çc]on|maurer"),
    ("coffreur", "Coffreur / constructeur béton armé", "7114", "bâtiment", r"coffreu|b[ée]ton arm|schaler|betonbauer"),
    ("ferrailleur", "Ferrailleur", "7114", "bâtiment", r"ferraill|eisenleger"),
    ("manoeuvre", "Manœuvre / aide de chantier", "9313", "bâtiment", r"man[oœ]uvre|aide.ma[çc]on|bauarbeiter|hilfsarbeiter|handlanger"),
    ("grutier", "Grutier", "8343", "bâtiment", r"grutier|kranf[üu]hrer"),
    ("machiniste", "Machiniste / conducteur d'engins", "8342", "bâtiment", r"machiniste|conducteur d.engins|baumaschinenf|pelle m[ée]canique"),
    ("charpentier", "Charpentier", "7115", "bâtiment", r"charpentier|zimmer(mann|leute)"),
    ("menuisier", "Menuisier / ébéniste", "7115", "bâtiment", r"menuisier|[ée]b[ée]niste|schreiner"),
    ("electricien", "Électricien / monteur électricien", "7411", "bâtiment", r"[ée]lectricien|monteur.[ée]lectr|elektroinstallateur|elektriker"),
    ("sanitaire", "Installateur sanitaire", "7126", "bâtiment", r"sanitaire|sanit[äa]r|plombier"),
    ("chauffage", "Installateur en chauffage", "7126", "bâtiment", r"chauffag|heizungs"),
    ("ventilation", "Monteur ventilation / climatisation", "7127", "bâtiment", r"ventilation|climatis|l[üu]ftung|klima"),
    ("peintre", "Peintre en bâtiment", "7131", "bâtiment", r"peintre|maler"),
    ("platrier", "Plâtrier / plâtrier-peintre", "7123", "bâtiment", r"pl[âa]tri|gipser|staffeur"),
    ("carreleur", "Carreleur", "7122", "bâtiment", r"carreleu|plattenleger"),
    ("couvreur", "Couvreur / ferblantier / étancheur", "7121", "bâtiment", r"couvreu|ferblant|[ée]tanch|dachdecker|spengler|abdichter"),
    ("isoleur", "Isoleur / façadier", "7124", "bâtiment", r"isoleu|fa[çc]adier|isolierer|fassadenbau"),
    ("echafaudeur", "Échafaudeur", "7119", "bâtiment", r"[ée]chafaud|ger[üu]stbau"),
    ("serrurier", "Serrurier / constructeur métallique", "7214", "bâtiment", r"serruri|constructeur m[ée]tal|metallbau"),
    ("chef_chantier", "Chef de chantier / contremaître", "3123", "bâtiment", r"chef de chantier|contrema[iî]tre|polier|bauf[üu]hrer|vorarbeiter"),
    ("dessinateur", "Dessinateur en bâtiment / génie civil", "3118", "bâtiment", r"dessinateu|zeichner"),
    ("paysagiste", "Paysagiste", "6113", "bâtiment", r"paysagist|jardinier|landschaftsg|g[äa]rtner"),
    ("soudeur", "Soudeur", "7212", "industrie", r"soudeu|schwei[sß]er"),
    ("polymecanicien", "Polymécanicien / mécanicien de production", "7223", "industrie", r"polym[ée]can|m[ée]canicien de prod|polymechanik|cnc"),
    ("mecanicien", "Mécanicien de maintenance", "7233", "industrie", r"m[ée]canicien|maintenance|mechaniker|instandhalt"),
    ("automaticien", "Automaticien", "7421", "industrie", r"automaticien|automatiker"),
    ("operateur", "Opérateur de production", "8189", "industrie", r"op[ée]rateu|ouvrier de prod|produktionsmitarbeiter|anlagenf[üu]hrer"),
    ("cariste", "Cariste", "8344", "logistique", r"cariste|staplerf"),
    ("logisticien", "Logisticien / magasinier", "4321", "logistique", r"logisticien|magasinier|logistiker|lagerist"),
    ("chauffeur", "Chauffeur poids lourds", "8332", "logistique", r"chauffeur|camion|poids lourd|lkw|lastwagen"),
    ("nettoyage", "Agent d'entretien / nettoyage", "9112", "services", r"nettoy|agent d.entretien|reinigung|concierge"),
]
_COMPILED = [(mid, re.compile(rx, re.I)) for mid, _l, _i, _s, rx in METIERS]


def detect(text: Optional[str]) -> list[str]:
    """Ids des métiers reconnus dans un titre / texte (ordre du référentiel)."""
    return [mid for mid, rx in _COMPILED if text and rx.search(text)]


def by_id() -> dict[str, dict]:
    return {m[0]: {"id": m[0], "label": m[1], "isco": m[2], "sector": m[3]} for m in METIERS}


def fetch() -> list[dict]:
    from .. import load, path

    pen = load("penurie") if path("penurie").exists() else []
    sal = load("salaires") if path("salaires").exists() else []
    out = []
    for mid, label, isco, sector, rx in METIERS:
        shortage = next((p for p in pen if any(c.startswith(isco) for c in p["extra"]["isco_codes"])), None)
        latest = max((s["extra"].get("Jahr") for s in sal), default=None)
        wages = {s["extra"]["Zentralwert und andere Perzentile"]: s["extra"]["value"] for s in sal
                 if s["extra"].get("isco") == isco[:2] and s["extra"].get("Grossregion") == "Région lémanique"
                 and s["extra"].get("Jahr") == latest}
        notes = []
        if shortage:
            notes.append(f"chômage {shortage['extra']['unemployment_rate']} % (obligation d'annonce)")
        elif pen:
            notes.append("absent de la liste SECO : chômage < 5 %, métier plutôt tendu")
        if wages.get("Médiane"):
            notes.append(f"salaire médian groupe ISCO {isco[:2]} (région lémanique, {latest}) : CHF {wages['Médiane']:.0f}")
        out.append(record(
            "metiers", mid,
            kind=sector,
            title=label,
            text=f"{label} (ISCO {isco}, {sector})" + (" — " + " ; ".join(notes) if notes else ""),
            extra={"isco": isco, "sector": sector, "regex": rx,
                   "unemployment_rate": shortage["extra"]["unemployment_rate"] if shortage else None,
                   "reporting_obligation": bool(shortage),
                   "salary_median": wages.get("Médiane"), "salary_p25": wages.get("P25"), "salary_p75": wages.get("P75"),
                   "salary_year": latest},
        ))
    return out
