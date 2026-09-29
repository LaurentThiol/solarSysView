# Historique — composants

- Module : `/pronostic?tab=historic`
- Niveau : C4 composants
- Révision : 1
- Code : `src/components/pronostic/historic-panel.tsx`, `historic-committee.tsx`, `historic-plane.tsx`, `src/lib/pronostic/historic.ts`, `committee.ts`, `plane.ts`

```mermaid
C4Component
title Historique, composants

Container_Boundary(historique, "Historique") {
  Component(panel, "HistoricPanel", "React", "Marge, fenêtre, couches, tableau.")
  Component(prepare, "Préparation", "historic.ts", "Cent derniers, lectures d'axes, choisi avant.")
  Component(joueur, "Joueur", "historic.ts", "Hit, mise, rangs, courbe, prochain tirage.")
  Component(plan, "Plan des résidus", "plane.ts", "Deux axes z, grille, carré de la marge.")
  Component(comiteUi, "Carte comité", "historic-committee.tsx", "Trois séries, têtes, préparer.")
  Component(score, "Score navigateur", "committee.ts", "Marge sur mu et sigma, décompte par tranches.")
}

Container_Ext(serie, "Série affichée", "draws filtrés", "Le filtre jour du bandeau s'applique à la moyenne.")
Container_Ext(brut, "Archive complète", "allDraws", "Le comité reçoit tous les jours.")
Container_Ext(proxy, "Route comité", "Next puis FastAPI", "Renvoie mu et sigma, sans k.")
Container_Ext(atelier, "Atelier", "PronosticLab", "Reçoit la prévision moyenne ou comité.")

Rel(panel, serie, "Lit")
Rel(panel, prepare, "horizon, lookback, couches")
Rel(prepare, joueur, "Lignes préparées et marge")
Rel(joueur, plan, "Vecteur z")
Rel(joueur, atelier, "Préparer le prochain tirage")
Rel(panel, brut, "Corps de requête")
Rel(panel, proxy, "POST si le comité est allumé")
Rel(proxy, score, "payload")
Rel(score, comiteUi, "Mises et têtes")
Rel(comiteUi, atelier, "Préparer le comité")

UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="1")
```

La préparation et le joueur tournent dans la page, par tranches, pour laisser l’écran répondre. Le comité distant ne compte pas les grilles : il ne renvoie que des moments.

## Journal

| Révision | Changement |
| --- | --- |
| 1 | Composants de la notation, du plan et du score du comité. |
