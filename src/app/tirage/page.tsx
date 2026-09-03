import type { Metadata } from "next"

import { DrawsExplorer } from "@/components/draws-explorer"

export const metadata: Metadata = {
  title: "Tirage — Synchro",
  description:
    "Tirages EuroMillions, filtrables par mois et par numéros, avec export CSV.",
}

export default function TiragePage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Tirage · archives</h1>
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 sm:px-6">
        <DrawsExplorer />
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
