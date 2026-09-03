import { NextRequest, NextResponse } from "next/server"

import { apiBase, HEALTH_TIMEOUT_MS } from "@/lib/api-base"

export const dynamic = "force-dynamic"

async function proxy(request: NextRequest, path: string[]) {
  const suffix = (path || []).join("/")
  const base = apiBase()
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "API locale non configurée" },
      { status: 503 }
    )
  }
  const search = request.nextUrl.search
  const heavy = suffix === "vlm" || suffix === "vlm/load" || suffix === "anticipate"
  const timeout = heavy ? 180_000 : HEALTH_TIMEOUT_MS
  const init: RequestInit = {
    method: request.method,
    cache: "no-store",
    signal: AbortSignal.timeout(timeout),
    headers: { "content-type": "application/json" },
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text()
  }
  try {
    const response = await fetch(`${base}/api/morpho/${suffix}${search}`, init)
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  return proxy(request, path)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  return proxy(request, path)
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  return proxy(request, path)
}
