import { NextRequest, NextResponse } from "next/server"

import { apiBase, HEALTH_TIMEOUT_MS } from "@/lib/api-base"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  const suffix = (path || []).join("/")
  const base = apiBase()
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "API locale non configurée" },
      { status: 503 }
    )
  }
  const search = request.nextUrl.search
  const timeout =
    suffix === "montecarlo" || suffix === "lab" ? 60_000 : HEALTH_TIMEOUT_MS
  try {
    const response = await fetch(`${base}/api/analysis/${suffix}${search}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
    })
    const body = await response.json().catch(() => ({ error: "réponse invalide" }))
    return NextResponse.json(body, { status: response.status })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "API injoignable",
      },
      { status: 503 }
    )
  }
}
