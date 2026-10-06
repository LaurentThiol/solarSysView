import type { Metadata } from "next"
import { Suspense } from "react"

import { NextDataLab } from "@/components/nextdata/nextdata-lab"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "nextData — Synchro",
  description:
    "Pronostic 5+2 du prochain tirage : LightGBM sur trois années civiles, comparé à la fenêtre des 50 ou 100 derniers tirages sortis.",
}

export default function NextDataPage() {
  return (
    <PageShell
      title="nextData"
      subtitle="Deux lectures du prochain tirage 5+2. L’une s’entraîne sur les années n, n−1 et n−2, avec un poids plus fort sur les derniers tirages. L’autre n’apprend que sur les 50 ou 100 derniers. La base est le recomptage des numéros sortis."
      className="pb-[calc(7rem+env(safe-area-inset-bottom))]"
    >
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement…</p>}>
        <NextDataLab />
      </Suspense>
    </PageShell>
  )
}
