# frontend/ — interface FlexRadar

React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui. L'interface lit les JSON de `public/data/`, produits par
le backend (`make build` à la racine) ; elle ne calcule rien de métier.

```bash
npm ci
npm run dev        # http://localhost:5173 (port pris : npx vite --port 5179 --strictPort)
npm run check      # types (tsc -b) + lint (oxlint)
npm run build      # build de production dans dist/
```

Organisation du code, pages et décisions de design : [docs/interface.md](../docs/interface.md).

## Fichiers publics

| dossier | contenu | produit par |
|---|---|---|
| `public/data/` | alertes, candidats, clients, missions, sources, emails, fiches d'appel, fond de carte | `python3 -m engine build` / `engine geo` |
| `public/img/alertes/`, `img/logos/` | vues aériennes swisstopo des projets, logos publiés sur jobup | `engine/images.py` |
| `public/img/districts/`, `valais-relief.jpg` | vignettes et relief des districts | `python3 -m engine geo` |
| `public/img/brand/` | logos Flexsis (flexsis.ch) | manuel |

Ajouter un composant shadcn : `npx shadcn@latest add <composant>` (va dans `src/components/ui/`).
