import type { Metadata } from "next"

import { EvolutionPanel } from "@/components/evolution-panel"

export const metadata: Metadata = {
  title: "Évolution — Synchro",
  description:
    "Évolution des tirages EuroMillions, suivi pair/impair, forme de la grille, numéros et étoiles les plus sortis (accès admin).",
  robots: { index: false, follow: false },
}

export default function EvolutionPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Évolution · statistiques</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Courbe, suivi pair/impair, forme de la grille (décennies, étendue,
          consécutifs), 20 ou 50 derniers tirages, fréquences et retards. Accès
          admin, comme les services.
        </p>
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 sm:px-6">
        <EvolutionPanel />
      </main>
    </div>
  )
}
