"""Amtsblattportal (SECO) : Bulletins officiels cantonaux + FOSC/SHAB.

API publique, sans clé : https://amtsblattportal.ch/api/v1
- /publications?...         liste (métadonnées seulement, pas de texte)
- /publications/{id}/xml    contenu complet structuré
- /rubrics                  catalogue de toutes les rubriques (tous cantons)

Rubriques utiles (Valais = tenant "kabvs", FOSC = tenant "shab") :
  BA-VS05  Demande d'autorisation de construire (mises à l'enquête)
  BA-VS10  Mise en consultation publique des plans
  BA-VS15  Approbation des plans - trafic     BA-VS20  ... - énergie
  BA-VS65  Avis général construction/territoire
  AL-VS20  Offre d'emploi (publique)          AR-VS40  Marchés publics hors simap
  HR01/02/03  Registre du commerce : nouvelle inscription / mutation / radiation
  KK01..KK12  Faillites                        NA..  Concordats
  AB20     Chantier sur route nationale avec travail de nuit
Autres cantons : `python -m sources rubrics` (ex. GR : AA-GR10 Baugesuch).
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from collections.abc import Iterable, Sequence
from typing import Optional

from ..core import http as _http
from ..core.record import i18n, record, since_date, strip_html

BASE = "https://amtsblattportal.ch/api/v1"
PAGE_SIZE = 200

# Balises purement techniques, ignorées dans le texte extrait.
SKIP = {
    "controls", "regOfficeSignature", "action", "key", "valueType", "selectType", "legalForm",
    "noUID", "sex", "img", "translation", "apiImport", "testImport", "uidOrganisationId",
    "uidOrganisationIdCategorie", "code13", "noAddress", "containsPostOfficeBox", "addition",
}


# --------------------------------------------------------------------------- API brute

def rubrics() -> list[dict]:
    """Catalogue complet des rubriques/sous-rubriques, tous tenants."""
    return _http.get_json(f"{BASE}/rubrics", ttl=7 * 86400)


def search(
    *,
    rubrics: Sequence[str] = (),
    sub_rubrics: Sequence[str] = (),
    cantons: Sequence[str] = ("VS",),
    since: Optional[str] = None,
    until: Optional[str] = None,
    max_items: int = 5000,
) -> list[dict]:
    """Liste des publications (champ `meta` uniquement), les plus récentes d'abord."""
    out: list[dict] = []
    page = 0
    while len(out) < max_items:
        d = _http.get_json(f"{BASE}/publications", {
            "publicationStates": "PUBLISHED",
            "cantons": list(cantons),
            "rubrics": list(rubrics),
            "subRubrics": list(sub_rubrics),
            "publicationDate.start": since,
            "publicationDate.end": until,
            "pageRequest.page": page,
            "pageRequest.size": PAGE_SIZE,
        })
        out += [p["meta"] for p in d["content"]]
        if not d["content"] or (page + 1) * PAGE_SIZE >= d["total"]:
            break
        page += 1
    return out[:max_items]


def xml(pub_id: str) -> ET.Element:
    """XML complet d'une publication (cache permanent : une publication ne change pas)."""
    return ET.fromstring(_http.get_text(f"{BASE}/publications/{pub_id}/xml", ttl=None).encode())


# --------------------------------------------------------------------------- parsing XML

LANGS = ("fr", "de", "it", "en")


def _leaves(el: ET.Element) -> Iterable[str]:
    """Valeurs texte d'un sous-arbre : sans balises techniques, une seule langue, HTML nettoyé."""
    if el.tag in SKIP:
        return
    kids = list(el)
    if not kids:
        t = (el.text or "").strip()
        if t and t not in ("true", "false"):
            yield strip_html(t) if "<" in t else t
        return
    if all(k.tag in LANGS or k.tag == "isoCode" for k in kids):  # {fr,de,it,en} -> une langue
        by_lang = {k.tag: (k.text or "").strip() for k in kids}
        t = next((by_lang[l] for l in LANGS if by_lang.get(l)), None)
        if t:
            yield strip_html(t) if "<" in t else t
        return
    for k in kids:
        yield from _leaves(k)


