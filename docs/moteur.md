# Moteur de signaux

> Chemins relatifs à `backend/` ; les commandes se lancent depuis `backend/` (ou via le `Makefile` à la racine).

Le moteur (`engine/`) transforme les publications publiques en **alertes** : quelle entreprise (ou quelle zone)
appeler, pour quel besoin, quand, et avec quels candidats.

```bash
python3 -m engine build      # export -> emails -> fiches d'appel, sortie dans ../frontend/public/data/
python3 -m engine export     # seulement les alertes, candidats, clients, missions, sources
python3 -m engine geo        # fond de carte et vignettes de district (une fois, versionné)
```

```
engine/
├── config.py        date de référence (NOW / TODAY) et chemins de sortie
├── signals.py       publication -> Signal (famille, cible, métiers, fenêtre, volume, source) ; ASSUMPTIONS
├── scoring.py       regroupement par cible, familles, niveau, besoin en fourchette, vivier, action
├── export.py        JSON du frontend (../frontend/public/data/)
├── images.py        vignettes aériennes swisstopo et logos jobup des alertes
├── geo.py           fond de carte du Valais
└── llm/             extract.py (fiches citées) · emails.py · calls.py (guides d'appel)
```

## Règles (validées avec Flexsis — ne pas changer sans accord)

- On compte des **familles** de signaux, pas des signaux : **Projet**, **Recrutement**, **Entreprise**, **Historique**.
- **Niveau** : **AGIR** = au moins 3 familles ET besoin dans les 8 semaines · **PRÉPARER** = 2 familles ·
  **SURVEILLER** = 1.
- Seuls **Projet** et **Recrutement** créent une alerte ; Entreprise (FOSC) et Historique ne font que confirmer.
- **Cible** : l'entreprise (tous métiers confondus), sinon la **zone** (district × métier) avec des « entreprises
  probables » et une part estimée (indicative, ne compte jamais comme famille).
- **Aucun score sur 100 affiché** : badge de niveau, familles en pastilles, confiance en mots
  (« Élevée · 3 familles convergent »). Les poids internes servent uniquement au tri.
- Le **vivier ne change pas le niveau** : il choisit l'action (appeler avec des profils, ou sourcer d'abord).
- Volumes en **fourchettes**. Chaque alerte **cite ses sources** (liens).
- Les hypothèses chiffrées sont regroupées dans `signals.ASSUMPTIONS` ; demander avant d'en changer une.

Ces règles sont vérifiées par `tests/test_engine.py`.

## Date de référence

« Aujourd'hui » (fenêtres de besoin, signaux expirés, données simulées, fraîcheur des sources) est **figé sur le
jour de la démo** (`engine/config.py`) : deux exports des mêmes snapshots produisent exactement les mêmes
fichiers, ce que la CI vérifie. Pour un vrai run après un `fetch` :

```bash
FLEXRADAR_TODAY=live python3 -m engine build    # ou FLEXRADAR_TODAY=2026-10-10
```

## Couche LLM (OpenAI)

Clé dans `.env` (gitignoré, modèle `OPENAI_MODEL`, voir `.env.example`). Tout est **mis en cache et versionné** :
la démo et la CI tournent sans clé ; seuls les records nouveaux partent vers l'API.

- `llm/extract.py` : texte brut d'un record -> fiche JSON stricte + citation (`preuve`). Cache
  `data/llm/<tâche>.json` indexé par id + empreinte du texte. Tâches : `permis` (type, ampleur, certitude, corps de
  métier, entreprise) et `grands_projets` / `presse` / `communiques_vs` (annonces de projet).
  `python3 -m engine.llm.extract <tâche>` ; `… eval` compare LLM et regex.
- Le LLM fournit des **faits**, jamais de niveau ni de volume. `signals.py` lit la fiche LLM d'abord, la regex en
  repli ; certitude « faible » = poids de tri × 0,7. Les annonces de projet donnent un signal Projet de **zone**,
  long terme, sans renfort chiffré. Ces signaux portent `ia` + `preuve` (badge « Extrait par IA »).
- `llm/emails.py` : emails de prospection pré-rédigés (alertes entreprise AGIR/PRÉPARER, FR ou DE selon le
  district) -> `emails.json`.
- `llm/calls.py` : fiches « Préparer l'appel » -> `calls.json` : faits (contact **fictif**, relation, demandes non
  pourvues, agences concurrentes, délais de placement), profils prêts (`match_profiles`) et guide rédigé (accroche,
  questions, objections, conclusion, pitch par profil).

## Ce que le test sur les données réelles a montré (2 oct. 2026)
1. **Au niveau entreprise, les signaux publics ne se croisent presque pas** : 42 entreprises ont un projet récent, 47 publient leurs propres annonces bâtiment, et une seule a les deux.
2. **La convergence existe au niveau zone** : 89 couples district × métier cumulent projet et recrutement.
3. **Solution retenue** : une entreprise qui a un projet hérite de la *tension de recrutement* de sa zone (au moins 2 annonces d'agences pour ses métiers dans son district). Résultat : 24 entreprises en PRÉPARER sur données publiques seules.
4. **AGIR (3 familles) dépend en pratique des données internes Flexsis** : 11 des 13 AGIR viennent de projet + recrutement + historique (fictif). C'est un argument de pitch : *les données publiques détectent, l'historique Flexsis confirme.*
5. Une adjudication sert de signal au **démarrage** du chantier (J+21 à J+90), pas sur toute sa durée. Les signaux dont la fenêtre est passée sont ignorés.

6. **Famille Entreprise resserrée** : 488 signaux, en majorité de faux positifs (formule type des statuts « peut créer des succursales »), ramenés à **18 événements réels** (augmentation de capital avec montants, fusion par absorption, succursale ; sociétés immobilières exclues). Entreprise et Historique ne font que **confirmer** : seuls Projet et Recrutement créent une opportunité. On passe de 786 à ~320 opportunités.
7. **Permis → entreprises** : seuls ~11 permis sur 187 nomment une entreprise de construction, qui est alors attribuée directement (7 entreprises en PRÉPARER). Aucune donnée publique ne relie un architecte à une entreprise. Pour les autres permis, la fiche de zone liste des **entreprises probables avec une part estimée**, calculée sur leurs antécédents dans la zone (adjudications SIMAP de l'année = 1, annonce directe = 0,5). Cette part est affichée à titre indicatif et ne compte jamais comme une famille. 64 zones PRÉPARER sur 89 ont des candidates, dont 47 avec une part ≥ 30 %.

8. **Volumes de zone corrigés** : chaque phase a une taille d'équipe relative et une durée réelle. L'effectif compté est l'effectif moyen présent en même temps dans l'horizon de 8 semaines (occupation = durée / largeur de la fenêtre). Exemple : Martigny machinistes, 28–56 → 5–10. Renfort médian : 1 par zone, 2 par entreprise.

## Hypothèses à calibrer / pistes
- **Formule montant → équipe** : avec durée = montant / 300 kCHF, toute adjudication de plus de 300 kCHF donne ~8 personnes (l'équipe ne dépend plus du montant). Piste : durée ∝ √montant (ex. 2 × √(MCHF) mois), ce qui fait grandir l'équipe avec le chantier. À calibrer avec Flexsis avant de changer.
- Archiver les annonces chaque jour pour détecter les republications et valider les délais.
