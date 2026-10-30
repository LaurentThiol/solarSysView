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
      subtitle="Chaque runner a son univers. Après l’avant-course, chaque tour lui laisse une tranche d’horloge pour penser : sommes, décennie, rangs. Il dessine sa tangente, son rayon, son vecteur et la case jouée."
    >
      <Suspense fallback={null}>
        <RunArcadeLab />
      </Suspense>
    </PageShell>
  )
}
