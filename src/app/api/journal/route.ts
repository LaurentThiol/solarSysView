import { NextRequest, NextResponse } from "next/server"

import { isAuthenticated } from "@/lib/admin-auth"
import { apiBase, HEALTH_TIMEOUT_MS } from "@/lib/api-base"
import { readJournalFiles } from "@/lib/journal-files"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 401 })
  }
  const base = apiBase()
  if (base) {
    try {
      const response = await fetch(`${base}/api/journal`, {
        cache: "no-store",
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      })
      if (response.ok) {
        const body = await response.json()
        return NextResponse.json({ ...body, readonly: false })
      }
      if (response.status !== 503) {
        const body = await response.json().catch(() => ({ error: "réponse invalide" }))
        return NextResponse.json(body, { status: response.status })
      }
    } catch {
      // L’API locale est absente : les fichiers du dépôt servent de lecture.
    }
  }
  try {
    const items = readJournalFiles()
    items.sort((a, b) => b.happened_on.localeCompare(a.happened_on) || b.slug.localeCompare(a.slug))
    return NextResponse.json({ items, readonly: true, source: "files" })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Journal illisible" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 401 })
  }
  return proxy(request, "/api/journal")
}

async function proxy(request: NextRequest, path: string) {
  const base = apiBase()
  if (!base) {
    return NextResponse.json({ ok: false, error: "API locale non configurée" }, { status: 503 })
  }
  try {
    const response = await fetch(`${base}${path}`, {
      method: request.method,
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
