// Les 18 détecteurs chartistes, avec la géométrie nécessaire au dessin.
//
// Chaque détection renvoie les pivots nommés (épaule gauche, tête, cou…), les
// lignes à tracer, la cassure avec sa validation par l'activité — la règle d'or :
// une cassure n'est validée que si l'activité dépasse sa moyenne mobile 20 et se
// confirme en clôture ou par le pull-back suivant — et l'objectif projeté selon
// la table des figures.

import { activityConfirms } from "@/lib/ta"
import {
  type FigureId,
  type FigureKind,
  type PivotRole,
  kindOf,
  labelOf,
  signalOf,
  targetBasis,
} from "./catalog"
import { DEFAULT_PCT, type SwingPivot, swingPivots } from "./pivots"
import { type Point, roundHalfEven } from "./svgpath"

export const DEFAULT_ZIGZAG_PCT = DEFAULT_PCT
export const DEFAULT_EPS = 0.05
export const FLAT_SLOPE = 0.12
export const ACTIVITY_PERIOD = 20
export const HOLD_BARS = 2
export const DEFAULT_MAX_OVERLAP = 0.2

/** Pente et ordonnée à l'origine d'une droite ajustée. */
export type Line = [number, number]

export type BreakoutDirection = "up" | "down"

export type FigurePivot = {
  index: number
  date: string | null
  value: number
  role: PivotRole
}

export type GuidePoint = {
  index: number
  value: number
}

export type Guide = {
  role: string
  kind: string
  dashed: boolean
  points: GuidePoint[]
}

export type Breakout = {
  index: number
  date: string | null
  value: number
  level: number
  direction: BreakoutDirection
  activity_ratio: number
  volume_ok: boolean
  holds: boolean
  confirmed: boolean
  fake: boolean
}

export type FigureTarget = {
  value: number
  basis: string
}

export type FigureHit = {
  figure: FigureId
  label: string
  kind: FigureKind
  signal: string
  confidence: number
  from_index: number
  to_index: number
  from: string | null
  to: string | null
  pivots: FigurePivot[]
  guides: Guide[]
  breakout: Breakout | null
  target: FigureTarget | null
  detector: string
}

export type FigureSummary = {
  count: number
  confirmed: number
  fake: number
  pending: number
  by_figure: Record<string, number>
}

export type TargetOutcome = {
  status: "no_breakout" | "reached" | "invalidated" | "open"
  reached: boolean | null
  bars: number | null
}

// --- Outils géométriques ------------------------------------------------------

// `sum()` de Python compense l'erreur d'arrondi (Kahan-Babuška-Neumaier) là où
// une accumulation naïve dérive d'un ulp une fois sur cinq. Les confiances du
// jumeau doivent tomber au dix-millième sur celles du backend.
function sumOf(values: number[]) {
  let total = 0
  let compensation = 0
  for (const value of values) {
    const next = total + value
    if (Math.abs(total) >= Math.abs(value)) compensation += total - next + value
    else compensation += value - next + total
    total = next
  }
  return total + compensation
}

/** Amplitude de référence de la fenêtre, pour rendre les seuils relatifs. */
function windowScale(values: number[]) {
  if (!values.length) return 1
  const span = Math.max(...values) - Math.min(...values)
  if (span > 0) return span
  return Math.max(1, Math.abs(values[0]))
}

function near(a: number, b: number, eps: number, scale: number) {
  return Math.abs(a - b) <= eps * scale
}

/** Moindres carrés sur (index, valeur) → (pente, ordonnée à l'origine). */
function fitLine(points: Point[]): Line | null {
  if (points.length < 2) return null
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const xbar = sumOf(xs) / xs.length
  const ybar = sumOf(ys) / ys.length
  const den = sumOf(xs.map((x) => (x - xbar) ** 2))
  if (den === 0) return null
  const slope = sumOf(xs.map((x, i) => (x - xbar) * (ys[i] - ybar))) / den
  return [slope, ybar - slope * xbar]
}

function lineAt(line: Line, index: number) {
  return line[0] * index + line[1]
}

function lineFitError(line: Line, points: Point[]) {
  if (!points.length) return 0
  return sumOf(points.map(([x, y]) => Math.abs(y - lineAt(line, x)))) / points.length
}

// Une droite passe exactement par deux points : son erreur d'ajustement nulle
// ne prouve rien. Tant qu'un troisième appui manque, on facture l'ignorance —
// sans quoi une marche aléatoire quelconque décroche la confiance maximale.
const NO_EVIDENCE = 0.07

/** Déplacement moyen par barre — la vitesse du tracé. */
function meanStep(values: number[]) {
  if (values.length < 2) return 0
  const steps = values.slice(1).map((value, i) => Math.abs(value - values[i]))
  return sumOf(steps) / (values.length - 1)
}

/** Erreurs relatives → confiance dans [0.05, 0.99]. */
function score(...errors: number[]) {
  const total = sumOf(errors.map((e) => Math.max(0, e)))
  return Math.max(0.05, Math.min(0.99, 1 / (1 + 6 * total)))
}

/**
 * Qualité d'ajustement pondérée par l'appui de la figure.
 *
 * Deux lignes se laissent toujours ajuster à quatre points quelconques : sur
 * un bout de fenêtre et sans appuis, un bel ajustement ne veut rien dire. On
 * escompte donc la confiance selon la part de fenêtre expliquée et le nombre
 * de pivots mobilisés. C'est une mesure de qualité géométrique, jamais une
 * probabilité que la figure annonce quoi que ce soit.
 */
