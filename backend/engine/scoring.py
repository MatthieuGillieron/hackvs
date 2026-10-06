"""Signaux -> opportunités : regroupement par cible, familles, timing, besoin, vivier, niveau, action.

Règles (voir docs/moteur.md) :
  cible    = entreprise × métier, sinon district × métier
  niveau   = AGIR si >= 3 familles ET besoin dans les 8 semaines ; PRÉPARER si 2 familles
             (ou 3 mais plus lointain) ; SURVEILLER si 1 famille
  vivier   = ne change pas le niveau, choisit l'action
  tri      = niveau, puis proximité du besoin, puis taille du besoin, puis poids (jamais affiché)
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from statistics import mean
from typing import Optional

from sources import flexsis_fictif, load
from sources.reference.metiers import by_id

from .signals import (
    ASSUMPTIONS,
    TODAY,
    Signal,
    announcement_signals,
    company_signals,
    history_signals,
    job_signals,
    norm_company,
    permit_signals,
    simap_signals,
)

HORIZON_J = 56          # "besoin proche" = dans les 8 semaines
LEVELS = ["AGIR", "PRÉPARER", "SURVEILLER"]
LABELS = {k: v["label"] for k, v in by_id().items()}


@dataclass
class Opportunity:
    key: tuple
    company: Optional[str]
    district: Optional[str]
    metier: str
    signals: list[Signal] = field(default_factory=list)
    level: str = "SURVEILLER"
    level_public: str = "SURVEILLER"   # niveau sans les signaux fictifs (historique Flexsis simulé)
    families: list[str] = field(default_factory=list)
    window: tuple[date, date] = (TODAY, TODAY)
    team: tuple[float, float, float] = (0, 0, 0)
    need: tuple[int, int, int] = (0, 0, 0)
    vivier: dict = field(default_factory=dict)
    pool: dict = field(default_factory=dict)   # ids des candidats comptés dans le vivier, par catégorie
    action: str = ""
    probable_companies: list[str] = field(default_factory=list)
    metiers_all: list[str] = field(default_factory=list)
    weight: float = 0

    @property
    def target(self) -> str:
        return self.company or f"Zone {self.district}"


# ------------------------------------------------------------------ helpers

def _km(a, b) -> float:
    (la1, lo1), (la2, lo2) = a, b
    return 111.2 * math.hypot(la2 - la1, (lo2 - lo1) * math.cos(math.radians((la1 + la2) / 2)))


def district_centroids() -> dict[str, tuple[float, float]]:
    pts = defaultdict(list)
    for c in load("communes"):
        if c["lat"] is not None:
            pts[c["extra"]["district"]].append((c["lat"], c["lon"]))
    return {d: (mean(p[0] for p in v), mean(p[1] for p in v)) for d, v in pts.items()}


def _dedup_weight(weights: list[float]) -> float:
    """1er signal d'une famille 100 %, 2e +30 %, 3e et suivants +15 %."""
    w = sorted(weights, reverse=True)
    return sum(x * (1 if i == 0 else .3 if i == 1 else .15) for i, x in enumerate(w))


# ------------------------------------------------------------------ assemblage

def collect_signals(real_clients: bool = True) -> tuple[list[Signal], dict]:
    fx = flexsis_fictif.generate(real_clients=real_clients, ref=TODAY)
    sigs = simap_signals() + permit_signals() + announcement_signals() + job_signals() + company_signals() + history_signals(fx["fx_demandes"])
    return sigs, fx


