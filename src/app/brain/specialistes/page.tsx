import type { Metadata } from "next"

import { BrainSpecialistsLab } from "@/components/brain/brain-specialists-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Spécialistes — Brain — Synchro",
  description:
    "Un petit réseau par série (parité, somme…). Entraîné sur l’ère formule, noté 20/50/100. Jamais une grille 5+2. Démo guidée : Suivant ou Annuler.",
}

export default function BrainSpecialistsPage() {
  return (
    <PageShell footer={false}>
      <BrainSpecialistsLab />
    </PageShell>
  )
}
