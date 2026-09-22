import type { Metadata } from "next"
import { Suspense } from "react"

import { PronosticLab } from "@/components/pronostic/pronostic-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Pronostic — Synchro",
  description:
    "Réduire l’univers EuroMillions 5+2 par couches (somme, parité, espaces n1–n5). Hypothèse de lecture : le tirage officiel reste uniforme.",
}

export default function PronosticPage() {
  return (
    <PageShell
      title="Pronostic"
      subtitle="Composeur d’hypothèses : des couches (somme, rangs/parité, espaces) se resserrent et le bandeau donne le nombre exact de grilles 5+2 restantes. Ce n’est pas P(prochain tirage) : la loi officielle reste uniforme."
      className="pb-[calc(7rem+env(safe-area-inset-bottom))]"
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
        <PronosticLab />
      </Suspense>
    </PageShell>
  )
}
