# Sources de données

> Chemins relatifs à `backend/` ; les commandes se lancent depuis `backend/` (ou via le `Makefile` à la racine).

Le paquet `sources/` collecte 31 sources publiques suisses (et les données internes Flexsis simulées) et les
ramène toutes au même format de record. Python ≥ 3.9, **aucune dépendance** (bibliothèque standard uniquement).

```
sources/
├── __init__.py      registre SOURCES, load / fetch / save, enrichissement commune -> district
├── __main__.py      CLI : list | check | stats | fetch | show | rubrics
├── core/            http.py (cache, retries, hors ligne) · record.py (format commun) · paths.py
├── public/          connecteurs : amtsblatt, simap, jobroom, jobup, flexsis, zefix, stattab, presse, meteo…
├── reference/       référentiels de jointure : communes, metiers, calendrier
└── simulated/       flexsis_fictif.py : données internes Flexsis SIMULÉES
data/
├── snapshots/       un JSON par source (versionné : la démo tourne hors ligne)
├── config/          sites_web.json (sites crawlés)
├── llm/             cache des extractions LLM (écrit par engine/llm)
└── cache/           cache HTTP brut (gitignoré)
```

```bash
python3 -m sources check          # les API répondent-elles encore ?
python3 -m sources fetch all      # rafraîchit tous les snapshots
python3 -m sources list           # état des snapshots
```

```python
from sources import load, fetch, load_all, communes

permis = load("permis_construire")          # snapshot local, instantané, zéro réseau
simap  = fetch("simap", days=30)            # re-télécharge (ou cache) et ré-écrit le snapshot
idx    = communes.index()                   # jointure commune / n° OFS -> district + lat/lon
communes.lookup("Sierre", idx)["extra"]["district"]
```

## Vérifier que ça marche

| commande | répond à |
|---|---|
| `python3 -m sources check` | Chaque API répond-elle ? (1 appel léger par source, code retour ≠ 0 si échec) |
| `python3 -m sources fetch all` | Récupération complète (~1 min), avec `✓ N records` ou `✗ erreur` par source |
| `python3 -m sources stats` | Volume, date de la dernière publication, âge du snapshot, % de champs remplis, alertes |
| `python3 -m sources show simap -n 3` | Contrôle à l'œil de records réels |

Les colonnes à 0 % pour les statistiques (`company`, `commune`…) sont normales : ces sources n'ont pas d'entreprise ou pas de commune. `stats` ne lève pas d'alerte de fraîcheur sur les statistiques ni sur les données fictives.

## Catalogue (31 sources)

Volumes = snapshot du 2 octobre 2026, Valais. Aucune source ne demande de clé.

**Référentiels (tables de jointure)**

| nom | contenu | origine |
|---|---|---|
| `communes` | 122 communes : n° OFS, district, lat/lon | OFS + geo.admin.ch |
| `metiers` | 31 métiers bâtiment/industrie/logistique : ISCO, regex de détection, chômage SECO, salaire médian | référentiel maison + `penurie` + `salaires` |
| `calendrier` | Jours fériés + vacances scolaires VS (officiel), saisons, congés du bâtiment, grands événements (**approx.**) | OpenHolidays API + liste curée |

**Chantiers et projets**

| nom | contenu | origine | défaut |
|---|---|---|---|
| `permis_construire` | Mises à l'enquête : projet, requérant, architecte, parcelles, n° eConstruction | Bulletin officiel VS (BA-VS05) | 90 j |
| `grands_projets` | Plans en consultation publique, approbations trafic / énergie | Bulletin officiel (BA-VS10/15/20/65) | 90 j |
| `simap` | Appels d'offres + **adjudications avec entreprise lauréate et montant CHF** | simap.ch API | 365 j |
| `construction_ofs` | Dépenses de construction + **réserves de travail (année suivante)** par commune | OFS STAT-TAB | 5 ans |

**Entreprises**

