import { Suspense } from "react"
import type { Metadata } from "next"

import { CyclesLab } from "@/components/cycles/cycles-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Cycles — Synchro",
  description:
    "Registre commun des cycles et Temporal Fusion Transformer pour comparer les horloges d’un module à l’autre.",
}

export default function CyclesPage() {
  return (
    <PageShell
      title="Cycles"
      subtitle="Les horloges de Réf, les raies d’Harmo, les figures de Chartisme et les séries d’Analyse sur le même index de tirage. Le TFT dit lesquelles pèsent."
      note="Les tirages sont indépendants. Cycles décrit la structure de l’archive, pas le prochain tirage. Aucune sortie vers les grilles."
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
        <CyclesLab />
      </Suspense>
    </PageShell>
  )
}
