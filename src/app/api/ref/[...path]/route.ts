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
    return { ok: false, error: text.replace(/\s+/g, " ").trim().slice(0, 200) || "réponse invalide" }
  }
}

async function proxy(request: NextRequest, path: string[]) {
  const suffix = (path || []).join("/")
  const base = apiBase()
  if (!base) {
    return NextResponse.json({ ok: false, error: "API locale non configurée" }, { status: 503 })
  }
  const heavy = suffix === "solar/goes"
  try {
    const response = await fetch(`${base}/api/ref/${suffix}${request.nextUrl.search}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(heavy ? 120_000 : HEALTH_TIMEOUT_MS),
    })
    const parsed = await readBody(response)
    if (!response.ok) {
      const detail = parsed.detail
      const error =
        (typeof parsed.error === "string" && parsed.error) ||
        (typeof detail === "string" && detail) ||
        `HTTP ${response.status}`
      return NextResponse.json({ ...parsed, ok: false, error }, { status: response.status })
    }
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
