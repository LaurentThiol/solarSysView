import rawDraws from "@/data/euromillions-2026.json"

export type Draw = {
  id: number
  date: string
  weekday: "mardi" | "vendredi" | string
  numbers: number[]
  stars: number[]
  star_pool?: number
}

export const DRAWS: Draw[] = [...rawDraws].sort((a, b) =>
  b.date.localeCompare(a.date)
)

export const MONTHS = [
  { value: "all", label: "Tous les mois" },
  { value: "01", label: "Janvier" },
  { value: "02", label: "Février" },
  { value: "03", label: "Mars" },
  { value: "04", label: "Avril" },
  { value: "05", label: "Mai" },
  { value: "06", label: "Juin" },
  { value: "07", label: "Juillet" },
  { value: "08", label: "Août" },
  { value: "09", label: "Septembre" },
  { value: "10", label: "Octobre" },
  { value: "11", label: "Novembre" },
  { value: "12", label: "Décembre" },
] as const

export const FIRST_DRAW = DRAWS[DRAWS.length - 1]
export const LAST_DRAW = DRAWS[0]

export function monthsPresent(draws: Draw[]) {
  const present = new Set(draws.map((draw) => monthOf(draw.date)))
  return [
    { value: "all", label: "Tous les mois" },
    ...MONTHS.filter((item) => item.value !== "all" && present.has(item.value)),
  ]
}

export function archiveSummary(draws: Draw[]) {
  if (draws.length === 0) {
    return "Historique des tirages EuroMillions."
  }
  const sorted = [...draws].sort((a, b) => a.date.localeCompare(b.date))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const year = first.date.slice(0, 4)
  const sameYear = year === last.date.slice(0, 4)
  if (sameYear) {
    return `Les ${draws.length} tirages de ${year}, du ${first.weekday} ${first.date} au ${last.weekday} ${last.date}.`
  }
  return `Les ${draws.length} tirages, du ${first.weekday} ${first.date} au ${last.weekday} ${last.date}.`
}

export function formatSyncStamp(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function formatDrawDate(isoDate: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${isoDate}T12:00:00`))
}

export function formatShortDate(isoDate: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${isoDate}T12:00:00`))
}

export function monthOf(isoDate: string) {
  return isoDate.slice(5, 7)
}

export function parseQueryNumbers(query: string): number[] {
  return [
    ...new Set(
      query
        .split(/[\s,;+]+/)
        .map((token) => Number.parseInt(token, 10))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 50)
    ),
  ]
}

export function drawMatchesQuery(draw: Draw, wanted: number[]) {
  if (wanted.length === 0) return true
  const pool = new Set([...draw.numbers, ...draw.stars])
  return wanted.every((n) => pool.has(n))
}

export function toCsv(draws: Draw[]) {
  const header = "date,jour,tirage,n1,n2,n3,n4,n5,etoile1,etoile2"
  const rows = [...draws]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((draw) =>
      [
        draw.date,
        draw.weekday,
        draw.id,
        ...draw.numbers,
        ...draw.stars,
      ].join(",")
    )
  return `${header}\n${rows.join("\n")}\n`
}

export function mergeDraws(primary: Draw[], fallback: Draw[]) {
  const byDate = new Map<string, Draw>()
  for (const draw of fallback) byDate.set(draw.date, draw)
  for (const draw of primary) byDate.set(draw.date, draw)
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
}

export function takeLastDraws(draws: Draw[], n: number) {
  return [...draws]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, Math.max(0, n))
}

export type FrequencyItem = {
  value: number
  count: number
  lastSeen: string | null
  delayDraws: number
}

function frequencyTable(
  draws: Draw[],
  pool: number,
  pick: (draw: Draw) => number[]
): FrequencyItem[] {
  const ordered = [...draws].sort((a, b) => a.date.localeCompare(b.date))
  const counts = Array(pool + 1).fill(0)
  const lastIndex: Array<number | null> = Array(pool + 1).fill(null)
  const lastDate: Array<string | null> = Array(pool + 1).fill(null)
  for (let i = 0; i < ordered.length; i += 1) {
    for (const value of pick(ordered[i])) {
      if (value < 1 || value > pool) continue
      counts[value] += 1
      lastIndex[value] = i
      lastDate[value] = ordered[i].date
    }
  }
  const n = ordered.length
  return Array.from({ length: pool }, (_, i) => {
    const value = i + 1
    const seenAt = lastIndex[value]
    return {
      value,
      count: counts[value] as number,
      lastSeen: lastDate[value],
      delayDraws: seenAt == null ? n : n - 1 - seenAt,
    }
  })
}

export function numberFrequencyTable(draws: Draw[]) {
  return frequencyTable(draws, 50, (draw) => draw.numbers)
}

export function starFrequencyTable(draws: Draw[], pool = 12) {
  return frequencyTable(draws, pool, (draw) => draw.stars)
}

export function expectedNumberHits(drawCount: number) {
  return drawCount * (5 / 50)
}

export function expectedStarHits(drawCount: number, pool = 12) {
  return pool > 0 ? drawCount * (2 / pool) : 0
}

export function hottest(items: FrequencyItem[], n: number) {
  return [...items]
    .sort((a, b) => b.count - a.count || a.value - b.value)
    .slice(0, n)
}

export function overdue(items: FrequencyItem[], n: number) {
  return [...items]
    .sort((a, b) => b.delayDraws - a.delayDraws || a.value - b.value)
    .slice(0, n)
}

export function numberCoverage(draws: Draw[]) {
  const seen = new Set<number>()
  for (const draw of draws) {
    for (const n of draw.numbers) seen.add(n)
  }
  return seen.size
}

export function numberFrequencies(draws: Draw[]) {
  return hottest(numberFrequencyTable(draws), 10).map(
    (item) => [item.value, item.count] as [number, number]
  )
}

export function starFrequencies(draws: Draw[]) {
  return hottest(starFrequencyTable(draws), 6).map(
    (item) => [item.value, item.count] as [number, number]
  )
}

export type DrawSeriesPoint = {
  date: string
  id: number
  n1: number
  n2: number
  n3: number
  n4: number
  n5: number
  sumNumbers: number
  e1: number
  e2: number
  sumStars: number
}

export function toDrawSeries(draws: Draw[]): DrawSeriesPoint[] {
  return [...draws]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((draw) => {
      const numbers = [...draw.numbers].sort((a, b) => a - b)
      const stars = [...draw.stars].sort((a, b) => a - b)
      const [n1, n2, n3, n4, n5] = numbers
      const [e1, e2] = stars
      return {
        date: draw.date,
        id: draw.id,
        n1,
        n2,
        n3,
        n4,
        n5,
        sumNumbers: n1 + n2 + n3 + n4 + n5,
        e1,
        e2,
        sumStars: e1 + e2,
      }
    })
}

export type SeriesSummary = {
  min: number
  max: number
  avg: number
}

export function summarizeValues(values: number[]): SeriesSummary | null {
  if (values.length === 0) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length
  return { min, max, avg }
}
