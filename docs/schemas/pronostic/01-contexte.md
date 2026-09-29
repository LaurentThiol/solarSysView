# Pronostic — contexte

- Module : `/pronostic`
- Niveau : C4 contexte
- Révision : 1
- Code : `src/app/pronostic/page.tsx`, `src/components/pronostic/pronostic-lab.tsx`

```mermaid
C4Context
title Pronostic, contexte

Person(chercheur, "Chercheur", "Pose une hypothèse de lecture 5+2 et note l'archive.")

System(pronostic, "Pronostic", "Atelier de couches et historique noté. Compte les grilles restantes. La loi officielle reste uniforme.")

System_Ext(archive, "Archive FDJ", "Tirages EuroMillions. Neon, repli JSON local.")
System_Ext(specialistes, "Spécialistes", "Forecast somme et parité des numéros.")
System_Ext(jeux, "Jeux", "Compteur de solutions et journal des mises jouées.")
System_Ext(capture, "Capture Brain", "Pack de lecture de l'écran atelier.")

Rel(chercheur, pronostic, "Règle couches, fenêtre, marge")
Rel(pronostic, archive, "Lit les tirages", "GET /api/draws")
Rel(pronostic, specialistes, "Importe somme et parité")
Rel(pronostic, jeux, "Envoie le spec, consigne une grille")
Rel(pronostic, capture, "Expose le pack atelier")

UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

Le chercheur ne parle qu’à Pronostic. L’archive alimente les deux onglets. Les spécialistes et Jeux ne touchent que l’atelier. La capture lit l’atelier, pas le comité.

## Journal

| Révision | Changement |
| --- | --- |
| 1 | Contexte aligné sur la page, l’archive, les spécialistes, Jeux et la capture. |
