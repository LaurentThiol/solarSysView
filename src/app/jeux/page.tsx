import { Suspense } from "react"
import type { Metadata } from "next"

import { JeuxLab } from "@/components/jeux/jeux-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Jeux — Synchro",
  description:
    "Compter les grilles EuroMillions 5+2 restantes, et consigner les grilles jouées (journal) pour relire rangs, test binomial et spec Jeux.",
}

export default function JeuxPage() {
  return (
    <PageShell
      title="Jeux"
      subtitle="Solutions : combien de grilles 5+2 restent une fois les restrictions posées. Journal : les grilles réellement jouées, relues contre le tirage FDJ. Ce n’est pas un pronostic."
      className="pb-[calc(7rem+env(safe-area-inset-bottom))]"
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
        <JeuxLab />
      </Suspense>
    </PageShell>
  )
}
