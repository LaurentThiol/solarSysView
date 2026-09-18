import { NextResponse } from "next/server"

import { apiBase } from "@/lib/api-base"
import { isAuthenticated } from "@/lib/admin-auth"
import { llmFetch } from "@/lib/ia/loopback-fetch"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 120

const PING_TIMEOUT_MS = 95_000

export async function POST(request: Request) {
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
    const response = await llmFetch(`${base}/api/llm/ping`, { method: "POST", cache: "no-store" }, PING_TIMEOUT_MS)
    const payload = await response.json().catch(() => ({ ok: false, error: "réponse invalide" }))
    return NextResponse.json(payload, { status: response.ok ? 200 : response.status })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Ping local impossible" },
      { status: 502 }
    )
  }
}
