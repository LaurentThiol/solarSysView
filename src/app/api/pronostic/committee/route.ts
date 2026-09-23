import { NextRequest, NextResponse } from "next/server"

import { apiBase, ENSURE_TIMEOUT_MS } from "@/lib/api-base"
import { llmFetch } from "@/lib/ia/loopback-fetch"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const COMMITTEE_TIMEOUT_MS = Math.max(ENSURE_TIMEOUT_MS, 120_000)

export async function POST(request: NextRequest) {
  const base = apiBase()
  if (!base) {
    return NextResponse.json({ ok: false, error: "API locale non configurée" }, { status: 503 })
  }
  try {
    const response = await llmFetch(
      `${base}/api/pronostic/committee`,
      {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(COMMITTEE_TIMEOUT_MS),
        headers: { "content-type": "application/json" },
        body: await request.text(),
      },
      COMMITTEE_TIMEOUT_MS
    )
    const body = await response.json().catch(() => ({ ok: false, error: "réponse invalide" }))
    return NextResponse.json(body, { status: response.status })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "API injoignable" },
      { status: 503 }
    )
  }
}
