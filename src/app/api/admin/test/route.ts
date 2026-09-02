import { NextResponse } from "next/server"

import { apiBase, HEALTH_TIMEOUT_MS } from "@/lib/api-base"
import { isAuthenticated } from "@/lib/admin-auth"
import { liveEnv } from "@/lib/env-file"
import { parseDatabaseUrl, type ServiceId } from "@/lib/secrets"

export const dynamic = "force-dynamic"

type TestBody = { service?: ServiceId; value?: string }

async function testNeon(value?: string) {
  const python = apiBase()
  if (python) {
    try {
      const response = await fetch(`${python}/api/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      })
      const health = (await response.json()) as {
        neon?: { ok?: boolean; configured?: boolean; latency_ms?: number; error?: string; host?: string }
        draws?: number | null
        latest?: { draw_date?: string } | null
      }
      const neon = health.neon || { ok: false, configured: false }
      return {
        ok: Boolean(neon.ok),
        detail: neon.ok
          ? `${neon.latency_ms ?? "?"} ms${health.draws != null ? ` · ${health.draws} tirages` : ""}`
          : neon.error || (neon.configured ? "hors ligne" : "non configuré"),
        extra: neon,
      }
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : "API Python injoignable",
      }
    }
  }
  const url = (value || liveEnv("DATABASE_URL")).trim()
  const parts = parseDatabaseUrl(url)
  if (!parts) {
    return { ok: false, detail: "DATABASE_URL absent" }
  }
  return {
    ok: false,
    detail: `URI configurée (${parts.host}) — lancez l’API Python pour un SELECT 1.`,
  }
}

async function testOpenAI(value?: string) {
  const key = (value || liveEnv("OPENAI_API_KEY")).trim()
  if (!key) return { ok: false, detail: "OPENAI_API_KEY absente" }
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    return { ok: false, detail: `HTTP ${response.status}${text ? ` · ${text.slice(0, 160)}` : ""}` }
  }
  const data = (await response.json()) as { data?: { id: string }[] }
  const count = data.data?.length ?? 0
  return { ok: true, detail: `${count} modèle(s) visibles` }
}

async function testGoogle(value?: string) {
  const key = (value || liveEnv("GOOGLE_API_KEY")).trim()
  if (!key) return { ok: false, detail: "GOOGLE_API_KEY absente" }
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    return { ok: false, detail: `HTTP ${response.status}${text ? ` · ${text.slice(0, 160)}` : ""}` }
  }
  const data = (await response.json()) as { models?: { name?: string }[] }
  const count = data.models?.length ?? 0
  return { ok: true, detail: `${count} modèle(s) Gemini` }
}

async function testBrave(value?: string) {
  const key = (value || liveEnv("BRAVE_API_KEY")).trim()
  if (!key) return { ok: false, detail: "BRAVE_API_KEY absente" }
  const response = await fetch(
    "https://api.search.brave.com/res/v1/web/search?q=euromillions&count=1",
    {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": key,
      },
      signal: AbortSignal.timeout(8000),
    }
  )
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    return { ok: false, detail: `HTTP ${response.status}${text ? ` · ${text.slice(0, 160)}` : ""}` }
  }
  return { ok: true, detail: "recherche web OK" }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }
  const body = (await request.json().catch(() => null)) as TestBody | null
  const service = body?.service
  try {
    if (service === "neon") return NextResponse.json(await testNeon(body?.value))
    if (service === "openai") return NextResponse.json(await testOpenAI(body?.value))
    if (service === "google") return NextResponse.json(await testGoogle(body?.value))
    if (service === "brave") return NextResponse.json(await testBrave(body?.value))
    return NextResponse.json({ ok: false, detail: "Service inconnu" }, { status: 400 })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      detail: error instanceof Error ? error.message : "échec",
    })
  }
}
