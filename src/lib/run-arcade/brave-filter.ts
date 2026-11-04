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

/** Les noms de chaque mois, sans accent : en toutes lettres, puis abrégés, en français et en anglais. */
const MONTH_NAMES: readonly (readonly string[])[] = [
  ["janvier", "january", "janv", "jan"],
  ["fevrier", "february", "fevr", "fev", "feb"],
  ["mars", "march", "mar"],
  ["avril", "april", "avr", "apr"],
  ["mai", "may"],
  ["juin", "june", "jun"],
  ["juillet", "july", "juil", "jul"],
  ["aout", "august", "aug"],
  ["septembre", "september", "sept", "sep"],
  ["octobre", "october", "oct"],
  ["novembre", "november", "nov"],
  ["decembre", "december", "dec"],
]

const MONTHS = new Map(MONTH_NAMES.flatMap((names, index) => names.map((name) => [name, index + 1] as const)))

/** Un nom de mois, avec ou sans point, qui ne continue pas en mot (« oct » n’est pas « octets »). */
const MONTH_WORD = `(${[...MONTHS.keys()].sort((left, right) => right.length - left.length).join("|")})\\.?(?![a-z])`
const DAY_SUFFIX = "(?:er|st|nd|rd|th)?"
/** L’année qui suit un mois : quatre chiffres, ou deux (20 + AA). */
const YEAR_AFTER = "(?:[\\s,]*(20\\d{2}|\\d{2})(?!\\d))?"
/** « 14 août », « 1er sept. 2026 », « 7th of August 2026 », « 14 August, 2026 » : jour, mois, année facultative. */
const DAY_FIRST = new RegExp(`(?<!\\d)(\\d{1,2})${DAY_SUFFIX}\\.?(?:\\s+(?:of|de))?\\s+${MONTH_WORD}${YEAR_AFTER}`, "g")
/** « août 2026 », « sept. 2026 » : un mois sans jour. */
const MONTH_YEAR = new RegExp(`(?<![a-z])${MONTH_WORD}[\\s,]*(20\\d{2})(?!\\d)`, "g")
/** « Aug 14, 2026 », « August 14th » : mois, jour, année facultative. */
const MONTH_FIRST = new RegExp(`(?<![a-z])${MONTH_WORD}\\s*(\\d{1,2})${DAY_SUFFIX}(?!\\d)${YEAR_AFTER}`, "g")
const STAR_WORDS = /étoiles?|etoiles?|★|⭐|stars?|lucky/gi

function pad(value: number) {
  return String(value).padStart(2, "0")
}

/** Un vrai jour du calendrier, ou rien : le 31 avril n’existe pas. */
function isoDay(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1) return null
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null
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

function foldAccents(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

export type CitedDates = {
  /** Jours cités, AAAA-MM-JJ, du plus ancien au plus récent. */
  days: string[]
  /** Mois cités sans jour, AAAA-MM : « août 2026 ». */
  months: string[]
}

/**
 * Toutes les dates qu’un texte cite, dans les formats courants français et anglais :
 * `2026-09-01`, `2026/09/01` et `2026.09.01` (l’heure peut suivre, collée ou non), `20260901`, `11/09/2026`,
 * `11-09-26`, `1er sept. 2026`, `30 oct. 2026`, `Aug 14, 2026`, `14 August, 2026`, `août 2026`, `2026-09`.
 * Une date que l’on peut lire de deux façons (JJ/MM ou MM/JJ) rend ses deux jours : l’un des deux peut être tardif.
 * Un jour sans année (« vendredi 14 août », « 14/08 », « 14-08 », « 14.08 ») prend `year`, l’année de la coupure ; sans `year`, il est ignoré.
 * Chaque motif lit ce qu’il trouve puis le retire du texte : « le 3 août 2026 » est un jour, pas aussi un mois.
 */
export function citedDates(text: string, year?: number): CitedDates {
  const days = new Set<string>()
  const months = new Set<string>()
  const addDay = (y: number, month: number, day: number) => {
    const iso = isoDay(y, month, day)
    if (iso) days.add(iso)
  }
  const addMonth = (y: number, month: number) => {
    if (month >= 1 && month <= 12) months.add(`${y}-${pad(month)}`)
  }
  let rest = foldAccents(text)
  const read = (pattern: RegExp, use: (found: string[]) => void) => {
    rest = rest.replace(pattern, (match: string, ...found: string[]) => {
      use(found)
      return " ".repeat(match.length)
    })
  }
  /** Un jour et un mois en lettres, avec l’année si elle suit. Deux chiffres : 20 + AA, et aussi un jour sans année. */
  const dayInWords = (name: string, day: string, after: string | undefined) => {
    const month = MONTHS.get(name) ?? 0
    if (after && after.length === 4) return addDay(Number(after), month, Number(day))
    if (after) addDay(2000 + Number(after), month, Number(day))
    if (year != null) addDay(year, month, Number(day))
  }

  read(/(?<!\d)(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/g, ([y, month, day]) => addDay(+y, +month, +day))
  read(/(?<!\d)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/g, ([y, month, day]) => addDay(+y, +month, +day))
  read(/(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})(?!\d)/g, ([first, second, y]) => {
    const full = y.length === 4 ? Number(y) : 2000 + Number(y)
    addDay(full, +second, +first)
    addDay(full, +first, +second)
  })
  read(/(?<!\d)(20\d{2})[-/](0?[1-9]|1[0-2])(?!\d)/g, ([y, month]) => addMonth(+y, +month))
  read(/(?<!\d)(0?[1-9]|1[0-2])[-/.](20\d{2})(?!\d)/g, ([month, y]) => addMonth(+y, +month))
  read(DAY_FIRST, ([day, name, after]) => dayInWords(name, day, after))
  read(MONTH_YEAR, ([name, y]) => addMonth(+y, MONTHS.get(name) ?? 0))
  read(MONTH_FIRST, ([name, day, after]) => dayInWords(name, day, after))
  read(/(?<![\d/.-])(\d{1,2})\/(\d{1,2})(?![\d/])/g, ([first, second]) => {
    if (year == null) return
    addDay(year, +second, +first)
    addDay(year, +first, +second)
  })
  // Jour sans année au tiret ou au point, écrit sur deux chiffres (« 14-08 », « 14.08 », « 03-04 ») :
  // deux chiffres des deux côtés écartent les décimales et les versions (« 3.14 », « 8.6.2 »).
  read(/(?<![\d/.-])(\d{2})[-.](\d{2})(?![\d/.-])/g, ([first, second]) => {
    if (year == null) return
    addDay(year, +second, +first)
    addDay(year, +first, +second)
  })
  return { days: [...days].sort(), months: [...months].sort() }
}

/** Le texte cite le jour de la coupure ou un jour d’après, ou un mois qui contient la coupure ou vient après. */
export function citesLateDate(text: string, cutoff: string) {
  const cited = citedDates(text, Number(cutoff.slice(0, 4)))
  return cited.days.some((date) => date >= cutoff) || cited.months.some((month) => month >= cutoff.slice(0, 7))
}

/** Le filtre ne vaut que s’il connaît un tirage au moins aussi récent que la fin de la piste du client. */
export function knowsThrough(hidden: readonly HiddenDraw[], through: string) {
  return hidden.some((draw) => draw.date >= through)
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
  const rawAge = typeof item.page_age === "string" ? item.page_age.trim() : ""
  if (rawAge.length > 0) {
    const age = rawAge.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(age) || age >= cutoff) return false
  }
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