| nom | contenu | origine | défaut |
|---|---|---|---|
| `registre_commerce` | Créations / mutations / radiations (but, capital, adresse, UID) | FOSC (HR) | 180 j |
| `faillites` | Faillites + concordats | FOSC (KK, NA) | 60 j |
| `fosc_capital` | Augmentations de capital, communications aux actionnaires | FOSC (UP) | 90 j |
| `zefix` | Fiche officielle (but, siège, succursales, dernières publications FOSC) des entreprises vues dans simap / permis / jobroom | zefix.ch REST | — |
| `sites_web` | Pages actualités / projets / carrière / avis des sites listés dans `data/config/sites_web.json` | crawl léger | — |

**Emploi et marché du travail**

| nom | contenu | origine | défaut |
|---|---|---|---|
| `jobroom` | Toutes les offres du canton (agrégateur SECO) + indicateurs agence / job board / obligation d'annonce + `extra.metiers` | job-room.ch (API interne) | 30 j |
| `jobup` | Offres jobup.ch avec employeur et segment (PME / grande entreprise / agence) | jobup.ch (API publique du site) | tout |
| `flexsis` | Offres publiées par Flexsis | flexsis.ch (HTML + JSON-LD) | tout |
| `emplois_publics` | Offres au Bulletin officiel | Bulletin officiel (AL-VS20) | 60 j |
| `penurie` | Professions avec **≥ 5 % de chômage** (nb de chômeurs, actifs, taux, code ISCO) | SECO, liste d'obligation d'annonce (PDF) | année |
| `emplois_ofs` | Établissements / emplois / EPT par commune et secteur | OFS STATENT | 3 ans |
| `salaires` | Salaire mensuel brut (médiane, P25, P75) par groupe de professions ISCO | OFS LSE | 2 éditions |
| `places_vacantes` | Places vacantes (nombre, indice, taux) par grande région | OFS | 12 trim. |

**Tourisme et saisonnalité**

| nom | contenu | origine | défaut |
|---|---|---|---|
| `hesta` | Arrivées et nuitées hôtelières par commune et par mois | OFS HESTA | 3 ans |
| `meteo` | Prévisions 16 jours + jours de gel / pluie / neige | Open-Meteo | 16 j |
| `meteosuisse` | Mesures journalières réelles de 20 stations VS (température, pluie, neige, vent) | MétéoSuisse Open Data | 60 j |

**Presse et institutions**

| nom | contenu | origine |
|---|---|---|
| `presse` | Le Nouvelliste (sitemap news), Canal9 (RSS), Rhône FM (rubrique Valais) : titre + chapeau | sites des médias |
| `communiques_vs` | Communiqués de l'État du Valais | vs.ch |

**Données internes Flexsis — FICTIVES** (`sources/simulated/flexsis_fictif.py`, graine fixe, `extra.fictif = True`, texte préfixé `[FICTIF]`)

| nom | contenu |
|---|---|
| `fx_clients` | Clients : secteur, taille, commune, métiers achetés, consultant |
| `fx_candidats` | Vivier : métier(s), expérience, commune, **rayon de mobilité**, permis, véhicule, **certifications**, langues, **statut et date de disponibilité** |
| `fx_demandes` | Historique des demandes : métier, nb de postes, prévenance, issue, délai de placement, concurrent gagnant |
| `fx_missions` | Missions (= placements réussis) : candidat, client, dates, heures, taux facturé, évaluation |
| `fx_contacts` | CRM : appels, visites, mails, objet, résultat |
| `fx_kpis` | **Délai moyen de placement et taux de couverture par métier et par district**, mobilité |

Le générateur fixe le schéma : si Flexsis fournit ses vraies données, il suffit de les convertir dans
les mêmes champs. `flexsis_fictif.generate(real_clients=True)` donne aux clients fictifs les noms
d'entreprises réelles vues dans les sources publiques (les historiques restent inventés : à
présenter comme tels).

## Couverture de la liste de sources demandée

