import { evenCount, wilson } from "@/lib/analysis"
import {
  evaluateGrid,
  gridKey,
  isCompleteGrid,
  numberSum,
  sortedGrid,
  type CombinationGrid,
} from "@/lib/combinations"
import { consecutiveCount, decadeCounts, spreadOf } from "@/lib/grid-shape"

export const PLAY_SOURCES = ["combinaisons", "jeux", "manuel"] as const
export type PlaySource = (typeof PLAY_SOURCES)[number]

export const PLAY_SOURCE_LABELS: Record<PlaySource, string> = {
  combinaisons: "Combinaisons",
  jeux: "Jeux",
  manuel: "Manuel",
}

export const MAX_COPIES = 20
export const PLAYS_SESSION_KEY = "synchro.plays.items"
export const PLAYS_HANDOFF_KEY = "synchro.plays.handoff"
export const PLAYS_EVENT = "synchro-plays"

export type PlayStatus = "pending" | "settled"

export type PlayResult = {
  matched_numbers: number
  matched_stars: number
  rank: number | null
  label: string
  winning_numbers: number[]
  winning_stars: number[]
}

export type PlayDraw = {
  numbers: number[]
  stars: number[]
  weekday?: string
  star_pool?: number | null
}

export type PlayRecord = CombinationGrid & {
  id: number | string
  label: string
  play_date: string
  source: PlaySource
  note?: string | null
  copies: number
  local?: boolean
  created_at?: string
  updated_at?: string
  status?: PlayStatus
  result?: PlayResult | null
  draw?: PlayDraw | null
  weekday?: string
  source_label?: string
  repeat_key?: string
}

export type DecoratedPlay = PlayRecord & {
  source_label: string
  weekday: string
  status: PlayStatus
  result: PlayResult | null
  draw: PlayDraw | null
  repeat_key: string
}

export type PlayHandoff = {
  play_date?: string
  items: Array<{
    numbers: number[]
    stars: number[]
    label?: string
    source?: PlaySource
    copies?: number
    note?: string | null
  }>
}

export type PlayStats = {
  plays: number
  tickets: number
  rows: number
  pending: number
  settled: number
  wins: number
  p_win: number | null
  wilson: { p: number; lo: number; hi: number } | null
  unique_grids: number
  by_rank: Array<{ rank: number | null; label: string; count: number }>
  by_match: Array<{ label: string; count: number }>
  by_source: Array<{ id: PlaySource; label: string; count: number }>
  by_weekday: Array<{ id: string; count: number }>
  numbers_played: Array<{ value: number; played: number; hits: number }>
  stars_played: Array<{ value: number; played: number; hits: number }>
}

const RANK_LABELS: Record<number, string> = {
  1: "5 numéros + 2 étoiles",
  2: "5 numéros + 1 étoile",
  3: "5 numéros",
  4: "4 numéros + 2 étoiles",
  5: "4 numéros + 1 étoile",
  6: "3 numéros + 2 étoiles",
  7: "4 numéros",
  8: "2 numéros + 2 étoiles",
  9: "3 numéros + 1 étoile",
  10: "3 numéros",
  11: "1 numéro + 2 étoiles",
  12: "2 numéros + 1 étoile",
  13: "2 numéros",
}

const PARIS = "Europe/Paris"
const PLAY_CUTOFF_MINUTES = 20 * 60 + 45

export function normalizeSource(value: string | null | undefined): PlaySource {
  const key = (value || "manuel").trim().toLowerCase()
  return (PLAY_SOURCES as readonly string[]).includes(key) ? (key as PlaySource) : "manuel"
}

export function normalizeCopies(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 1
  return Math.min(MAX_COPIES, Math.max(1, Math.round(value as number)))
}

export function isDrawIso(iso: string) {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay()
  return day === 2 || day === 5
}

export function weekdayFr(iso: string) {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay()
  return ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"][day] ?? ""
}

export function addIsoDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + days))
  return next.toISOString().slice(0, 10)
}

