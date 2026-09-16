import { Suspense } from "react"
import type { Metadata } from "next"

import { JeuxLab } from "@/components/jeux/jeux-lab"

export const metadata: Metadata = {
  title: "Jeux — Synchro",
  description:
    "Compter les grilles EuroMillions 5+2 restantes, et consigner les grilles jouées (histoJeux) pour relire rangs, test binomial et spec Jeux.",
}

export default function JeuxPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden pb-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Jeux</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Solutions : combien de grilles 5+2 restent une fois les restrictions
          posées. histoJeux : les grilles réellement jouées, stockées dans Neon,
          relues contre le tirage FDJ (rang, test binomial vs 7,71 %, spec Jeux).
          Ce n’est pas un pronostic.
        </p>
      </div>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-12 sm:px-6">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
          <JeuxLab />
        </Suspense>
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
