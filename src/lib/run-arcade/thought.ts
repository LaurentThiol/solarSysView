import { clampInt, theoreticalSlot, type PoolKind } from "@/lib/pronostic/bounds"

/** Ratios du nombre d’or : 1/φ², 1/φ, √φ, φ, φ². */
export const GOLDEN_RATIOS = [0.382, 0.618, 1.272, 1.618, 2.618] as const

export type GoldenRatio = (typeof GOLDEN_RATIOS)[number]

export const RANK_KEYS = ["n1", "n2", "n3", "n4", "n5", "e1", "e2"] as const

export type RankKey = (typeof RANK_KEYS)[number]

export const START_CENTS = 5000
export const TICKET_CENTS = 250
export const HIT_CENTS = 200
export const RUNNER_MAX = 50
export const RUNNER_DEFAULT = 8

export type RankPoint = { date: string } & Record<RankKey, number>

export type SpanKind = "bande" | "lignes" | "pas"
export type MotionKind = "persiste" | "glisse" | "miroir" | "or"

export type RunnerMind = {
  id: string
  name: string
  focus: RankKey
  ratio: GoldenRatio
  span: SpanKind
  motion: MotionKind
  window: number
}

export type Point = { x: number; y: number }
export type Segment = { x1: number; y1: number; x2: number; y2: number }

export type ThoughtDraw = {
  focus: RankKey
  trail: Point[]
  tangent: Segment
  radius: { cx: number; cy: number; r: number }
  /** Trait du centre vers le niveau d’or visé. */
  spoke: Segment
  /** Pas de n−1 vers n. Absent au premier point. */
  velocity: Segment | null
  /** Flèche de n vers la valeur annoncée. */
  projection: Segment
  projectedValue: number
  golden: { ratio: number; y: number; chosen: boolean }[]
  marks: { key: RankKey; value: number }[]
  phrase: string
  /** Dernier tirage du passé révélé. Le tirage caché n’y figure pas. */
  seenDate: string
  yMin: number
  yMax: number
  xMax: number
}

export type Guess = Record<RankKey, number>

export type Thought = {
  guess: Guess
  draw: ThoughtDraw
}

const WINDOWS = [6, 8, 10, 12, 16] as const
const SPANS: SpanKind[] = ["bande", "lignes", "pas"]
const MOTIONS: MotionKind[] = ["persiste", "glisse", "miroir", "or"]

const MOTION_PHRASE: Record<MotionKind, string> = {
  persiste: "reste sur place",
  glisse: "poursuit le pas",
  miroir: "inverse le pas",
  or: "vise le nombre d’or",
}

export function rankKind(key: RankKey): PoolKind {
  return key === "e1" || key === "e2" ? "stars" : "numbers"
}

export function slotIndex(key: RankKey) {
  return Number(key.slice(1)) - 1
}

export function formatRatio(ratio: number) {
  return ratio.toFixed(3).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",")
}

export function formatCents(cents: number) {
  const sign = cents < 0 ? "−" : ""
  const abs = Math.abs(Math.round(cents))
  const euros = Math.floor(abs / 100)
  const cent = String(abs % 100).padStart(2, "0")
  return `${sign}${euros},${cent} €`
}

/** Niveau d’un ratio. En dessous de 1, il est dans le span. Au-dessus, il prolonge au-delà du haut, comme fibLevels. */
export function goldenLevel(lo: number, hi: number, ratio: number) {
  const span = hi - lo
  if (ratio <= 1) return lo + ratio * span
  return hi + (ratio - 1) * span
}

/** Part du span visée par le runner. 1,618 vise 0,618, 2,618 vise encore 0,618. */
export function aimRatio(ratio: number) {
  if (ratio <= 1) return ratio
  const frac = ratio - Math.floor(ratio)
  return frac === 0 ? 0.618 : frac
}

export function goldenAim(lo: number, hi: number, ratio: number) {
  return lo + aimRatio(ratio) * (hi - lo)
}

export function createMinds(count: number): RunnerMind[] {
  const n = Math.min(RUNNER_MAX, Math.max(1, Math.round(count)))
  return Array.from({ length: n }, (_, index) => ({
    id: `r${index + 1}`,
    name: `R${index + 1}`,
    focus: RANK_KEYS[index % RANK_KEYS.length],
    ratio: GOLDEN_RATIOS[index % GOLDEN_RATIOS.length],
    span: SPANS[index % SPANS.length],
    motion: MOTIONS[index % MOTIONS.length],
    window: WINDOWS[index % WINDOWS.length],
  }))
}

