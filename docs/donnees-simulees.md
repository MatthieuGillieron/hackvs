# Données simulées

> Chemins relatifs à `backend/` ; les commandes se lancent depuis `backend/` (ou via le `Makefile` à la racine).

Les données internes de Flexsis (historique, vivier, clients, CRM) ne sont pas publiques. Pour la démo, elles sont
**générées** par `sources/simulated/flexsis_fictif.py` avec une graine fixe : mêmes données à chaque run.

| snapshot | contenu |
|---|---|
| `fx_clients` | clients : secteur, taille, commune, métiers achetés, consultant |
| `fx_candidats` | vivier : métiers, expérience, mobilité, permis, certifications, langues, disponibilité |
| `fx_demandes` | historique des demandes : métier, postes, prévenance, issue, délai, concurrent gagnant |
| `fx_missions` | missions réalisées : candidat, client, dates, heures, taux, évaluation |
| `fx_contacts` | CRM : appels, visites, mails |
| `fx_kpis` | délai moyen de placement, taux de couverture par métier et district |

## Règles

- Chaque record simulé porte `extra.fictif = true` et un texte préfixé `[FICTIF]` ; le front affiche le badge
  « Données simulées ». `tests/test_sources.py` vérifie ce marquage.
- Les clients simulés portent les noms d'**entreprises réelles** vues dans les sources publiques
  (`generate(real_clients=True)`) ; leurs historiques restent inventés et doivent être présentés comme tels.
- Contacts des fiches d'appel : noms fictifs déterministes, numéros `027 000 …`.
- Le niveau public d'une alerte (`levelPublic`, sans la famille Historique simulée) est exporté à côté du niveau
  complet : on peut toujours montrer ce que les seules données publiques détectent.

## Brancher les vraies données

Le générateur fixe le schéma. Si Flexsis fournit ses données, il suffit de les convertir dans les mêmes champs et
de les écrire dans `data/snapshots/fx_*.json` : le moteur et l'interface n'ont rien à changer.