def _first_text(el: Optional[ET.Element]) -> Optional[str]:
    return next(iter(_leaves(el)), None) if el is not None else None


def _subject_name(el: ET.Element) -> Optional[str]:
    """Nom d'une personne morale ou physique dans un bloc <subject>/<debtor>/..."""
    company = el.find(".//company/name")
    if company is not None and company.text:
        return company.text.strip()
    for first, last in (("firstName", "officialName"), ("prename", "name")):
        f, l = el.findtext(f".//{first}"), el.findtext(f".//{last}")
        if l:
            return " ".join(x for x in (f, l) if x).strip()
    return el.findtext(".//name")


def content_text(content: ET.Element) -> str:
    """Texte lisible d'un bloc <content>, quelle que soit la rubrique."""
    pt = content.findtext("publicationText")
    if pt and pt.strip():
        return pt.strip()
    lines = []
    for el in content.iter("element"):
        label = _first_text(el.find("term"))
        vals = [v for child in el if child.tag != "term" for v in _leaves(child)]
        if vals:
            lines.append(f"{label}: {' '.join(vals)}" if label else " ".join(vals))
    if lines:
        return "\n".join(lines)
    # Rubriques sans <element> (ex. faillites) : "balise: valeur"
    return "\n".join(f"{tag}: {val}" for tag, val in _tagged_leaves(content))


def _tagged_leaves(el: ET.Element) -> Iterable[tuple[str, str]]:
    if el.tag in SKIP:
        return
    kids = list(el)
    if not kids or all(k.tag in LANGS or k.tag == "isoCode" for k in kids):
        for v in _leaves(el):
            yield el.tag, v
        return
    for k in kids:
        yield from _tagged_leaves(k)


def elements_by_key(content: ET.Element) -> dict[str, list[ET.Element]]:
    out: dict[str, list[ET.Element]] = {}
    for el in content.iter("element"):
        k = el.findtext("key")
        if k:
            out.setdefault(k, []).append(el)
    return out


# --------------------------------------------------------------------------- normalisation

def _base(source: str, meta: dict, content: ET.Element, **fields) -> dict:
    title = i18n(meta.get("title"))
    office = meta.get("registrationOffice") or {}
    pid = meta["id"]
    extra = fields.pop("extra", {})
    fields.setdefault("commune", title.rsplit(", ", 1)[-1] if title and ", " in title else office.get("town"))
    fields.setdefault("bfs", office.get("municipalityId"))
    return record(
        source, pid,
        kind=meta.get("subRubric"),
        date=(meta.get("publicationDate") or "")[:10] or None,
        title=title,
        text=f"{title}\n{content_text(content)}",
        url=f"{BASE}/publications/{pid}/xml",
        canton=(meta.get("cantons") or [None])[0],
        **fields,
        extra={
            "publication_number": meta.get("publicationNumber"),
            "rubric": meta.get("rubric"),
            "sub_rubric": meta.get("subRubric"),
            "registration_office": office.get("displayName"),
            "language": meta.get("language"),
            **extra,
        },
    )


def _detail(meta: dict) -> tuple[dict, ET.Element]:
    root = xml(meta["id"])
    return meta, root.find("content")


def _fetch(source: str, normalize, *, days: int, canton: str, max_items: int, **search_kw) -> list[dict]:
    metas = search(cantons=(canton,), since=since_date(days), max_items=max_items, **search_kw)
    print(f"  {source}: {len(metas)} publications, téléchargement des XML…")
    details = _http.pmap(_detail, metas)
    out = []
    for d in details:
        if d is None or d[1] is None:
            continue
        try:
            out.append(normalize(source, *d))
        except Exception as e:
            print(f"  ! {source} {d[0]['id']}: {e}")
    return out


def _norm_generic(source, meta, content):
    return _base(source, meta, content)


def _norm_construction(source, meta, content):
    by = elements_by_key(content)
    # Titre du projet = premier élément du bloc <primary>
    first = content.find(".//primary/element")
    project = " ".join(v for c in first if c.tag != "term" for v in _leaves(c)) if first is not None else None

    def names(key):
        return [n for n in (_subject_name(e) for e in by.get(key, [])) if n]

    applicants, framers = names("applicantParty"), names("projectFramer")
    return _base(
        source, meta, content,
        company=(applicants or [None])[0],
        extra={
            "project": project,
            "applicants": applicants,
            "architects": sorted(set(framers)),
            "parcels": [" ".join(v for c in e if c.tag != "term" for v in _leaves(c)) for e in by.get("parcel", [])],
            "econstruction_case": next((e.findtext("valueTextNeutral") for e in by.get("caseNo", [])), None),
        },
    )


