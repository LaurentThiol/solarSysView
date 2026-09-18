import { Suspense } from "react"
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
      title="Analyse"
      subtitle="Indicateurs, numéros et tests vs hasard sur la même fenêtre de travail. X est la période des indicateurs, distincte de la plage calendaire."
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
        <AnalysisLab />
      </Suspense>
    </PageShell>
  )
}
