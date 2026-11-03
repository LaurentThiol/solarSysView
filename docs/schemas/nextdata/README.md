# nextData — schémas

Pronostic `/nextdata` et entraînement `/nextdatatraining`. Lecture dans l’application : `/schemas/nextdata`.

Les deux écrans lisent les mêmes pas. Le rayon X pose les chiffres de la lecture affichée sur cette chaîne. Il ne relance pas les modèles.

## Lire dans cet ordre

| Schéma | Niveau | Ce qu’il fixe |
| --- | --- | --- |
| [Contexte](01-contexte.md) | C4 contexte | Chercheur, archive, cache des pas, Jeux |
| [Traitement](02-traitement.md) | Flux | Les dix opérations, de l’archive à Persist |
| [Flux](03-flux.md) | Flux | Prochain tirage, et décalages −1 à −10 |
| [Contrôles](04-controles.md) | Flux | Les écarts que le rayon remonte en tête |

## Identifiants stables

À réutiliser tels quels quand une fonction évolue.

| Identifiant | Fonction |
| --- | --- |
| `cadre` | Archive filtrée, focus, années, jour, indice t |
| `reglage` | Familles, bloc, arbres, Chronos, Persist |
| `pas` | Morceaux, origine relu ou calculé, empreinte d’assemblage |
| `matrice` | Lags, lignes de perte, poids ×3 et ×1 |
| `quantiles` | Bandes 10–90 avant Chronos |
| `chronos` | Poids, fenêtre d’avant, cibles somme, somme des étoiles, niveau de n1 |
| `arbitrage` | Niveau, delta, chaîne, bord d’écart |
| `projection` | Reconstruction, nudges, faisceau |
| `calibrage` | Bande brute ou déplacée, hors du tirage noté |
| `persist` | Échanges après la grille |

## Code de référence

- Pages : `src/app/nextdata/page.tsx`, `src/app/nextdatatraining/page.tsx`
- Écrans : `src/components/nextdata/nextdata-lab.tsx`, `training-lab.tsx`, `xray-panel.tsx`
- Trace : `synchro/nextdata/xray.py`, assemblage `backtest.py`, projection `project.py`
