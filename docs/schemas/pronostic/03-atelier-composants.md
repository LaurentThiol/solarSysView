# Atelier — composants

- Module : `/pronostic` onglet Atelier
- Niveau : C4 composants
- Révision : 1
- Code : `src/components/pronostic/pronostic-lab.tsx`, `src/lib/pronostic/`

```mermaid
C4Component
title Atelier, composants

Container_Boundary(atelier, "Atelier") {
  Component(lab, "PronosticLab", "React", "Onglets, session, bandeau de solutions.")
  Component(window, "Fenêtre", "resolveWindow", "Preset, dates, derniers N, warmup, jour.")
  Component(piles, "Piles", "state.ts", "Numéros et étoiles. Couches, ordre, bornes.")
  Component(proposeur, "Proposeur", "learn.ts", "Enveloppe sur la fenêtre. Walk-forward.")
  Component(resserrage, "Resserrage", "propagate.ts", "Ordre strict et cohérence des bandes.")
  Component(pas, "Pas", "delta-layer.ts", "Porte. N'intersecte que si le pas sort de l'indépendance.")
  Component(decompte, "Décompte", "count.ts", "Cascade puis produit 5+2.")
  Component(grilles, "Grilles", "jeux.ts", "Liste sous 50, sinon échantillon.")
  Component(pont, "Pont Jeux", "handoff.ts", "Spec session et consignation.")
}

Container_Ext(archive, "Archive filtrée", "useDraws", "Série du bandeau jour.")
Container_Ext(specialistes, "Spécialistes", "brain/specialists.ts", "Forecast somme et parité.")
Container_Ext(jeux, "Jeux", "jeux.ts, plays.ts", "Curseurs et journal.")
Container_Ext(capture, "Capture", "capture/pack.ts", "packPronostic.")

Rel(lab, window, "Choisit la fenêtre")
Rel(window, archive, "Lit")
Rel(lab, piles, "Édite")
Rel(proposeur, window, "Lit les points")
Rel(lab, proposeur, "Applique sur demande")
Rel(proposeur, piles, "Écrit les bandes")
Rel(specialistes, piles, "Somme et pairs, numéros")
Rel(piles, resserrage, "Avant chaque décompte")
Rel(resserrage, pas, "Espaces resserrés")
Rel(pas, decompte, "Pile jouée")
Rel(decompte, grilles, "Volume")
Rel(grilles, pont, "Une grille ou le spec")
Rel(pont, jeux, "Session ou POST plays")
Rel(lab, capture, "Pack de l'écran")

UpdateLayoutConfig($c4ShapeInRow="4", $c4BoundaryInRow="1")
```

Le proposeur affiche une proposition. Le décompte ne la voit qu’après **Appliquer**. Le pas éteint laisse le décompte des trois couches de niveau.

## Journal

| Révision | Changement |
| --- | --- |
| 1 | Composants de l’atelier et de leurs fichiers. |
