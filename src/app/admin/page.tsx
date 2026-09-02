import type { Metadata } from "next"

import { AdminPanel } from "@/components/admin-panel"

export const metadata: Metadata = {
  title: "Admin — Synchro",
  description: "Liens et secrets Neon, Google, OpenAI, Brave, plus contrôles Neon et GitHub.",
  robots: { index: false, follow: false },
}

export default function AdminPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Admin · services</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Liens des consoles, mots de passe et tests de connexion. Les secrets restent dans{" "}
          <code>.env</code> (jamais commités). En production Netlify, utilisez les variables
          d’environnement du site.
        </p>
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 sm:px-6">
        <AdminPanel />
      </main>
    </div>
  )
}
