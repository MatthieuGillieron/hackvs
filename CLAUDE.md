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

## Couche LLM (OpenAI, clé dans `.env` gitignoré, modèle `OPENAI_MODEL`)

- `prototype/extract.py` : texte brut (`text` des records) -> fiche JSON stricte + citation (`preuve`), cache versionné
  `sources/_data/llm/<tâche>.json` (id + empreinte du texte -> démo hors ligne, seuls les nouveaux records partent).
  Tâches : `permis` (type, ampleur, certitude, corps de métier, entreprise) et `grands_projets` / `presse` /
  `communiques_vs` (annonces de projet). `python3 -m prototype.extract <tâche>` ; `… eval` compare LLM / regex.
- Le LLM fournit des **faits**, jamais de niveau ni de volume. `signals.py` : fiche LLM d'abord, regex en repli ;
  entreprise = nom exact du permis (regex) sinon LLM ; certitude « faible » = poids de tri × 0,7.
  Annonces de projet = signal Projet de **zone**, long terme (`delai_plans_debut_j` 6–18 mois, `delai_presse_debut_j`
  12–36 mois, validés), **sans renfort chiffré**. Signaux marqués `ia` + `preuve` (badge « Extrait par IA »).
- `prototype/emails.py` : emails de prospection pré-rédigés (alertes entreprise AGIR/PRÉPARER, FR ou DE selon le
  district) -> `web/public/data/emails.json` ; `components/alerts/email-dialog.tsx` (bouton « Générer un email »).
