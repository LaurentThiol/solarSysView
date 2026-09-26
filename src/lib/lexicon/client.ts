export type LexiconCard = {
  id: string
  status: "draft" | "confirmed" | string
  symbol: string | null
  equation: string
  keywords: string[]
  gloss: string
  scope: string
  image_svg?: string
  quality?: {
    episodes?: number
    skill?: number | null
    reviewed?: string | null
    outcomes?: Record<string, { reached?: number; invalidated?: number; open?: number }>
  }
  source?: string
  revision?: number
}

export type SenseCell = {
  symbol?: string
  sense?: string
  register?: string
} | null

export type Reading = {
  id?: string
  weekday?: string
  draw_count?: number
  from_date?: string | null
  to_date?: string | null
  fields?: string[]
  columns?: Record<
    string,
    Record<
      string,
      {
        sense: SenseCell
        previous: SenseCell
        reread: string | null
        /** Chaîne renvoyée par la lecture. Le symbole de la case reste la corde. */
        segments?: Record<string, unknown>[] | null
      }
    >
  >
  horizons?: Record<string, string>
  ref?: { clock: string; field: string; verdict: string; winners?: Record<string, number | null> }[]
  stamps?: { clock: string; phase: number; date: string }[]
  measured?: { id: string; status: string }[]
  link?: Record<string, string>
  oppositions?: { kind: string; field?: string; length?: number; clock?: string; left?: string; right?: string }[]
  opens_llm?: boolean
  question?: string | null
  cycles?: { role?: string; draw_date?: string | null }
  pack?: { id: string; gloss?: string; status?: string; recall?: string | null }[]
  difficulties?: string[]
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string; detail?: string }
  if (!response.ok) {
    throw new Error(payload.detail || payload.error || `HTTP ${response.status}`)
  }
  return payload
}

export function fetchCards() {
  return fetch("/api/brain/lexicon/cards", { cache: "no-store" }).then((response) =>
    readJson<{ ok: boolean; cards: LexiconCard[] }>(response)
  )
}

export function saveCard(card: Partial<LexiconCard> & { id: string }) {
  return fetch("/api/brain/lexicon/cards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(card),
  }).then((response) => readJson<{ ok: boolean; card: LexiconCard }>(response))
}

export function fetchMode() {
  return fetch("/api/brain/lexicon/mode", { cache: "no-store" }).then((response) =>
    readJson<{ ok: boolean; automatic: boolean }>(response)
  )
}

export function saveMode(automatic: boolean) {
  return fetch("/api/brain/lexicon/mode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ automatic }),
  }).then((response) => readJson<{ ok: boolean; automatic: boolean }>(response))
}

export function postReading(weekday: string) {
  return fetch("/api/brain/lexicon/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ weekday: weekday === "tous" ? null : weekday, era: "current" }),
  }).then((response) => readJson<{ ok: boolean; reading: Reading }>(response))
}

export function postHelp(readingId: string | undefined, escalate: boolean, cloudNote: string) {
  return fetch("/api/brain/lexicon/help", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      reading_id: readingId,
      escalate,
      cloud_note: cloudNote || null,
    }),
  }).then((response) =>
    readJson<{
      ok: boolean
      provider: string
      question: string
      text: string | null
      awaiting_note?: boolean
      escalate?: boolean
    }>(
      response
    )
  )
}
