# decisionTree — conteneurs

- Module : `/brain/decision-tree`
- Niveau : C4 conteneurs
- Révision : 1
- Code : `src/lib/brain/decision-tree.ts`, `src/app/api/brain/[...path]/route.ts`, `synchro/app.py`, `synchro/decision_tree/`

```mermaid
C4Container
title decisionTree, conteneurs

Person(chercheur, "Chercheur", "Utilise la page decisionTree.")

System_Boundary(navigateur, "Navigateur") {
  Container(page, "Page decisionTree", "Next.js", "Question, tableau, verdict, dessin, suite.")
  Container(client, "lib/brain", "TypeScript", "Client API, libellés, histogramme, action principale.")
  Container(session, "sessionStorage", "Navigateur", "Brouillon, règle, chances Jeux, jour.")
}

Container(proxy, "Proxy Brain", "Next.js", "GET POST DELETE /api/brain. Tableau, délai 90 s.")
Container(api, "API synchro", "FastAPI", "Statut, tableau, tâche, lecture, cas, brouillon.")
Container(paquet, "decision_tree", "Python", "read_flux. Une tâche à la fois.")
Container(fichiers, "Lectures", ".brain/decision-tree", "report, rules, config, SVG. Hors dépôt.")
Container(sklearn, "scikit-learn", "Python", "Arbre et validation temporelle.")
Container_Ext(dessin, "dtreeviz et dot", "Python, Graphviz", "SVG. Sans dot, texte de l'arbre.")
Container_Ext(archive, "Archive", "Neon ou JSON", "Tirages de l'ère, filtrés par le jour.")

Rel(chercheur, page, "Consulte")
Rel(page, client, "Affiche")
Rel(page, session, "Écrit la suite sur clic")
Rel(page, proxy, "Tableau, lecture, journal")
Rel(proxy, api, "Propage corps et jour")
Rel(api, paquet, "Lance le thread")
Rel(paquet, sklearn, "Ajuste")
Rel(paquet, dessin, "Dessine")
Rel(paquet, fichiers, "Enregistre à la fin")
Rel(api, archive, "Lit")

UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

Le navigateur ne choisit pas la profondeur finale. Il envoie un plafond, un critère éventuel, N, la coupe et les fenêtres. Python cherche, note, et ne sauve le dossier qu’une fois le rapport complet. Une annulation laisse le dossier vide.

## Journal

| Révision | Changement |
| --- | --- |
| 1 | Conteneurs du navigateur, du proxy, du paquet et des fichiers. |
