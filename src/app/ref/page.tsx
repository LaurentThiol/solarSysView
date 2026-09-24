import { Suspense } from "react"
import type { Metadata } from "next"

import { PageShell } from "@/components/page-shell"
import { RefLab } from "@/components/ref/ref-lab"

export const metadata: Metadata = {
  title: "Réf — Synchro",
  description:
    "Références de cycles physiques : mois synodique, rotation de Carrington, cycle de Schwabe, catalogue des autres cycles.",
}

export default function RefPage() {
  return (
    <PageShell
      title="Réf"
      subtitle="Cycles physiques datés, puis un plan : deux phases en axes, couleur donnée par le total des numéros, le total des étoiles, n1–n5, E1 ou E2."
      note="Une phase ou un numéro de rotation décrit le ciel à une date. Ça ne dit rien du prochain tirage."
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
        <RefLab />
      </Suspense>
    </PageShell>
  )
}
