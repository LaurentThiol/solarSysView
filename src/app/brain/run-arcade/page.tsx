import type { Metadata } from "next"
import { Suspense } from "react"

import { RunArcadeLab } from "@/components/brain/run-arcade-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "runArcade — Synchro",
  description:
    "Chaque runner s’entraîne sur les années n−1 et n, puis court les derniers tirages et dessine sa pensée : tangente, rayon, vecteur, projection.",
}

export default function RunArcadePage() {
  return (
    <PageShell
      wide
      title="runArcade"
      subtitle="Chaque runner a son univers. Après l’avant-course, chaque tour lui laisse une tranche d’horloge pour penser : somme, puis rangs. Il dessine sa tangente, son rayon, son vecteur et la case jouée, près de sa pensée. n1 à n5 ne se calent pas sur 10, 20, 30, 40 ou 50. Le geste soir aligne le mardi et le vendredi, à trois ou quatre jours."
    >
      <Suspense fallback={null}>
        <RunArcadeLab />
      </Suspense>
    </PageShell>
  )
}
