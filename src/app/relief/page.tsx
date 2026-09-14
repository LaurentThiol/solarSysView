import type { Metadata } from "next"

import { ReliefLab } from "@/components/relief/relief-lab"

export const metadata: Metadata = {
  title: "Relief — Synchro",
  description:
    "Carte 3D des tirages EuroMillions : glyphes 5×10, couleur selon la hauteur, décalage harmonieux, rotation.",
}

export default function ReliefPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Relief · carte 3D</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Glyphes Morpho 5×10, couleur selon la hauteur. L’angle d’or (ou
          l’hexagone à 20 tirages) décale les grilles pour former une carte
          lisible. Glisser fait tourner.
        </p>
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
