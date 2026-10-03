# FlexRadar — contexte pour Claude

Hackathon HackVS (Foire du Valais, 3–4 oct. 2026), challenge Flexsis (intérim bâtiment / industrie / logistique,
groupe Interiman). Pitch : *« Quand le client appelle, la course a déjà commencé. FlexRadar appelle avant, avec
les bons candidats. »* L'outil dit à un consultant quelle entreprise appeler, pour quel besoin futur, et quels
candidats proposer, à partir de signaux publics. Brief d'équipe :
https://claude.ai/code/artifact/1c0fc2cc-b32f-4f92-a28d-32757fa9638c

Langue : tout en français (UI, réponses, docs). Travail en cours sur la branche `magillie`.

## Repo

```
sources/     31 sources publiques (stdlib Python, aucune dépendance) + snapshots JSON (sources/_data/*.json)
             python3 -m sources check | stats | list | fetch all [--offline] | show <src>
             cache brut sources/_data/cache/ : gitignoré, ~190 Mo, local uniquement (fetch complet sans cache ≈ 20 min)
prototype/   moteur de signaux : signals.py (publication -> signal, ASSUMPTIONS), scoring.py (cibles, niveaux,
             vivier, action), export.py (JSON pour le front), brief.py / html.py (anciens aperçus)
             geo.py : fond de carte (une fois, versionné) -> web/public/data/geo.json (districts LV95 en km,
             simplifiés), img/valais-relief.jpg, img/districts/<n° OFS>.jpg (SWISSIMAGE du chef-lieu)
             images.py : vignettes aériennes des alertes -> web/public/img/alertes/ (+ logos jobup img/logos/)
             extract.py : extraction LLM (OpenAI, clé dans .env, modèle de .env.example) texte -> fiche citée ;
             cache versionné sources/_data/llm/<source>.json (démo hors ligne) ; `python3 -m prototype.extract permis|eval`
web/         React 19 + TS + Vite + Tailwind v4 + shadcn/ui (preset radix-nova, `cn` = paquet officiel shadcn)
             lit web/public/data/*.json (versionnés) ; npm run dev -> http://localhost:5173
             (5173 parfois pris par un autre projet local : `npx vite --port 5179 --strictPort`)
```

Après toute modif du moteur ou un fetch : `python3 -m prototype.export` (racine du repo), puis vérifier
`cd web && npx tsc -b && npx oxlint src`.

## Règles du moteur (validées avec l'utilisateur — ne pas changer sans demander)

- On compte des **familles** de signaux, pas des signaux : Projet, Recrutement, Entreprise, Historique.
- Niveau : **AGIR** = ≥ 3 familles ET besoin dans les 8 semaines · **PRÉPARER** = 2 · **SURVEILLER** = 1.
- Seuls Projet et Recrutement créent une opportunité ; Entreprise (FOSC) et Historique confirment.
- Cible : entreprise, sinon zone (district × métier) avec « entreprises probables » + part estimée
  (indicatif, ne compte jamais comme famille).
- **Aucun score sur 100 affiché** : badge de niveau + familles en pastilles, confiance en mots
  (« Élevée · 3 familles convergent »). Les poids internes servent uniquement au tri.
- Le **vivier ne change pas le niveau**, il choisit l'action (appeler avec des profils / sourcer d'abord).
- Volumes en **fourchettes**. Chaque fiche **cite ses sources** (liens).
- Données internes Flexsis (historique, vivier, clients, CRM) **fictives** : toujours marquées
  (`fictif: true`, badge « Données simulées »). Ne jamais inventer d'images, de scores ou de chiffres présentés
  comme réels.
- Calibrage non validé : formule montant → équipe (au-delà de 300 kCHF donne ~8 pers.) — piste durée ∝ √montant,
  à calibrer avec Flexsis. Demander avant de changer un chiffre d'hypothèse.

## Interface (décisions prises)

