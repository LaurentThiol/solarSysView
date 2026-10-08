import { Suspense } from "react"
import type { Metadata } from "next"

import { EvolutionPanel } from "@/components/evolution-panel"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Évolution — Synchro",
  description:
    "Évolution des tirages EuroMillions, Annuel (somme des numéros sur n, n−1, n−2), écarts DeltaEvol (dessin libre), Persist (reprise 0 / +1), gains FR/EU dans le temps (log, mardi/vendredi, report, masse empilée), suivi pair/impair, forme de la grille, numéros et étoiles les plus sortis (accès admin).",
  robots: { index: false, follow: false },
}

export default function EvolutionPage() {
  return (
    <PageShell
      title="Évolution"
      subtitle="Courbe, Annuel (somme des numéros sur n, n−1, n−2), DeltaEvol (écarts n − n−1, dessin libre), Persist (reprise 0 / +1 d’un numéro ou d’une étoile), gains FR/EU dans le temps (log, mardi/vendredi, report, masse empilée, dessin chartiste), pair/impair, forme de la grille, fréquences et retards. Accès admin, comme les services."
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
        <EvolutionPanel />
      </Suspense>
    </PageShell>
  )
}
