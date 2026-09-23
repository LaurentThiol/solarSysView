import { NextResponse } from "next/server"

import { apiBase, isNetlify } from "@/lib/api-base"
import { gitStatus } from "@/lib/git"
import { secretSnapshot } from "@/lib/secrets"
import { backendStatus } from "@/lib/startup-backend"

export const dynamic = "force-dynamic"

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
