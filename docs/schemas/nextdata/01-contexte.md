# nextData — contexte

- Module : `/nextdata`
- Niveau : C4 contexte
- Révision : 1
- Code : `src/app/nextdata/page.tsx`, `src/app/nextdatatraining/page.tsx`

```mermaid
C4Context
    title nextData, contexte

    Person(chercheur, "Chercheur", "Règle le focus, les années, le jour et les familles. Lit les écarts du rayon.")

    System(nextdata, "nextData", "Deux grilles 5+2 pour le prochain tirage. Le retour note les mêmes pas.")
    System(entrainement, "nextDataTraining", "Les dix derniers pas du retour, mesurés contre le tirage sorti.")

    System_Ext(archive, "Archive FDJ", "Tirages EuroMillions. Neon, repli JSON local.")
    System_Ext(cache, "Cache des pas", "Morceaux LightGBM, CatBoost, Darts et Chronos. Hors dépôt.")
    System_Ext(jeux, "Jeux", "Reçoit la grille choisie, ou sa jumelle Persist.")

    Rel(chercheur, nextdata, "Pronostique, ouvre le rayon")
    Rel(chercheur, entrainement, "Entraîne, épingle un décalage")
    Rel(nextdata, archive, "Lit les tirages", "GET /api/draws")
    Rel(entrainement, archive, "Lit les mêmes tirages")
    Rel(nextdata, cache, "Calcule ou relit un pas")
    Rel(entrainement, cache, "Relit les mêmes pas")
    Rel(nextdata, jeux, "Envoie une grille")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

Le chercheur parle aux deux pages. Elles partagent l’archive et le cache. Jeux ne reçoit que la grille du pronostic. Le rayon ne parle à personne : il relit la réponse déjà là.

```mermaid
C4Container
    title nextData, conteneurs

    Person(chercheur, "Chercheur", "Utilise les deux pages.")

    System_Boundary(navigateur, "Navigateur") {
        Container(page, "Pages nextData", "Next.js", "Pronostic, retour, entraînement, panneau Rayons X.")
    }

    Container(proxy, "Routes nextData", "Next.js", "POST forecast, training et sweep. Proxifient l’API locale.")
    Container(api, "API synchro", "FastAPI", "Assemble les pas. Publie la trace sans réajuster les arbres.")
    Container(modeles, "models.py", "Python", "LightGBM, CatBoost, Darts, Chronos. Seul ce code entre dans la clé du cache.")
    ContainerDb(cache, "steps", "Fichiers JSON", ".nextdata/steps, hors dépôt.")
    ContainerDb(neon, "Neon", "Postgres", "Archive des tirages quand l’API répond.")

    Rel(chercheur, page, "Consulte")
    Rel(page, proxy, "POST le réglage et les tirages")
    Rel(proxy, api, "Propage le corps")
    Rel(api, modeles, "Calcule un morceau manquant")
    Rel(api, cache, "Relit un morceau prêt")
    Rel(page, neon, "Charge l’archive")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

L’assemblage, le calibrage et l’écran vivent hors de `models.py`. Les changer ne recalcule aucun pas. Le rayon dit quelle empreinte d’assemblage a fabriqué la grille affichée.

## Journal

| Révision | Changement |
| --- | --- |
| 1 | Contexte et conteneurs du pronostic, de l’entraînement et du cache des pas. |
