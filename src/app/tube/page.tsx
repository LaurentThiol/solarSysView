import type { Metadata } from "next"

import { PageShell } from "@/components/page-shell"
import { TubeLab } from "@/components/tube/tube-lab"

export const metadata: Metadata = {
  title: "Tube — Synchro",
  description:
    "Tube de flux 2D sur la somme des numéros EuroMillions : axe SMA, enveloppe, étirement, cisaillement et compression par N1–N5 et la lune.",
}

export default function TubePage() {
  return (
    <PageShell
      title="Tube"
      subtitle="Un flux, un axe, des vecteurs périphériques. Somme des numéros en 2D, déformée par N1–N5 et la lune."
      compact
    >
      <TubeLab />
    </PageShell>
  )
}
