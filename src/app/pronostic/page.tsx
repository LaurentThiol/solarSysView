import type { Metadata } from "next"
import { Suspense } from "react"

import { PronosticLab } from "@/components/pronostic/pronostic-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Pronostic — Synchro",
  description:
    "Réduire l’univers EuroMillions 5+2 par couches, et noter chaque tirage passé avec une marge d’erreur annoncée à l’avance. La mise est le nombre de grilles restantes. La loi officielle reste uniforme.",
}

export default function PronosticPage() {
  return (
    <PageShell
      title="Pronostic"
      subtitle="L’atelier resserre l’univers 5+2 par couches et compte les grilles restantes. L’historique note chaque tirage avec une marge d’erreur annoncée à l’avance, et compte la mise en grilles 5+2. Ce n’est pas P(prochain tirage) : la loi officielle reste uniforme."
      className="pb-[calc(7rem+env(safe-area-inset-bottom))]"
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
        <PronosticLab />
      </Suspense>
    </PageShell>
  )
}
