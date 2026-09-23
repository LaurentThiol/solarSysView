import type { Metadata } from "next"
import { Suspense } from "react"

import { PronosticLab } from "@/components/pronostic/pronostic-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Pronostic — Synchro",
  description:
    "Réduire l’univers EuroMillions 5+2 par couches, et rejouer les 100 derniers tirages pour voir comment la largeur des bandes change la couverture et le nombre de combinaisons. La loi officielle reste uniforme.",
}

export default function PronosticPage() {
  return (
    <PageShell
      title="Pronostic"
      subtitle="L’atelier resserre l’univers 5+2 par couches et compte les grilles restantes. L’historique rejoue les 100 derniers tirages : la largeur des bandes fait varier la couverture et le nombre de combinaisons. Ce n’est pas P(prochain tirage) : la loi officielle reste uniforme."
      className="pb-[calc(7rem+env(safe-area-inset-bottom))]"
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
        <PronosticLab />
      </Suspense>
    </PageShell>
  )
}
