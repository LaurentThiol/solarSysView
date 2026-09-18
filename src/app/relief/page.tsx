import type { Metadata } from "next"

import { PageShell } from "@/components/page-shell"
import { ReliefLab } from "@/components/relief/relief-lab"

export const metadata: Metadata = {
  title: "Relief — Synchro",
  description:
    "Carte 3D des tirages EuroMillions : une ligne de cinq points n1→n5 par jour, hauteur = valeur 1–50.",
}

export default function ReliefPage() {
  return (
    <PageShell
      title="Relief"
      subtitle="Une ligne n1→n5 par tirage. Hauteur = valeur 1–50. Le glyphe 5×10 reste Morpho."
      compact
    >
      <ReliefLab />
    </PageShell>
  )
}
