import type { Metadata } from "next"
import { Suspense } from "react"

import { DecisionTreeLab, DecisionTreeTitle } from "@/components/brain/decision-tree-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "decisionTree — Synchro",
  description:
    "Seuils du flux (somme, rangs, retards, figures). L’indépendance n’est que le nul, rejoué quand l’ordre des tirages est détruit.",
}

export default function DecisionTreePage() {
  return (
    <PageShell
      title={<DecisionTreeTitle />}
      subtitle="Un seuil sur le flux, tenu contre l’ordre détruit. Pas une grille 5+2."
    >
      <Suspense fallback={null}>
        <DecisionTreeLab />
      </Suspense>
    </PageShell>
  )
}