def _norm_hr(source, meta, content):
    co = content.find(".//company")
    name = co.findtext("name") if co is not None else None
    seat = co.findtext("seat") if co is not None else None
    labels = {"HR01": "Nouvelle inscription", "HR02": "Mutation", "HR03": "Radiation"}
    rec = _base(
        source, meta, content,
        company=name,
        commune=seat,
        bfs=None,  # le bureau RC est cantonal, pas communal
        extra={
            "event": labels.get(meta.get("subRubric")),
            "uid": co.findtext("uid") if co is not None else None,
            "purpose": content.findtext(".//purpose"),
            "capital": content.findtext(".//capital/nominal"),
            "address": " ".join(_leaves(co.find("address"))) if co is not None and co.find("address") is not None else None,
        },
    )
    return rec


def _norm_bankruptcy(source, meta, content):
    debtor = content.find("debtor")
    town = debtor.findtext(".//town") if debtor is not None else None
    return _base(
        source, meta, content,
        company=_subject_name(debtor) if debtor is not None else None,
        commune=town,
        bfs=None,
        extra={"remarks": (content.findtext("remarks") or "").strip() or None},
    )


# --------------------------------------------------------------------------- presets

def fetch_permis_construire(days: int = 90, canton: str = "VS", max_items: int = 3000) -> list[dict]:
    """Mises à l'enquête publiques (demandes d'autorisation de construire)."""
    return _fetch("permis_construire", _norm_construction, days=days, canton=canton,
                  max_items=max_items, sub_rubrics=(f"BA-{canton}05",))


def fetch_grands_projets(days: int = 90, canton: str = "VS", max_items: int = 1000) -> list[dict]:
    """Plans mis en consultation, approbations trafic/énergie, avis construction (gros chantiers)."""
    subs = tuple(f"BA-{canton}{n}" for n in ("10", "15", "20", "65"))
    return _fetch("grands_projets", _norm_construction, days=days, canton=canton,
                  max_items=max_items, sub_rubrics=subs)


def fetch_registre_commerce(days: int = 180, canton: str = "VS", max_items: int = 8000) -> list[dict]:
    """FOSC : créations, mutations, radiations d'entreprises."""
    return _fetch("registre_commerce", _norm_hr, days=days, canton=canton,
                  max_items=max_items, rubrics=("HR",))


def fetch_faillites(days: int = 60, canton: str = "VS", max_items: int = 2000) -> list[dict]:
    """FOSC : faillites + concordats (sursis)."""
    return _fetch("faillites", _norm_bankruptcy, days=days, canton=canton,
                  max_items=max_items, rubrics=("KK", "NA"))


def fetch_capital(days: int = 90, canton: str = "VS", max_items: int = 1000) -> list[dict]:
    """FOSC : communications d'entreprises (augmentations de capital, dividendes, AG…)."""
    return _fetch("fosc_capital", _norm_generic, days=days, canton=canton, max_items=max_items, rubrics=("UP",))


def fetch_emplois_publics(days: int = 60, canton: str = "VS", max_items: int = 500) -> list[dict]:
    """Offres d'emploi publiées au Bulletin officiel (communes, canton)."""
    return _fetch("emplois_publics", _norm_generic, days=days, canton=canton,
                  max_items=max_items, sub_rubrics=(f"AL-{canton}20",))


def fetch_rubrique(*sub_rubrics: str, days: int = 30, canton: str = "VS", max_items: int = 2000,
                   source: str = "amtsblatt") -> list[dict]:
    """N'importe quelle sous-rubrique, ex. fetch_rubrique('AB20') ou ('AR-VS05', 'AR-VS07')."""
    return _fetch(source, _norm_generic, days=days, canton=canton, max_items=max_items,
                  sub_rubrics=sub_rubrics)