- `prototype/calls.py` : fiches « Préparer l'appel » (AGIR/PRÉPARER, entreprise ou zone avec entreprises probables)
  -> `web/public/data/calls.json` : faits (contact FICTIF déterministe, tél. `027 000 …`, relation, demandes non
  pourvues, agences concurrentes hors Flexsis/job boards, délais de placement) + guide LLM (accroche, qui demander,
  questions dépliables (pourquoi / à noter), objections, conclusion, objectif + durée, pitch par profil).
  `components/alerts/call-sheet.tsx` (d'après maquette) : remplace le détail dans le modal d'alerte (bouton retour),
  `CallButton` pour l'ouvrir hors modal (Dashboard) ; gauche = en-tête (#n priorité top 3 AGIR, secteur + phases),
  besoin, pourquoi maintenant (groupé par type), relation, contact ; droite = onglets Guide / Profils / Compte-rendu,
  accent orange ; guide **personnel** (« j'ai vu votre projet, j'ai anticipé, j'ai déjà ces profils prêts », jamais
  « meilleure agence », limites de mots) ; `match_profiles` (calls.py) : vivier + disponibles des métiers de l'alerte,
  meilleur profil par métier puis complément, atouts = distance au chantier / dispo avant démarrage / missions chez
  ce client (note si ≥ 4) / certifs ; étape « Vos profils prêts » + email des profils ; onglet Profils = `CandidateCard`
  (`components/candidates/candidate-card.tsx`, partagée avec la page Candidats), fiche candidat ouverte sur place ;
  compte-rendu
  (`logCall` dans `tasks.ts` : Pas de besoin -> Traité, sinon En cours).
  Ordre : `python3 -m prototype.export && python3 -m prototype.emails && python3 -m prototype.calls`.

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
- Sidebar shadcn (`sidebar-07` adapté, `lib/nav.ts` → `NAV_SECTIONS`) : logo officiel **Flexsis** seul en haut (`web/public/img/brand/` : logo complet clair/sombre, symbole quand la sidebar est repliée, aussi favicon ; récupérés sur flexsis.ch). Nom affiché de l'app = « Flexsis » (onglet, sidebar) ; « FlexRadar » reste le nom de projet du pitch ; pas de
  sous-titre, séparateur pleine largeur dessous ; sections
  **Prospection** : Accueil · Alertes (badge = nb AGIR) · Analytics ; **Portefeuille** : Clients · Candidats ;
  **Données** : Sources. Profil en bas avec menu : Mon profil, Paramètres, Déconnexion (désactivée).
- Bouton rond de repli sur la bordure de la sidebar (`sidebar-edge-toggle.tsx`) ; plus d'en-tête de page global
  (`app-header.tsx` supprimé), le titre est dans `PageHeader` (`components/page.tsx`).
- Typo : `text-xs` = 13 px, `text-sm` = 15 px (`index.css`) ; entrées de sidebar plus hautes (h-10, texte 16 px,
  icônes 20 px, `nav-main.tsx`).
- **Squelette de page commun, modèle = Alertes** : en-tête sur fond blanc (titre, onglets / pastilles de statut,
  recherche), puis `PageBody` (`components/page.tsx`) = fond gris pleine largeur jusqu'en bas, cartes blanches dessus.
  Appliqué : Alertes, Clients, Candidats (`DbTabsBar` en blanc, `DbFilterBar` + grille en gris), Sources, Profil,
  Paramètres. Analytics aussi.
- Pas de page Rapports en v1. Pages minimales d'abord. Données chargées via `DataProvider` (`web/src/lib/data.tsx`).
- **Accueil** (ex-Dashboard, `/`, `pages/dashboard.tsx`, « Bonjour Julie · Voici ce qui demande votre attention
  aujourd'hui ») : même squelette qu'Alertes (`PageHeader` blanc + `PageBody` gris). Rangée du haut (h-64, 2 col.) :
  **Pipeline de suivi** en 2×2 (À faire | En cours / En attente = dernier appel « à rappeler » | Clos 7 j ; icône
  orange + séparateur vertical, même style pour les 4) et **Rappels** (callbacks, pastille Client si
  `clients[].alertKeys`). Dessous : **Top 3 des nouvelles opportunités** = 3 premières alertes actives hors tâches
  (tri d'Alertes), affichées avec `AlertCard` du fil, clic = `/alertes?alerte=<key>`. Puis **Projets détectés par semaine** (ex-« Pouls du radar »), bandeau sur une rangée
  en 2 parties (titre + 2 chiffres | barres) qui prend la hauteur restante (lg : page = hauteur d'écran, aucun défilement) : nouveaux projets publics (famille Projet, signaux dédoublonnés) par semaine glissante sur 12 semaines, barres fines, survol =
  détail par type au-dessus des barres ; à gauche « N nouveaux projets ces 7 derniers jours » et « N offres d'emploi
  actives » (pas de pourcentage, retiré à la demande).
  Recrutement exclu de la courbe : les annonces n'ont pas d'historique (visibles seulement tant qu'elles sont en
  ligne), une courbe « tous signaux » ferait croire à une accélération du marché. Retirés à la demande : tuiles
  de chiffres, plan d'action, tableau d'opportunités, couverture du vivier, activité récente.
- Fait : shell, Accueil, **Alertes** (voir « Page Alertes v2 » plus bas), Analytics, Clients, Candidats, Sources.
- **Analytics** (`/analytics`, ex-Statistiques ; `/statistiques` et `/carte` redirigés ; `pages/analytics.tsx`,
  `components/analytics/ui.tsx`, `lib/analytics.ts`) : **une seule page, l'essentiel** (pas d'onglets), d'après une
  maquette de l'utilisateur (4 oct.) ; squelette Alertes ; **tout tient à l'écran sans défiler** (exigé, vérifié à
  1366×681 : `PageBody` lg de hauteur `100svh - 6.375rem`, la 2e rangée prend le reste ; attention à la largeur
  minimale de la bande, qui peut faire déborder la page à droite). Période 30 j / **90 j (défaut)** / 12 mois
  (`?periode=`) = date de **détection** (1er signal public daté) et date des actions. Clic sur une tuile de district =
  filtre de toute la page (`?district=`, la bande Zones l'ignore). De haut en bas :
  1. **Du signal au client** (pièce maîtresse de la démo), widget d'après mockup (4 oct.) : 5 cartes verticales
     (icône orange, trait horizontal, étape, grand chiffre en gras, sous-titre : analysées / identifiées / en cours /
     contactées / qualifiés), reliées par des flèches **sans taux** (retirés à la demande), chiffres text-lg / text-3xl,
     badge « Activité en partie démo ». Format complet dès 820 px de haut ; compact en dessous (icône + étape sur une
     ligne, sous-titre à côté du chiffre). Phrase de synthèse retirée (absente du mockup).
  2. Rangée `flex-[2.1] tall:flex-[2.6]` (proportions du mockup : tableau + chiffres ≈ 2,6 × la carte ; 2,1 sous
     820 px de haut, minimum pour les chiffres) : **Tension par métier** (tableau Métier / Tension / Couverture / Statut ; statut en
     texte, « ⚠ X à sourcer » en texte normal noir (icône orange) / « ✓ Couvert » vert, sans pastille ; **jamais de ligne coupée** : n'affiche
     que les lignes qui tiennent (hauteurs mesurées dans le navigateur) + « Voir les N autres métiers » qui déplie la
     liste complète en défilement interne ; manques d'abord, couverture = vivier / bas de fourchette ; clic sur une
     ligne = détail + « voir les alertes ») | colonne de 20rem : **un seul widget** avec les 3 **chiffres** séparés par des traits (`Stat` sans carte propre, compacts sous 820 px de haut, format mockup au-delà via
     `tall:`) :
     Anticipation (médiane 1er signal -> début du besoin ; sous-texte réduit à « pour 8 alertes sur 10 » à la demande), Couverture du vivier (simulé, sans pastille « à sourcer »),
     Clients intéressés (cohorte des alertes suivies + taux d'appels « Intéressé », bouton Démo).
  3. **Zones** en bande pleine largeur `flex-1` (la carte a été retirée à la demande : trop petite dans une bande
     large) : les 13 districts en tuiles **regroupées par niveau** (urgent -> à anticiper -> veille -> sans alerte, le plus
     d'alertes d'abord à niveau égal ; `lg:grid-cols-13`), barre de couleur = niveau le plus élevé,
     nom, nombre d'alertes urgentes ou à anticiper, renfort en fourchette ; clic = filtre `?district=`. Légende à
     droite du titre. `components/map/valais-map.tsx` n'est plus utilisé par aucune page.
  Disposition et proportions = mockup de l'utilisateur (4 oct., dessiné sur ~1366×1010), sans scroll à toute hauteur.
  Icônes comme le « Pipeline de suivi » de l'Accueil : orange **sans fond**, suivies d'un **trait vertical** (étapes de
  l'entonnoir, chiffres) ; titres de widgets = icône orange simple.
  **Pas de « vs période précédente »** (l'export ne garde que les alertes vivantes : artefact) ni de « missions
  gagnées » (aucune donnée ne relie une alerte à une mission). Démo : `demoTasks` déterministe, tâches `demo: true`,
  retirables (`clearDemoTasks`), jamais sur une tâche réelle.
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
  Fiches en modal large (`sm:max-w-5xl`). Candidats : avatar illustré DiceBear `personas` généré localement depuis
  l'id (`lib/avatar.ts`, `CandidateAvatar`, genre déduit du prénom) — dessin, jamais de photo (candidats fictifs).
  Carte entreprise : cloche + pastille rouge (nb d'alertes AGIR/PRÉPARER), pas de badge de niveau ; la fiche liste
  chaque alerte (lien « Voir l'alerte » seul, sans pastille de niveau -> `/alertes?alerte=<key>`, clés exportées dans `clients.json` `alertKeys`).
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
- Modal (`alert-detail.tsx`, refonte 3 oct.) : **tout tient à l'écran sans défiler** (≥ 1366×768, modal
  `h-[min(92svh,900px)]`), les listes longues défilent dans leur tuile ; **seul l'onglet Candidats défile**.
  Accent = `--primary` orange (changé dans `index.css`, comme « Préparer l'appel ») ; couleurs des familles inchangées.
  En-tête compact (vignette, nom + niveau, lieu · projet ; suivi + fermer — **pas de lien registre**, il est dans
  l'onglet Entreprise) ; espacements serrés sous 820 px de haut, plus aérés au-delà (variante `tall:` de `index.css`) ;
  onglets soulignés avec icônes ; corps gris à tuiles blanches ; pied : Générer un email + Préparer l'appel.
- Vue d'ensemble : Informations clés (grille 2×2) + Confiance (2 colonnes égales, textes non tronqués), puis Chronologie qui prend la hauteur restante
  (`alert-timeline.tsx` : vraie échelle de temps aujourd'hui → fin du besoin ; 2 étapes Projet max en barres datées,
  infos à gauche (19rem) : « Dans x semaines | le jj.mm.aa » + pastille de durée estimée ; métiers en pastilles sous « Pic de besoin » seulement (écrans hauts) ;
  barres fines et claires ; **pic de besoin = histogramme** des candidats adéquats libres par
  semaine (quinzaine si > 40 sem., simulé, survol = nombre), orange dans la fenêtre du besoin ;
  note de tâche à côté). `web/src/lib/reco.ts` reste inutilisé.
- Onglet Signaux (`signal-board.tsx`) : une colonne par famille, regroupés par type (« pourquoi c'est important » =
  `SIGNAL_WHY` dans `format.ts`, texte fixe), 3 visibles puis « Voir les N autres » ; les phases d'un même permis
  sont fusionnées ; carte = titre, résumé, faits en pastilles, lien « Voir la source · site » toujours visible.
  Contenu = champ `detail` des signaux (`signals.py` `detail()` : résumé des fiches LLM **déjà en cache** pour
  permis / annonces de projet, champs structurés pour SIMAP / annonces / FOSC / historique) — **aucun appel LLM**.
- Onglet Entreprise : 2 colonnes — `CompanyHistory` (chiffres, métiers fournis, dernier contact, missions qui
  défilent ; simulé) | Registre du commerce (libellés au-dessus des valeurs) + Événements FOSC. Zone : entreprises
  probables avec barres de part + explication. Onglet Candidats : `CandidateMatcher` = DA de la page Candidats
  (pastilles de disponibilité + recherche, `DbFilterBar` Expérience / Tarif max, interrupteurs, grille de
  `CandidateCard` avec `reasons` « pourquoi lui », « Voir plus » par 21, fiche `CandidateDetail` sur place avec retour) ;
  logique dans `web/src/lib/match.ts`.
- Une autre session travaille aussi sur `alert-detail.tsx` (bouton email, `email-dialog.tsx`) : relire avant d'éditer.
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
