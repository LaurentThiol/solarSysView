import type { Metadata } from "next"

import { HarmoLab } from "@/components/harmo/harmo-lab"

export const metadata: Metadata = {
  title: "Harmo — Synchro",
  description:
    "Étude harmonique des séries de tirages : mélange réseau / mécanique / acoustique, FFT, STFT, Hilbert, order tracking tacholess.",
}

export default function HarmoPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Harmo · harmoniques</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Une série de tirages (somme, retard, présence…) lue comme un mélange
          possible de trois signatures : raies verrouillées sur le calendrier,
          trajectoires à fréquence instantanée variable, continuum large bande.
          scipy calcule ; le navigateur affiche.
        </p>
        <p className="mt-3 max-w-2xl rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
          Les tirages sont indépendants. Harmo décrit le tracé, pas le prochain
          tirage. Les unités sont des cycles/tirage et des cycles/an — pas des
          hertz. Interpoler vers une grille kHz fabriquerait des artefacts.
        </p>
      </div>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-12 sm:px-6">
        <HarmoLab />
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