function weigh(fit: number, first: number, last: number, pivots: number, window: number) {
  const span = Math.max(1, window - 1)
  const coverage = Math.min(1, (last - first) / span / 0.6)
  const support = Math.min(1, pivots / 5)
  return Math.max(0.01, Math.min(0.99, fit * (0.35 + 0.65 * (0.55 * coverage + 0.45 * support))))
}

/**
 * Pivots hors point d'ouverture de la fenêtre.
 *
 * Le premier point d'une fenêtre est presque toujours un extrême : il vient
 * du découpage, pas du tracé. Le compter comme un appui fait passer
 * n'importe quelle fenêtre pour un range.
 */
function interior(pivots: SwingPivot[]) {
  return pivots.filter((p) => p.index > 0)
}

function figurePivot(
  index: number,
  value: number,
  role: PivotRole,
  dates: Array<string | null>
): FigurePivot {
  return {
    index,
    date: index >= 0 && index < dates.length ? dates[index] : null,
    value,
    role,
  }
}

function guide(
  role: string,
  points: Array<[number, number]>,
  options: { kind?: string; dashed?: boolean } = {}
): Guide {
  return {
    role,
    kind: options.kind ?? "segment",
    dashed: options.dashed ?? true,
    points: points.map(([index, value]) => ({ index, value })),
  }
}

export function activityRatio(activity: number[], index: number, period = ACTIVITY_PERIOD) {
  if (index < 0 || index >= activity.length) return 0
  const start = Math.max(0, index - period)
  const chunk = activity.slice(start, index)
  if (!chunk.length) return 0
  const mean = sumOf(chunk) / chunk.length
  if (mean <= 0) return 0
  return activity[index] / mean
}

/** Premier franchissement du niveau après `start`, avec sa validation. */
function findBreakout(
  values: number[],
  dates: Array<string | null>,
  activity: number[],
  options: {
    start: number
    level: (index: number) => number
    direction: BreakoutDirection
    limit?: number | null
  }
): Breakout | null {
  const { start, level, direction } = options
  const limit = options.limit
  const stop = limit == null ? values.length : Math.min(values.length, start + limit + 1)
  for (let index = start + 1; index < stop; index += 1) {
    const bound = level(index)
    const crossed = direction === "down" ? values[index] < bound : values[index] > bound
    if (!crossed) continue
    const ratio = activityRatio(activity, index)
    const volumeOk = activity.length > 0 && activityConfirms(activity, index, ACTIVITY_PERIOD)
    let holds = true
    for (let ahead = index + 1; ahead < Math.min(values.length, index + 1 + HOLD_BARS); ahead += 1) {
      const edge = level(ahead)
      if (direction === "down" ? values[ahead] >= edge : values[ahead] <= edge) {
        holds = false
        break
      }
    }
    // Règle d'or : activité au-dessus de sa MM20 **et** confirmation en clôture
    // (ou par le pull-back suivant). Le « et » n'est pas négociable — c'est lui
    // qui distingue la cassure du fake breakout. Sans série d'activité la
    // moitié volume du critère est indécidable, et on s'en tient à la tenue.
    const confirmed = activity.length ? volumeOk && holds : holds
    return {
      index,
      date: index < dates.length ? dates[index] : null,
      value: values[index],
      level: bound,
      direction,
      activity_ratio: roundHalfEven(ratio, 3),
      volume_ok: volumeOk,
      holds,
      confirmed,
      fake: !confirmed,
    }
  }
  return null
}

function hitOf(
  figure: FigureId,
  options: {
    pivots: FigurePivot[]
    guides: Guide[]
    confidence: number
    dates: Array<string | null>
    breakout?: Breakout | null
    target?: number | null
    detector?: string
  }
): FigureHit {
  const { pivots, guides, confidence, dates } = options
  const target = options.target
  const indexes = pivots.length ? pivots.map((p) => p.index) : [0]
  const first = Math.min(...indexes)
  const last = Math.max(...indexes)
  return {
    figure,
    label: labelOf(figure),
    kind: kindOf(figure),
    signal: signalOf(figure),
    confidence: roundHalfEven(weigh(confidence, first, last, pivots.length, dates.length), 4),
    from_index: first,
    to_index: last,
    from: first < dates.length ? dates[first] : null,
    to: last < dates.length ? dates[last] : null,
    pivots,
    guides,
    breakout: options.breakout ?? null,
    target: target == null ? null : { value: target, basis: targetBasis(figure) },
    detector: options.detector ?? "geometric",
  }
}

// --- Contexte -----------------------------------------------------------------

/** Fenêtre prête à détecter : valeurs, dates, activité, pivots. */
export type Context = {
  values: number[]
  dates: Array<string | null>
  activity: number[]
  eps: number
  scale: number
  pivots: SwingPivot[]
  highs: SwingPivot[]
  lows: SwingPivot[]
}

export function makeContext(
  values: number[],
  dates?: string[] | null,
  activity?: number[] | null,
  options: { zigzagPct?: number; eps?: number } = {}
): Context {
  const series = values.map(Number)
  // Rembourré à la longueur de la fenêtre pour que `dates[i]` soit toujours
  // interrogeable, mais avec des trous plutôt que des indices déguisés en
  // dates : le champ part tel quel vers Neon et l'UI.
  const labels: Array<string | null> = dates ? [...dates] : []
  while (labels.length < series.length) labels.push(null)
  const pivots = swingPivots(series, labels, options.zigzagPct ?? DEFAULT_ZIGZAG_PCT)
  return {
    values: series,
    dates: labels,
    activity: (activity ?? []).map(Number),
    eps: options.eps ?? DEFAULT_EPS,
    scale: windowScale(series),
    pivots,
    highs: pivots.filter((p) => p.type === "H"),
    lows: pivots.filter((p) => p.type === "L"),
  }
}

