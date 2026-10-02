import { Suspense } from "react"
import type { Metadata } from "next"

import { NextLab } from "@/components/next/next-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Next — Synchro",
  description:
    "Lecture des tirages EuroMillions du plus récent au plus ancien. Couple place les boules selon leurs co-sorties observées.",
}

export default function NextPage() {
  return (
    <PageShell
      title="Next"
      subtitle="Lecture des tirages réalisés, du plus récent au plus ancien."
      note="Couple compte les co-sorties des boules 1–50 dans la fenêtre choisie. Le poids suit cet ordre de lecture."
      wide
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
        <NextLab />
      </Suspense>
    </PageShell>
  )
}
