import type { Metadata } from "next"

import { AdminPanel } from "@/components/admin-panel"
import { PageShell } from "@/components/page-shell"

export const metadata: Metadata = {
  title: "Admin — Synchro",
  description: "Secrets, contrôles Neon et GitHub, suivi des bibliothèques.",
  robots: { index: false, follow: false },
}

export default function AdminPage() {
  return (
    <PageShell
      title="Admin"
      subtitle={
        <>
          Liens des consoles, mots de passe, tests de connexion, et suivi des bibliothèques. Les
          secrets restent dans{" "}
          <code>.env</code> (jamais commités). En production Netlify, utilisez les variables
          d’environnement du site.
        </>
      }
    >
      <AdminPanel />
    </PageShell>
  )
}
