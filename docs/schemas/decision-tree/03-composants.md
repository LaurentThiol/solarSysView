# decisionTree — composants

- Module : `/brain/decision-tree`
- Niveau : C4 composants
- Révision : 1
- Code : `src/components/brain/decision-tree-lab.tsx`, `synchro/decision_tree/`

```mermaid
C4Component
title decisionTree, composants

Container_Boundary(labo, "Labo") {
  Component(lab, "DecisionTreeLab", "React", "Question, réglages, verdict, suite.")
  Component(tableauUi, "Tableau", "question-table.tsx", "Image du tableau avant toute coupure.")
  Component(cadre, "Cadre", "decision-tree-frame", "Barre, histogramme du nul, dessin.")
  Component(vue, "Mise en forme", "decision-tree-view.ts", "Libellés, feuilles, p, suite.")
  Component(client, "Client", "decision-tree.ts", "Statut, tâche, attente 700 ms, annulation.")
}

Container_Boundary(python, "Paquet decision_tree") {
  Component(jobs, "jobs", "Python", "Une lecture, progression, journal BH.")
  Component(questions, "questions", "Python", "Tableau selon la question.")
  Component(measures, "measures", "Python", "Indicateurs et périodes candidates.")
  Component(windows, "windows", "Python", "Fenêtre retenue sur l'apprentissage.")
  Component(search, "search", "Python", "Recherche, contrôle, remaniements.")
  Component(reading, "reading", "Python", "read_flux assemble la lecture.")
  Component(rules, "rules", "Python", "Chemins et texte.")
  Component(drawing, "drawing", "Python", "SVG ou texte.")
  Component(draft, "draft", "Python", "Brouillons, rien d'autre n'est écrit.")
  Component(predict, "predict", "Python", "Marche sur l'arbre JSON.")
  Component(store, "store", "Python", "Fichiers de la lecture.")
}

Rel(lab, tableauUi, "Affiche avant Lire")
Rel(lab, client, "Lance et sonde")
Rel(client, jobs, "POST puis GET")
Rel(jobs, reading, "Thread")
Rel(reading, questions, "Tableau")
Rel(questions, measures, "Colonnes")
Rel(reading, search, "Preuve")
Rel(search, windows, "Fenêtres apprises")
Rel(reading, rules, "Feuilles")
Rel(reading, drawing, "Dessin")
Rel(reading, draft, "Suite proposée")
Rel(reading, predict, "Cas du dernier état")
Rel(reading, store, "Sauve")
Rel(lab, vue, "Feuilles et action")
Rel(lab, cadre, "Barre et histogramme")

UpdateLayoutConfig($c4ShapeInRow="4", $c4BoundaryInRow="2")
```

Le tableau de l’écran appelle `question_picture`. Il ne lance pas `read_flux`. La lecture part seulement de **Lire le flux**.

## Journal

| Révision | Changement |
| --- | --- |
| 1 | Composants du labo et du paquet, dans l’ordre d’appel de `read_flux`. |
