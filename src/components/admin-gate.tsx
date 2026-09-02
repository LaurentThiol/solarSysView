"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"

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
          <Input
            type="password"
            placeholder="ADMIN_PASSWORD"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void login()
            }}
          />
          <Button type="button" onClick={() => void login()}>
            Entrer
          </Button>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </CardContent>
      </Card>
    )
  }

  return <>{children}</>
}
