import rawDraws from "@/data/euromillions-2026.json"

export type Draw = {
  id: number
  date: string
  weekday: "mardi" | "vendredi" | string
  numbers: number[]
  stars: number[]
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

export function numberFrequencies(draws: Draw[]) {
  const counts = new Map<number, number>()
  for (const draw of draws) {
    for (const n of draw.numbers) {
      counts.set(n, (counts.get(n) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 10)
}

export function starFrequencies(draws: Draw[]) {
  const counts = new Map<number, number>()
  for (const draw of draws) {
    for (const n of draw.stars) {
      counts.set(n, (counts.get(n) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 6)
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
