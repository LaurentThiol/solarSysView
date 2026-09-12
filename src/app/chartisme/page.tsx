import type { Metadata } from "next"

import { ChartismeLab } from "@/components/chartisme/chartisme-lab"

export const metadata: Metadata = {
  title: "Chartisme — Synchro",
  description:
    "Figures chartistes sur les courbes du logiciel : détection géométrique, annotation dessinée, atelier d’étiquetage, règles descriptives et rétro-test contre le hasard.",
}

export default function ChartismePage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Chartisme · figures
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Les 17 figures de la table de référence sur les courbes exportées du
          logiciel : épaules, biseaux, triangles, drapeaux, tasse avec anse.
          Cassure validée seulement si l’activité dépasse sa moyenne mobile 20 et
          si la clôture confirme — sinon c’est un <em>fake breakout</em>.
        </p>
        <p className="mt-3 max-w-2xl rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
          Les tirages sont indépendants. Une figure sur une courbe de retards ou
          de sorties est une propriété du tracé, pas une prédiction. Cet onglet
          ne touche pas aux grilles : il décrit, et le rétro-test mesure l’écart
          entre la figure et le hasard.
        </p>
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 sm:px-6">
        <ChartismeLab />
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
