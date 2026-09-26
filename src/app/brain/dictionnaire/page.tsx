import { Suspense } from "react"
import type { Metadata } from "next"

import { LexiconLab } from "@/components/brain/lexicon-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Dictionnaire — Brain — Synchro",
  description:
    "Fiches de concepts confirmées à la main. Lecture 20/50/100 des sens de fenêtre, horloges Réf, démo sans enregistrement.",
}

export default function DictionnairePage() {
  return (
    <PageShell
      title="Dictionnaire"
      subtitle="Fiches de concepts. La lecture 20/50/100 nomme les sens, la relecture et les quarts Réf."
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
        <LexiconLab />
      </Suspense>
    </PageShell>
  )
}
