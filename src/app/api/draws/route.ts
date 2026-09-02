import { NextResponse } from "next/server"

import { apiBase, HEALTH_TIMEOUT_MS } from "@/lib/api-base"

export const dynamic = "force-dynamic"

type NeonDraw = {
  draw_date?: string
  draw_code?: string | null
  weekday?: string | null
  numbers?: number[]
  stars?: number[]
}

function drawId(row: NeonDraw, date: string): number {
  const fromCode = Number.parseInt(String(row.draw_code || "").replace(/\D/g, ""), 10)
  if (Number.isFinite(fromCode) && fromCode > 0) return fromCode
  const fromDate = Number.parseInt(date.replaceAll("-", ""), 10)
  return Number.isFinite(fromDate) ? fromDate : 0
}

export async function GET() {
  const url = apiBase()
  if (!url) {
    return NextResponse.json({ ok: false, items: [], year: null, source: "json" })
  }
  try {
    const latestRes = await fetch(`${url}/api/draws/latest`, {
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
    if (!latestRes.ok) {
      return NextResponse.json({ ok: false, items: [], year: null, source: "json" })
    }
    const latest = (await latestRes.json()) as NeonDraw
    const date = String(latest.draw_date || "").slice(0, 10)
    const year = date.length >= 4 ? Number.parseInt(date.slice(0, 4), 10) : null
    const drawsRes = await fetch(
      `${url}/api/draws?limit=500&offset=0${year ? `&year=${year}` : ""}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      }
    )
    if (!drawsRes.ok) {
      return NextResponse.json({ ok: false, items: [], year, source: "json" })
    }
    const payload = (await drawsRes.json()) as { items?: NeonDraw[] }
    const items = (payload.items || []).map((row) => {
      const iso = String(row.draw_date || "").slice(0, 10)
      return {
        id: drawId(row, iso),
        date: iso,
        weekday: String(row.weekday || "").toLowerCase(),
        numbers: Array.isArray(row.numbers) ? row.numbers : [],
        stars: Array.isArray(row.stars) ? row.stars : [],
      }
    })
    return NextResponse.json({
      ok: items.length > 0,
      items,
      year,
      source: "neon",
    })
  } catch {
    return NextResponse.json({ ok: false, items: [], year: null, source: "json" })
  }
}
