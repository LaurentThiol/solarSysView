import type { Metadata } from "next"

import { AdminGate } from "@/components/admin-gate"
import { JournalPanel } from "@/components/journal/journal-panel"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Journal — Synchro",
  description: "Suivi des modifications de Synchro.",
  robots: { index: false, follow: false },
}

export default function JournalPage() {
  return (
    <PageShell
      wide
      title="Journal"
      subtitle="Modifications de Synchro. Synthèse des PR, timeline, et texte à réécrire ici. Distinct du journal des mises, dans Jeux."
    >
      <AdminGate prompt="Entrez ADMIN_PASSWORD pour afficher le journal des modifications.">
        <JournalPanel />
      </AdminGate>
    </PageShell>
  )
}
