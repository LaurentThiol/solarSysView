import type { Metadata } from "next"

import { MorphoLab } from "@/components/morpho/morpho-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Morpho — Synchro",
  description:
    "Glyphes, formes, règles d’action et anticipation sur les tirages EuroMillions.",
}

export default function MorphoPage() {
  return (
    <PageShell
      title="Morpho · formes"
      description="Grille 5×10, lexique géométrique, kNN visuel, VLM local (Ollama / Moondream), règles QUAND/ALORS, P(forme suivante | contexte) vs uniforme."
    >
      <MorphoLab />
    </PageShell>
  )
}
