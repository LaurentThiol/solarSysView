"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"

import { HelpTip, WithHelp } from "@/components/help"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type AuthSnap = {
  authenticated: boolean
  needsPassword: boolean
}

export function AdminGate({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthSnap | null>(null)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const response = await fetch("/api/admin", { cache: "no-store" })
    const payload = (await response.json()) as AuthSnap
    setAuth({
      authenticated: Boolean(payload.authenticated),
      needsPassword: Boolean(payload.needsPassword),
    })
    return payload
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "échec")
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function login() {
    setError(null)
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
    const payload = (await response.json()) as { ok?: boolean; error?: string }
    if (!response.ok) {
      setError(payload.error || "Mot de passe incorrect")
      return
    }
    setPassword("")
    await load()
  }

  if (error && !auth) {
    return <p className="text-sm text-red-300">{error}</p>
  }

  if (!auth) {
    return <p className="text-sm text-muted-foreground">Vérification de l’accès…</p>
  }

  if (!auth.authenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accès admin</CardTitle>
          <CardDescription>
            {auth.needsPassword
              ? "Entrez ADMIN_PASSWORD pour afficher l’évolution des tirages."
              : "Définissez ADMIN_PASSWORD dans .env (ou ouvrez l’UI en local sur 127.0.0.1)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex max-w-md flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              Mot de passe admin
              <HelpTip
                title="Mot de passe admin"
                body="Saisissez ADMIN_PASSWORD (défini dans .env). Entrée ou le bouton Entrer valide. En local sur 127.0.0.1, le mot de passe peut être facultatif."
              />
            </span>
            <Input
              type="password"
              placeholder="ADMIN_PASSWORD"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void login()
              }}
            />
          </label>
          <WithHelp
            help={{
              title: "Entrer",
              body: "Vérifie le mot de passe auprès de /api/admin/login puis affiche la page protégée.",
            }}
          >
            <Button type="button" onClick={() => void login()}>
              Entrer
            </Button>
          </WithHelp>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </CardContent>
      </Card>
    )
  }

  return <>{children}</>
}
