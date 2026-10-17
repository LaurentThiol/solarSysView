import { foldGlossaryQuery } from "@/lib/copy"
import { NAV_GROUPS } from "@/lib/nav"

export type JournalPr = {
  number: number
  title: string
  merged_on: string
  url: string
}

export type JournalEntry = {
  id?: number
  slug: string
  happened_on: string
  area: string
  title: string
  body: string
  pr_number: number | null
  pr_url: string | null
  prs: JournalPr[]
  source: "seed" | "agent" | "dev"
}

export type TimelinePoint = {
  slug: string
  number: number
  title: string
  mergedOn: string
  url: string
  lane: string
  x: number
  y: number
}

export const JOURNAL_LANES = [
  "Socle",
  ...NAV_GROUPS.flatMap((group) => group.items.map((item) => item.label)),
]

const DAY_MS = 24 * 60 * 60 * 1000

export function journalPoints(entry: JournalEntry): JournalPr[] {
  if (entry.prs.length > 0) return entry.prs
  if (entry.pr_number != null && entry.happened_on) {
    return [
      {
        number: entry.pr_number,
        title: entry.title,
        merged_on: entry.happened_on.slice(0, 10),
        url: entry.pr_url ?? "",
      },
    ]
  }
  return []
}

export function filterJournal(entries: readonly JournalEntry[], query: string, area: string) {
  const needle = foldGlossaryQuery(query).trim()
  return entries.filter((entry) => {
    if (area !== "Toutes" && entry.area !== area) return false
    if (!needle) return true
    const prs = journalPoints(entry)
      .map((pr) => `${pr.number} ${pr.title}`)
      .join(" ")
    const hay = foldGlossaryQuery(
      `${entry.area} ${entry.title} ${entry.body} ${entry.pr_number ?? ""} ${prs}`
    )
    return hay.includes(needle)
  })
}

export function lanesFor(entries: readonly JournalEntry[]) {
  const present = new Set(entries.flatMap((entry) => (journalPoints(entry).length ? [entry.area] : [])))
  const known = JOURNAL_LANES.filter((lane) => present.has(lane))
  const extra = [...present].filter((lane) => !JOURNAL_LANES.includes(lane)).sort((a, b) => a.localeCompare(b, "fr"))
  return [...known, ...extra]
}

export function timelinePoints(entries: readonly JournalEntry[], lanes: readonly string[]): TimelinePoint[] {
  const yOf = new Map(lanes.map((lane, index) => [lane, index]))
  const grouped = new Map<string, TimelinePoint[]>()
  for (const entry of entries) {
    const y = yOf.get(entry.area)
    if (y == null) continue
    for (const pr of journalPoints(entry)) {
      const key = `${entry.area}|${pr.merged_on}`
      const list = grouped.get(key) ?? []
      list.push({
        slug: entry.slug,
        number: pr.number,
        title: pr.title,
        mergedOn: pr.merged_on,
        url: pr.url,
        lane: entry.area,
        x: 0,
        y,
      })
      grouped.set(key, list)
    }
  }
  const points: TimelinePoint[] = []
  for (const list of grouped.values()) {
    list.sort((a, b) => a.number - b.number)
    const span = 20 * 60 * 60 * 1000
    const day = Date.parse(`${list[0].mergedOn}T00:00:00Z`)
    list.forEach((point, index) => {
      points.push({ ...point, x: day + ((index + 0.5) * span) / list.length })
    })
  }
  return points.sort((a, b) => a.x - b.x || a.y - b.y || a.number - b.number)
}

export function timelineDomain(points: readonly TimelinePoint[]) {
  if (points.length === 0) return { min: 0, max: DAY_MS }
  const xs = points.map((point) => point.x)
  return {
    min: Math.min(...xs) - DAY_MS / 2,
    max: Math.max(...xs) + DAY_MS / 2,
  }
}

export function formatJournalDay(value: string) {
  const day = value.slice(0, 10)
  const parsed = Date.parse(`${day}T00:00:00Z`)
  if (Number.isNaN(parsed)) return day
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed)
}

export function areasIn(entries: readonly JournalEntry[]) {
  const present = new Set(entries.map((entry) => entry.area))
  const known = JOURNAL_LANES.filter((lane) => present.has(lane))
  const extra = [...present].filter((lane) => !JOURNAL_LANES.includes(lane)).sort((a, b) => a.localeCompare(b, "fr"))
  return [...known, ...extra]
}
