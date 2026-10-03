# FlexRadar

**Quand le client appelle, la course a déjà commencé. FlexRadar appelle avant, avec les bons candidats.**

Outil pour les consultants Flexsis : chaque semaine, il dit quelle entreprise appeler, pour quel besoin futur,
et quels candidats proposer, à partir de signaux publics (chantiers attribués, permis, offres d'emploi,
registre du commerce). Challenge Flexsis, HackVS, Foire du Valais, 3–4 octobre 2026.

Brief complet pour l'équipe : https://claude.ai/code/artifact/1c0fc2cc-b32f-4f92-a28d-32757fa9638c

## Démarrer

Python ≥ 3.9, aucune dépendance.

```bash
python3 -m sources check           # les API répondent-elles ?
python3 -m prototype.html          # génère le brief -> prototype/out/brief.html (à ouvrir dans le navigateur)
python3 -m prototype.brief -n 10   # ou le top 10 dans le terminal
```

## Interface (web/)

React + TypeScript + Vite + Tailwind + shadcn/ui. Le front lit les JSON exportés par le moteur.

```bash
python3 -m prototype.export        # moteur -> web/public/data/*.json (à relancer après un fetch)
cd web && npm install && npm run dev   # http://localhost:5173
```

## Organisation

```
sources/      31 sources de données publiques + snapshots JSON (sources/_data/*.json)
              -> python3 -m sources list | stats | fetch all | show <source>
              -> détail des sources et pièges connus : sources/README.md
web/          interface React (pages : Dashboard, Alertes, Carte, Clients, Candidats, Admin › Sources)
prototype/    moteur de signaux
  signals.py    publication brute -> signal (familles, phasage, montant -> équipe, ASSUMPTIONS)
  scoring.py    regroupement par cible, niveau AGIR / PRÉPARER / SURVEILLER, vivier, action
  brief.py      brief terminal + export JSON
  html.py       brief en page web autonome (prototype)
  export.py     JSON pour l'interface -> web/public/data/
              -> règles et constats du test : prototype/README.md
```

## Règles du moteur (résumé)

- **Familles** : Projet, Recrutement, Entreprise, Historique. On compte les familles, pas les signaux.
- **Niveau** : AGIR = 3 familles ou plus et besoin dans les 8 semaines · PRÉPARER = 2 · SURVEILLER = 1.
- **Vivier** : ne change pas le niveau, choisit l'action (appeler avec des profils, ou sourcer d'abord).
- Chaque fiche cite ses sources. Aucun score sur 100 n'est affiché.

## Données réelles et fictives

Les signaux publics sont réels. **Les données internes Flexsis (historique client, vivier, CRM) sont
fictives** (`sources/flexsis_fictif.py`, sources `fx_*`, mention FICTIF partout). Si Flexsis fournit ses
données, il suffit de les convertir dans le même format.

## Pendant la démo

Rien en live : `python3 -m sources fetch all --offline` reconstruit tout depuis le cache local.