function parisNow(now = new Date()) {
  const bag: Record<string, string> = {}
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: PARIS,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  })
  for (const part of fmt.formatToParts(now)) {
    if (part.type !== "literal") bag[part.type] = part.value
  }
  return {
    iso: `${bag.year}-${bag.month}-${bag.day}`,
    hour: Number(bag.hour),
    minute: Number(bag.minute),
  }
}

export function nextPlayDate(now = new Date()) {
  const { iso, hour, minute } = parisNow(now)
  const minutes = hour * 60 + minute
  if (isDrawIso(iso) && minutes < PLAY_CUTOFF_MINUTES) return iso
  let cursor = addIsoDays(iso, 1)
  while (!isDrawIso(cursor)) cursor = addIsoDays(cursor, 1)
  return cursor
}

export function playDateOptions(now = new Date(), upcoming = 6, recent = 8) {
  const next = nextPlayDate(now)
  const upcomingDates = [next]
  let cursor = next
  while (upcomingDates.length < upcoming) {
    cursor = addIsoDays(cursor, 1)
    while (!isDrawIso(cursor)) cursor = addIsoDays(cursor, 1)
    upcomingDates.push(cursor)
  }
  const recentDates: string[] = []
  cursor = addIsoDays(next, -1)
  while (recentDates.length < recent) {
    while (!isDrawIso(cursor)) cursor = addIsoDays(cursor, -1)
    recentDates.push(cursor)
    cursor = addIsoDays(cursor, -1)
  }
  return { next, upcoming: upcomingDates, recent: recentDates }
}

export function parsePlayDate(value: string | null | undefined) {
  const iso = (value || "").trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !isDrawIso(iso)) return null
  return iso
}

export function repeatKey(playDate: string, grid: CombinationGrid) {
  return `${playDate}|${gridKey(grid)}`
}

export type DrawLike = {
  date: string
  numbers: number[]
  stars: number[]
  weekday?: string
  star_pool?: number
}

export function decoratePlay(
  play: PlayRecord,
  draw: DrawLike | null | undefined
): DecoratedPlay {
  const grid = sortedGrid(play)
  const playDate = play.play_date.slice(0, 10)
  const source = normalizeSource(play.source)
  const copies = normalizeCopies(play.copies)
  const base: DecoratedPlay = {
    ...play,
    ...grid,
    copies,
    source,
    source_label: PLAY_SOURCE_LABELS[source],
    weekday: weekdayFr(playDate),
    status: "pending",
    result: null,
    draw: null,
    repeat_key: repeatKey(playDate, grid),
  }
  if (!draw) {
    if (play.result && (play.status === "settled" || play.result.rank !== undefined)) {
      return {
        ...base,
        status: "settled",
        result: play.result,
        draw: play.draw ?? null,
      }
    }
    return base
  }
  const evaluated = evaluateGrid(grid, draw)
  return {
    ...base,
    status: "settled",
    result: {
      matched_numbers: evaluated.matchedNumbers,
      matched_stars: evaluated.matchedStars,
      rank: evaluated.rank,
      label: evaluated.label,
      winning_numbers: evaluated.winningNumbers,
      winning_stars: evaluated.winningStars,
    },
    draw: {
      numbers: [...draw.numbers],
      stars: [...draw.stars],
      weekday: draw.weekday || base.weekday,
      star_pool: draw.star_pool,
    },
  }
}

export function decoratePlays(
  plays: PlayRecord[],
  draws: DrawLike[]
): DecoratedPlay[] {
  const byDate = new Map(draws.map((draw) => [draw.date.slice(0, 10), draw]))
  return plays.map((play) => decoratePlay(play, byDate.get(play.play_date.slice(0, 10)) ?? null))
}

function weighted(items: DecoratedPlay[]) {
  return items.reduce((total, item) => total + normalizeCopies(item.copies), 0)
}

