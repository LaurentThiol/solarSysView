import type { Metadata } from "next"

import { JeuxPanel } from "@/components/jeux/jeux-panel"

export const metadata: Metadata = {
  title: "Jeux — Synchro",
  description:
    "Compter les grilles EuroMillions 5+2 qui restent après restrictions de somme, de parité et de chances de tirage.",
}

export default function JeuxPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden pb-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Jeux · solutions</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Combien de grilles 5+2 restent une fois la somme, la parité et les
          chances de chaque boule fixées ? Le bandeau du bas suit le décompte
          en direct. Sous 50 solutions, la liste s’affiche ; au-delà, un
          échantillon uniforme.
        </p>
      </div>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-12 sm:px-6">
        <JeuxPanel />
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
