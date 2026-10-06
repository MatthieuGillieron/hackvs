# Architecture

FlexRadar a été construit pendant le hackathon **HackVS** (Foire du Valais, 3–4 octobre 2026) pour le challenge
**Flexsis** (travail temporaire dans le bâtiment, l'industrie et la logistique, groupe Interiman).

> *« Quand le client appelle, la course a déjà commencé. FlexRadar appelle avant, avec les bons candidats. »*

L'outil dit à un consultant **quelle entreprise appeler, pour quel besoin futur, et quels candidats proposer**, à
partir de signaux publics : mises à l'enquête, marchés publics, offres d'emploi, registre du commerce, presse.

## Pipeline

```
 ┌─────────────────────────── backend/ (Python) ───────────────────────────┐    ┌──── frontend/ ────┐
 sources publiques ─► sources/ ─► data/snapshots/*.json ─► engine/ ──────────────► public/data/*.json ─► src/ (React)
 (API, Bulletin       collecte,   (versionnés)              signaux, niveaux,        (versionnés)          lecture seule
  officiel, OFS…)     format commun                         LLM (cache data/llm/)
```

Chaque couche ne dépend que de la précédente, et uniquement via des fichiers JSON versionnés. Conséquences :

- **La démo tourne hors ligne** : ni réseau, ni clé API, ni Python ne sont nécessaires pour lancer l'interface.
- **Le moteur est reproductible** : mêmes snapshots + même date de référence = mêmes fichiers (vérifié en CI).
- Les données internes Flexsis (clients, vivier, missions, CRM) sont **simulées** et toujours marquées
  (`fictif: true`, badge « Données simulées ») : voir [donnees-simulees.md](donnees-simulees.md).

## Arborescence

```
.
├── backend/              Python ≥ 3.9, bibliothèque standard uniquement
│   ├── sources/          collecte : connecteurs, référentiels, données simulées       -> sources.md
│   ├── engine/           moteur : signaux, niveaux, export, couche LLM                -> moteur.md
│   ├── data/             snapshots, cache LLM, configuration (cache HTTP gitignoré)
│   ├── tests/            règles du moteur et format des snapshots (unittest)
│   ├── pyproject.toml    métadonnées et configuration de ruff
│   └── .env.example      clé OpenAI (copier en .env)
├── frontend/             React 19 + Vite, lit public/data/                            -> interface.md
├── docs/                 cette documentation
├── .github/workflows/    CI : lint, tests, JSON à jour, build
└── Makefile              raccourcis (make help)
```

## Commandes

| commande | effet |
|---|---|
| `make dev` | installe le front et lance http://localhost:5173 |
| `make data` | rafraîchit les snapshots (`cd backend && python3 -m sources fetch all`, réseau) |
| `make data-offline` | reconstruit les snapshots depuis le cache local, sans réseau |
| `make build` | régénère `frontend/public/data/` (`cd backend && python3 -m engine build`) |
| `make test` | tests du moteur et des snapshots |
| `make check` | lint Python, tests, types et lint du front |

Après une modification du moteur ou un fetch : `make build`, puis `make check`.

## Conventions

- **Langues** : README en anglais (vitrine) ; documentation, interface et commentaires en français.
  Noms de fichiers et de dossiers de code en anglais ; les identifiants de sources (`permis_construire`…) et les
  routes de l'interface (`/alertes`, `/candidats`) restent en français.
- **Python** : bibliothèque standard uniquement, Python ≥ 3.9, `ruff check` propre.
- **Front** : `tsc -b` et `oxlint` propres ; `components/ui/` est généré par shadcn.
- **Aucune donnée inventée présentée comme réelle** : images = vues aériennes swisstopo ou logos publiés ;
  chiffres internes = simulés et signalés ; volumes en fourchettes ; chaque alerte cite ses sources.