function xy(pivot: SwingPivot): Point {
  return [pivot.index, pivot.price]
}

function lastIndex(ctx: Context) {
  return ctx.values.length - 1
}

function contextBreakout(
  ctx: Context,
  options: {
    start: number
    level: (index: number) => number
    direction: BreakoutDirection
    limit?: number | null
  }
) {
  return findBreakout(ctx.values, ctx.dates, ctx.activity, options)
}

// --- Retournements par pivots -------------------------------------------------

/** Tête & épaules et sa version inversée. */
export function detectEte(ctx: Context): FigureHit[] {
  const out: FigureHit[] = []
  for (const inverted of [false, true]) {
    const extremes = inverted ? ctx.lows : ctx.highs
    const counters = inverted ? ctx.highs : ctx.lows
    const figure: FigureId = inverted ? "ete_inv" : "ete"
    const direction: BreakoutDirection = inverted ? "up" : "down"
    for (let slot = 0; slot < extremes.length - 2; slot += 1) {
      const left = extremes[slot]
      const head = extremes[slot + 1]
      const right = extremes[slot + 2]
      const lp = left.price
      const hp = head.price
      const rp = right.price
      // La tête doit dominer franchement les épaules, sinon c'est un
      // triple sommet / creux.
      const prominence = inverted
        ? Math.min(lp - hp, rp - hp)
        : Math.min(hp - lp, hp - rp)
      if (prominence < 0.12 * ctx.scale) continue
      if (!near(lp, rp, ctx.eps * 2, ctx.scale)) continue
      const necks = counters.filter((c) => left.index < c.index && c.index < right.index)
      if (necks.length < 2) continue
      const neckA = necks[0]
      const neckB = necks[necks.length - 1]
      const line = fitLine([xy(neckA), xy(neckB)])
      if (line === null) continue
      const depth = Math.abs(hp - lineAt(line, head.index))
      if (depth <= ctx.eps * ctx.scale) continue
      const shoulderErr = Math.abs(lp - rp) / ctx.scale
      const balance =
        Math.abs(head.index - left.index - (right.index - head.index)) /
        Math.max(1, right.index - left.index)
      const breakout = contextBreakout(ctx, {
        start: right.index,
        level: (i) => lineAt(line, i),
        direction,
      })
      const anchor = breakout ? breakout.index : lastIndex(ctx)
      const neckAt = lineAt(line, anchor)
      const target = direction === "down" ? neckAt - depth : neckAt + depth
      out.push(
        hitOf(figure, {
          pivots: [
            figurePivot(left.index, lp, "left_shoulder", ctx.dates),
            figurePivot(neckA.index, neckA.price, "neck_left", ctx.dates),
            figurePivot(head.index, hp, "head", ctx.dates),
            figurePivot(neckB.index, neckB.price, "neck_right", ctx.dates),
            figurePivot(right.index, rp, "right_shoulder", ctx.dates),
          ],
          guides: [
            guide("neckline", [
              [neckA.index, lineAt(line, neckA.index)],
              [anchor, neckAt],
            ]),
            guide(
              "height",
              [
                [head.index, hp],
                [head.index, lineAt(line, head.index)],
              ],
              { kind: "measure" }
            ),
          ],
          confidence: score(shoulderErr, balance * 0.5),
          dates: ctx.dates,
          breakout,
          target,
        })
      )
    }
  }
  return out
}

/** Double et triple sommet / creux. */
export function detectMultiTop(ctx: Context): FigureHit[] {
  const out: FigureHit[] = []
  for (const inverted of [false, true]) {
    const extremes = inverted ? ctx.lows : ctx.highs
    const counters = inverted ? ctx.highs : ctx.lows
    const direction: BreakoutDirection = inverted ? "up" : "down"
    const variants: Array<[number, FigureId]> = [
      [3, inverted ? "triple_bottom" : "triple_top"],
      [2, inverted ? "double_bottom" : "double_top"],
    ]
    for (const [count, figure] of variants) {
      for (let slot = 0; slot <= extremes.length - count; slot += 1) {
        const group = extremes.slice(slot, slot + count)
        const prices = group.map((p) => p.price)
        // Tolérance de niveau plus large que `eps` : sur une courbe bruitée,
        // trois sommets « au même niveau » se lisent à l'œil bien avant de
        // tenir dans 5 % du range.
        const levelEps = ctx.eps * 1.6 * ctx.scale
        if (Math.max(...prices) - Math.min(...prices) > levelEps) continue
        // Un range à quatre touches est un rectangle, pas un double sommet :
        // on exige que le niveau ne soit touché que `count` fois.
        const center = sumOf(prices) / prices.length
        const touches = interior(extremes).filter((p) => Math.abs(p.price - center) <= levelEps)
        if (touches.length > count) continue
        const mids = counters.filter(
          (c) => group[0].index < c.index && c.index < group[group.length - 1].index
        )
        if (mids.length !== count - 1) continue
        const midPrices = mids.map((c) => c.price)
        const level = inverted ? Math.max(...midPrices) : Math.min(...midPrices)
        const extreme = inverted ? Math.min(...prices) : Math.max(...prices)
        const height = Math.abs(extreme - level)
        // Un vrai repli entre les sommets, pas une simple ondulation.
        if (height <= 0.18 * ctx.scale) continue
        // Le support ne doit pas être, lui aussi, une borne de range : autant
        // d'appuis dessous que dessus, et la figure est un rectangle. Les
        // pivots de bord de fenêtre ne comptent pas, ils viennent du
        // découpage et non du tracé.
        const held = interior(counters).filter((c) => Math.abs(c.price - level) <= levelEps)
        if (held.length > count - 1) continue
        const breakout = contextBreakout(ctx, {
          start: group[group.length - 1].index,
          level: () => level,
          direction,
        })
        const target = direction === "down" ? level - height : level + height
        const role: PivotRole = inverted ? "bottom" : "top"
        const pivots = group.map((p) => figurePivot(p.index, p.price, role, ctx.dates))
        pivots.push(
          ...mids.map((c) =>
            figurePivot(c.index, c.price, inverted ? "resistance" : "support", ctx.dates)
          )
        )
        const spread = (Math.max(...prices) - Math.min(...prices)) / ctx.scale
        out.push(
          hitOf(figure, {
            pivots,
            guides: [
              guide(
                inverted ? "resistance" : "support",
                [
                  [group[0].index, level],
                  [breakout ? breakout.index : lastIndex(ctx), level],
                ],
                { kind: "level" }
              ),
              guide(
                "height",
                [
                  [group[0].index, extreme],
                  [group[0].index, level],
                ],
                { kind: "measure" }
              ),
            ],
            confidence: score(spread, count >= 3 ? 0 : NO_EVIDENCE),
            dates: ctx.dates,
            breakout,
            target,
          })
        )
      }
    }
  }
  return out
}

