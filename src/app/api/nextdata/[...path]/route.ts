import { NextRequest, NextResponse } from "next/server"

import { apiBase, HEALTH_TIMEOUT_MS } from "@/lib/api-base"

export const dynamic = "force-dynamic"

const FORECAST_TIMEOUT_MS = 180_000

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
  const heavy = suffix === "forecast" || suffix === "training" || suffix === "sweep"
  const timeout = heavy ? FORECAST_TIMEOUT_MS : HEALTH_TIMEOUT_MS
  try {
    const headers = new Headers()
    const contentType = request.headers.get("content-type")
    if (contentType) headers.set("content-type", contentType)
    const response = await fetch(`${base}/api/nextdata/${suffix}${search}`, {
      method: request.method,
      cache: "no-store",
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
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
