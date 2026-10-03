# prototype/ — moteur de signaux FlexRadar (essai)

```bash
python3 -m prototype.html                  # page HTML du brief -> prototype/out/brief.html
python3 -m prototype.brief                 # top 10 entreprises dans le terminal
python3 -m prototype.brief --zones -n 20   # inclut les opportunités de zone (district × métier)
python3 -m prototype.brief --fictional-clients --no-zone-context   # signaux publics bruts
```
Sortie complète : `prototype/out/opportunities.json`.

## Règles
- **Signal** = famille + cible + métiers + fenêtre de besoin + volume estimé + source (`signals.py`).
- **Familles de demande** : projet, recrutement, entreprise, historique. Le vivier n'en est **pas** une.
- **Cible** : entreprise (tous métiers confondus), sinon district × métier.
- **Niveau** : AGIR = au moins 3 familles et besoin dans les 8 semaines ; PRÉPARER = 2 familles ; SURVEILLER = 1.
- **Vivier** : ne change pas le niveau, il choisit l'action (appeler avec des profils, ou sourcer d'abord).
- Les hypothèses chiffrées sont regroupées dans `signals.ASSUMPTIONS`.

## Ce que le test sur les données réelles a montré (2 oct. 2026)
1. **Au niveau entreprise, les signaux publics ne se croisent presque pas** : 42 entreprises ont un projet récent, 47 publient leurs propres annonces bâtiment, et une seule a les deux.
2. **La convergence existe au niveau zone** : 89 couples district × métier cumulent projet et recrutement.
3. **Solution retenue** : une entreprise qui a un projet hérite de la *tension de recrutement* de sa zone (au moins 2 annonces d'agences pour ses métiers dans son district). Résultat : 24 entreprises en PRÉPARER sur données publiques seules.
4. **AGIR (3 familles) dépend en pratique des données internes Flexsis** : 11 des 13 AGIR viennent de projet + recrutement + historique (fictif). C'est un argument de pitch : *les données publiques détectent, l'historique Flexsis confirme.*
5. Une adjudication sert de signal au **démarrage** du chantier (J+21 à J+90), pas sur toute sa durée. Les signaux dont la fenêtre est passée sont ignorés.

6. **Famille Entreprise resserrée** : 488 signaux, en majorité de faux positifs (formule type des statuts « peut créer des succursales »), ramenés à **18 événements réels** (augmentation de capital avec montants, fusion par absorption, succursale ; sociétés immobilières exclues). Entreprise et Historique ne font que **confirmer** : seuls Projet et Recrutement créent une opportunité. On passe de 786 à ~320 opportunités.
7. **Permis → entreprises** : seuls ~11 permis sur 187 nomment une entreprise de construction, qui est alors attribuée directement (7 entreprises en PRÉPARER). Aucune donnée publique ne relie un architecte à une entreprise. Pour les autres permis, la fiche de zone liste des **entreprises probables avec une part estimée**, calculée sur leurs antécédents dans la zone (adjudications SIMAP de l'année = 1, annonce directe = 0,5). Cette part est affichée à titre indicatif et ne compte jamais comme une famille. 64 zones PRÉPARER sur 89 ont des candidates, dont 47 avec une part ≥ 30 %.

8. **Volumes de zone corrigés** : chaque phase a une taille d'équipe relative et une durée réelle. L'effectif compté est l'effectif moyen présent en même temps dans l'horizon de 8 semaines (occupation = durée / largeur de la fenêtre). Exemple : Martigny machinistes, 28–56 → 5–10. Renfort médian : 1 par zone, 2 par entreprise.

## À faire / pistes
- **Formule montant → équipe** : avec durée = montant / 300 kCHF, toute adjudication de plus de 300 kCHF donne ~8 personnes (l'équipe ne dépend plus du montant). Piste : durée ∝ √montant (ex. 2 × √(MCHF) mois), ce qui fait grandir l'équipe avec le chantier. À calibrer avec Flexsis avant de changer.
- Archiver les annonces chaque jour pour détecter les republications et valider les délais.
- Mail pré-rédigé (LLM) pour AGIR et PRÉPARER.
