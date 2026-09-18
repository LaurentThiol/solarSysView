import type { Metadata } from "next"

import { BrainLab } from "@/components/brain/brain-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Brain — Synchro",
  description:
    "Épingle des indicateurs (@rsi, @ete, @specialist.paire-impair) et discute avec Brain. Les spécialistes publient une prévision de série nommée ; Brain peut aussi pronostiquer (hypothèse, pas une certitude). Ollama d’abord ; le cloud seulement si vous le demandez.",
}

export default function BrainPage() {
  return (
    <PageShell
      title="Brain"
      subtitle="Épinglez des indicateurs et discutez avec Brain. Ollama d’abord ; le cloud seulement si vous le demandez."
    >
      <BrainLab />
    </PageShell>
  )
}