def build(real_clients: bool = True, key_mode: str = "entreprise_metier",
          zone_context: bool = False) -> tuple[list[Opportunity], dict]:
    """key_mode : "entreprise_metier" (cible = entreprise × métier) ou "entreprise" (tous métiers confondus)."""
    sigs, fx = collect_signals(real_clients)
    track = track_record(sigs)  # antécédents sur 12 mois, y compris signaux expirés
    sigs = [s for s in sigs if s.window[1] >= TODAY]  # un signal dont la fenêtre est passée ne prouve plus rien
    centroids = district_centroids()

    # district réel d'une entreprise = district le plus fréquent dans ses signaux publics
    comp_district = defaultdict(Counter)
    for s in sigs:
        if s.company and s.district and not s.fictif:
            comp_district[norm_company(s.company)][s.district] += 1

    opps: dict[tuple, Opportunity] = {}
    for s in sigs:
        for m in s.metiers:
            if s.company:
                nc = norm_company(s.company)
                key = ("entreprise", nc, m if key_mode == "entreprise_metier" else "*")
                district = (comp_district[nc].most_common(1) or [(s.district, 0)])[0][0]
            else:
                if not s.district:
                    continue
                key = ("zone", s.district, m)
                district = s.district
            o = opps.setdefault(key, Opportunity(key, s.company, district, key[2]))
            if not any(x is s for x in o.signals):  # un signal multi-métiers n'est compté qu'une fois
                o.signals.append(s)

    # contexte de zone : une entreprise avec un projet hérite de la tension de recrutement
    # (agences qui cherchent ses métiers dans son district). Seule la famille Recrutement est transmise.
    if zone_context:
        agency = defaultdict(list)
        for s in sigs:
            if s.type == "agences_concurrentes" and s.district:
                for m in s.metiers:
                    agency[(s.district, m)].append(s)
        for o in opps.values():
            if not o.company or not any(s.family == "projet" for s in o.signals):
                continue
            ms = {o.metier} if o.metier != "*" else {m for s in o.signals if s.family == "projet" for m in s.metiers}
            ctx = [a for m in sorted(ms) for a in agency.get((o.district, m), [])]
            if len(ctx) >= 2:  # au moins 2 annonces d'agences = vraie tension
                o.signals.append(Signal("recrutement", "tension_zone", None, o.district, sorted(ms),
                                        (TODAY, TODAY + timedelta(days=45)), None, 8,
                                        f"{len(ctx)} annonces d'agences concurrentes pour ces métiers dans le {o.district}",
                                        ctx[0].url, None,
                                        meta={"detail": {"titre": f"{len(ctx)} annonces d'agences dans la zone", "resume": None,
                                                         "faits": sorted({a.meta.get("agence") for a in ctx if a.meta.get("agence")})[:6]}}))

    # Projet et Recrutement déclenchent une opportunité ; Entreprise et Historique ne font que confirmer
    opps = {k: o for k, o in opps.items() if any(s.family in ("projet", "recrutement") for s in o.signals)}

    out = []
    for o in opps.values():
        _evaluate(o, fx["fx_candidats"], centroids)
        if not o.company:
            o.probable_companies = probable_companies(track, o.district, o.metier)
        out.append(o)
    out.sort(key=lambda o: (LEVELS.index(o.level), max(0, (o.window[0] - TODAY).days), -o.need[1], -o.weight))
    return out, fx


def track_record(sigs: list[Signal]) -> dict:
    """(district, métier) -> {entreprise: score}. Adjudication SIMAP = 1, annonce directe = 0,5."""
    tr = defaultdict(Counter)
    for s in sigs:
        if s.company and s.district and s.type in ("adjudication", "annonce_directe"):
            for m in s.metiers:
                tr[(s.district, m)][s.company] += 1 if s.type == "adjudication" else .5
    return tr


def probable_companies(track: dict, district: str, metier: str, k: int = 3) -> list[tuple[str, float]]:
    """Entreprises probables pour un projet de zone, avec une part estimée (antécédents dans la zone).
    Ce n'est PAS une attribution : affiché à titre indicatif, ne compte pas comme famille."""
    scores = track.get((district, metier)) or Counter()
    total = sum(scores.values())
    return [(c, v / total) for c, v in scores.most_common(k)] if total else []


