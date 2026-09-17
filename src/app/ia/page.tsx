import type { Metadata } from "next"

import { IaLab } from "@/components/ia/ia-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "IA — Synchro",
  description:
    "Lire une capture de laboratoire : visuel, données de fenêtre, flux et comparaison de deux modèles. Description, puis pronostic d’hypothèse si on le demande.",
}

export default function IaPage() {
  return (
    <PageShell
      title="IA · lecture"
      description="Envoie une capture (bouton Capture du bandeau) : le graphique à l’écran plus les données de la fenêtre. L’historique se renomme, s’exporte (Markdown / JSON / PDF) ou se supprime. Choisis Gemini, OpenAI ou un modèle local (Ollama) — catalogue recommandé, plus ceux visibles sur tes clés (Admin). La réponse arrive en flux. Comparer lit le même pack avec deux modèles (Chartisme / Harmo). Les tirages sont indépendants en loi officielle — l’assistant décrit, puis peut pronostiquer (hypothèse, pas une certitude)."
      footer={false}
    >
      <IaLab />
    </PageShell>
  )
}
