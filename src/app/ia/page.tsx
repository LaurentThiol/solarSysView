import type { Metadata } from "next"

import { IaLab } from "@/components/ia/ia-lab"

export const metadata: Metadata = {
  title: "IA — Synchro",
  description:
    "Lire une capture de laboratoire : visuel, données de fenêtre, choix du modèle Gemini ou OpenAI. Descriptif, pas un pronostic.",
}

export default function IaPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">IA · lecture</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Envoie une capture (bouton Capture du bandeau) : l’image de l’écran plus
          les données de la fenêtre. Choisis Gemini ou OpenAI, puis le modèle —
          catalogue recommandé, plus ceux visibles sur tes clés (Admin). Les
          tirages sont indépendants — l’assistant décrit, il ne joue pas.
        </p>
      </div>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-12 sm:px-6">
        <IaLab />
      </main>
    </div>
  )
}
