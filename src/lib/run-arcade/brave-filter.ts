/**
 * Brave cherche sur le web d’aujourd’hui, où les tirages encore cachés sont publiés.
 * Ces fonctions décident, côté serveur, ce qu’un runner peut lire.
 */

/** Sites de résultats et de statistiques : leurs pages comptent les tirages cachés sans les citer. */
export const EXCLUDED_SITES = [
  "fdj.fr",
  "euro-millions.com",
  "tirage-euromillions.net",
  "resultats-loto.com",
  "secretsdujeu.com",
  "lottery.co.uk",
  "national-lottery.co.uk",
  "loterie-romande.ch",
  "euromillones.com",
] as const

export type HiddenDraw = { date: string; numbers: number[]; stars: number[] }

export type BraveItem = {
  title?: string
  url?: string
  description?: string
  extra_snippets?: string[]
  page_age?: string
}

export type BraveNote = { title: string; url: string; snippet: string }

const NUMBER_SPAN = 80
const STAR_SPAN = 60

const MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
  décembre: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

const MONTH_PATTERN = Object.keys(MONTHS).join("|")
const STAR_WORDS = /étoiles?|etoiles?|★|⭐|stars?|lucky/gi

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function isoDay(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

export function cleanText(raw: string) {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x?[0-9a-f]+;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Dates au jour près, dans les formats courants français et anglais. */
export function datesIn(text: string): string[] {
  const found: string[] = []
  const push = (value: string | null) => {
    if (value) found.push(value)
  }
  for (const match of text.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
    push(isoDay(Number(match[1]), Number(match[2]), Number(match[3])))
  }
  for (const match of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/g)) {
    push(isoDay(Number(match[3]), Number(match[2]), Number(match[1])))
  }
  const dayMonth = new RegExp(`\\b(\\d{1,2})(?:er|st|nd|rd|th)?\\s+(${MONTH_PATTERN})\\s+(20\\d{2})\\b`, "gi")
  for (const match of text.matchAll(dayMonth)) {
    push(isoDay(Number(match[3]), MONTHS[match[2].toLowerCase()], Number(match[1])))
  }
  const monthDay = new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`, "gi")
  for (const match of text.matchAll(monthDay)) {
    push(isoDay(Number(match[3]), MONTHS[match[1].toLowerCase()], Number(match[2])))
  }
  return found
}

/** Mois cités sans jour : « août 2026 ». « le 3 août 2026 » est une date au jour près. */
export function monthsIn(text: string): string[] {
  const pattern = new RegExp(`(?<!\\d(?:er|st|nd|rd|th)?\\s+)\\b(${MONTH_PATTERN})\\s+(20\\d{2})\\b`, "gi")
  return [...text.matchAll(pattern)].map((match) => `${match[2]}-${pad(MONTHS[match[1].toLowerCase()])}`)
}

export function citesLateDate(text: string, cutoff: string) {
  if (datesIn(text).some((date) => date >= cutoff)) return true
  const month = cutoff.slice(0, 7)
  return monthsIn(text).some((value) => value >= month)
}

type Token = { index: number; value: number }

function tokens(text: string): Token[] {
  return [...text.matchAll(/(?<!\d)(\d{1,2})(?!\d)/g)].map((match) => ({
    index: match.index ?? 0,
    value: Number(match[1]),
  }))
}

/** Toutes les valeurs, dans n’importe quel ordre, dans une portée de `span` caractères. */
export function valuesNear(text: string, values: readonly number[], span: number) {
  const wanted = new Set(values)
  if (wanted.size === 0) return false
  const hits = tokens(text).filter((token) => wanted.has(token.value))
  const counts = new Map<number, number>()
  let left = 0
  for (let right = 0; right < hits.length; right += 1) {
    counts.set(hits[right].value, (counts.get(hits[right].value) ?? 0) + 1)
    while (hits[right].index - hits[left].index > span) {
      const value = hits[left].value
      const next = (counts.get(value) ?? 1) - 1
      if (next <= 0) counts.delete(value)
      else counts.set(value, next)
      left += 1
    }
    if (counts.size === wanted.size) return true
  }
  return false
}

function subsets<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]]
  if (items.length < size) return []
  const [head, ...rest] = items
  return [...subsets(rest, size - 1).map((combo) => [head, ...combo]), ...subsets(rest, size)]
}

/** Les deux étoiles comptent près d’un mot d’étoile, ou avec trois numéros du même tirage. */
export function starsLeak(text: string, draw: HiddenDraw) {
  for (const match of text.matchAll(STAR_WORDS)) {
    const at = match.index ?? 0
    const around = text.slice(Math.max(0, at - STAR_SPAN), at + STAR_SPAN)
    if (valuesNear(around, draw.stars, STAR_SPAN * 2)) return true
  }
  return subsets(draw.numbers, 3).some((combo) => valuesNear(text, [...combo, ...draw.stars], NUMBER_SPAN))
}

export function itemText(item: BraveItem) {
  return cleanText([item.title, item.description, ...(item.extra_snippets ?? [])].filter(Boolean).join(" · "))
}

export function keepResult(item: BraveItem, cutoff: string, hidden: readonly HiddenDraw[]) {
  const age = String(item.page_age || "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(age) || age >= cutoff) return false
  const text = itemText(item)
  if (citesLateDate(text, cutoff)) return false
  for (const draw of hidden) {
    if (valuesNear(text, draw.numbers, NUMBER_SPAN)) return false
    if (starsLeak(text, draw)) return false
  }
  return true
}

export function filterResults(items: readonly BraveItem[], cutoff: string, hidden: readonly HiddenDraw[]): BraveNote[] {
  return items
    .filter((item) => keepResult(item, cutoff, hidden))
    .map((item) => ({
      title: cleanText(item.title || "").slice(0, 160),
      url: String(item.url || ""),
      snippet: cleanText([item.description, ...(item.extra_snippets ?? [])].filter(Boolean).join(" · ")).slice(0, 400),
    }))
}

export function dayBefore(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

/** Plage Brave : du 1er janvier de n−1 à la veille de la coupure. */
export function freshness(from: string, cutoff: string) {
  return `${from.slice(0, 10)}to${dayBefore(cutoff)}`
}

export function withExclusions(query: string) {
  return `${query.trim()} -résultat -loto ${EXCLUDED_SITES.map((site) => `-site:${site}`).join(" ")}`
}

/** Une requête qui cite une date à partir de la coupure, ou une année d’après, est refusée. */
export function guardQuery(query: string, cutoff: string): { ok: true; query: string } | { ok: false; error: string } {
  const text = query.replace(/\s+/g, " ").trim().slice(0, 300)
  if (!text) return { ok: false, error: "requête vide" }
  if (citesLateDate(text, cutoff)) return { ok: false, error: "requête refusée : elle cite une date encore cachée" }
  const year = Number(cutoff.slice(0, 4))
  if ([...text.matchAll(/\b(20\d{2})\b/g)].some((match) => Number(match[1]) > year)) {
    return { ok: false, error: "requête refusée : elle cite une année encore cachée" }
  }
  return { ok: true, query: text }
}
