import { NextResponse } from "next/server"

import { apiBase, HEALTH_TIMEOUT_MS, isNetlify } from "@/lib/api-base"
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
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
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
          last_sync?: Record<string, unknown> | null
          stale?: boolean | null
          expected_draw_date?: string | null
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
    last_sync: health?.last_sync ?? null,
    stale: health?.stale ?? null,
    expected_draw_date: health?.expected_draw_date ?? null,
    quitAvailable: !isNetlify(),
    keys: {
      neon: secretSnapshot("neon").configured,
      google: secretSnapshot("google").configured,
      openai: secretSnapshot("openai").configured,
      brave: secretSnapshot("brave").configured,
    },
  })
}
