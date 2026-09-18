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
      title="IA"
      subtitle="Envoyez une capture (bouton Capture du bandeau) : le graphique à l’écran plus les données de la fenêtre. L’historique se renomme, s’exporte ou se supprime. Choisissez Gemini, OpenAI ou un modèle local. Les tirages sont indépendants — l’assistant décrit, puis peut pronostiquer (hypothèse, pas une certitude)."
    >
      <IaLab />
    </PageShell>
  )
}
