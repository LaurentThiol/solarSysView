import type { Metadata } from "next"

import { ReliefLab } from "@/components/relief/relief-lab"

export const metadata: Metadata = {
  title: "Relief — Synchro",
  description:
    "Carte des tirages EuroMillions : une plaque Morpho 5×10 par tirage, couleur selon la récence, décalage lisible.",
}

export default function ReliefPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      <div className="mx-auto w-full max-w-6xl px-4 py-3 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Relief · plaques 5×10</h1>
      </div>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-12 sm:px-6">
        <ReliefLab />
      </main>
      <footer className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
          Archives FDJ :{" "}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href="https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/historique"
          >
            fdj.fr
          </a>
          .
        </p>
      </footer>
    </div>
  )
}
