# Historique — flux

- Module : `/pronostic?tab=historic`
- Niveau : flux
- Révision : 1
- Code : `src/lib/pronostic/historic.ts`, `src/components/pronostic/historic-panel.tsx`

La série notée est déjà passée par `filtreJour`. Le comité, lui, repart de l’archive non filtrée. Voir [Comité](07-comite-flux.md).

```mermaid
flowchart TD
  serie["série affichée"] --> horizon["horizon<br/>100 derniers tirages"]
  horizon --> complet{"fenêtre entière avant le tirage"}
  complet -->|non| ignore["tirage non noté"]
  complet -->|oui| lookback{"lookback"}
  lookback -->|20, 50 ou 100| fixe["fenêtre stricte"]
  lookback -->|choisi avant| choisiAvant["choisiAvant"]
  choisiAvant --> priors["jusqu'à 10 essais déjà notés<br/>au moins 3"]
  priors --> choixFenetre["plus petite erreur médiane<br/>égalité : la plus courte<br/>sinon 20"]
  fixe --> lectures
  choixFenetre --> lectures
  lectures["lectures<br/>11 axes, moyenne et sigma des tirages d'avant"] --> couches{"couches on<br/>somme, parité, espaces"}
  couches --> vecteurZ["vecteurZ<br/>toutes les couches, y compris éteintes"]
  couches --> requis["plus petite marge qui contient l'axe"]
  requis --> joint["erreur mesurée = max des axes allumés"]
  joint --> lien["axe décisif : plus grande marge, puis plus grand z"]
  marge{"marge"} -->|manuel| annonce["curseur, même k pour chaque tirage"]
  marge -->|automatique| postHoc["post hoc sur toute la série"]
  postHoc --> ratio["parmi les k avec au moins 3 hits<br/>plus petite mise cumulée / hits<br/>égalité : le plus étroit<br/>sinon 1 sigma"]
  annonce --> notation
  ratio --> notation
  notation{"notation"} -->|numéros et étoiles dedans| hit["dans la marge"]
  notation -->|une couche allumée dehors| miss["hors marge"]
  notation --> mise["mise<br/>grilles numéros × grilles étoiles"]
  hit --> synthese["cartes, courbes, rangs"]
  miss --> synthese
  mise --> synthese
  vecteurZ --> plan["plan et grille des résidus"]
  synthese --> filtreLignes{"filtreLignes<br/>tous, dans, hors"}
  filtreLignes --> tableau["tableau du plus récent au plus ancien"]
  lectures --> prochain["prochain<br/>dernière fenêtre, moyenne ± k sigma<br/>ce tirage n'entre pas dans le calcul"]
  prochain -->|Préparer| atelier["atelier"]
```

## Axes

Onze axes, dans cet ordre : somme, pairs, n1, n2, n3, n4, n5, somme étoiles, pairs étoiles, e1, e2.

Pour chaque axe, sur les tirages strictement antérieurs :

- moyenne arithmétique
- écart-type d’échantillon, diviseur n − 1
- z = (réel − moyenne) / σ quand σ est positif
- si σ vaut 0 et que le réel diffère, z est vide et aucune marge finie ne couvre l’axe
- bande entière : plancher en bas, plafond en haut, recoupée par les bornes théoriques
- à 0 σ, la moyenne entière tient une seule valeur ; sinon la bande tient les deux entiers qui l’encadrent

Pas de marge : 0, 0,25, 0,5, 0,75, 1, 1,25, 1,5, 1,75, 2, 2,5, 3. Défaut manuel : 1. Au-delà de 3, l’erreur mesurée est vide et la courbe la place à part.

Une couche éteinte ne fait pas sortir le tirage et ne réduit pas la mise. Elle reste dans le vecteur z.

## Pas dans l’historique

Pas allumé resserre la mise comme dans l’atelier. Il ne change ni l’erreur mesurée, ni l’axe décisif, ni le vecteur z. Le rapport Pas compte les fenêtres où la porte s’ouvre, les tirages que le niveau contenait et que le pas exclut, et les grilles économisées.

## Partie jouée

À côté du choix automatique post hoc, la partie jouée refait le même ratio avant chaque tirage, uniquement sur les tirages déjà notés. C’est elle qui fige une marge annoncée. Elle est affichée avec le comité. Sans comité, la carte moyenne la calcule aussi en mode automatique.

## Rangs et courbes

Le tableau **Paramètres qui pèsent** ne classe que les axes allumés : fois décisif, puis hors marge, puis |z| médian.

La courbe du haut est l’erreur mesurée de chaque tirage. La ligne horizontale est la marge en cours. La courbe du bas est la part des tirages déjà notés dont l’erreur tient dans chaque pas. Elle ne refait pas le décompte. La mise se recalcule à la marge choisie.

## Plan

Le plan place chaque tirage noté sur deux axes du vecteur z. La paire par défaut suit l’ordre du tableau des rangs. Le carré dessine ±k·σ de la marge en cours. La grille reprend le même vecteur, une ligne par tirage et une colonne par axe allumé.

## Journal

| Révision | Changement |
| --- | --- |
| 1 | Flux de notation, marge, choisi avant, mise et plan. |