// --- Bornes convergentes / divergentes ---------------------------------------

function bounds(
  ctx: Context,
  pivotsH: SwingPivot[],
  pivotsL: SwingPivot[]
): [Line, Line, number] | null {
  const upper = fitLine(pivotsH.map(xy))
  const lower = fitLine(pivotsL.map(xy))
  if (upper === null || lower === null) return null
  let err =
    (lineFitError(upper, pivotsH.map(xy)) + lineFitError(lower, pivotsL.map(xy))) / ctx.scale
  err += NO_EVIDENCE * [pivotsH, pivotsL].filter((side) => side.length < 3).length
  return [upper, lower, err]
}

function span(pivotsH: SwingPivot[], pivotsL: SwingPivot[]): [number, number] {
  const idx = [...pivotsH, ...pivotsL].map((p) => p.index)
  return [Math.min(...idx), Math.max(...idx)]
}

function boundGuides(upper: Line, lower: Line, first: number, last: number): Guide[] {
  return [
    guide("upper", [
      [first, lineAt(upper, first)],
      [last, lineAt(upper, last)],
    ]),
    guide("lower", [
      [first, lineAt(lower, first)],
      [last, lineAt(lower, last)],
    ]),
  ]
}

function boundPivots(ctx: Context, pivotsH: SwingPivot[], pivotsL: SwingPivot[]) {
  const pivots = pivotsH.map((p) => figurePivot(p.index, p.price, "upper", ctx.dates))
  pivots.push(...pivotsL.map((p) => figurePivot(p.index, p.price, "lower", ctx.dates)))
  return pivots.sort((a, b) => a.index - b.index)
}

/** Bornes ajustées → (figure, sens attendu de la cassure). */
function classifyBounds(
  upper: Line,
  lower: Line,
  first: number,
  last: number
): [FigureId, BreakoutDirection | "any"] | null {
  const width = last - first
  if (width <= 0) return null
  const h0 = lineAt(upper, first) - lineAt(lower, first)
  const h1 = lineAt(upper, last) - lineAt(lower, last)
  if (h0 <= 0) return null
  // « Plat » : la borne varie de moins de 12 % de la hauteur de la figure.
  const flat = (FLAT_SLOPE * h0) / width
  const up = upper[0]
  const low = lower[0]
  const upFlat = Math.abs(up) <= flat
  const lowFlat = Math.abs(low) <= flat
  const ratio = h1 / h0
  if (ratio < 0.75) {
    if (up > flat && low > flat) return ["wedge_rising", "down"]
    if (up < -flat && low < -flat) return ["wedge_falling", "up"]
    if (upFlat && low > flat) return ["triangle_asc", "up"]
    if (lowFlat && up < -flat) return ["triangle_desc", "down"]
    if (up < -flat && low > flat) return ["triangle_sym", "any"]
    return null
  }
  if (ratio > 1.3) {
    if (up > flat && low < -flat) return ["broadening_top", "down"]
    return null
  }
  if (upFlat && lowFlat) return ["rectangle", "any"]
  // Bornes parallèles et inclinées : canal à largeur constante (pas un rectangle plat).
  const parallel =
    Math.abs(up - low) <= Math.max(2 * flat, 0.3 * (Math.abs(up) + Math.abs(low)) / 2)
  if (parallel) return ["canal", "any"]
  return null
}

/** Sous-suites contiguës de pivots, les plus longues d'abord. */
function* pivotGroups(pivots: SwingPivot[], sizes: number[] = [6, 5, 4]) {
  for (const size of sizes) {
    for (let start = 0; start <= pivots.length - size; start += 1) {
      const group = pivots.slice(start, start + size)
      const highs = group.filter((p) => p.type === "H")
      const lows = group.filter((p) => p.type === "L")
      if (highs.length >= 2 && lows.length >= 2) yield { highs, lows }
    }
  }
}

