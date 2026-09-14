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
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Relief · carte 3D</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Chaque tirage est un glyphe 5×10 posé dans l’espace. La couleur suit la
          hauteur. Un décalage entre tirages (angle d’or par défaut) évite la
          superposition brute et cherche une cartographie lisible. Glisser fait
          tourner la carte.
        </p>
        <p className="mt-3 max-w-2xl rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
          Les tirages sont indépendants. Relief décrit l’archive empilée, pas le
          prochain tirage. Le voisinage sur la carte est un choix de mise en page.
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
