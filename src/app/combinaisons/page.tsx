import type { Metadata } from "next"

import { CombinaisonsPanel } from "@/components/combinaisons/combinaisons-panel"

export const metadata: Metadata = {
  title: "Combinaisons — Synchro",
  description:
    "Composer, proposer et comparer des grilles EuroMillions selon les retards, les totaux et les probas de gain.",
}

export default function CombinaisonsPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Combinaisons · EuroMillions
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Composez une grille 5+2, ou demandez des propositions. Les retards et
          totaux de la fenêtre servent à choisir les boules ; le score affiché
          est une proba de gain (loi officielle + taux empirique sur la fenêtre).
        </p>
      </div>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-12 sm:px-6">
        <CombinaisonsPanel />
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