/**
 * Figures à deux bornes : biseaux, triangles, rectangle, canal, broadening top.
 *
 * Les bornes sont ajustées sur un groupe de pivots *clos*, et la cassure est
 * cherchée après son dernier pivot : la jambe de sortie ne contamine donc pas
 * l'ajustement des bornes.
 */
export function detectBounds(ctx: Context): FigureHit[] {
  const out: FigureHit[] = []
  for (const { highs, lows } of pivotGroups(ctx.pivots)) {
    const fitted = bounds(ctx, highs, lows)
    if (fitted === null) continue
    const [upper, lower, err] = fitted
    const [first, last] = span(highs, lows)
    const verdict = classifyBounds(upper, lower, first, last)
    if (verdict === null) continue
    const [figure, direction] = verdict
    let base = lineAt(upper, first) - lineAt(lower, first)
    if (base <= ctx.eps * ctx.scale) continue
    let upLevel: (index: number) => number
    let downLevel: (index: number) => number
    let guides: Guide[]
    if (figure === "rectangle") {
      const top = sumOf(highs.map((p) => p.price)) / highs.length
      const bottom = sumOf(lows.map((p) => p.price)) / lows.length
      base = top - bottom
      upLevel = () => top
      downLevel = () => bottom
      guides = [
        guide(
          "upper",
          [
            [first, top],
            [last, top],
          ],
          { kind: "level" }
        ),
        guide(
          "lower",
          [
            [first, bottom],
            [last, bottom],
          ],
          { kind: "level" }
        ),
        guide(
          "height",
          [
            [first, bottom],
            [first, top],
          ],
          { kind: "measure" }
        ),
      ]
    } else {
      upLevel = (i) => lineAt(upper, i)
      downLevel = (i) => lineAt(lower, i)
      guides = [
        ...boundGuides(upper, lower, first, last),
        guide(
          "base",
          [
            [first, lineAt(lower, first)],
            [first, lineAt(upper, first)],
          ],
          { kind: "measure" }
        ),
      ]
    }
    if (figure === "broadening_top") {
      // Le signal est la cassure du dernier creux, pas celle de la borne.
      const level = Math.min(...lows.slice(-2).map((p) => p.price))
      downLevel = () => level
      base = lineAt(upper, last) - lineAt(lower, last)
      guides.push(
        guide(
          "support",
          [
            [lows[lows.length - 1].index, level],
            [lastIndex(ctx), level],
          ],
          { kind: "level" }
        )
      )
    }
    const candidates: Array<Breakout | null> = []
    if (direction === "down" || direction === "any") {
      candidates.push(contextBreakout(ctx, { start: last, level: downLevel, direction: "down" }))
    }
    if (direction === "up" || direction === "any") {
      candidates.push(contextBreakout(ctx, { start: last, level: upLevel, direction: "up" }))
    }
    let breakout: Breakout | null = null
    for (const candidate of candidates) {
      if (candidate && (breakout === null || candidate.index < breakout.index)) breakout = candidate
    }
    let target: number
    if (breakout === null) {
      const origin = ctx.values[lastIndex(ctx)]
      target = direction === "down" ? origin - base : origin + base
    } else {
      const origin = breakout.value
      target = breakout.direction === "down" ? origin - base : origin + base
    }
    out.push(
      hitOf(figure, {
        pivots: boundPivots(ctx, highs, lows),
        guides,
        confidence: score(err),
        dates: ctx.dates,
        breakout,
        target,
      })
    )
  }
  return out
}

/** Diamant : les bornes s'écartent puis se resserrent autour d'un apex. */
export function detectDiamond(ctx: Context): FigureHit[] {
  const out: FigureHit[] = []
  if (ctx.pivots.length < 6) return out
  for (const size of [8, 7, 6]) {
    for (let offset = 0; offset <= ctx.pivots.length - size; offset += 1) {
      const group = ctx.pivots.slice(offset, offset + size)
      const middle = Math.floor(size / 2)
      const leftPart = group.slice(0, middle + 1)
      const rightPart = group.slice(middle)
      const lh = leftPart.filter((p) => p.type === "H")
      const ll = leftPart.filter((p) => p.type === "L")
      const rh = rightPart.filter((p) => p.type === "H")
      const rl = rightPart.filter((p) => p.type === "L")
      if (Math.min(lh.length, ll.length, rh.length, rl.length) < 2) continue
      const left = bounds(ctx, lh, ll)
      const right = bounds(ctx, rh, rl)
      if (left === null || right === null) continue
      const [lu, lo, leftErr] = left
      const [ru, ro, rightErr] = right
      const first = group[0].index
      const last = group[group.length - 1].index
      const apex = group[middle].index
      const openStart = lineAt(lu, first) - lineAt(lo, first)
      const openMid = lineAt(lu, apex) - lineAt(lo, apex)
      const openEnd = lineAt(ru, last) - lineAt(ro, last)
      if (openMid <= 0) continue
      if (openMid < openStart * 1.2 || openMid < openEnd * 1.2) continue
      // Bornes qui s'écartent à gauche, se resserrent à droite : sans cette
      // exigence de signes, un simple triangle passerait pour un diamant.
      if (!(lu[0] > 0 && lo[0] < 0 && ru[0] < 0 && ro[0] > 0)) continue
      const balance = (apex - first) / Math.max(1, last - first)
      if (!(balance >= 0.3 && balance <= 0.7)) continue
      const level = lineAt(ro, last)
      const breakout = contextBreakout(ctx, {
        start: last,
        level: (i) => lineAt(ro, i),
        direction: "down",
      })
      const origin = breakout ? breakout.value : ctx.values[lastIndex(ctx)]
      const pivots = boundPivots(ctx, [...lh, ...rh], [...ll, ...rl])
      pivots.push(figurePivot(apex, ctx.values[apex], "apex", ctx.dates))
      out.push(
        hitOf("diamond", {
          pivots,
          guides: [
            guide("upper", [
              [first, lineAt(lu, first)],
              [apex, lineAt(lu, apex)],
            ]),
            guide("lower", [
              [first, lineAt(lo, first)],
              [apex, lineAt(lo, apex)],
            ]),
            guide("upper", [
              [apex, lineAt(ru, apex)],
              [last, lineAt(ru, last)],
            ]),
            guide("lower", [
              [apex, lineAt(ro, apex)],
              [last, lineAt(ro, last)],
            ]),
            guide(
              "height",
              [
                [apex, lineAt(lo, apex)],
                [apex, lineAt(lu, apex)],
              ],
              { kind: "measure" }
            ),
            guide(
              "support",
              [
                [last, level],
                [lastIndex(ctx), level],
              ],
              { kind: "level" }
            ),
          ],
          confidence: score(leftErr, rightErr),
          dates: ctx.dates,
          breakout,
          target: origin - openMid,
        })
      )
    }
  }
  return out
}

