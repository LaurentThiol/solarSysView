import type { Metadata } from "next"

import { BrainSpecialistsLab } from "@/components/brain/brain-specialists-lab"

export const metadata: Metadata = {
  title: "Spécialistes — Brain — Synchro",
  description:
    "Un petit réseau par série (parité, somme…). Entraîné sur l’ère formule, noté 20/50/100. Jamais une grille 5+2. Démo guidée : Suivant ou Annuler.",
}

export default function BrainSpecialistsPage() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-6 pb-12 sm:px-6">
        <BrainSpecialistsLab />
      </main>
    </div>
  )
}
