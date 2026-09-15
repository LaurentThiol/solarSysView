import type { Metadata } from "next"

import { MorphoLab } from "@/components/morpho/morpho-lab"

export const metadata: Metadata = {
  title: "Morpho — Synchro",
  description:
    "Glyphes, formes, règles d’action et anticipation sur les tirages EuroMillions.",
}

export default function MorphoPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Morpho · formes</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Grille 5×10, lexique géométrique, kNN visuel, VLM local (Ollama /
          Moondream), règles QUAND/ALORS, P(forme suivante | contexte) vs uniforme.
        </p>
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 sm:px-6">
        <MorphoLab />
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