// --- Continuations avec mât ---------------------------------------------------

/**
 * Sous-suites courtes servant de pause à un drapeau : une borne suffit.
 *
 * `pivotGroups` réclame deux appuis par borne, ce qu'une consolidation de
 * quelques barres ne fournit jamais.
 */
function* pauseGroups(pivots: SwingPivot[], sizes: number[] = [4, 3]) {
  for (const size of sizes) {
    for (let start = 0; start <= pivots.length - size; start += 1) {
      const group = pivots.slice(start, start + size)
      if (group.some((p) => p.type === "H") && group.some((p) => p.type === "L")) yield group
    }
  }
}

/**
 * La pause reste-t-elle collée au sommet du mât ?
 *
 * Un drapeau ne rend pas la moitié de l'élan : s'il s'en éloigne, la jambe
 * précédente n'était pas un mât mais une simple oscillation de plus.
 */
function pauseHolds(values: number[], first: number, last: number, anchor: number, reach: number) {
  return values.slice(first, last + 1).every((v) => Math.abs(v - anchor) <= reach)
}

/**
 * Drapeau et fanion : un mât franc, puis une consolidation serrée.
 *
 * Le mât est cherché sur les valeurs et non d'un pivot à l'autre : son départ
 * tombe souvent hors fenêtre ou sous le seuil de détection des pivots, et la
 * figure disparaîtrait alors qu'elle est là. Ce qui la définit reste l'écart
 * d'échelle entre l'élan et la pause qui suit.
 */
export function detectFlagPennant(ctx: Context): FigureHit[] {
  const out: FigureHit[] = []
  for (const group of pauseGroups(ctx.pivots)) {
    const first = group[0].index
    const last = group[group.length - 1].index
    const prices = group.map((p) => p.price)
    const amplitude = Math.max(...prices) - Math.min(...prices)
    if (last <= first || amplitude <= 0) continue
    // Le mât : le plus grand déplacement net aboutissant au début de la pause,
    // cherché sur une fenêtre arrière proportionnée à la pause.
    const lookback = Math.max(4, Math.min(first, 2 * (last - first)))
    // Sans les barres du mât devant soi, la fenêtre est trop courte pour rien
    // conclure : la figure commence avant le découpage.
    if (first - lookback < 0) continue
    const window = ctx.values.slice(first - lookback, first + 1)
    if (window.length < 3) continue
    const anchor = ctx.values[first]
    const low = Math.min(...window)
    const high = Math.max(...window)
    const poleUp = anchor - low
    const poleDown = high - anchor
    const direction: BreakoutDirection = poleUp >= poleDown ? "up" : "down"
    const poleLen = Math.max(poleUp, poleDown)
    const originValue = direction === "up" ? low : high
    const poleStart = first - lookback + window.indexOf(originValue)
    const poleBars = first - poleStart
    if (poleBars <= 0 || poleLen < 0.3 * ctx.scale) continue
    // L'élan doit dominer la pause : c'est tout ce qui sépare un drapeau d'un
    // triangle, où chaque jambe vaut la précédente.
    if (amplitude > poleLen * 0.5) continue
    if (!pauseHolds(ctx.values, first, last, anchor, poleLen * 0.5)) continue
    // Une pause est brève. Au-delà, c'est une figure à bornes qui suit une
    // tendance, pas un drapeau.
    if (last - first > 3 * poleBars) continue
    if (
      meanStep(ctx.values.slice(poleStart, first + 1)) <
      1.5 * meanStep(ctx.values.slice(first, last + 1))
    ) {
      continue
    }
    const consH = group.filter((p) => p.type === "H")
    const consL = group.filter((p) => p.type === "L")
    const upper = consH.length >= 2 ? fitLine(consH.map(xy)) : null
    const lower = consL.length >= 2 ? fitLine(consL.map(xy)) : null
    let fitErr: number
    let guides: Guide[]
    let levelFn: (index: number) => number
    if (upper !== null && lower !== null) {
      fitErr =
        (lineFitError(upper, consH.map(xy)) + lineFitError(lower, consL.map(xy))) / ctx.scale
      guides = boundGuides(upper, lower, first, last)
      levelFn =
        direction === "up" ? (i) => lineAt(upper, i) : (i) => lineAt(lower, i)
    } else {
      fitErr = NO_EVIDENCE
      const top = Math.max(...prices)
      const bottom = Math.min(...prices)
      guides = [
        guide(
          "upper",
          [
            [first, top],
            [last, top],
          ],
          { kind: "level" }
        ),
        guide(
          "lower",
          [
            [first, bottom],
            [last, bottom],
          ],
          { kind: "level" }
        ),
      ]
      levelFn = direction === "up" ? () => top : () => bottom
    }
    const breakout = contextBreakout(ctx, { start: last, level: levelFn, direction })
    const origin = breakout ? breakout.value : ctx.values[lastIndex(ctx)]
    const target = direction === "up" ? origin + poleLen : origin - poleLen
    // Fanion = pause qui se resserre ; drapeau = canal d'amplitude constante.
    // Mesuré jusqu'à la cassure : le dernier pivot détecté arrive tôt quand le
    // resserrement fait taire les oscillations.
    let figure: FigureId = "flag"
    const pause = ctx.values.slice(first, breakout ? breakout.index : ctx.values.length)
    if (pause.length >= 6) {
      const half = Math.floor(pause.length / 2)
      const headAmp = Math.max(...pause.slice(0, half)) - Math.min(...pause.slice(0, half))
      const tailAmp = Math.max(...pause.slice(half)) - Math.min(...pause.slice(half))
      if (headAmp > 0 && tailAmp < headAmp * 0.75) figure = "pennant"
    }
    const pivots = [
      figurePivot(poleStart, ctx.values[poleStart], "pole_start", ctx.dates),
      figurePivot(first, anchor, "pole_end", ctx.dates),
    ]
    pivots.push(
      ...group.map((p) =>
        figurePivot(p.index, p.price, p.type === "H" ? "upper" : "lower", ctx.dates)
      )
    )
    out.push(
      hitOf(figure, {
        pivots,
        guides: [
          ...guides,
          guide(
            "pole",
            [
              [poleStart, ctx.values[poleStart]],
              [first, anchor],
            ],
            { kind: "measure", dashed: false }
          ),
        ],
        // Une pause serrée fait un bon drapeau : on ne facture que l'amplitude
        // excessive, jamais la tenue du canal.
        confidence: score(fitErr, Math.max(0, amplitude / poleLen - 0.35)),
        dates: ctx.dates,
        breakout,
        target,
      })
    )
  }
  return out
}

