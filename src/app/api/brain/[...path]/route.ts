import { NextRequest, NextResponse } from "next/server"

import { apiBase, ENSURE_TIMEOUT_MS, HEALTH_TIMEOUT_MS } from "@/lib/api-base"
import { llmFetch } from "@/lib/ia/loopback-fetch"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function timeoutFor(path: string[], method: string) {
  if (path[0] === "status") return 6_000
  if (path.includes("retrieve")) return 30_000
  if (path.includes("tableau")) return 90_000
  if (path.includes("specialists") && method === "POST") return ENSURE_TIMEOUT_MS
  return HEALTH_TIMEOUT_MS
}

async function proxy(request: NextRequest, path: string[]) {
  const base = apiBase()
  if (!base) {
    return NextResponse.json({ ok: false, error: "API locale non configurée" }, { status: 503 })
  }
  const suffix = path.length ? `/${path.join("/")}` : ""
  const timeout = timeoutFor(path || [], request.method)
  const init: RequestInit = {
    method: request.method,
    cache: "no-store",
    signal: AbortSignal.timeout(timeout),
    headers: { "content-type": "application/json" },
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text()
  }
  try {
    const response = await llmFetch(`${base}/api/brain${suffix}${request.nextUrl.search}`, init, timeout)
    const body = await response.json().catch(() => ({ error: "réponse invalide" }))
    return NextResponse.json(body, { status: response.status })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "API injoignable" },
      { status: 503 }
    )
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return proxy(request, path || [])
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return proxy(request, path || [])
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  return proxy(request, path || [])
}