- **Un seul compte, pas de vue admin** (supprimée à la demande de l'utilisateur) : Julie Martin, Consultante (fictif).
- Sidebar shadcn (`sidebar-07` adapté, `lib/nav.ts` → `NAV_SECTIONS`) : logo radar + « FlexRadar » seuls en haut (pas de
  sous-titre), séparateur pleine largeur dessous ; sections
  **Prospection** : Dashboard · Alertes (badge = nb AGIR) · Carte ; **Portefeuille** : Clients · Candidats ;
  **Données** : Sources. Profil en bas avec menu : Mon profil, Paramètres, Déconnexion (désactivée).
- Bouton rond de repli sur la bordure de la sidebar (`sidebar-edge-toggle.tsx`) ; plus d'en-tête de page global
  (`app-header.tsx` supprimé), le titre est dans `PageHeader` (`components/page.tsx`).
- Typo : `text-xs` = 13 px, `text-sm` = 15 px (`index.css`) ; entrées de sidebar plus hautes (h-10, texte 16 px,
  icônes 20 px, `nav-main.tsx`).
- Pas de page Rapports en v1. Pages minimales d'abord. Données chargées via `DataProvider` (`web/src/lib/data.tsx`).
- **Dashboard** (`pages/dashboard.tsx`, « Brief de la semaine ») : doit tenir sans défiler (≥ 1366×768 ; depuis la
  hausse de la typo, dépasse de ~7 px à 1366×768 fenêtre). 4 KPIs (appels,
  renfort en fourchette, profils prêts, « Votre avance » = AGIR dus à l'historique, `level` ≠ `levelPublic`) ;
  3 cartes Priorité paginées (‹ ›) parmi les AGIR, même tri que le badge #1/#2/#3 d'Alertes (vue aérienne, renfort,
  « Pourquoi ? » via `shortReasons`, familles, vivier, couverture) ; sous la carte sélectionnée : candidats du `pool`
  + action recommandée, synthèse sans IA (copiable), lien `/alertes?id=<id>` — **à corriger** : Alertes ouvre une
  fiche via `?alerte=<key>`, ce lien n'ouvre donc rien. Écartés : mini-carte (page Carte),
  courbe de tension (pas d'historique), scores, « +x % vs semaine dernière ».
- Fait : shell, Dashboard, **Alertes** (voir « Page Alertes v2 » plus bas), Carte, Clients, Candidats, Sources.
- **Carte** (`pages/carte.tsx`, `components/map/`, `lib/carte.ts`) : SVG des 13 districts sur relief swisstopo,
  zoom/déplacement, filtres Période (J+7/30/90 = début du besoin) · Métier dans l'URL ; couleur = meilleur niveau
  du district, taille de bulle = renfort ; zones chaudes classées (niveau, nb AGIR/PRÉPARER, renfort) ;
  panneau district (vue aérienne, niveau + confiance en mots, renfort = somme des fourchettes AGIR+PRÉPARER,
  vivier = union des `pool` filtrée par métier, signaux publics, action) ; projection 13 semaines.
- **Sources** (`/sources`, `pages/sources.tsx`, `components/sources/`, `lib/sources-config.ts`) : UI épurée façon
  Fivetran — liste groupée par catégorie, une ligne = icône, nom lisible (`title` exporté), famille alimentée, fraîcheur,
  interrupteur ; détail + édition dans un panneau latéral (Sheet). **Sources publiques seulement** : les bases internes
  `fx_*` sont rattachées à Candidats / Entreprises (ligne « Base interne Flexsis »). Réglages en `localStorage`
  (`flexradar.sources.v1`), n'affectent PAS le moteur (une vraie source = module dans `sources/`).
- **Clients / Candidats** (`/clients`, `/candidats` ; `pages/clients.tsx`, `pages/candidats.tsx`, `components/db/`,
  `components/entreprises/`, `components/candidates/`, `lib/history.ts`) — anciennes pages admin Entreprises / Candidats : bases consultables (pas de classement ni de « performance », demandé par l'utilisateur) ;
  grille de cartes courtes 3/ligne (`components/db/record-card.tsx`, même anatomie que les cartes d'alerte : en-tête,
  mini-titre, 3 repères, pied), barre `DbToolbar` (pastilles + recherche, filtres compacts), « Voir plus » par 21 ;
  pastilles par statut (candidat : disponible / en mission / indisponible / ancien ; entreprise : actif = mission
  < 12 mois, ancien, sans mission), filtres + fiche (`?candidat=` / `?entreprise=`) avec historique des missions
  (`missions.json`, fictif). Fiche entreprise = registre Zefix réel (`registry` dans clients.json) + relation simulée.
- À faire (pages encore en `Placeholder`) : Mon profil, Paramètres ;
  « Préparer l'appel » et « Générer un email » (désactivés, « Bientôt disponible ») ; mail rédigé par LLM.

## Page Alertes v2 (faite, non commitée) : fil + tâches + modal

- 2 onglets (`?vue=taches`) : **Fil d'alertes** (grille 3 cartes par ligne, 21 puis « Voir plus » par 21 ; carte courte : en-tête,
  mini-titre = 2 raisons courtes, Renfort / Quand / Confiance en petit, pas de pastilles familles — détail dans le modal) et **Mes tâches** (kanban À faire / En cours / Traité, statut par menu, pas de
  drag & drop). Clic sur une carte = modal avec `AlertDetail` (`?alerte=<key>`).
- Carte compacte : petite vignette carrée en haut à gauche (`AlertAvatar`, même taille partout) = logo réel de
  l'entreprise (`company_logo_file` des annonces jobup, téléchargé dans `web/public/img/logos/`, 12 entreprises) ›
  vue aérienne du projet › district cadré (zone) › icône. Structure validée : en-tête (vignette, nom, lieu, dernier
  signal, pastille de niveau seule — plus de « #n Priorité ») / séparateur / résumé 2 lignes (`alertSummary`, construit
  depuis les signaux) / Renfort · Quand · Confiance / pied (nb de signaux, 🔖, Traiter). Modal limité à max-w-5xl.
- 🔖 = « À faire », bouton « Traiter » (icône UserRoundCheck) = « En cours » ; ensuite menu de statut.
- Filtre **Suivi** : par défaut « Hors mes tâches » (une alerte enregistrée quitte le fil), sinon « Toutes les
  alertes » / « Dans mes tâches ». Note libre par tâche (dans le modal, onglet Vue d'ensemble).
- Modal (`alert-detail.tsx`) : en-tête (vignette, nom, lieu, projet, familles ; suivi + fermer) sans pastille renfort ;
  navigation en tuile (4 onglets) ; corps gris à tuiles blanches : Informations + Confiance / Chronologie +
  Recommandations ; 3 boutons toujours visibles en pied : Préparer l'appel et Générer un email (désactivés,
  « Bientôt disponible »), Matchmaking candidats (ouvre l'onglet Candidats).
- Recommandations = règles dans `web/src/lib/reco.ts` (chaque action s'appuie sur un fait de la fiche ; vivier et
  historique marqués « Simulé »). Piste : reformulation LLM à l'export via `prototype/extract.py`.
- Tâches en `localStorage` (`flexradar.tasks.v1`, `web/src/lib/tasks.ts`), indexées par `key` stable de l'export
  (`entreprise|<nom normalisé>|*` ou `zone|<district>|<métier>`), jamais par `id` (= position, change à chaque export).
- Zones : silhouette du district sur le relief (`geo.json`) au lieu de la photo du chef-lieu ; titre
  « <métier> · zone <district> » (`alertTitle`).

### v1 (refonte d'après maquette)

Implémenté : `prototype/images.py` (vignettes `web/public/img/alertes/`, champs `image`/`place`), `registry` (fiche Zefix)
dans l'export, `alert-thumb.tsx`, `alertes.tsx`, `alert-detail.tsx`. Zones = vignette du chef-lieu (`img/districts/`
de `prototype/geo.py`). Spécification d'origine :

D'après un croquis de l'utilisateur (style maquette « Alertes & opportunités ») :
- titre « Alertes & opportunités » ; filtres Région · Métier · Horizon · Priorité · **Source** + Réinitialiser ;
  « N alertes détectées » + tri.
- carte d'alerte : **image** à gauche, nom, lieu, métiers, horizon en fourchette (« Dans 4–6 semaines »),
  badge « #1/#2/#3 Priorité » pour le top, encadré mis en avant = **renfort estimé** (à la place du score),
  3 raisons courtes à droite (« Adjudication SIMAP 1,2 MCHF »…).
- détail : image + nom + lieu + type de projet ; onglets Vue d'ensemble / Signaux / **Entreprise** (fiche Zefix) /
  Candidats ; Informations clés + Confiance (anneau 4 segments = familles présentes sur 4, pas de %) ;
  Signaux détectés (« il y a 3 jours ») ; Chronologie relative (« Dans 2–4 semaines : lancement du chantier ») ;
  bloc « Actions recommandées » (Préparer l'appel en principal).
- **Images = photos aériennes swisstopo réelles du lieu**, pas de photos inventées :
  - permis : coordonnées LV95 dans le texte (« Coordonnées: 2'579'324 1'104'027 », 1387/1401 permis) ;
  - autres : centroïde de la commune (sources `communes`, lat/lon -> LV95) ;
  - WMS : `https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.swisstopo.swissimage&STYLES=&CRS=EPSG:2056&BBOX=<minx,miny,maxx,maxy>&WIDTH=320&HEIGHT=240&FORMAT=image/jpeg` (testé : OK) ;
  - télécharger les vignettes à l'export dans `web/public/img/` (démo hors ligne), légende « © swisstopo ».
- Panneau détail : mise en page 2 colonnes via container queries quand la largeur le permet.

## En cours / attention

- Modif non commitée trouvée dans le repo (pas de Claude) : champ `pool` (ids des candidats comptés dans le vivier)
  dans `prototype/scoring.py`, `prototype/export.py`, `web/src/lib/types.ts`. La garder ; l'utiliser pour lister
  les candidats du vivier dans le détail. Vérifier qui travaille sur quels fichiers avant de toucher aux mêmes.
- Le dossier `/Users/magillie/dev/test_hackvs` était le bac à sable de préparation : ne plus y travailler.
- Vérifier le règlement HackVS sur le code préparé avant l'événement.
- Démo : rien en live (`--offline`), JSON versionnés.