/** Tasse avec anse : fond arrondi entre deux lèvres, puis repli court. */
export function detectCupHandle(ctx: Context): FigureHit[] {
  const out: FigureHit[] = []
  if (ctx.highs.length < 2 || !ctx.lows.length) return out
  for (let slot = 0; slot < ctx.highs.length - 1; slot += 1) {
    const leftLip = ctx.highs[slot]
    const rightLip = ctx.highs[slot + 1]
    const lipL = leftLip.price
    const lipR = rightLip.price
    if (!near(lipL, lipR, ctx.eps * 3, ctx.scale)) continue
    const inner = ctx.lows.filter((p) => leftLip.index < p.index && p.index < rightLip.index)
    if (!inner.length) continue
    const bottom = inner.reduce((best, p) => (p.price < best.price ? p : best))
    const lip = Math.min(lipL, lipR)
    const depth = lip - bottom.price
    const width = rightLip.index - leftLip.index
    if (depth <= ctx.eps * 2 * ctx.scale || width < 6) continue
    // Un fond arrondi, pas un V : la moitié basse de la tasse doit être large.
    const floor = bottom.price + depth * 0.35
    let wide = 0
    for (let i = leftLip.index; i <= rightLip.index; i += 1) {
      if (ctx.values[i] <= floor) wide += 1
    }
    const roundness = wide / Math.max(1, width)
    if (roundness < 0.25) continue
    const handle = ctx.lows.filter((p) => p.index > rightLip.index)
    const handleLow = handle.length ? handle[0] : null
    if (handleLow !== null) {
      const pullback = lipR - handleLow.price
      if (pullback > depth * 0.5) continue
    }
    const anchor = handleLow !== null ? handleLow.index : rightLip.index
    const breakout = contextBreakout(ctx, { start: anchor, level: () => lipR, direction: "up" })
    const origin = breakout ? breakout.value : lipR
    const pivots = [
      figurePivot(leftLip.index, lipL, "lip_left", ctx.dates),
      figurePivot(bottom.index, bottom.price, "bottom", ctx.dates),
      figurePivot(rightLip.index, lipR, "lip_right", ctx.dates),
    ]
    if (handleLow !== null) {
      pivots.push(figurePivot(handleLow.index, handleLow.price, "handle_low", ctx.dates))
    }
    out.push(
      hitOf("cup_handle", {
        pivots,
        guides: [
          guide(
            "lip",
            [
              [leftLip.index, lipR],
              [breakout ? breakout.index : lastIndex(ctx), lipR],
            ],
            { kind: "level" }
          ),
          guide(
            "depth",
            [
              [bottom.index, bottom.price],
              [bottom.index, lipR],
            ],
            { kind: "measure" }
          ),
        ],
        confidence: score(Math.abs(lipL - lipR) / ctx.scale, Math.max(0, 0.5 - roundness)),
        dates: ctx.dates,
        breakout,
        target: origin + depth,
      })
    )
  }
  return out
}

export const DETECTORS: Array<(ctx: Context) => FigureHit[]> = [
  detectEte,
  detectMultiTop,
  detectBounds,
  detectDiamond,
  detectFlagPennant,
  detectCupHandle,
]

