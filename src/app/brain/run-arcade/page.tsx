import type { Metadata } from "next"
import { Suspense } from "react"

import { RunArcadeLab } from "@/components/brain/run-arcade-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "runArcade — Synchro",
  description:
    "Chaque runner dessine, dans son univers, la tangente, le rayon, les vecteurs et la projection des rangs.",
}

export default function RunArcadePage() {
  return (
    <PageShell
      wide
      title="runArcade"
      subtitle="Chaque runner a son univers. À chaque tour il y dessine ce qu’il pense : tangente, rayon, vecteurs, projection des rangs."
    >
      <Suspense fallback={null}>
        <RunArcadeLab />
      </Suspense>
    </PageShell>
  )
}