def _evaluate(o: Opportunity, cands: list[dict], centroids: dict) -> None:
    fam = defaultdict(list)
    for s in o.signals:
        fam[s.family].append(s)
    o.families = sorted(fam)
    o.weight = sum(_dedup_weight([s.weight for s in v]) for v in fam.values())

    # fenêtre : priorité aux signaux qui datent le besoin (projet, historique), sinon recrutement
    timed = [s for s in o.signals if s.family in ("projet", "historique")] or o.signals
    upcoming = [s for s in timed if s.window[1] >= TODAY]
    if upcoming:
        start = min(max(s.window[0], TODAY) for s in upcoming)
        end = max(s.window[1] for s in upcoming)
        o.window = (start, end)

    # équipe estimée = effectif moyen mobilisé EN MÊME TEMPS dans l'horizon d'action :
    # seuls les signaux projet chiffrés dont la fenêtre commence dans l'horizon comptent ;
    # chaque phase de permis est pondérée par son occupation (durée réelle / largeur de fenêtre) ;
    # l'équipe d'un signal multi-métiers est répartie entre ses métiers.
    horizon_end = TODAY + timedelta(days=HORIZON_J)
    teams, seen = [], set()
    for s in fam.get("projet", []):
        if not s.team or s.meta.get("modification") or s.window[0] > horizon_end:
            continue
        k = (s.meta.get("permis_id"), s.meta.get("phase")) if s.type == "permis" else s.url
        if k in seen:
            continue
        seen.add(k)
        # cible entreprise (tous métiers) : toute l'équipe ; cible zone × métier : la part de ce métier
        share = (1 if o.key[2] == "*" else 1 / max(1, len(s.metiers))) * s.meta.get("occupation", 1.0)
        teams.append(tuple(x * share for x in s.team))
    if teams:
        o.team = tuple(sum(t[i] for t in teams) for i in range(3))
        pi = ASSUMPTIONS["part_interim"]
        o.need = (max(1, round(o.team[0] * pi[0])), max(1, round(o.team[1] * pi[1])), max(1, round(o.team[2] * pi[2])))
    else:  # pas de volume chiffré : historique (postes) ou annonces (1 poste par annonce)
        ads = [s for s in fam.get("recrutement", [])]
        n = max(len(ads), 1)
        o.need = (1, n, n + 1)

    # niveau
    near = o.window[0] <= TODAY + timedelta(days=HORIZON_J)
    nf = len(o.families)
    o.level = "AGIR" if nf >= 3 and near else "PRÉPARER" if nf >= 2 else "SURVEILLER"
    npub = len({s.family for s in o.signals if not s.fictif})
    o.level_public = "AGIR" if npub >= 3 and near else "PRÉPARER" if npub >= 2 else "SURVEILLER"

    if o.metier == "*":
        o.metier = Counter(m for s in o.signals for m in s.metiers).most_common(1)[0][0]
        o.metiers_all = sorted({m for s in o.signals for m in s.metiers})

    # vivier (métier principal du candidat uniquement)
    center = centroids.get(o.district)
    pool = {"disponibles": [], "bientot": [], "anciens": []}
    for c in cands:
        if o.metier != c["metier"]:
            continue
        if center and _km((c["lat"], c["lon"]), center) > c["rayon_km"]:
            continue
        free = date.fromisoformat(c["disponible_des"]) if c.get("disponible_des") else None
        if c["statut"] == "disponible":
            pool["disponibles"].append(c["id"])
        elif c["statut"] == "en mission" and free and free <= o.window[0] + timedelta(days=7):
            pool["bientot"].append(c["id"])
        elif c["statut"] == "ancien":
            pool["anciens"].append(c["id"])
    o.pool = pool
    dispo, soon, old = (len(pool[k]) for k in ("disponibles", "bientot", "anciens"))
    gap = max(o.need[1] - dispo - soon, 0)
    o.vivier = {"besoin": o.need[1], "disponibles": dispo, "bientot": soon, "anciens": old, "a_sourcer": gap}

    # action (le vivier choisit l'action, pas le niveau)
    who = o.company or f"les entreprises du {o.district}"
    if o.level == "SURVEILLER":
        o.action = "Surveiller : pas d'action commerciale"
    elif gap == 0:
        o.action = f"Appeler {who} {'cette semaine' if o.level == 'AGIR' else 'dans les 2–3 semaines'} avec {o.need[1]} profil(s) prêts"
    else:
        react = min(gap, old)
        o.action = (f"Sourcer d'abord : réactiver {react} ancien(s)" + (f", publier pour {gap - react}" if gap > react else "")
                    + f", puis appeler {who}")
