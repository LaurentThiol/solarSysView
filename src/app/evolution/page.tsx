import type { Metadata } from "next"

import { EvolutionPanel } from "@/components/evolution-panel"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Évolution — Synchro",
  description:
    "Évolution des tirages EuroMillions, suivi pair/impair, forme de la grille, numéros et étoiles les plus sortis (accès admin).",
  robots: { index: false, follow: false },
}

export default function EvolutionPage() {
  return (
    <PageShell
      title="Évolution"
      subtitle="Courbe, dessin libre chartiste (aimant, Alt pour l’arrivée hors courbe), pair/impair, forme de la grille, fréquences et retards. Accès admin, comme les services."
    >
      <EvolutionPanel />
    </PageShell>
  )
}
