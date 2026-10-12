import { NextRequest, NextResponse } from "next/server"

import { apiBase, HEALTH_TIMEOUT_MS } from "@/lib/api-base"
import { parsePrizeTiers, totalWinners } from "@/lib/draws"

export const dynamic = "force-dynamic"

type NeonDraw = {
  id?: number | string
  draw_date?: string
  draw_code?: string | null
  weekday?: string | null
  numbers?: number[]
  stars?: number[]
  star_pool?: number
  prizes?: unknown
  winners_total_fr?: number | null
  winners_total_eu?: number | null
}

function drawId(row: NeonDraw, date: string): number {
  const fromCode = Number.parseInt(String(row.draw_code || "").replace(/\D/g, ""), 10)
  if (Number.isFinite(fromCode) && fromCode > 0) return fromCode
  const fromDate = Number.parseInt(date.replaceAll("-", ""), 10)
  return Number.isFinite(fromDate) ? fromDate : 0
}

function toUi(row: NeonDraw) {
  const iso = String(row.draw_date || "").slice(0, 10)
  const prizes = parsePrizeTiers(row.prizes)
  const summed = totalWinners({ prizes })
  return {
    id: Number(row.id) || drawId(row, iso),
    date: iso,
    weekday: String(row.weekday || "").toLowerCase(),
    numbers: Array.isArray(row.numbers) ? row.numbers : [],
    stars: Array.isArray(row.stars) ? row.stars : [],
    star_pool: row.star_pool,
    prizes,
    winners_total_fr: toOptionalInt(row.winners_total_fr) ?? summed.fr,
    winners_total_eu: toOptionalInt(row.winners_total_eu) ?? summed.eu,
  }
}

function toOptionalInt(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function weekdayQuery(weekday: string | null) {
  if (weekday !== "mardi" && weekday !== "vendredi") return ""
  return `&weekday=${weekday}`
}

async function fetchEra(base: string, era: "current" | "all", weekday: string | null) {
  const items: ReturnType<typeof toUi>[] = []
  let offset = 0
  let total = Number.POSITIVE_INFINITY
  const page = 2000
  while (items.length < total) {
    const response = await fetch(
      `${base}/api/draws?limit=${page}&offset=${offset}&era=${era}${weekdayQuery(weekday)}`,
      { cache: "no-store", signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) }
    )
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = (await response.json()) as { items?: NeonDraw[]; total?: number }
    const batch = (body.items || []).map(toUi).filter((d) => d.date)
    total = Number(body.total ?? batch.length)
    if (batch.length === 0) break
    items.push(...batch)
    offset += batch.length
  }
  return items
}

function parseLastN(raw: string | null) {
  if (!raw || !/^\d+$/.test(raw)) return null
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 2 || n > 200) return null
  return n
}

function parseYearQuery(raw: string | null): number | "n-1" | "n-2" | null {
  if (!raw) return null
  if (raw === "n-1" || raw === "prev") return "n-1"
  if (raw === "n-2") return "n-2"
  if (!/^\d{4}$/.test(raw)) return null
  const year = Number.parseInt(raw, 10)
  if (year < 2004 || year > 2100) return null
  return year
}

function calendarYearOf(date: string): number | null {
  if (date.length < 4) return null
  const year = Number.parseInt(date.slice(0, 4), 10)
  return Number.isFinite(year) ? year : null
}

async function fetchLast(base: string, lastN: number, weekday: string | null) {
  const response = await fetch(
    `${base}/api/draws?limit=${lastN}&offset=0${weekdayQuery(weekday)}`,
    { cache: "no-store", signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) }
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = (await response.json()) as { items?: NeonDraw[] }
  return (body.items || []).map(toUi).filter((d) => d.date)
}

async function fetchLatestYear(base: string): Promise<number | null> {
  const latestRes = await fetch(`${base}/api/draws/latest`, {
    cache: "no-store",
    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
  })
  if (!latestRes.ok) return null
  const latest = (await latestRes.json()) as NeonDraw
  return calendarYearOf(String(latest.draw_date || "").slice(0, 10))
}

async function fetchYear(base: string, year: number, weekday: string | null) {
  const response = await fetch(
    `${base}/api/draws?limit=500&offset=0&year=${year}${weekdayQuery(weekday)}`,
    { cache: "no-store", signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) }
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = (await response.json()) as { items?: NeonDraw[] }
  return (body.items || []).map(toUi).filter((d) => d.date)
}

export async function GET(request: NextRequest) {
  const url = apiBase()
  const eraParam = request.nextUrl.searchParams.get("era")
  const era = eraParam === "all" || eraParam === "current" ? eraParam : null
  const lastN = parseLastN(request.nextUrl.searchParams.get("last"))
  const yearQuery = parseYearQuery(request.nextUrl.searchParams.get("year"))
  const weekdayRaw = (request.nextUrl.searchParams.get("weekday") || "").toLowerCase()
  const weekday = weekdayRaw === "mardi" || weekdayRaw === "vendredi" ? weekdayRaw : null
  if (!url) {
    return NextResponse.json({
      ok: false,
      items: [],
      year: yearQuery === "n-1" || yearQuery === "n-2" ? null : yearQuery,
      source: "json",
      era,
      last: lastN,
    })
  }
  try {
    if (lastN) {
      const items = await fetchLast(url, lastN, weekday)
      return NextResponse.json({
        ok: items.length > 0,
        items,
        total: items.length,
        year: null,
        last: lastN,
        weekday,
        source: "neon",
      })
    }
    if (era) {
      const items = await fetchEra(url, era, weekday)
      return NextResponse.json({
        ok: items.length > 0,
        items,
        total: items.length,
        year: null,
        era,
        weekday,
        source: "neon",
      })
    }
    const latestYear = await fetchLatestYear(url)
    const yearOffset = yearQuery === "n-1" ? 1 : yearQuery === "n-2" ? 2 : 0
    const numericYear = typeof yearQuery === "number" ? yearQuery : null
    const year: number | null =
      yearOffset > 0
        ? latestYear != null
          ? latestYear - yearOffset
          : null
        : numericYear ?? latestYear
    if (year == null || year < 2004) {
      return NextResponse.json({ ok: false, items: [], year: null, source: "json" })
    }
    const items = await fetchYear(url, year, weekday)
    return NextResponse.json({
      ok: items.length > 0,
      items,
      year,
      weekday,
      source: "neon",
    })
  } catch {
    return NextResponse.json({ ok: false, items: [], year: null, source: "json", era })
  }
}
