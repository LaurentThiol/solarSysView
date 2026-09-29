# Pronostic — schémas

Atelier `/pronostic` et historique `/pronostic?tab=historic`. Lecture dans l’application : `/schemas/pronostic`.

L’atelier resserre l’univers 5+2 (2 118 760 combinaisons de numéros × 66 combinaisons d’étoiles = 139 838 160 grilles) par des couches, puis compte les grilles restantes. L’historique note les 100 derniers tirages de la série affichée, avec une marge annoncée ou choisie après coup, et peut confronter un comité de réseaux à la moyenne de fenêtre. Le nombre affiché est une mise en grilles. La loi officielle du tirage reste uniforme.

## Lire dans cet ordre

| Schéma | Niveau | Ce qu’il fixe |
| --- | --- | --- |
| [Contexte](01-contexte.md) | C4 contexte | Chercheur, archive, spécialistes, Jeux, capture |
| [Conteneurs](02-conteneurs.md) | C4 conteneurs | Navigateur, proxy Next, API Python, Neon |
| [Atelier — composants](03-atelier-composants.md) | C4 composants | Piles, proposeur, resserrage, décompte |
| [Atelier — flux](04-atelier-flux.md) | Flux | Fenêtre, couches, pas, liste ou échantillon |
| [Historique — composants](05-historique-composants.md) | C4 composants | Notation, plan, comité |
| [Historique — flux](06-historique-flux.md) | Flux | Marge, choisi avant, mise, prochain tirage |
| [Comité — flux](07-comite-flux.md) | Flux | Onze têtes, porte, global, trois séries |
| [Filtres](08-filtres.md) | Flux | Où chaque filtre coupe, et ce qu’il laisse passer |

## Identifiants stables

À réutiliser tels quels quand une fonction évolue.

| Identifiant | Fonction |
| --- | --- |
| `filtreJour` | Bandeau tous / mardi / vendredi / synthèse |
| `fenetre` | Preset, dates, derniers N, warmup de l’atelier |
| `proposeur` | Enveloppe min/max, moyenne ou percentiles |
| `walkforward` | Couverture sur les tirages d’avant |
| `pileNumeros` `pileEtoiles` | État des couches 5 et 2 |
| `resserrage` | Cohérence somme, parité, espaces, ordre strict |
| `pas` | Porte sur le pas de la fenêtre |
| `decompte` | Produit combinaisons numéros × étoiles |
| `specJeux` | Spec envoyé à Jeux, piles avant Pas |
| `historiqueIn` | Prévision moyenne ou comité recopiée dans les deux piles |
| `filtreLignes` | Tableau tous, dans la marge, ou hors marge |
| `horizon` | 100 derniers tirages notés |
| `lookback` | 20, 50, 100, ou choisi avant |
| `marge` | moyenne ± k·σ, pas discrets jusqu’à 3 |
| `notation` | Hit seulement si numéros et étoiles sont dedans |
| `vecteurZ` | Résidus des onze axes |
| `mise` | Grilles 5+2 restantes à cette marge |
| `porte` | Une tête reprend la moyenne si son erreur médiane est plus grande |
| `global` | Réécrit les centres dès qu’une tête reste en réseau |
| `recalageSigma` | 1 σ couvre environ deux tiers des tirages d’avant |
| `series` | Mixte, mardi, vendredi, calculés à part |

## Code de référence

- Page : `src/app/pronostic/page.tsx`
- Atelier : `src/components/pronostic/pronostic-lab.tsx`
- Historique : `src/components/pronostic/historic-panel.tsx`, `historic-committee.tsx`, `historic-plane.tsx`
- Calcul navigateur : `src/lib/pronostic/`
- Comité : `src/app/api/pronostic/committee/route.ts`, `synchro/pronostic_net/`
