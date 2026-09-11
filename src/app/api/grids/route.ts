import { NextRequest, NextResponse } from "next/server"

import { apiBase, HEALTH_TIMEOUT_MS } from "@/lib/api-base"

export const dynamic = "force-dynamic"

async function proxy(request: NextRequest, path = "") {
  const base = apiBase()
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "API locale non configurée" },
      { status: 503 }
    )
  }
  const suffix = path ? `/${path}` : ""
  const init: RequestInit = {
    method: request.method,
    cache: "no-store",
    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    headers: { "content-type": "application/json" },
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text()
  }
  try {
    const response = await fetch(`${base}/api/grids${suffix}${request.nextUrl.search}`, init)
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

export async function GET(request: NextRequest) {
  return proxy(request)
}

export async function POST(request: NextRequest) {
  return proxy(request)
}
