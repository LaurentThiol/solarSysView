import { NextRequest, NextResponse } from "next/server"

import { apiBase, HEALTH_TIMEOUT_MS } from "@/lib/api-base"

export const dynamic = "force-dynamic"

async function readBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!text) return { ok: false, error: `HTTP ${response.status}` }
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return { ok: false, error: "réponse invalide" }
  } catch {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 200)
    return { ok: false, error: snippet || "réponse invalide" }
  }
}

async function proxy(request: NextRequest, path: string[]) {
  const suffix = (path || []).join("/")
  const base = apiBase()
  if (!base) {
    return NextResponse.json({ ok: false, error: "API locale non configurée" }, { status: 503 })
  }
  const search = request.nextUrl.search
  const heavy = suffix === "fit"
  const timeout = heavy ? 120_000 : HEALTH_TIMEOUT_MS
  try {
    const response = await fetch(`${base}/api/cycles/${suffix}${search}`, {
      method: request.method,
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
    })
    const parsed = await readBody(response)
    return NextResponse.json(parsed, { status: response.status })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "API injoignable" },
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