export function spanOf(mind: RunnerMind, past: readonly RankPoint[], key: RankKey) {
  const band = theoreticalSlot(rankKind(key), slotIndex(key))
  const window = past.slice(-Math.max(2, mind.window))
  if (mind.span === "bande" || window.length === 0) return band
  if (mind.span === "lignes") {
    if (rankKind(key) === "stars") {
      const lo = Math.min(...window.map((point) => point.e1))
      const hi = Math.max(...window.map((point) => point.e2))
      return { lo, hi: Math.max(hi, lo + 1) }
    }
    const lo = Math.min(...window.map((point) => point.n1))
    const hi = Math.max(...window.map((point) => point.n5))
    return { lo, hi: Math.max(hi, lo + 1) }
  }
  const last = window[window.length - 1][key]
  const prev = window.length > 1 ? window[window.length - 2][key] : last
  const lo = Math.min(last, prev)
  return { lo, hi: Math.max(last, prev, lo + 1) }
}

function rawNext(mind: RunnerMind, past: readonly RankPoint[], key: RankKey) {
  const last = past[past.length - 1][key]
  const prev = past.length > 1 ? past[past.length - 2][key] : last
  const delta = last - prev
  if (mind.motion === "persiste") return last
  if (mind.motion === "glisse") return last + delta
  if (mind.motion === "miroir") return last - delta
  const band = theoreticalSlot(rankKind(key), slotIndex(key))
  return goldenAim(band.lo, band.hi, mind.ratio)
}

export function orderGuess(raw: Guess): Guess {
  const numbers = orderKind(
    [raw.n1, raw.n2, raw.n3, raw.n4, raw.n5],
    "numbers"
  )
  const stars = orderKind([raw.e1, raw.e2], "stars")
  return {
    n1: numbers[0],
    n2: numbers[1],
    n3: numbers[2],
    n4: numbers[3],
    n5: numbers[4],
    e1: stars[0],
    e2: stars[1],
  }
}

function orderKind(values: number[], kind: PoolKind) {
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  for (let index = 0; index < sorted.length; index += 1) {
    const slot = theoreticalSlot(kind, index)
    const previous = index === 0 ? slot.lo - 1 : out[index - 1]
    const lo = Math.max(slot.lo, previous + 1)
    const hi = Math.max(lo, slot.hi)
    out.push(clampInt(sorted[index], lo, hi))
  }
  return out
}

export function countHits(guess: Guess, actual: RankPoint) {
  return RANK_KEYS.reduce((total, key) => total + (guess[key] === actual[key] ? 1 : 0), 0)
}

export function settlePurse(cents: number, hits: number) {
  return cents - TICKET_CENTS + hits * HIT_CENTS
}

function formatNum(value: number) {
  const rounded = Math.round(value * 10) / 10
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(1).replace(".", ",")
}

export function think(mind: RunnerMind, past: readonly RankPoint[]): Thought {
  const window = past.slice(-Math.max(2, mind.window))
  const focus = mind.focus
  const trail = window.map((point, index) => ({ x: index, y: point[focus] }))
  const last = trail[trail.length - 1]
  const prev = trail.length > 1 ? trail[trail.length - 2] : last
  const delta = last.y - prev.y
  const span = spanOf(mind, past, focus)
  const spanWidth = Math.max(1, span.hi - span.lo)
  const aimY = goldenAim(span.lo, span.hi, mind.ratio)
  const levels = GOLDEN_RATIOS.map((ratio) => ({
    ratio,
    y: ratio === mind.ratio ? aimY : goldenLevel(span.lo, span.hi, ratio),
    chosen: ratio === mind.ratio,
  })).reduce<{ ratio: number; y: number; chosen: boolean }[]>((kept, level) => {
    const twin = kept.find((item) => Math.abs(item.y - level.y) < 0.05)
    if (!twin) kept.push(level)
    else if (level.chosen) {
      twin.ratio = level.ratio
      twin.y = level.y
      twin.chosen = true
    }
    return kept
  }, [])
  const targetY = aimY
  const rawR = Math.abs(last.y - targetY)
  const radius = Math.min(Math.max(rawR, 0.8), Math.max(1.5, spanWidth * 0.45))
  const reach = 1.25
  const tangent: Segment = {
    x1: last.x - reach,
    y1: last.y - delta * reach,
    x2: last.x + reach,
    y2: last.y + delta * reach,
  }
  const raw = {
    n1: rawNext(mind, past, "n1"),
    n2: rawNext(mind, past, "n2"),
    n3: rawNext(mind, past, "n3"),
    n4: rawNext(mind, past, "n4"),
    n5: rawNext(mind, past, "n5"),
    e1: rawNext(mind, past, "e1"),
    e2: rawNext(mind, past, "e2"),
  } satisfies Guess
  const guess = orderGuess(raw)
  const projected = guess[focus]
  const visible = levels.filter((level) => {
    const low = Math.min(span.lo, last.y, projected) - spanWidth * 0.35
    const high = Math.max(span.hi, last.y, projected) + spanWidth * 0.75
    return level.y >= low && level.y <= high
  })
  const slopeWord = delta > 0.05 ? "montante" : delta < -0.05 ? "descendante" : "plate"
  const phrase = `${focus} ${MOTION_PHRASE[mind.motion]} : tangente ${slopeWord}, rayon ${formatNum(radius)} vers ${formatRatio(mind.ratio)}, projection ${projected}.`
  const ys = [
    ...trail.map((point) => point.y),
    tangent.y1,
    tangent.y2,
    projected,
    last.y - radius,
    last.y + radius,
    targetY,
    ...visible.map((level) => level.y),
  ]
  let yMin = Math.min(...ys)
  let yMax = Math.max(...ys)
  if (yMin === yMax) {
    yMin -= 1
    yMax += 1
  }
  const pad = Math.max(0.8, (yMax - yMin) * 0.08)
  return {
    guess,
    draw: {
      focus,
      trail,
      tangent,
      radius: { cx: last.x, cy: last.y, r: radius },
      spoke: { x1: last.x, y1: last.y, x2: last.x, y2: targetY },
      velocity:
        trail.length > 1
          ? { x1: prev.x, y1: prev.y, x2: last.x, y2: last.y }
          : null,
      projection: { x1: last.x, y1: last.y, x2: last.x + 1, y2: projected },
      projectedValue: projected,
      golden: visible,
      marks: RANK_KEYS.map((key) => ({ key, value: guess[key] })),
      phrase,
      seenDate: past[past.length - 1].date,
      yMin: yMin - pad,
      yMax: yMax + pad,
      xMax: last.x,
    },
  }
}

