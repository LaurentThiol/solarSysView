import type { Metadata } from "next"
import { Suspense } from "react"

import { TrainingLab } from "@/components/nextdata/training-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "nextDataTraining — Synchro",
  description:
    "Même réglage que nextData, reculé de 1 à 10 tirages : écart entre la prévision et le tirage sorti.",
}

export default function NextDataTrainingPage() {
  return (
    <PageShell
      title="nextDataTraining"
      subtitle="Le même réglage que nextData, mesuré sur les dix tirages d’avant. −1 cache le dernier tirage. −10 se place dix tirages plus tôt. La courbe est l’écart entre la prévision et le tirage sorti."
      className="pb-[calc(7rem+env(safe-area-inset-bottom))]"
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
        <TrainingLab />
      </Suspense>
    </PageShell>
  )
}
