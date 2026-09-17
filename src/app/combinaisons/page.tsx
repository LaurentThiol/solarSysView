import type { Metadata } from "next"

import { CombinaisonsPanel } from "@/components/combinaisons/combinaisons-panel"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Combinaisons — Synchro",
  description:
    "Composer, proposer et comparer des grilles EuroMillions selon les retards, les totaux et les probas de gain.",
}

export default function CombinaisonsPage() {
  return (
    <PageShell
      title="Combinaisons · EuroMillions"
      description="Composez une grille 5+2, ou demandez des propositions. Enregistrer garde un modèle ; Consigner l’envoie dans histoJeux pour un tirage donné. Le score affiché est une proba de gain (loi officielle + taux empirique), pas un pronostic."
    >
      <CombinaisonsPanel />
    </PageShell>
  )
}
