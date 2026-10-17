import { NextRequest, NextResponse } from "next/server"

import { isAuthenticated } from "@/lib/admin-auth"
import { apiBase, ENSURE_TIMEOUT_MS } from "@/lib/api-base"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 401 })
  }
  const base = apiBase()
  if (!base) {
    return NextResponse.json({ ok: false, error: "API locale non configurée" }, { status: 503 })
  }
  try {
    const response = await fetch(`${base}/api/journal/update`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(ENSURE_TIMEOUT_MS),
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
