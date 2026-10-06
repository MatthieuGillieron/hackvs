# Interface

React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui (preset `radix-nova`). L'interface ne calcule rien de
métier : elle lit les JSON produits par le moteur (`frontend/public/data/*.json`, chargés par `DataProvider`,
`lib/data.tsx`). Tout est en français ; un seul compte, Julie Martin, consultante (fictif).

```
frontend/src/
├── main.tsx · index.css
├── app/             app.tsx (routes), app-layout.tsx (sidebar + contenu)
├── pages/           une page par route : home, alerts, analytics, clients, candidates, sources, profile, settings
├── features/        composants + logique d'un domaine
│   ├── alerts/      carte, modal de détail, chronologie, signaux, vignette, email
│   ├── call/        fiche « Préparer l'appel »
│   ├── tasks/       kanban, statut, stockage local des tâches (tasks.ts)
│   ├── candidates/  carte, fiche, matcher d'une alerte, logique de matching (match.ts)
│   ├── clients/     fiche entreprise, historique de la relation
│   ├── sources/     ligne, panneau latéral, réglages locaux (sources-config.ts)
│   └── analytics/   widgets, agrégats (analytics.ts, stats.ts, district-stats.ts)
├── components/
│   ├── ui/          primitives shadcn (générées, ne pas modifier à la main)
│   ├── layout/      sidebar, navigation, PageHeader / PageBody
│   ├── records/     grille de fiches, barre de filtres, onglets d'état (Clients, Candidats)
│   └── level-badge.tsx
├── hooks/           use-mobile (shadcn)
└── lib/             types des JSON, données, format, utilitaires partagés
```

Règle de rangement : un fichier utilisé par un seul domaine va dans `features/<domaine>/` ; s'il sert à plusieurs
domaines, dans `components/` (UI) ou `lib/` (logique).

## Principes

- **Squelette de page commun** (modèle = Alertes) : en-tête blanc (`PageHeader` : titre, onglets ou pastilles,
  recherche), puis `PageBody` = fond gris pleine largeur, cartes blanches dessus.
- **Sidebar** shadcn (`lib/nav.ts` -> `NAV_SECTIONS`) : logo Flexsis en haut ; **Prospection** (Accueil, Alertes
  avec badge = nb AGIR, Analytics), **Portefeuille** (Clients, Candidats), **Données** (Sources) ; profil en bas.
  Bouton rond de repli sur la bordure.
- **Typo** : `text-xs` = 13 px, `text-sm` = 15 px (`index.css`). Variante `tall:` = écrans de plus de 820 px de haut.
- **Données simulées toujours signalées** (badge « Données simulées »). Avatars de candidats = dessins DiceBear
  générés localement, jamais de photo. Vignettes d'alerte = **vraies** vues aériennes swisstopo ou logos publiés.
- **État local** : tâches (`flexradar.tasks.v1`) et réglages des sources (`flexradar.sources.v1`) en
  `localStorage`. Les tâches sont indexées par la `key` stable de l'export (`entreprise|<nom>|*`,
  `zone|<district>|<métier>`), jamais par `id`.
- **Tout tient à l'écran sans défiler** sur Accueil, Analytics et le modal d'alerte (vérifié à 1366×681).

## Pages

| route | fichier | contenu |
|---|---|---|
| `/` | `pages/home.tsx` | Pipeline de suivi (À faire / En cours / En attente / Clos 7 j), Rappels, top 3 des nouvelles opportunités, projets détectés par semaine (12 semaines, famille Projet seulement) |
| `/alertes` | `pages/alerts.tsx` | Fil d'alertes (grille, filtres, « Voir plus » par 21) et Mes tâches (`?vue=taches`) ; clic = modal (`?alerte=<key>`) |
| `/analytics` | `pages/analytics.tsx` | Du signal au client (entonnoir), tension par métier, anticipation, couverture du vivier, zones par district ; période `?periode=`, filtre `?district=` |
| `/clients` | `pages/clients.tsx` | Base clients (fiche Zefix réelle + relation simulée, alertes liées) |
| `/candidats` | `pages/candidates.tsx` | Vivier (simulé) : disponibilité, filtres, fiche avec historique des missions |
| `/sources` | `pages/sources.tsx` | Sources publiques par catégorie, fraîcheur, panneau de détail (réglages locaux, sans effet sur le moteur) |
| `/profil`, `/parametres` | `pages/profile.tsx`, `pages/settings.tsx` | à faire |

## Modal d'alerte (`features/alerts/alert-detail.tsx`)

- Onglets : **Vue d'ensemble** (informations clés, confiance, chronologie à l'échelle avec histogramme des candidats
  libres), **Signaux** (une colonne par famille, « pourquoi c'est important », lien vers la source), **Entreprise**
  (historique simulé | registre du commerce + FOSC ; pour une zone, entreprises probables), **Candidats** (matcher).
- Pied : **Générer un email** (`email-dialog.tsx`) et **Préparer l'appel** (`features/call/call-sheet.tsx` : guide,
  profils prêts, compte-rendu qui met à jour la tâche).
- Accent orange (`--primary`) ; couleurs des familles fixes.

## Choix écartés (à ne pas réintroduire sans en parler)

- Score sur 100, « missions gagnées », comparaison « vs période précédente » (l'export ne garde que les alertes
  vivantes), courbe « tous signaux » (les annonces n'ont pas d'historique).
- Vue admin, page Rapports, carte du Valais sur Analytics (trop petite dans une bande large).
