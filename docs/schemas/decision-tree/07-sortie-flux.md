# Sortie — flux

- Module : `/brain/decision-tree`
- Niveau : flux
- Révision : 1
- Code : `synchro/decision_tree/drawing.py`, `rules.py`, `draft.py`, `predict.py`, `store.py`, `jobs.py`, `src/lib/brain/decision-tree-view.ts`

Le rapport est écrit seulement après le dessin. Les SVG restent des fichiers. `report.json` ne les contient pas.

```mermaid
flowchart TD
  arbre["arbre ajusté<br/>apprentissage"] --> svg["dtreeviz<br/>histogrammes et barres"]
  svg -->|dot présent| fichiers["tree.svg, case.svg, path.svg"]
  svg -->|échec| texte["export_text<br/>engine text"]
  arbre --> marche["parcours des nœuds"]
  marche --> feuille["feuille<br/>classe majoritaire du nœud"]
  feuille --> taux{"taux de contrôle<br/>sous la moyenne du nul"}
  taux -->|oui| faible["feuille weak"]
  taux -->|non| tenue["feuille tenue"]
  faible --> tri
  tenue --> tri
  tri["positives d'abord<br/>puis taux de contrôle"] --> phrase["verdict_text"]
  phrase --> dossier[".brain/decision-tree/slug"]
  fichiers --> dossier
  texte --> dossier
  dossier --> liste["list_readings"]
  liste --> bh["Benjamini-Hochberg<br/>par ère"]
```

Le dessin du cas reprend le dernier état du flux. `path.svg` ne trace que le chemin de ce cas. Les numéros de nœuds sont posés dans `desc#decision-tree-nodes`, les mêmes que la liste des feuilles. Le seuil affiché a deux décimales, identique au texte de la règle.

`predict_row` marche l’arbre JSON, sans pickle. À gauche si la valeur est inférieure ou égale au seuil, à droite sinon. Les boules notent ainsi `latest_by_ball` : probabilité de la classe sortie, et numéro de feuille.

## Dossier

| Fichier | Contenu |
| --- | --- |
| `config.json` | Question, ère, jour, critère, profondeur, N, date |
| `rules.json` | Chemins |
| `report.json` | Rapport sans les trois SVG |
| `tree.svg` | Arbre, si dtreeviz a réussi |
| `case.svg` | Arbre avec le dernier état |
| `path.svg` | Chemin seul |

Le journal trie par date de fichier, du plus récent au plus ancien. `p_adjusted` et `q_reject` sont calculés à la lecture de la liste, sur toutes les lectures de la même ère, y compris les verdicts sans seuil. L’écran marque une lecture périmée si le nombre de tirages a augmenté, si l’ère a changé, ou si le jour a changé.

## Suite

Une seule action principale. Rien n’est écrit en silence.

```mermaid
flowchart TD
  beats{"beats_independence"} -->|non| retry["Essayer une autre question<br/>suggestions"]
  beats -->|series| train["Entraîner ce spécialiste"]
  beats -->|shape| plusieurs["Entraîner un brouillon par série"]
  beats -->|balls| jeux["Envoyer vers Jeux"]
  beats -->|chartisme| regle["Préparer la règle"]
  train --> sessionSpec["sessionStorage<br/>synchro.specialist.flux-draft"]
  plusieurs --> sessionSpec
  sessionSpec --> pageSpec["/brain/specialistes"]
  pageSpec --> post["POST spécialistes<br/>seulement au clic Entraîner"]
  jeux --> chances["chances 0 à 100<br/>défaut 100"]
  chances --> pageJeux["/jeux<br/>Appliquer les chances est un autre clic"]
  regle --> filtreRegle{"feuille positive<br/>et non weak"}
  filtreRegle -->|oui| sessionRegle["sessionStorage<br/>règle inactive"]
  filtreRegle -->|non| aucune["erreur, aucune feuille tenue"]
  sessionRegle --> pageChart["/chartisme"]
```

Les brouillons de spécialiste n’existent que pour le flux et une série. Ils gardent les feuilles positives tenues au contrôle, sinon les feuilles positives. Une série sans indicateur reconnu n’a pas de brouillon. Les consignes citent la coupe apprise si elle s’écarte de la médiane ou de la parité 3, et les fenêtres qui s’écartent de la période habituelle. n1 bas le dit : le spécialiste binaire apprend la forme haute.

Une règle chartiste reste `active: false`. Elle ne reprend que les feuilles positives tenues. Confiance, activité, figure, courbe, direction hausse et mardi deviennent la condition. L’action est une note, pas une mise.

## Journal

| Révision | Changement |
| --- | --- |
| 1 | Dessin, feuilles, dossier, p corrigé et suite. |
