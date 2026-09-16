import type { Metadata } from "next"

import { IaLab } from "@/components/ia/ia-lab"

export const metadata: Metadata = {
  title: "IA — Synchro",
  description:
    "Lire une capture de laboratoire : visuel, données de fenêtre, flux et comparaison de deux modèles. Description, puis pronostic d’hypothèse si on le demande.",
}

export default function IaPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">IA · lecture</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Envoie une capture (bouton Capture du bandeau) : le graphique à
          l’écran plus les données de la fenêtre. L’historique se renomme,
          s’exporte (Markdown / JSON / PDF) ou se supprime. Choisis Gemini, OpenAI
          ou un modèle local (Ollama) — catalogue recommandé, plus ceux visibles sur tes
          clés (Admin). La réponse arrive en flux. Comparer lit le même pack avec
          deux modèles (Chartisme / Harmo). Les tirages sont indépendants en
          loi officielle — l’assistant décrit, puis peut pronostiquer
          (hypothèse, pas une certitude).
        </p>
      </div>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-12 sm:px-6">
        <IaLab />
      </main>
    </div>
  )
}
