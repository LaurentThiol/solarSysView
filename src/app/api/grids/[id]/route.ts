import { NextRequest, NextResponse } from "next/server"

import { apiBase, HEALTH_TIMEOUT_MS } from "@/lib/api-base"

export const dynamic = "force-dynamic"

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const base = apiBase()
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "API locale non configurée" },
      { status: 503 }
    )
  }
  try {
    const response = await fetch(`${base}/api/grids/${id}`, {
      method: "DELETE",
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
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
