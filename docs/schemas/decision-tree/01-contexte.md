# decisionTree — contexte

- Module : `/brain/decision-tree`
- Niveau : C4 contexte
- Révision : 1
- Code : `src/app/brain/decision-tree/page.tsx`, `synchro/decision_tree/reading.py`

```mermaid
C4Context
title decisionTree, contexte

Person(chercheur, "Chercheur", "Pose une question binaire sur le tirage t et lit le verdict.")

System(decisionTree, "decisionTree", "Cherche un seuil de flux. Compare le contrôle à l'ordre détruit. Dessine l'arbre.")

System_Ext(archive, "Archive FDJ", "Tirages EuroMillions. Neon, repli JSON local.")
System_Ext(specialistes, "Spécialistes", "Réseau binaire entraîné depuis un brouillon.")
System_Ext(jeux, "Jeux", "Chances par boule. Rien n'est appliqué sans clic.")
System_Ext(chartisme, "Chartisme", "Figures scannées. Règle préparée, inactive.")
System_Ext(graphviz, "Graphviz", "Binaire dot. Sans lui, le dessin devient du texte.")

Rel(chercheur, decisionTree, "Question, Lire le flux, suite")
Rel(decisionTree, archive, "Lit les tirages", "ère et jour")
Rel(decisionTree, specialistes, "Brouillon, puis entraînement")
Rel(decisionTree, jeux, "Chances de sortie")
Rel(decisionTree, chartisme, "Balayage, puis règle")
Rel(decisionTree, graphviz, "Dessin dtreeviz")

UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

Le chercheur ne parle qu’à decisionTree. L’archive alimente le tableau. Les spécialistes, Jeux et Chartisme ne reçoivent quelque chose qu’après un clic de suite. Graphviz ne sert qu’au dessin.

## Journal

| Révision | Changement |
| --- | --- |
| 1 | Contexte aligné sur la page, l’archive, les suites et le dessin. |
