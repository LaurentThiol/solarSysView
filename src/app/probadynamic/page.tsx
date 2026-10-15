import { Suspense } from "react"
import type { Metadata } from "next"

import { PageShell } from "@/components/page-shell"
import { ProbaDynamicLab } from "@/components/proba-dynamic/proba-dynamic-lab"

export const metadata: Metadata = {
  title: "probaDynamic — Synchro",
  description:
    "Compteur d’observateur : 1/50 par numéro absent, 1/12 par étoile absente, remis à zéro à la sortie.",
}

export default function ProbaDynamicPage() {
  return (
    <PageShell
      title="probaDynamic"
      subtitle="Chaque absence ajoute 1/50 à un numéro et 1/12 à une étoile. La sortie remet le compteur à zéro."
      note="Lecture d’archive. Le trait marque l’écart moyen sous la loi uniforme, 9/50 pour un numéro et 5/12 pour une étoile. Le tirage suivant reste uniforme."
      wide
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
        <ProbaDynamicLab />
      </Suspense>
    </PageShell>
  )
}
