import { Suspense } from "react"
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
      title="Harmo"
      subtitle="Une série de tirages lue comme un mélange possible de raies calendaires, de trajectoires à fréquence variable, et d’un continuum. scipy calcule ; le navigateur affiche."
      note="Les tirages sont indépendants. Harmo décrit le tracé, pas le prochain tirage. Les unités sont des cycles/tirage et des cycles/an."
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
        <HarmoLab />
      </Suspense>
    </PageShell>
  )
}
