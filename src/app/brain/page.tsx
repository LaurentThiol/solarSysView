import type { Metadata } from "next"

import { BrainLab } from "@/components/brain/brain-lab"

export const metadata: Metadata = {
  title: "Brain — Synchro",
  description:
    "Épingle des indicateurs (@rsi, @ete, @specialist.pere-impair) et discute avec Brain. Les spécialistes forecast une série nommée ; Brain peut aussi pronostiquer (hypothèse, pas une certitude). Ollama d’abord ; le cloud seulement si tu le demandes.",
}

export default function BrainPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 pb-12 sm:px-6">
        <BrainLab />
      </main>
    </div>
  )
}
