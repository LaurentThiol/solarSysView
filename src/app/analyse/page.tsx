import type { Metadata } from "next"

import { AnalysisLab } from "@/components/analysis/analysis-lab"

export const metadata: Metadata = {
  title: "Analyse — Synchro",
  description:
    "Laboratoire d’analyse des tirages EuroMillions : variables, chandeliers, probabilités, tests vs hasard.",
}

export default function AnalysePage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Analyse · laboratoire</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Variables, fenêtres à X échantillons, chandeliers, probabilités exactes,
          inférence, bayésien et dépendances — calculés sur les tirages chargés.
        </p>
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 sm:px-6">
        <AnalysisLab />
      </main>
      <footer className="border-t border-border">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
          Jeu de hasard. Ces outils ne constituent ni un pronostic ni un conseil de
          jeu. Résultats officiels :{" "}
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
