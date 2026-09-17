import type { Metadata } from "next"

import { AnalysisLab } from "@/components/analysis/analysis-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Analyse — Synchro",
  description:
    "Laboratoire d’analyse des tirages EuroMillions : variables, chandeliers, probabilités, tests vs hasard.",
}

export default function AnalysePage() {
  return (
    <PageShell
      title="Analyse · laboratoire"
      description="Fenêtre temporelle globale, puis onglets : graphiques, tendance, momentum, volatilité, niveaux, figures, flux, moyennes, système, numéros, pair/impair, hasard, bayésien, dépendances. X = période d’indicateur, distincte de la plage calendaire."
    >
      <AnalysisLab />
    </PageShell>
  )
}
