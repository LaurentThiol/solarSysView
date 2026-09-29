# Tableau — flux

- Module : `/brain/decision-tree`
- Niveau : flux
- Révision : 1
- Code : `synchro/decision_tree/questions.py`, `measures.py`

Une ligne est l’état juste avant le tirage t. L’étiquette est sur t+1. Le mot « retard » ne désigne que le retard d’une boule. Un pas ou un lag s’appelle « dernière ».

```mermaid
flowchart TD
  draws["tirages filtrés<br/>ère et filtreJour"] --> question{"question"}
  question -->|shape| shape["build_shape"]
  question -->|series| serie["build_series"]
  question -->|balls| boules["build_balls"]
  question -->|chartisme| fourni{"enregistrements déjà fournis"}
  fourni -->|oui| matrice["chartisme_matrix"]
  fourni -->|non| scan["build_chartisme"]
  shape --> etoiles{"ère all"}
  etoiles -->|oui| sans["séries numéros seules"]
  etoiles -->|non| avec["numéros, somme étoiles, e1, e2"]
  sans --> colonnes
  avec --> colonnes
  serie --> urne{"e1 ou e2<br/>plusieurs urnes"}
  urne -->|oui| refus["erreur"]
  urne -->|non| colonnes
  colonnes["feature_matrix"] --> aligne["lignes finies<br/>après warmup"]
  aligne --> etiquette["étiquette binaire<br/>ou série brute si coupe apprise"]
  etiquette --> nulDraws["nul shuffle_draws"]
  boules --> ligneBoule["une ligne par boule<br/>à partir du tirage 21"]
  ligneBoule --> nulDraws
  scan --> seuilFig{"au moins 24 figures<br/>atteint ou invalidé"}
  seuilFig -->|non| peu["erreur"]
  seuilFig -->|oui| matrice
  matrice --> nulLabels["nul shuffle_labels"]
```

## Questions

| Question | Colonnes | Étiquette | Poids | Nul |
| --- | --- | --- | --- | --- |
| `shape` | Catalogue sur somme, étendue, parité, n1 à n5, g1 à g4, et les étoiles si l’ère n’est pas `all` | Somme haute, parité, ou n1 bas | `balanced` si la coupe est apprise | Mélange des tirages, tableau reconstruit |
| `series` | Même catalogue sur cette série, sans le pas | La série est haute, ou la parité | `balanced` si la coupe est apprise | Mélange des tirages, tableau reconstruit |
| `balls` | Retard, sorties 20, sorties 50, dernière, RSI 14, z20 du retard | La boule sort | `balanced` | Mélange des tirages, tableau reconstruit |
| `chartisme` | Confiance, activité, longueur, direction hausse, mardi, courbe, figure | Objectif atteint | `balanced` | Étiquettes mélangées, même matrice |

Le catalogue par défaut du flux est tout `MEASURE_IDS`. Une série retire `step`. Un indicateur retiré par l’écran sort des colonnes. Les figures lisent par défaut somme, étendue, parité et n1, échelle 60, confiance minimale 0,35, horizon 40. Seuls les objectifs atteints ou les figures invalidées entrent.

L’écran demande d’abord `POST /api/brain/decision-tree/tableau`. `question_picture` regroupe les lignes, pose la frontière apprentissage / contrôle, et montre les huit dernières en valeurs exactes. Cette image ne cherche pas l’arbre.

## Coupe figée, avant la recherche

Quand la coupe est `fixed`, l’étiquette est déjà binaire dans le tableau. Parité : au moins 3. Les autres formes : médiane de l’apprentissage, sens ≥, sauf n1 bas en sens ≤. Le seuil du spécialiste binaire est ce seuil-là. La coupe apprise laisse la série brute et choisit plus tard, dans [Recherche](06-recherche-flux.md).

## Journal

| Révision | Changement |
| --- | --- |
| 1 | Tableau des quatre questions, étoiles, urnes et nuls. |