export function summarizePlays(items: DecoratedPlay[]): PlayStats {
  const settled = items.filter((item) => item.status === "settled")
  const pending = items.filter((item) => item.status !== "settled")
  const wins = settled.filter((item) => item.result?.rank != null)
  const byRank = new Map<string, number>()
  const byMatch = new Map<string, number>()
  const bySource = new Map<PlaySource, number>()
  const byWeekday = new Map<string, number>()
  const numberPlayed = new Map<number, number>()
  const starPlayed = new Map<number, number>()
  const numberHits = new Map<number, number>()
  const starHits = new Map<number, number>()
  const unique = new Set<string>()

  for (const item of items) {
    const copies = normalizeCopies(item.copies)
    bySource.set(item.source, (bySource.get(item.source) ?? 0) + copies)
    byWeekday.set(item.weekday, (byWeekday.get(item.weekday) ?? 0) + copies)
    unique.add(gridKey(item))
    for (const value of item.numbers) {
      numberPlayed.set(value, (numberPlayed.get(value) ?? 0) + copies)
    }
    for (const value of item.stars) {
      starPlayed.set(value, (starPlayed.get(value) ?? 0) + copies)
    }
    if (item.status !== "settled" || !item.result) continue
    const rankKey = item.result.rank == null ? "none" : String(item.result.rank)
    byRank.set(rankKey, (byRank.get(rankKey) ?? 0) + copies)
    const matchKey = `${item.result.matched_numbers}+${item.result.matched_stars}`
    byMatch.set(matchKey, (byMatch.get(matchKey) ?? 0) + copies)
    for (const value of item.result.winning_numbers) {
      numberHits.set(value, (numberHits.get(value) ?? 0) + copies)
    }
    for (const value of item.result.winning_stars) {
      starHits.set(value, (starHits.get(value) ?? 0) + copies)
    }
  }

  const settledN = weighted(settled)
  const winN = weighted(wins)
  const rankRows: PlayStats["by_rank"] = []
  for (let rank = 1; rank <= 13; rank += 1) {
    const count = byRank.get(String(rank)) ?? 0
    if (count) rankRows.push({ rank, label: RANK_LABELS[rank], count })
  }
  const noneCount = byRank.get("none") ?? 0
  if (noneCount) rankRows.push({ rank: null, label: "Pas de gain", count: noneCount })

  const top = (map: Map<number, number>, hits: Map<number, number>, take: number) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, take)
      .map(([value, played]) => ({ value, played, hits: hits.get(value) ?? 0 }))

  return {
    plays: weighted(items),
    tickets: weighted(items),
    rows: items.length,
    pending: weighted(pending),
    settled: settledN,
    wins: winN,
    p_win: settledN > 0 ? winN / settledN : null,
    wilson: settledN > 0 ? wilson(winN, settledN) : null,
    unique_grids: unique.size,
    by_rank: rankRows,
    by_match: [...byMatch.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ label, count })),
    by_source: PLAY_SOURCES.filter((id) => bySource.get(id))
      .map((id) => ({ id, label: PLAY_SOURCE_LABELS[id], count: bySource.get(id) ?? 0 })),
    by_weekday: [...byWeekday.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([id, count]) => ({ id, count })),
    numbers_played: top(numberPlayed, numberHits, 10),
    stars_played: top(starPlayed, starHits, 8),
  }
}

export function emptyStats(): PlayStats {
  return summarizePlays([])
}

export function playShape(grid: CombinationGrid) {
  const numbers = [...grid.numbers].sort((a, b) => a - b)
  return {
    sum: numberSum(grid),
    even: evenCount(numbers),
    odd: numbers.length - evenCount(numbers),
    spread: spreadOf(numbers),
    consecutive: consecutiveCount(numbers),
    decades: decadeCounts(numbers),
  }
}

