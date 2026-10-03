"""Extraction des signaux : chaque publication brute -> 0..n signaux normalisés.

Un signal = (famille, cible, métiers, fenêtre de besoin, volume estimé, preuve citable).
Familles de DEMANDE : projet, recrutement, entreprise, historique.
Les hypothèses chiffrées sont regroupées dans ASSUMPTIONS pour être montrées et discutées.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional

from sources import communes, load, metiers

TODAY = date.today()

ASSUMPTIONS = {
    "part_main_oeuvre": (0.30, 0.40, 0.50),     # part du montant d'un marché qui paie de la main-d'œuvre
    "cout_horaire_chf": 85,                     # coût complet d'une heure ouvrier
    "heures_par_mois": 170,
    "chf_par_mois_de_chantier": 300_000,        # durée ≈ montant / ce chiffre (1 à 12 mois)
    "part_interim": (0.15, 0.25, 0.35),         # part de l'équipe en renfort temporaire
    "delai_adjudication_debut_j": (21, 90),     # adjudication -> démarrage (= moment où l'entreprise staffe)
    "delai_annonce_besoin_j": (0, 30),          # une annonce = besoin déjà là ou imminent
    "annonce_difficile_j": 21,                  # en ligne depuis + de 21 j = n'arrive pas à recruter
}

BTP = {"macon", "coffreur", "ferrailleur", "manoeuvre", "grutier", "machiniste", "charpentier", "menuisier",
       "electricien", "sanitaire", "chauffage", "ventilation", "peintre", "platrier", "carreleur", "couvreur",
       "isoleur", "echafaudeur", "serrurier", "chef_chantier", "paysagiste"}

# Codes CFC/BKP (2-3 premiers chiffres) -> métiers
CFC = [
    (r"^1\d\d|^20\d", ["machiniste", "manoeuvre"]),
    (r"^21[0-3]", ["macon", "coffreur", "manoeuvre"]),
    (r"^214", ["charpentier"]),
    (r"^215|^226", ["isoleur"]),
    (r"^221|^273", ["menuisier"]),
    (r"^222|^224", ["couvreur"]),
    (r"^23", ["electricien"]),
    (r"^24", ["chauffage", "ventilation"]),
    (r"^25", ["sanitaire"]),
    (r"^271", ["platrier"]),
    (r"^272", ["serrurier"]),
    (r"^28[12]", ["carreleur"]),
    (r"^227|^285", ["peintre"]),
    (r"^4\d\d", ["paysagiste"]),
]
# Mots-clés de lot -> métiers (si pas de code CFC)
LOT_KEYWORDS = [  # corps de métier spécifiques d'abord, mots génériques d'infrastructure en dernier
    (r"électri|elektro", ["electricien"]),
    (r"sanitaire|sanitär", ["sanitaire"]),
    (r"chauffage|heizung", ["chauffage"]),
    (r"ventilation|lüftung|climatisation|cvc|hlk", ["ventilation"]),
    (r"peinture|maler", ["peintre"]),
    (r"plâtr|gipser", ["platrier"]),
    (r"carrel|plattenbel", ["carreleur"]),
    (r"menuiser|schreiner|fenêtre", ["menuisier"]),
    (r"charpent|holzbau|zimmer", ["charpentier"]),
    (r"toiture|ferblant|couverture|dach|spengler|étanch", ["couvreur"]),
    (r"façade|fassade|isolation", ["isoleur"]),
    (r"échafaud|gerüst", ["echafaudeur"]),
    (r"serrur|construction métallique|metallbau", ["serrurier"]),
    (r"paysag|aménagements extérieurs|umgebung|garten", ["paysagiste"]),
    (r"bitum|enrob|revêtement.*(route|chauss)|belag|strassenbau|route|chaussée", ["machiniste", "manoeuvre"]),
    (r"terrass|excavat|aushub|erdbau|fouille", ["machiniste", "manoeuvre"]),
    (r"canalis|conduite|collecteur|leitung|réseau d.eau|assainissement", ["machiniste", "manoeuvre", "macon"]),
    (r"maçonn|béton|gros.œuvre|gros-oeuvre|baumeister|rohbau|galerie|tunnel|pont|ouvrage d.art|kunstbau|mur de",
     ["macon", "coffreur", "machiniste", "manoeuvre"]),
]
NOT_WORKS = r"matériel|material|fourniture|lieferung|étude|ingénieur|mandat|planung|honorar|nettoyage"

# Phasage d'un chantier de bâtiment.
# (phase, métiers, début, fin de la fenêtre en mois après la mise à l'enquête,
#  taille d'équipe relative au gros œuvre, durée réelle de la phase en mois)
# La fenêtre exprime l'incertitude sur QUAND la phase a lieu ; la durée dit combien de temps
# l'équipe est réellement mobilisée. Occupation moyenne = durée / largeur de la fenêtre.
PHASES_NEUF = [
    ("terrassement", ["machiniste", "manoeuvre"], 2, 4, 0.5, 0.75),
    ("gros œuvre", ["macon", "coffreur", "ferrailleur", "grutier"], 3, 7, 1.0, 3.0),
    ("toiture / enveloppe", ["charpentier", "couvreur", "isoleur"], 6, 9, 0.5, 1.0),
    ("technique", ["electricien", "sanitaire", "chauffage"], 7, 11, 0.75, 2.0),
    ("finitions", ["platrier", "peintre", "carreleur", "menuisier"], 9, 13, 0.75, 2.0),
]
PHASES_RENOV = [
    ("technique", ["electricien", "sanitaire", "chauffage"], 2, 5, 0.75, 1.5),
    ("finitions", ["platrier", "peintre", "carreleur", "menuisier"], 3, 6, 0.75, 1.5),
]
BIG = r"immeuble|logements|appartements|halle|h[ôo]tel|[ée]cole|EMS|centre|industriel|r[ée]sidence|Mehrfamilien|MFH|Wohnungen|Überbauung|Gewerbe|Hochhaus|Arena"
VILLA = r"villa|chalet|maison|Einfamilien|EFH|Wohnhaus|habitation"
RENOV = r"transformation|r[ée]novation|agrandissement|sur[ée]l[ée]vation|Umbau|Sanierung|r[ée]fection|changement d.affectation"
SMALL = r"\bPAC\b|pompe [àa] chaleur|solaire|photovolta|pergola|couvert|abri|cl[ôo]ture|piscine|Wärmepumpe|Solar|carport|Unterstand|Gartenhaus|jacuzzi|bain [àa] remous|mur de sout|antenne|enseigne|totem|places? de parc|Parkplatz|sondes?|forage"
MODIF = r"modification du projet|modification de projet|Abänderungsgesuch|Projektänderung|annule et remplace|régularisation"


@dataclass
class Signal:
    family: str                    # projet | recrutement | entreprise | historique
    type: str                      # adjudication, appel_offres, permis, annonce_directe, ...
    company: Optional[str]         # entreprise ciblée (None = signal de zone)
    district: Optional[str]
    metiers: list[str]
    window: tuple[date, date]      # quand le besoin arrive
    team: Optional[tuple[float, float, float]] = None   # taille d'équipe estimée (bas, central, haut)
    weight: float = 1.0            # sert uniquement à départager à niveau égal
    label: str = ""                # phrase courte affichée dans "Pourquoi"
    url: Optional[str] = None
    date: Optional[str] = None
    fictif: bool = False
    meta: dict = field(default_factory=dict)


def norm_company(name: Optional[str]) -> str:
    n = re.sub(r"\b(sa|s\.a\.|sàrl|sarl|s\.à r\.l\.|ag|gmbh|holding|succursale.*|filiale.*|filial .*)\b", " ", (name or "").lower())
    return re.sub(r"[^a-z0-9äöüéèàç]+", " ", n).strip()


def _d(s: Optional[str]) -> date:
    return date.fromisoformat(s[:10]) if s else TODAY


def _district(rec: dict) -> Optional[str]:
    if rec["extra"].get("district"):
        return rec["extra"]["district"]
    c = communes.lookup(rec.get("commune") or "")
    return c["extra"]["district"] if c else None


# ------------------------------------------------------------------ PROJET : SIMAP

def lot_metiers(rec: dict) -> list[str]:
    text = f"{rec['title']} {rec['text']}"
    codes = [b["code"] for b in rec["extra"].get("bkp_codes") or []] + re.findall(r"\b(?:CFC|BKP)\s*(\d{3})", text)
    out = []
    for code in codes:
        for rx, ms in CFC:
            if re.match(rx, code):
                out += ms
    if not out:
        for rx, ms in LOT_KEYWORDS:
            if re.search(rx, text, re.I):
                out += ms
                break
    if not out and rec["extra"].get("construction_category") == "civil_engineering":
        out = ["machiniste", "macon", "manoeuvre"]
    return list(dict.fromkeys(out))


def team_from_amount(chf: float) -> tuple[tuple[float, float, float], float]:
    a = ASSUMPTIONS
    months = min(12, max(1, chf / a["chf_par_mois_de_chantier"]))
    hours_per_person = a["heures_par_mois"] * months
    team = tuple(chf * share / a["cout_horaire_chf"] / hours_per_person for share in a["part_main_oeuvre"])
    return team, months


def simap_signals() -> list[Signal]:
    out = []
    for r in load("simap"):
        if re.search(NOT_WORKS, r["title"], re.I) or r["kind"] not in ("award", "tender"):
            continue
        ms = lot_metiers(r)
        if not ms:
            continue
        dist = _district(r)
        if r["kind"] == "award":
            for w in r["extra"]["winners"]:
                if not w.get("price_chf"):
                    continue
                team, months = team_from_amount(w["price_chf"])
                d0 = _d(r["date"])
                lo, hi = ASSUMPTIONS["delai_adjudication_debut_j"]
                start = d0 + timedelta(days=lo)
                out.append(Signal(
                    "projet", "adjudication", w["name"], dist, ms,
                    (start, d0 + timedelta(days=hi)), team, 30,
                    f"Adjudication SIMAP {w['price_chf'] / 1e6:.2f} MCHF : {r['title'][:70]}",
                    r["url"], r["date"], meta={"montant": w["price_chf"], "mois": round(months, 1), "commune": r["commune"]},
                ))
        else:  # appel d'offres ouvert : lauréat inconnu -> signal de zone, plus lointain
            deadline = next(iter(r["extra"]["dates"].get("offerDeadline") or []), None)
            d0 = _d(deadline) if deadline else _d(r["date"]) + timedelta(days=40)
            out.append(Signal(
                "projet", "appel_offres", None, dist, ms,
                (d0 + timedelta(days=45), d0 + timedelta(days=150)), None, 15,
                f"Appel d'offres SIMAP (délai {d0.isoformat()}) : {r['title'][:70]}", r["url"], r["date"],
                meta={"commune": r["commune"]},
            ))
    return out


# ------------------------------------------------------------------ PROJET : permis + phasage

def permit_class(project: str) -> Optional[str]:
    if re.search(SMALL, project, re.I) and not re.search(BIG, project, re.I):
        return None
    n = max([int(x) for x in re.findall(r"(\d+)\s*(?:appartements|logements|Wohnungen)", project, re.I)] or [0])
    if re.search(RENOV, project, re.I) and not re.search(r"construction|Neubau|reconstruction", project, re.I):
        return "renovation" if (n >= 4 or re.search(BIG, project, re.I)) else None
    if n >= 6 or re.search(r"halle|h[ôo]tel|[ée]cole|EMS|centre|industriel|Hochhaus|Arena|Überbauung|immeubles|\d immeubles|MFH .* MFH|zwei MFH|zwei Mehrfamilien", project, re.I):
        return "grand"
    if re.search(BIG, project, re.I):
        return "moyen"
    if re.search(VILLA, project, re.I):
        return "villa"
    return None


# Entreprise de construction nommée dans le permis (requérant / entreprise générale) -> attribution directe
CONTRACTOR_RE = r"construction|bau\b|baugesch|bauunternehm|entreprise g[ée]n[ée]rale|generalunternehm|g[ée]nie civil|ma[çc]onnerie|holzbau|charpente|metallbau"
PROMOTER_RE = r"immo|invest|holding|patrimoine|promotion|architect|architektur|bureau|ing[ée]nieur|d[ée]partement"


def named_contractor(rec: dict) -> Optional[str]:
    for name in rec["extra"].get("applicants", []) + rec["extra"].get("architects", []):
        if re.search(CONTRACTOR_RE, name, re.I) and not re.search(PROMOTER_RE, name, re.I):
            return name
    return None


TEAM_BY_CLASS = {"grand": (4, 6, 8), "moyen": (2, 3, 4), "villa": (1, 1.5, 2), "renovation": (1, 2, 3)}


def permit_signals() -> list[Signal]:
    out = []
    for r in load("permis_construire"):
        project = r["extra"].get("project") or r["title"]
        cls = permit_class(project)
        if cls in (None, "villa"):
            continue
        modif = bool(re.search(MODIF, project, re.I))
        contractor = named_contractor(r)
        d0 = _d(r["date"])
        phases = PHASES_RENOV if cls == "renovation" else PHASES_NEUF
        for phase, ms, m0, m1, crew, duration in phases:
            start, end = d0 + timedelta(days=30 * m0), d0 + timedelta(days=30 * m1)
            if end < TODAY:
                continue
            team = tuple(x * crew for x in TEAM_BY_CLASS[cls])
            out.append(Signal(
                "projet", "permis", contractor, _district(r), ms, (start, end), team, 22 if cls == "grand" else 12,
                f"Mise à l'enquête ({cls}) {r['commune']} — {phase} : {project[:70]}"
                + (f" [entreprise nommée : {contractor}]" if contractor else ""), r["url"], r["date"],
                meta={"phase": phase, "classe": cls, "modification": modif, "commune": r["commune"],
                      "occupation": min(1.0, duration / (m1 - m0)),
                      "requerant": r["company"], "architecte": (r["extra"].get("architects") or [None])[-1],
                      "permis_id": r["id"]},
            ))
    return out


# ------------------------------------------------------------------ RECRUTEMENT

def job_signals() -> list[Signal]:
    out = []
    for src in ("jobroom", "jobup"):
        for r in load(src):
            ms = [m for m in (r["extra"].get("metiers") or metiers.detect(r["title"])) if m in BTP]
            if not ms:
                continue
            first = r["extra"].get("initial_publication_date") or r["date"]
            age = (TODAY - _d(first)).days
            agency = r["extra"].get("is_staffing_agency") or r["extra"].get("is_job_board")
            lo, hi = ASSUMPTIONS["delai_annonce_besoin_j"]
            win = (TODAY + timedelta(days=lo), TODAY + timedelta(days=hi + 30))
            if agency:  # concurrence : signal de zone
                out.append(Signal("recrutement", "agences_concurrentes", None, _district(r), ms, win, None, 6,
                                  f"Agence {r['company']} recrute ({r['title'][:50]}, {r['commune']})", r["url"], r["date"]))
            else:
                hard = age >= ASSUMPTIONS["annonce_difficile_j"]
                out.append(Signal("recrutement", "annonce_directe", r["company"], _district(r), ms, win, None,
                                  18 if hard else 10,
                                  f"Annonce {'en ligne depuis ' + str(age) + ' j' if hard else 'récente'} : {r['title'][:60]}",
                                  r["url"], r["date"], meta={"age_j": age, "difficile": hard}))
    return out


# ------------------------------------------------------------------ ENTREPRISE (FOSC)

CONSTRUCTION_PURPOSE = r"constru|bâtiment|maçonn|génie civil|charpent|électri|sanitaire|chauffage|peinture|plâtr|carrel|toiture|ferblant|terrass|Bau|Elektro|Sanitär|Maler|Gipser|Holzbau"
CAPITAL_RE = re.compile(r"(?:Nouveau capital[- ](?:actions|social)|Neues (?:Aktien|Stamm)kapital)\s*:\s*CHF\s*([\d'’.]+)\s*\[(?:précédemment|bisher)\s*:\s*CHF\s*([\d'’.]+)", re.I)
MERGER_RE = re.compile(r"Fusion\s*:\s*(?:reprise des actifs et des passifs|Übernahme der Aktiven und Passiven)\s+(?:de|der)\s+(?:la société\s+)?([^,(]+)", re.I)


def _chf(s: str) -> float:
    return float(re.sub(r"[^\d.]", "", s.replace("’", "").replace("'", "")) or 0)


def company_signals() -> list[Signal]:
    """Événements FOSC structurés (pas la formule type des statuts) : croissance réelle de l'entreprise."""
    out = []
    for r in load("registre_commerce"):
        text = r["text"]
        m = re.search(r"\b(?:But|Zweck)\s*:", text)
        head = text[:m.start()] if m else text          # avant "But:" = l'événement ; après = statuts types
        purpose = r["extra"].get("purpose") or (text[m.end():] if m else "")
        if not re.search(CONSTRUCTION_PURPOSE, purpose or "", re.I):
            continue
        if re.search(r"immo|invest|holding|patrimoine|gestion|finance|property|real estate", r["company"] or "", re.I):
            continue  # sociétés patrimoniales : pas des employeurs de chantier
        why = None
        cap = CAPITAL_RE.search(text)
        merger = MERGER_RE.search(text)
        if cap and _chf(cap.group(1)) > _chf(cap.group(2)):
            why = f"Augmentation de capital (CHF {_chf(cap.group(2)):,.0f} → {_chf(cap.group(1)):,.0f})".replace(",", "'")
        elif merger:
            why = f"Fusion : absorbe {merger.group(1).strip()[:50]}"
        elif r["extra"].get("event") == "Nouvelle inscription" and re.search(r"succursale|Zweigniederlassung", head, re.I):
            why = "Ouverture d'une succursale en Valais"
        if not why:
            continue
        d0 = _d(r["date"])
        ms = [m for m in metiers.detect(purpose) if m in BTP] or ["macon", "manoeuvre"]
        out.append(Signal("entreprise", why.split(" ")[0].lower(), r["company"], _district(r), ms,
                          (d0, d0 + timedelta(days=150)), None, 10, f"FOSC {r['date']} : {why}", r["url"], r["date"]))
    return out


# ------------------------------------------------------------------ HISTORIQUE (FICTIF)

def history_signals(demandes: list[dict]) -> list[Signal]:
    """Le client a eu ce besoin à la même période les années précédentes (fenêtre ±45 j autour de +6 sem.)."""
    out = []
    target = TODAY + timedelta(days=42)
    by_key: dict = {}
    for d in demandes:
        dd = _d(d["date_demande"])
        if dd.year == TODAY.year:
            continue
        gap = abs(dd.timetuple().tm_yday - target.timetuple().tm_yday)
        same_period = min(gap, 365 - gap) <= 45
        if same_period and d["metier"] in BTP:
            by_key.setdefault((d["client"], d["metier"]), []).append(d)
    for (client, m), ds in by_key.items():
        n = sum(x["nb_postes"] for x in ds)
        years = sorted({x["date_demande"][:4] for x in ds})
        out.append(Signal("historique", "client_recurrent", client, ds[0]["district"], [m],
                          (target - timedelta(days=21), target + timedelta(days=30)), None, 25,
                          f"[FICTIF] Demandes Flexsis à la même période en {', '.join(years)} ({n} postes)",
                          None, None, fictif=True))
    return out
