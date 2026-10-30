import { NextRequest, NextResponse } from "next/server"

import { apiBase, HEALTH_TIMEOUT_MS } from "@/lib/api-base"
import { DRAWS } from "@/lib/draws"
import { liveEnv } from "@/lib/env-file"
import {
  filterResults,
  freshness,
  guardQuery,
  withExclusions,
  type BraveItem,
  type HiddenDraw,
} from "@/lib/run-arcade/brave-filter"
import { isPlaceholder } from "@/lib/secrets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const BRAVE_URL = "https://api.search.brave.com/res/v1/web/search"

type BraveBody = { query?: unknown; from?: unknown; cutoff?: unknown }

/** Tirages encore cachés, lus côté serveur : l’archive embarquée, puis Neon s’il répond. */
async function hiddenDraws(cutoff: string): Promise<HiddenDraw[]> {
  const byDate = new Map<string, HiddenDraw>()
  for (const draw of DRAWS) {
    if (draw.date >= cutoff) byDate.set(draw.date, { date: draw.date, numbers: draw.numbers, stars: draw.stars })
  }
  const base = apiBase()
  if (!base) return [...byDate.values()]
  try {
    const response = await fetch(`${base}/api/draws?limit=120&offset=0`, {
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
    if (response.ok) {
      const body = (await response.json()) as {
        items?: { draw_date?: string; numbers?: number[]; stars?: number[] }[]
      }
      for (const row of body.items ?? []) {
        const date = String(row.draw_date || "").slice(0, 10)
        if (date >= cutoff && Array.isArray(row.numbers) && Array.isArray(row.stars)) {
          byDate.set(date, { date, numbers: row.numbers, stars: row.stars })
        }
      }
    }
  } catch {
    /* Neon absent : l’archive embarquée filtre seule. */
  }
  return [...byDate.values()]
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as BraveBody | null
  const cutoff = String(body?.cutoff ?? "").slice(0, 10)
  const from = String(body?.from ?? "").slice(0, 10)
  if (!ISO_DAY.test(cutoff) || !ISO_DAY.test(from) || from >= cutoff) {
    return NextResponse.json({ ok: false, error: "dates de recherche invalides" }, { status: 400 })
  }
  const key = liveEnv("BRAVE_API_KEY").trim()
  if (!key || isPlaceholder(key)) {
    return NextResponse.json({ ok: false, absent: true, error: "BRAVE_API_KEY absente" }, { status: 503 })
  }
  const guard = guardQuery(String(body?.query ?? ""), cutoff)
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: 400 })

  const params = new URLSearchParams({
    q: withExclusions(guard.query),
    count: "10",
    freshness: freshness(from, cutoff),
    extra_snippets: "true",
  })
  let response: Response
  try {
    response = await fetch(`${BRAVE_URL}?${params}`, {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Brave injoignable" },
      { status: 502 }
    )
  }
  if (response.status === 429) {
    const retry = Number(response.headers.get("retry-after"))
    return NextResponse.json(
      { ok: false, error: "Brave : trop de requêtes", retryAfterMs: retry > 0 ? retry * 1000 : 1500 },
      { status: 429 }
    )
  }
  if (!response.ok) {
    return NextResponse.json({ ok: false, error: `Brave HTTP ${response.status}` }, { status: 502 })
  }
  const data = (await response.json().catch(() => null)) as { web?: { results?: BraveItem[] } } | null
  const results = filterResults(data?.web?.results ?? [], cutoff, await hiddenDraws(cutoff))
  return NextResponse.json({ ok: true, results })
}
