import type { Metadata } from "next"

import { HarmoLab } from "@/components/harmo/harmo-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Harmo — Synchro",
  description:
    "Étude harmonique des séries de tirages : mélange réseau / mécanique / acoustique, FFT, STFT, Hilbert, order tracking tacholess.",
}

export default function HarmoPage() {
  return (
    <PageShell
      title="Harmo · harmoniques"
      description="Une série de tirages (somme, retard, présence…) lue comme un mélange possible de trois signatures : raies verrouillées sur le calendrier, trajectoires à fréquence instantanée variable, continuum large bande. scipy calcule ; le navigateur affiche."
      notice="Les tirages sont indépendants. Harmo décrit le tracé, pas le prochain tirage. Les unités sont des cycles/tirage et des cycles/an — pas des hertz. Interpoler vers une grille kHz fabriquerait des artefacts."
    >
      <HarmoLab />
    </PageShell>
  )
}
