import type { Metadata } from "next"

import { AdminPanel } from "@/components/admin-panel"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Admin — Synchro",
  description: "Liens et secrets Neon, Google, OpenAI, Brave, plus contrôles Neon et GitHub.",
  robots: { index: false, follow: false },
}

export default function AdminPage() {
  return (
    <PageShell
      title="Admin · services"
      description={
        <>
          Liens des consoles, mots de passe et tests de connexion. Les secrets restent dans{" "}
          <code>.env</code> (jamais commités). En production Netlify, utilisez les variables
          d’environnement du site.
        </>
      }
      footer={false}
    >
      <AdminPanel />
    </PageShell>
  )
}
