# Atelier — flux

- Module : `/pronostic` onglet Atelier
- Niveau : flux
- Révision : 1
- Code : `src/components/pronostic/pronostic-lab.tsx`, `src/lib/pronostic/learn.ts`, `propagate.ts`, `delta-layer.ts`, `count.ts`

Deux piles vivent en parallèle, numéros (1–50, cinq rangs, somme 15–240) et étoiles (1–12, deux rangs, somme 3–23). L’écran n’en montre qu’une. Le produit final multiplie les deux décomptes. La liste et l’échantillon suivent les piles après Pas. Le spec envoyé à Jeux, et celui qui accompagne une consignation, part des piles avant Pas : le pont ne fait que le resserrage.

```mermaid
flowchart TD
  archive["archive<br/>GET /api/draws, repli JSON"] --> filtreJour{"filtreJour<br/>bandeau"}
  filtreJour -->|tous ou synthèse| mixte["série mixte"]
  filtreJour -->|mardi| mardi["série mardi"]
  filtreJour -->|vendredi| vendredi["série vendredi"]
  mixte --> fenetre
  mardi --> fenetre
  vendredi --> fenetre
  fenetre["fenêtre<br/>preset, dates, derniers N, warmup"] --> points["points<br/>somme, pairs, rangs triés"]
  points --> proposeur["proposeur<br/>formule, k, percentile"]
  proposeur --> proposition["proposition affichée"]
  proposition -->|Appliquer| pileActive{"pile affichée"}
  points --> walkforward["walkforward<br/>lookback 20, 50 ou 100<br/>au moins 5 tirages avant"]
  walkforward --> couverture["taux de hits et volume moyen"]
  curseurs["curseurs, ordre, on, off"] --> pileActive
  historiqueIn["prévision historique<br/>moyenne ou comité"] --> pileNumeros
  historiqueIn --> pileEtoiles
  specialistes["spécialistes<br/>somme puis parité"] -->|bande somme| pileNumeros
  specialistes -->|pairs anticipés| pileNumeros
  session["session<br/>synchro.pronostic.v1"] --> pileNumeros
  session --> pileEtoiles
  pileActive -->|numéros| pileNumeros["pileNuméros"]
  pileActive -->|étoiles| pileEtoiles["pileÉtoiles"]
  pileNumeros --> resserrageN["resserrage numéros"]
  pileEtoiles --> resserrageE["resserrage étoiles"]
  resserrageN --> pasN{"pas"}
  resserrageE --> pasE{"pas"}
  pasN -->|ouvert| joueN["espaces coupés par le pas"]
  pasN -->|fermé ou off| joueN2["espaces de niveau"]
  pasE -->|ouvert| joueE["espaces coupés par le pas"]
  pasE -->|fermé ou off| joueE2["espaces de niveau"]
  joueN --> decompte
  joueN2 --> decompte
  joueE --> decompte
  joueE2 --> decompte
  decompte["décompte<br/>combinaisons n × combinaisons étoiles"] --> seuil{"plus de 50 grilles"}
  seuil -->|non| liste["liste exacte des grilles jouées"]
  seuil -->|oui| echantillon["échantillon uniforme, 12 lignes"]
  pileNumeros --> specJeux["spec Jeux<br/>piles avant Pas"]
  pileEtoiles --> specJeux
  specJeux --> jeux["envoyer vers Jeux"]
  specJeux --> consigne["consigne<br/>grille affichée, spec avant Pas"]
  liste --> consigne
  echantillon --> consigne
  pileNumeros --> capture["capture<br/>packPronostic"]
  pileEtoiles --> capture
```

## Couches d’une pile

L’ordre des couches est celui de l’écran. Une couche éteinte sort du décompte et reprend ses bornes théoriques. **Haut** et **Bas** ne changent que l’ordre de la cascade affichée.

```mermaid
flowchart LR
  univers["univers"] --> somme{"somme on"}
  somme -->|oui| bandeSomme["bande mini maxi"]
  somme -->|non| sommeLibre["15 à 240 ou 3 à 23"]
  bandeSomme --> parite
  sommeLibre --> parite
  parite{"parité on"} -->|observé| bandePairs["bande lue"]
  parite -->|anticipé| curseurPairs["curseur ou spécialiste"]
  parite -->|off| pairsLibres["0 à 5, ou 0 à 2"]
  bandePairs --> espaces
  curseurPairs --> espaces
  pairsLibres --> espaces
  espaces{"espaces on"} -->|oui| slots["n1 à n5 ou e1 e2"]
  espaces -->|non| slotsTheorie["bornes théoriques du rang"]
  slots --> resserrage
  slotsTheorie --> resserrage["resserrage<br/>jusqu'à 12 passes"]
```

Le resserrage impose un ordre strict (n1 avant n2, un numéro pris une seule fois). Il recoupe la somme réalisable, la parité réalisable, et retire de chaque espace les valeurs incompatibles. Une bande vide arrête le décompte à 0 et affiche le diagnostic.

## Porte Pas

Pas est éteint par défaut. Allumé, il ne change le décompte que si la fenêtre a au moins 8 points et que le pas s’écarte de deux tirages indépendants : mélange des mêmes niveaux, ou loi de la valeur absolue du delta. Sinon la porte reste fermée et les curseurs d’espaces ne bougent pas.

Trois lectures de rang : fermé, persiste, repousse. Trois lectures de bord : fermé, glisse, se sépare.

## Proposeur

| Formule | Bande, avant bornes théoriques |
| --- | --- |
| min/max ± k·σ | minimum observé moins k·σ, maximum observé plus k·σ |
| moyenne ± k·σ | moyenne moins k·σ, moyenne plus k·σ |
| percentiles | queue basse P, queue haute 100 moins P |

Les bornes passent par un plancher et un plafond entiers, puis par les bornes théoriques de l’axe. Le walk-forward refait cette enveloppe sur les seuls tirages d’avant chaque point de la fenêtre. Il affiche le taux de hits et le volume moyen restant. Il n’écrit pas dans les piles.

## Journal

| Révision | Changement |
| --- | --- |
| 1 | Flux de l’atelier, couches, pas et proposeur. |