| demandé | statut | où |
|---|---|---|
| SIMAP | ✅ | `simap` |
| eConstruction Valais | ✅ via le Bulletin officiel (pas d'API publique eConstruction) | `permis_construire`, n° de dossier dans `extra.econstruction_case` |
| Bulletin officiel du Valais | ✅ | `permis_construire`, `grands_projets`, `emplois_publics`, `amtsblatt.fetch_rubrique()` |
| Job-Room / SECO | ✅ | `jobroom` |
| Zefix | ✅ | `zefix` |
| FOSC (créations, faillites, changements, capital) | ✅ | `registre_commerce`, `faillites`, `fosc_capital` |
| Historique missions / demandes, base candidats, disponibilités, compétences / certifications / mobilité, CRM, contacts, placements | 🟡 **fictif** (données internes, non publiques) | `fx_*` |
| Délai moyen de placement, taux de couverture par métier / région | 🟡 **fictif**, calculé sur les données fictives | `fx_kpis` |
| Données de mobilité géographique des candidats | 🟡 **fictif** | `fx_candidats.extra.rayon_km`, `fx_kpis` |
| Sites web des entreprises clientes, pages projets / actualités / carrière | ✅ moteur prêt, **liste des clients à fournir** | `sites_web` + `data/config/sites_web.json` → `entreprises` |
| Sites des communes | ✅ 12 communes principales | `sites_web` |
| OFS / STAT-TAB | ✅ 5 tables + requêteur générique | `construction_ofs`, `emplois_ofs`, `salaires`, `places_vacantes`, `stattab.query()` |
| HESTA | ✅ | `hesta` |
| MétéoSuisse Open Data | ✅ | `meteosuisse` (+ `meteo` pour les prévisions) |
| Vacances scolaires, jours fériés | ✅ officiel | `calendrier` |
| Congés collectifs du bâtiment, saison touristique, vendanges, saison de ski, grands événements | 🟡 dates **approximatives**, curées à la main (`a_verifier`) | `calendrier` ; la saisonnalité réelle se mesure avec `hesta` |
| Jobup | ✅ | `jobup` |
| Indeed | ❌ bloqué (HTTP 403, anti-bot) | — |
| LinkedIn Jobs | ❌ volontairement non branché (CGU interdisant le scraping, risque juridique) | — |
| Presse locale, Le Nouvelliste, Rhône FM, Canal9 | ✅ titres + chapeaux | `presse` |
| Communiqués cantonaux | ✅ | `communiques_vs` |
| Données de pénurie par métier | ✅ approché : chômage ≥ 5 % (SECO) ; absent de la liste = métier tendu | `penurie`, `metiers` |
| Données de chômage par profession | 🟡 partiel : national, seulement pour les métiers au-dessus de 5 % | `penurie` ; par annonce : `jobroom.extra.reporting_obligation` |
| Données de salaire par métier | ✅ par groupe ISCO (2 chiffres), région lémanique | `salaires`, `metiers` |

`--days N` et `--canton XX` s'appliquent à toutes les sources qui les acceptent.
Autre canton : `python3 -m sources rubrics GR` pour connaître les codes de rubrique
(ex. GR : `AA-GR10` = Baugesuch), puis `amtsblatt.fetch_rubrique("AA-GR10", canton="GR")`.

## Format commun d'un record

Toutes les sources renvoient le même schéma (détail dans `sources/core/record.py`) :

```json
{
  "source": "simap", "id": "…", "kind": "award", "date": "2026-10-02",
  "title": "H203 Virage des Esserces : revêtements bitumineux",
  "text": "texte complet en clair, à donner tel quel à un LLM",
  "url": "lien vers la publication d'origine (à citer)",
  "canton": "VS", "commune": "Martigny-Combe", "bfs": 6137,
  "company": "Weibel SA", "lat": 46.067, "lon": 7.037,
  "extra": { "district": "District de Martigny",
             "winners": [{"name": "Weibel SA", "price_chf": 118796.95}], "...": "..." }
}
```

- `text` sert à l'extraction LLM, `extra` contient les champs déjà structurés, `url` sert à citer la source.
- `bfs` = n° OFS de la commune. À la sauvegarde, `enrich()` rattache chaque record au référentiel `communes` (par n° OFS ou par nom, avec alias pour les localités et anciennes communes : Verbier → Val de Bagnes, etc.) et complète `bfs`, `lat`/`lon` et `extra.district`. Couverture actuelle : de 84 à 99 % selon la source. Pour combler un manque, compléter `communes.ALIASES`.
- Snapshots : `data/snapshots/<source>.json` = `{source, fetched_at, params, count, records}`.

## Cache et démo hors ligne

- Chaque requête HTTP est mise en cache dans `data/cache/` : 6 h pour les listes, sans limite pour les détails (une publication ne change pas). Un second `fetch` ne coûte donc presque rien.
- **`SOURCES_OFFLINE=1`** ou `fetch … --offline` : aucun appel réseau, tout est servi depuis le cache. À activer pour la démo.
- Le cache (~120 Mo) est exclu de git. Les snapshots `data/snapshots/*.json` (~35 Mo) sont versionnés et suffisent à faire tourner un projet.

## Ajouter une source

1. Créer `sources/public/ma_source.py` avec `fetch(**kwargs) -> list[dict]`, qui construit chaque record avec `record("ma_source", id, …)`.
2. Utiliser `core.http.get_json / get_text / request` : cache, retries et mode hors ligne sont alors inclus. Utiliser `core.http.pmap` pour paralléliser la récupération des détails.
3. L'ajouter à `SOURCES` dans `__init__.py` et, si possible, à `cmd_check` dans `__main__.py`.

## Notes et pièges connus par source

- **amtsblattportal** : la liste ne contient que les métadonnées, le texte complet est dans `/publications/{id}/xml`. Le serveur renvoie parfois du gzip sans qu'on le demande (géré). La commune est déduite du titre (« …, Sion ») ; `bfs` n'est renseigné que si l'office qui publie est communal. Filtres utiles : `cantons`, `rubrics`, `subRubrics`, `publicationDate.start/end`, au maximum 200 résultats par page.
- **SIMAP** : sans recherche textuelle, au moins un « quick-filter » est obligatoire (`projectSubTypes`, etc.). La pagination fonctionne avec `lastItem`. Seuls les marchés au-dessus des seuils légaux y figurent. Les lauréats sont dans `decision.vendors` (y compris par lot). La spec complète est à `https://www.simap.ch/api/specifications/simap.yaml`.
- **job-room** : API interne non documentée, susceptible de changer. Le body de recherche est dans `jobroom.py` et le total dans l'en-tête `X-Total-Count`. `communalCode` = n° OFS. Les flags `is_staffing_agency` et `is_job_board` reposent sur une regex, ce n'est qu'une heuristique.
- **flexsis.ch** : la pagination est `/offres-emploi-<region>/page/N/`. La localité exacte n'apparaît que dans le JSON-LD `JobPosting` de la page de détail.
- **Open-Meteo** : jusqu'à 16 jours de prévision, plusieurs localités en un seul appel. Pour d'autres lieux, utiliser `meteo.fetch(towns=[(nom, bfs, lat, lon), …])`.
- **Zefix** : l'API officielle (ZefixPublicREST) exige un compte ; on utilise l'API REST du site. Le Valais a 3 offices du registre (600 Haut-Valais, 621 Valais central, 626 Bas-Valais). Le rapprochement ne se fait que sur un nom identique après normalisation : pas de correspondance approximative.
- **jobup** : 20 résultats maximum par page. Les annonces recoupent en partie job-room (qui agrège jobup).
- **STAT-TAB (PxWeb)** : limite de débit (HTTP 429, gérée par les retries). `stattab.query(table, {variable: [codes] | fonction | None})` interroge n'importe quelle table, et `stattab.tables()` les liste. Les montants de construction sont en milliers de CHF. HESTA a environ 2 mois de décalage.
- **MétéoSuisse** : les CSV sont en latin-1 et séparés par `;`. `_d_recent` couvre l'année en cours ; il existe aussi `_m` (mensuel) et `_historical`.
- **SECO / pénurie** : le PDF annuel est trouvé automatiquement sur arbeit.swiss. Le rafraîchir demande `pdftotext` (poppler), sinon utiliser le snapshot.
- **Presse** : le Nouvelliste est souvent payant, seuls le titre et les mots-clés sont récupérés. Pour Rhône FM, on prend les articles listés sur la page Valais.
- **sites_web** : crawl d'un seul niveau, 3 pages par catégorie et par site. Ajouter les sites des clients dans `data/config/sites_web.json`.
- **calendrier** : les entrées curées (saisons, congés du bâtiment, événements) ont `extra.confidence = "approx"` : vérifier les dates avant toute démo.
