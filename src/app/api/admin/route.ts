import { NextResponse } from "next/server"

import { apiBase, HEALTH_TIMEOUT_MS, isNetlify } from "@/lib/api-base"
import { upsertEnv } from "@/lib/env-file"
import {
  adminPassword,
  isAuthenticated,
  isLocalRequest,
} from "@/lib/admin-auth"
import { gitStatus } from "@/lib/git"
import {
  parseDatabaseUrl,
  replaceNeonPassword,
  secretSnapshot,
  SERVICES,
  type ServiceId,
} from "@/lib/secrets"

export const dynamic = "force-dynamic"

async function backendHealth() {
  const url = apiBase()
  if (!url) return null
  try {
    const response = await fetch(`${url}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
    if (!response.ok) return null
    return (await response.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const refreshGit = searchParams.get("refresh") === "1"
  const authenticated = await isAuthenticated(request)
  const [github, health] = await Promise.all([gitStatus(refreshGit), backendHealth()])
  const services = SERVICES.map((service) => {
    const snap = secretSnapshot(service.id)
    if (!authenticated) {
      return { ...snap, value: "", password: "" }
    }
    return snap
  })
  return NextResponse.json({
    authenticated,
    needsPassword: !authenticated && Boolean(adminPassword()),
    local: isLocalRequest(request),
    writable: !isNetlify(),
    netlify: isNetlify(),
    services,
    github,
    neon: (health?.neon as Record<string, unknown> | undefined) ?? {
      ok: false,
      configured: secretSnapshot("neon").configured,
    },
    draws: health?.draws ?? null,
    latest: health?.latest ?? null,
    last_sync: health?.last_sync ?? null,
    stale: health?.stale ?? null,
    expected_draw_date: health?.expected_draw_date ?? null,
  })
}

type SaveBody = {
  service?: ServiceId
  value?: string
  password?: string
  clear?: boolean
}

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }
  if (isNetlify()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Sur Netlify, les secrets se définissent dans Site configuration → Environment variables (pas dans .env).",
      },
      { status: 400 }
    )
  }
  const body = (await request.json().catch(() => null)) as SaveBody | null
  const service = SERVICES.find((item) => item.id === body?.service)
  if (!service) {
    return NextResponse.json({ ok: false, error: "Service inconnu" }, { status: 400 })
  }

  let nextValue = (body?.value || "").trim()
  if (body?.clear) {
    upsertEnv({ [service.envKey]: null })
  } else if (service.id === "neon" && body?.password?.trim()) {
    const current = secretSnapshot("neon").value || nextValue
    if (!current) {
      return NextResponse.json(
        { ok: false, error: "Collez d’abord l’URI Neon, puis le mot de passe." },
        { status: 400 }
      )
    }
    nextValue = replaceNeonPassword(current, body.password.trim())
    upsertEnv({ DATABASE_URL: nextValue })
  } else if (nextValue) {
    if (service.id === "neon" && !parseDatabaseUrl(nextValue)) {
      return NextResponse.json(
        { ok: false, error: "URI PostgreSQL Neon invalide." },
        { status: 400 }
      )
    }
    upsertEnv({ [service.envKey]: nextValue })
  } else {
    return NextResponse.json({ ok: false, error: "Valeur vide" }, { status: 400 })
  }

  const python = apiBase()
  if (python) {
    try {
      await fetch(`${python}/api/reload-env`, {
        method: "POST",
        signal: AbortSignal.timeout(3000),
      })
    } catch {
      // l’API Python n’est pas obligatoire pour sauver .env
    }
  }

  return NextResponse.json({
    ok: true,
    message:
      service.id === "neon"
        ? "URI Neon enregistrée dans .env"
        : `Clé ${service.envKey} enregistrée dans .env`,
    service: secretSnapshot(service.id),
  })
}
