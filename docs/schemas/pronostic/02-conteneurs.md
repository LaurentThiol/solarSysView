# Pronostic — conteneurs

- Module : `/pronostic`
- Niveau : C4 conteneurs
- Révision : 1
- Code : `src/lib/use-draws.ts`, `src/app/api/pronostic/committee/route.ts`, `synchro/app.py`, `synchro/pronostic_net/`

```mermaid
C4Container
title Pronostic, conteneurs

Person(chercheur, "Chercheur", "Utilise la page Pronostic.")

System_Boundary(navigateur, "Navigateur") {
  Container(page, "Page Pronostic", "Next.js", "Onglets Atelier et Historique. La marge k reste ici.")
  Container(lib, "lib/pronostic", "TypeScript", "Piles, décompte exact, notation, score des bandes du comité.")
  Container(session, "sessionStorage", "Navigateur", "synchro.pronostic.v1 et synchro.jour.")
}

Container(drawsApi, "API tirages", "Next.js", "GET /api/draws, filtre jour et ère.")
ContainerDb(neon, "Neon", "Postgres", "Archive des tirages quand l'API répond.")
Container(json, "DRAWS JSON", "Fichier embarqué", "Repli si l'API tirages ne répond pas.")
Container(proxy, "Route comité", "Next.js", "POST /api/pronostic/committee, délai 120 s.")
Container(api, "API synchro", "FastAPI", "Même chemin. Normalise les tirages.")
Container(net, "pronostic_net", "Python, NumPy", "Onze têtes, porte, global. Trois séries à part.")
Container_Ext(specialistes, "Spécialistes", "Python", "Liste puis inférence somme et parité.")
Container_Ext(jeux, "Jeux et journal", "Next.js, Neon plays", "Spec de session et consignation.")

Rel(chercheur, page, "Consulte")
Rel(page, lib, "Calcule dans la page")
Rel(page, session, "Relit et écrit l'atelier")
Rel(page, drawsApi, "Charge l'archive")
Rel(drawsApi, neon, "Lit")
Rel(page, json, "Repli local")
Rel(page, proxy, "POST lookback et tirages")
Rel(proxy, api, "Propage le corps")
Rel(api, net, "Walk-forward")
Rel(page, specialistes, "Importe les forecasts")
Rel(page, jeux, "Spec et consignation")

UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

`k` ne part pas vers Python. Le comité renvoie des centres et des écarts. Le navigateur applique la marge et compte les grilles.

## Journal

| Révision | Changement |
| --- | --- |
| 1 | Conteneurs du navigateur, du proxy et de pronostic_net. |
