import type { Metadata } from "next"

import { BrainLab } from "@/components/brain/brain-lab"

export const metadata: Metadata = {
  title: "Brain — Synchro",
  description:
    "Catalog nommé des indicateurs, journal, mémoire et agent manuel. LLM local d’abord ; Gemini / OpenAI seulement sur escalade explicite.",
}

export default function BrainPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Brain · catalog</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Nomme les indicateurs (`@rsi`, `@ete`, `@fft`), enregistre une lecture datée,
          et balaie le catalog sur bouton. Le panneau Objets est exactement le prompt.
          Le chat passe par Ollama ; Escalader n’envoie un tour cloud que si tu le
          coches. L’onglet IA reste la lecture de captures.
        </p>
      </div>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-12 sm:px-6">
        <BrainLab />
      </main>
    </div>
  )
}
