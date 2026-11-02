import type { Metadata } from "next"
import { Suspense } from "react"

import { RunArcadeLab } from "@/components/brain/run-arcade-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "runArcade — Synchro",
  description:
    "Chaque runner s’entraîne sur les années n−1 et n, puis court les derniers tirages. Il dessine la courbe fondamentale, les masques des skills, et les calques tangente, cercle d’or, pas d’avant et vecteur.",
}

export default function RunArcadePage() {
  return (
    <PageShell
      wide
      title="runArcade"
      subtitle="Chaque runner a son univers. Après l’avant-course, chaque tour lui laisse une tranche d’horloge pour penser : somme, puis rangs. Le trait est la courbe fondamentale, la bande le masque de la skill, et tangente, cercle d’or, pas d’avant et vecteur restent en calques. Le point est la case jouée, près de la pensée. n1 à n5 ne se calent pas sur 10, 20, 30, 40 ou 50. Le geste soir aligne le mardi et le vendredi, à quatre jours au plus. Une skill n’est gardée que si l’examen monte. Le logiciel date chaque observation et compte ses reconnaissances."
    >
      <Suspense fallback={null}>
        <RunArcadeLab />
      </Suspense>
    </PageShell>
  )
}
