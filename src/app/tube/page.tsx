import type { Metadata } from "next"

import { PageShell } from "@/components/page-shell"
import { TubeLab } from "@/components/tube/tube-lab"

export const metadata: Metadata = {
  title: "Tube — Synchro",
  description:
    "Tube de flux sur la somme des numéros : gains appris, section asymétrique, ellipse somme × étendue ou parité, phases, retards et étoiles.",
}

export default function TubePage() {
  return (
    <PageShell
      title="Tube"
      subtitle="Somme des numéros. Gains appris sur le passé, section asymétrique, ellipse dans le plan somme × étendue."
      compact
    >
      <TubeLab />
    </PageShell>
  )
}
