import { Suspense } from "react"
import type { Metadata } from "next"

import { PageShell } from "@/components/page-shell"
import { PulseLab } from "@/components/pulse/pulse-lab"

export const metadata: Metadata = {
  title: "Pulse — Synchro",
  description:
    "Générateurs d’onde sur les présences des boules et des étoiles : cycle simple, double cycle, paires et triplets.",
}

export default function PulsePage() {
  return (
    <PageShell
      title="Pulse"
      subtitle="Chaque boule et chaque étoile est rapprochée d’un générateur d’onde. La concordance mesure les sorties qui tombent dans le demi-cycle positif."
      note="Les tirages sont indépendants. Pulse décrit le tracé, pas le prochain tirage. Les périodes sont en tirages."
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
        <PulseLab />
      </Suspense>
    </PageShell>
  )
}
