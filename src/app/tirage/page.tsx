import type { Metadata } from "next"

import { DrawsExplorer } from "@/components/draws-explorer"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Tirage — Synchro",
  description:
    "Tirages EuroMillions, filtrables par mois et par numéros, avec export CSV.",
}

export default function TiragePage() {
  return (
    <PageShell
      title="Tirage"
      subtitle="Archives EuroMillions, filtrables par mois et par numéros, avec export CSV."
    >
      <DrawsExplorer />
    </PageShell>
  )
}
