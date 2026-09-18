import { NextResponse } from "next/server"

import { apiBase, HEALTH_TIMEOUT_MS } from "@/lib/api-base"
import { isAuthenticated } from "@/lib/admin-auth"
import { llmFetch } from "@/lib/ia/loopback-fetch"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }
  const base = apiBase()
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "API Python non configurée (lancez ./launch en local)." },
      { status: 503 }
    )
  }
  try {
    const response = await llmFetch(`${base}/api/llm/usage`, { method: "GET", cache: "no-store" }, HEALTH_TIMEOUT_MS)
    const payload = await response.json().catch(() => ({ ok: false, error: "réponse invalide" }))
    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "API injoignable" },
      { status: 503 }
    )
  }
}