export function formatPlayDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00`))
}

export function formatPct(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return "—"
  return value.toLocaleString("fr-FR", {
    style: "percent",
    maximumFractionDigits: digits,
    minimumFractionDigits: Math.min(digits, 1),
  })
}

export function playsToCsv(items: DecoratedPlay[]) {
  const header = [
    "play_date",
    "weekday",
    "label",
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "s1",
    "s2",
    "source",
    "copies",
    "status",
    "matched_numbers",
    "matched_stars",
    "rank",
    "rank_label",
    "note",
  ]
  const lines = [header.join(",")]
  for (const item of items) {
    const nums = [...item.numbers, "", "", "", "", ""].slice(0, 5)
    const stars = [...item.stars, "", ""].slice(0, 2)
    const cells = [
      item.play_date,
      item.weekday,
      csvCell(item.label),
      ...nums.map(String),
      ...stars.map(String),
      item.source,
      String(item.copies),
      item.status,
      item.result ? String(item.result.matched_numbers) : "",
      item.result ? String(item.result.matched_stars) : "",
      item.result?.rank == null ? "" : String(item.result.rank),
      csvCell(item.result?.label ?? ""),
      csvCell(item.note ?? ""),
    ]
    lines.push(cells.join(","))
  }
  return `${lines.join("\n")}\n`
}

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function readSessionPlays(): PlayRecord[] {
  if (typeof window === "undefined") return []
  try {
    const raw = sessionStorage.getItem(PLAYS_SESSION_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PlayRecord[]
    return Array.isArray(parsed) ? parsed.filter((item) => isCompleteGrid(item) && parsePlayDate(item.play_date)) : []
  } catch {
    return []
  }
}

export function writeSessionPlays(items: PlayRecord[]) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(PLAYS_SESSION_KEY, JSON.stringify(items))
    window.dispatchEvent(new Event(PLAYS_EVENT))
  } catch {
    /* quota / private mode */
  }
}

export function writePlayHandoff(payload: PlayHandoff) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(PLAYS_HANDOFF_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function readPlayHandoff(): PlayHandoff | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(PLAYS_HANDOFF_KEY)
    if (!raw) return null
    sessionStorage.removeItem(PLAYS_HANDOFF_KEY)
    const parsed = JSON.parse(raw) as PlayHandoff
    if (!parsed || !Array.isArray(parsed.items)) return null
    const items = parsed.items.filter((item) => isCompleteGrid(item)).map((item) => ({
      ...sortedGrid(item),
      label: item.label?.trim() || "Grille",
      source: normalizeSource(item.source),
      copies: normalizeCopies(item.copies),
      note: item.note ?? null,
    }))
    if (items.length === 0) return null
    return { play_date: parsePlayDate(parsed.play_date) ?? undefined, items }
  } catch {
    return null
  }
}

export function friendlyPlaysError(raw?: string) {
  const text = raw?.trim() || "API histoJeux indisponible"
  if (/fetch failed|ECONNREFUSED|injoignable|non configurée/i.test(text)) {
    return "API histoJeux indisponible"
  }
  return text
}

export async function persistPlays(payload: {
  play_date: string
  items: PlayHandoff["items"]
  preferSession?: boolean
}): Promise<{ items: PlayRecord[]; source: "api" | "session"; error: string | null }> {
  const playDate = parsePlayDate(payload.play_date)
  if (!playDate) {
    return { items: [], source: "session", error: "Date de tirage invalide (mardi ou vendredi)." }
  }
  const items = payload.items.filter((item) => isCompleteGrid(item)).map((item) => ({
    ...sortedGrid(item),
    label: item.label?.trim() || "Grille",
    source: normalizeSource(item.source),
    copies: normalizeCopies(item.copies),
    note: item.note ?? null,
  }))
  if (items.length === 0) {
    return { items: [], source: "session", error: "Il faut 5 numéros et 2 étoiles." }
  }
  if (!payload.preferSession) {
    try {
      const response = await fetch("/api/plays", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ play_date: playDate, items }),
      })
      const body = (await response.json()) as { items?: PlayRecord[]; error?: string }
      if (response.ok && Array.isArray(body.items) && body.items.length > 0) {
        return { items: body.items, source: "api", error: null }
      }
      if (response.status < 500) {
        return {
          items: [],
          source: "api",
          error: friendlyPlaysError(body.error || "Enregistrement refusé"),
        }
      }
    } catch {
      /* fallback session */
    }
  }
  const local: PlayRecord[] = items.map((item, index) => ({
    ...item,
    id: `local-${Date.now()}-${index}`,
    play_date: playDate,
    local: true,
  }))
  const next = [...local, ...readSessionPlays()]
  writeSessionPlays(next)
  return {
    items: local,
    source: "session",
    error: "API histoJeux indisponible — conservation en session",
  }
}