// Deux lectures peuvent coexister sur la même zone — la ligne de cou d'une ETE
// est aussi un double creux. À confiance voisine, la figure la plus spécifique
// passe devant.
export const SPECIFICITY: Record<FigureId, number> = {
  ete: 9,
  ete_inv: 9,
  cup_handle: 8,
  diamond: 7,
  triple_top: 6,
  triple_bottom: 6,
  pennant: 5,
  flag: 5,
  wedge_rising: 4,
  wedge_falling: 4,
  triangle_sym: 4,
  triangle_asc: 4,
  triangle_desc: 4,
  broadening_top: 3,
  double_top: 2,
  double_bottom: 2,
  canal: 2,
  rectangle: 1,
  none: 0,
}

/** 2 = cassure confirmée, 1 = figure en formation, 0 = fake breakout. */
export function breakoutTier(hit: FigureHit) {
  if (!hit.breakout) return 1
  return hit.breakout.confirmed ? 2 : 0
}

/** Une cassure confirmée passe devant, puis la lecture la plus spécifique. */
export function rankKey(hit: FigureHit): [number, number, number, number] {
  return [-breakoutTier(hit), -(SPECIFICITY[hit.figure] ?? 0), -hit.confidence, hit.from_index]
}

function compareRank(a: FigureHit, b: FigureHit) {
  const left = rankKey(a)
  const right = rankKey(b)
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1
  }
  return 0
}

function overlap(a: FigureHit, b: FigureHit) {
  const lo = Math.max(a.from_index, b.from_index)
  const hi = Math.min(a.to_index, b.to_index)
  if (hi <= lo) return 0
  const shortest = Math.min(a.to_index - a.from_index, b.to_index - b.from_index)
  if (shortest <= 0) return 0
  return (hi - lo) / shortest
}

/**
 * Une seule occurrence par figure et par zone : on garde la mieux classée.
 *
 * Les groupes de pivots se chevauchent par construction (4, 5 puis 6 pivots
 * glissants) : sans ce filtre, un même triangle ressortirait quatre fois.
 */
export function dedupe(hits: FigureHit[], options: { maxOverlap?: number } = {}): FigureHit[] {
  const maxOverlap = options.maxOverlap ?? DEFAULT_MAX_OVERLAP
  const kept: FigureHit[] = []
  for (const hit of [...hits].sort(compareRank)) {
    const clash = kept.some(
      (other) => other.figure === hit.figure && overlap(other, hit) > maxOverlap
    )
    if (!clash) kept.push(hit)
  }
  kept.sort(compareRank)
  return kept
}

/** Toutes les figures d'une fenêtre, triées par confiance décroissante. */
export function detectFigures(
  values: number[],
  dates?: string[] | null,
  activity?: number[] | null,
  options: {
    zigzagPct?: number
    eps?: number
    minConfidence?: number
    maxOverlap?: number
  } = {}
): FigureHit[] {
  const ctx = makeContext(values, dates, activity, {
    zigzagPct: options.zigzagPct,
    eps: options.eps,
  })
  const hits: FigureHit[] = []
  for (const detector of DETECTORS) {
    // Un détecteur qui trébuche sur une fenêtre dégénérée ne doit pas emporter
    // les autres : côté navigateur, la carte resterait blanche.
    try {
      hits.push(...detector(ctx))
    } catch {
      continue
    }
  }
  const minConfidence = options.minConfidence ?? 0
  return dedupe(
    hits.filter((h) => h.confidence >= minConfidence),
    { maxOverlap: options.maxOverlap ?? DEFAULT_MAX_OVERLAP }
  )
}

export function bestFigure(
  values: number[],
  dates?: string[] | null,
  activity?: number[] | null,
  options: {
    zigzagPct?: number
    eps?: number
    minConfidence?: number
    maxOverlap?: number
  } = {}
): FigureHit | null {
  const hits = detectFigures(values, dates, activity, options)
  return hits.length ? hits[0] : null
}

/** L'objectif a-t-il été atteint après la cassure, avant invalidation ? */
export function targetReached(
  values: number[],
  hit: FigureHit,
  options: { horizon?: number | null } = {}
): TargetOutcome {
  const breakout = hit.breakout
  const target = hit.target
  if (!breakout || !target) return { status: "no_breakout", reached: null, bars: null }
  const start = breakout.index
  const level = breakout.level
  const goal = target.value
  const down = breakout.direction === "down"
  const horizon = options.horizon
  const stop = horizon == null ? values.length : Math.min(values.length, start + horizon + 1)
  for (let index = start + 1; index < stop; index += 1) {
    const value = values[index]
    if (down ? value <= goal : value >= goal) {
      return { status: "reached", reached: true, bars: index - start }
    }
    const invalidated = down ? value > level : value < level
    if (invalidated) return { status: "invalidated", reached: false, bars: index - start }
  }
  return { status: "open", reached: null, bars: stop - 1 - start }
}

export function summarize(hits: FigureHit[]): FigureSummary {
  const confirmed = hits.filter((h) => h.breakout?.confirmed).length
  const fakes = hits.filter((h) => h.breakout?.fake).length
  const byFigure = new Map<string, number>()
  for (const hit of hits) byFigure.set(hit.figure, (byFigure.get(hit.figure) ?? 0) + 1)
  return {
    count: hits.length,
    confirmed,
    fake: fakes,
    pending: hits.length - confirmed - fakes,
    by_figure: Object.fromEntries([...byFigure].sort((a, b) => b[1] - a[1])),
  }
}
