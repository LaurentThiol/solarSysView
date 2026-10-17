import { NextRequest, NextResponse } from "next/server"

import { isAuthenticated } from "@/lib/admin-auth"
import { apiBase, HEALTH_TIMEOUT_MS } from "@/lib/api-base"

export const dynamic = "force-dynamic"

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 401 })
  }
  const { id } = await context.params
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "Fiche introuvable" }, { status: 404 })
  }
  const base = apiBase()
  if (!base) {
    return NextResponse.json({ ok: false, error: "API locale non configurée" }, { status: 503 })
  }
  try {
    const response = await fetch(`${base}/api/journal/${id}`, {
      method: "PATCH",
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      headers: { "content-type": "application/json" },
      body: await request.text(),
    })
    const body = await response.json().catch(() => ({ error: "réponse invalide" }))
    return NextResponse.json(body, { status: response.status })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "API injoignable" },
      { status: 503 }
    )
  }
}
