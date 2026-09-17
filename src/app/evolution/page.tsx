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
      title="Évolution · statistiques"
      description="Courbe, dessin libre chartiste (aimant + gabarit), suivi pair/impair, forme de la grille (décennies, étendue, consécutifs), 20 ou 50 derniers tirages, fréquences et retards. Accès admin, comme les services."
      footer={false}
    >
      <EvolutionPanel />
    </PageShell>
  )
}
