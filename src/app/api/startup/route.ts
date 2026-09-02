import { NextResponse } from "next/server"

import { apiBase } from "@/lib/api-base"
import { gitStatus } from "@/lib/git"
import { secretSnapshot } from "@/lib/secrets"

export const dynamic = "force-dynamic"

async function backendStatus(url: string) {
  if (!url) {
    return { ok: false, url: "", error: "API locale non configurée" }
  }
  try {
    const alive = await fetch(`${url}/api/alive`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    })
    if (!alive.ok) {
      return { ok: false, url, error: `alive HTTP ${alive.status}` }
    }
    const healthRes = await fetch(`${url}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
    const health = await healthRes.json().catch(() => null)
    return { ok: true, url, health }
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : "injoignable",
    }
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const refresh = searchParams.get("refresh") === "1"
  const url = apiBase()
  const [backend, git] = await Promise.all([backendStatus(url), gitStatus(refresh)])
  const health =
    backend && "health" in backend
      ? (backend.health as {
          neon?: Record<string, unknown>
          draws?: number | null
          latest?: Record<string, unknown> | null
        } | null)
      : null
  const neon = health?.neon ?? {
    ok: false,
    configured: secretSnapshot("neon").configured,
  }
  return NextResponse.json({
    frontend: { ok: true },
    backend,
    neon,
    git,
    draws: health?.draws ?? null,
    latest: health?.latest ?? null,
    keys: {
      neon: secretSnapshot("neon").configured,
      google: secretSnapshot("google").configured,
      openai: secretSnapshot("openai").configured,
      brave: secretSnapshot("brave").configured,
    },
  })
}