export type RunnerLive = {
  mind: RunnerMind
  cents: number
  alive: boolean
  turns: number
  hits: number
  lastHits: number
  thought: ThoughtDraw | null
  guess: Guess | null
  /** Rangs justes, posés par l’arbitre après le dessin. */
  matched: RankKey[]
}

export type Race = {
  runners: RunnerLive[]
  cursor: number
  start: number
  end: number
  revealed: RankPoint | null
  /** Date du dernier tirage lisible au moment du dessin. */
  seenDate: string | null
  done: boolean
}

export function createRace(count: number, seriesLength: number, length: number): Race {
  const end = Math.max(0, seriesLength)
  const span = Math.max(1, Math.round(length))
  const start = Math.max(2, end - span)
  return {
    runners: createMinds(count).map((mind) => ({
      mind,
      cents: START_CENTS,
      alive: true,
      turns: 0,
      hits: 0,
      lastHits: 0,
      thought: null,
      guess: null,
      matched: [],
    })),
    cursor: Math.min(start, end),
    start: Math.min(start, end),
    end,
    revealed: null,
    seenDate: null,
    done: start >= end,
  }
}

/** Copie des tirages strictement avant `cursor`. `cursor` est le tirage caché. */
export function revealedPast(series: readonly RankPoint[], cursor: number): RankPoint[] {
  const end = Math.max(0, Math.min(cursor, series.length))
  return series.slice(0, end).map((point) => ({
    date: point.date,
    n1: point.n1,
    n2: point.n2,
    n3: point.n3,
    n4: point.n4,
    n5: point.n5,
    e1: point.e1,
    e2: point.e2,
  }))
}

export function playTurn(race: Race, series: readonly RankPoint[]): Race {
  if (race.done || race.cursor >= race.end || race.cursor >= series.length || race.cursor < 2) {
    return { ...race, done: true }
  }
  const past = revealedPast(series, race.cursor)
  const actual = series[race.cursor]
  if (past.length < 2 || past[past.length - 1].date === actual.date) {
    return { ...race, done: true }
  }
  const runners = race.runners.map((runner) => {
    if (!runner.alive || runner.cents < TICKET_CENTS) {
      return runner.alive ? { ...runner, alive: false, matched: [] } : runner
    }
    const thought = think(runner.mind, past)
    const matched = RANK_KEYS.filter((key) => thought.guess[key] === actual[key])
    const cents = settlePurse(runner.cents, matched.length)
    return {
      ...runner,
      cents,
      alive: cents >= TICKET_CENTS,
      turns: runner.turns + 1,
      hits: runner.hits + matched.length,
      lastHits: matched.length,
      thought: thought.draw,
      guess: thought.guess,
      matched,
    }
  })
  const cursor = race.cursor + 1
  return {
    ...race,
    runners,
    cursor,
    revealed: { ...actual },
    seenDate: past[past.length - 1].date,
    done: cursor >= race.end || runners.every((runner) => !runner.alive),
  }
}

export function leaderOf(runners: readonly RunnerLive[]) {
  return runners.reduce((best, runner) => (runner.cents > best.cents ? runner : best))
}
