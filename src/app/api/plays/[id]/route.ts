import { NextRequest, NextResponse } from "next/server"

import { apiBase, HEALTH_TIMEOUT_MS } from "@/lib/api-base"

export const dynamic = "force-dynamic"

async function proxy(request: NextRequest, id: string) {
  const base = apiBase()
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "API locale non configurée" },
      { status: 503 }
    )
  }
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
    const response = await fetch(`${base}/api/plays/${id}`, init)
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  return proxy(request, id)
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  return proxy(request, id)
}
