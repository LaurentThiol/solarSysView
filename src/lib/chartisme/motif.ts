// Épine simplifiée → graphe de motif → figures du catalogue.
//
// Jumeau de `synchro/chartisme/motif.py`. Les nœuds sont les pivots de
// l'épine. `hvg` est la visibilité horizontale, `nvg` la visibilité
// naturelle (côté +1 : résistance, côté −1 : support). Une figure n'est
// retenue que si elle revient sur au moins deux tolérances.

import { activityConfirms } from "@/lib/ta"
import {
  kindOf,
  labelOf,
  signalOf,
  targetBasis,
  type FigureId,
  type SlopeBias,
} from "./catalog"
import {
  classifyBounds,
  lineAt,
  medianLine,
  slopeBiasOf,
  type Line,
} from "./rails"
import { roundHalfEven } from "./svgpath"
import {
  DEFAULT_TAU,
  DEFAULT_TAUS,
  FLAT_GRADE,
  STEEP_GRADE,
  pyramid,
  type SpineLevel,
  type SpinePivot,
} from "./simplify"
import type { Breakout, BreakoutDirection, FigureHit, FigurePivot, Guide } from "./figures"

export const ACTIVITY_PERIOD = 20
export const HOLD_BARS = 2
export const INDEX_TOL = 3
export const LEVEL_FLOOR = 0.06
export const MIN_PULLBACK = 0.18
export const MIN_PROMINENCE = 0.12
export const AGREEMENT = 1.12

export type MotifNode = {
  slot: number
  index: number
  date: string | null
  price: number
  type: "H" | "L"
  saliency: number
  x: number
  y: number
  hvg_degree: number
}

export type MotifEdge = {
  source: number
  target: number
  kind: "segment" | "hvg" | "nvg"
  side: number
}

export type MotifLeg = {
  start: number
  end: number
  direction: "up" | "down" | "flat"
  slope: "flat" | "moderate" | "steep"
  dy: number
  tertile: number
  symbol: string
}

export type MotifNetwork = {
  graph_version: 2
  tau: number
  variable: boolean
  span: number
  length: number
  nodes: MotifNode[]
  edges: MotifEdge[]
  word: string[]
  legs: MotifLeg[]
  transitions: Record<string, number>
  indices: number[]
}

type MotifHit = FigureHit & { persistence?: number; agreed?: boolean }

function spanOf(values: number[]) {
  if (!values.length) return 0
  return Math.max(...values) - Math.min(...values)
}

/** Visibilité horizontale, par pile. Indices dans `prices`. */
export function horizontalVisibility(prices: number[]): Array<[number, number]> {
  const ys = prices.map(Number)
  const edges: Array<[number, number]> = []
  const stack: number[] = []
  for (let index = 0; index < ys.length; index += 1) {
    const price = ys[index]
    while (stack.length && ys[stack[stack.length - 1]] <= price) {
      edges.push([stack.pop() as number, index])
    }
    if (stack.length) edges.push([stack[stack.length - 1], index])
    stack.push(index)
  }
  return edges
}

function lineValue(i0: number, y0: number, i1: number, y1: number, index: number) {
  if (i1 === i0) return y0
  return y0 + ((y1 - y0) * (index - i0)) / (i1 - i0)
}

/** Visibilité naturelle. Une paire sans nœud intermédiaire reste un segment. */
export function naturalVisibility(
  indices: number[],
  prices: number[],
  tolerance: number
): Array<[number, number, number]> {
  const idx = indices.map((index) => index)
  const ys = prices.map(Number)
  const edges: Array<[number, number, number]> = []
  const tol = Math.abs(tolerance)
  for (let left = 0; left < idx.length; left += 1) {
    for (let right = left + 2; right < idx.length; right += 1) {
      for (const side of [1, -1]) {
        let clear = true
        for (let mid = left + 1; mid < right; mid += 1) {
          const line = lineValue(idx[left], ys[left], idx[right], ys[right], idx[mid])
          if (side > 0 && ys[mid] > line + tol) {
            clear = false
            break
          }
          if (side < 0 && ys[mid] < line - tol) {
            clear = false
            break
          }
        }
        if (clear) edges.push([left, right, side])
      }
    }
  }
  return edges
}

function grade(dy: number, dx: number, span: number, length: number) {
  // Hausse rapportée à la hauteur de la fenêtre : une oscillation courte
  // dans une consolidation reste plate.
  void dx
  void length
  if (span <= 0) return 0
  return Math.abs(dy) / span
}

function slopeName(value: number): MotifLeg["slope"] {
  if (value < FLAT_GRADE) return "flat"
  if (value < STEEP_GRADE) return "moderate"
  return "steep"
}

function tertiles(amplitudes: number[]) {
  const count = amplitudes.length
  if (!count) return []
  const order = amplitudes.map((_, index) => index).sort((a, b) => {
    if (amplitudes[a] !== amplitudes[b]) return amplitudes[a] - amplitudes[b]
    return a - b
  })
  const out = amplitudes.map(() => 0)
  order.forEach((index, rank) => {
    out[index] = Math.min(2, Math.floor((rank * 3) / count))
  })
  return out
}

export function legWord(pivots: SpinePivot[], span: number, length: number): MotifLeg[] {
  const rows: Array<Omit<MotifLeg, "tertile" | "symbol">> = []
  const amplitudes: number[] = []
  for (let pos = 0; pos < pivots.length - 1; pos += 1) {
    const start = pivots[pos]
    const end = pivots[pos + 1]
    const dy = end.price - start.price
    const dx = end.index - start.index
    amplitudes.push(Math.abs(dy))
    const direction: MotifLeg["direction"] = dy > 0 ? "up" : dy < 0 ? "down" : "flat"
    rows.push({
      start: start.index,
      end: end.index,
      direction,
      slope: slopeName(grade(dy, dx, span, length)),
      dy,
    })
  }
  const thirds = tertiles(amplitudes)
  return rows.map((row, index) => ({
    ...row,
    tertile: thirds[index] ?? 0,
    symbol: `${row.direction}:${row.slope}:${thirds[index] ?? 0}`,
  }))
}

export function transitionCounts(legs: MotifLeg[]) {
  const counts: Record<string, number> = {}
  for (let pos = 0; pos < legs.length - 1; pos += 1) {
    const key = `${legs[pos].symbol}|${legs[pos + 1].symbol}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

export function buildNetwork(
  values: number[],
  options: {
    tau?: number
    variable?: boolean
    dates?: Array<string | null> | null
    level?: SpineLevel | null
  } = {}
): MotifNetwork {
  const ys = values.map(Number)
  const count = ys.length
  const span = spanOf(ys)
  const tau = options.tau ?? DEFAULT_TAU
  const variable = options.variable ?? true
  const spine =
    options.level ??
    pyramid(ys, [tau], { variable, dates: options.dates })[0]
  const pivots = spine.pivots
  const lo = count ? Math.min(...ys) : 0
  const nodes: MotifNode[] = pivots.map((pivot, slot) => ({
    slot,
    index: pivot.index,
    date: pivot.date,
    price: pivot.price,
    type: pivot.type,
    saliency: pivot.saliency,
    x: count <= 1 ? 0 : pivot.index / (count - 1),
    y: span <= 0 ? 0.5 : (pivot.price - lo) / span,
    hvg_degree: 0,
  }))
  const prices = nodes.map((node) => node.price)
  const hvg = nodes.length >= 2 ? horizontalVisibility(prices) : []
  const degree = nodes.map(() => 0)
  for (const [left, right] of hvg) {
    degree[left] += 1
    degree[right] += 1
  }
  nodes.forEach((node, index) => {
    node.hvg_degree = degree[index]
  })
  const nvg =
    span > 0 && nodes.length >= 3
      ? naturalVisibility(
          nodes.map((node) => node.index),
          prices,
          tau * span
        )
      : []
  const edges: MotifEdge[] = []
  for (let slot = 0; slot < nodes.length - 1; slot += 1) {
    edges.push({ source: slot, target: slot + 1, kind: "segment", side: 0 })
  }
  for (const [left, right] of hvg) {
    if (right === left + 1) continue
    edges.push({ source: left, target: right, kind: "hvg", side: 0 })
  }
  for (const [left, right, side] of nvg) {
    edges.push({ source: left, target: right, kind: "nvg", side })
  }
  const legs = legWord(pivots, span, count)
  return {
    graph_version: 2,
    tau: spine.tau,
    variable: spine.variable,
    span,
    length: count,
    nodes,
    edges,
    word: legs.map((leg) => leg.symbol),
    legs,
    transitions: transitionCounts(legs),
    indices: spine.indices,
  }
}

function linked(network: MotifNetwork, kind: MotifEdge["kind"], left: number, right: number, side?: number) {
  const lo = Math.min(left, right)
  const hi = Math.max(left, right)
  return network.edges.some(
    (edge) =>
      edge.kind === kind &&
      edge.source === lo &&
      edge.target === hi &&
      (side == null || edge.side === side)
  )
}

function band(network: MotifNetwork, eps: number) {
  return Math.max(eps, LEVEL_FLOOR, network.tau) * network.span
}

function lineThrough(a: MotifNode, b: MotifNode): Line | null {
  const dx = b.index - a.index
  if (dx === 0) return null
  const slope = (b.price - a.price) / dx
  return [slope, a.price - slope * a.index]
}

function deviation(line: Line, nodes: MotifNode[]) {
  if (!nodes.length) return 0
  return Math.max(...nodes.map((node) => Math.abs(node.price - lineAt(line, node.index))))
}

function chains(network: MotifNetwork, side: number) {
  const wanted = side > 0 ? "H" : "L"
  const selected = network.nodes.filter((node) => node.type === wanted)
  if (selected.length < 2) return []
  const tol = network.tau * network.span
  const found: MotifNode[][] = []
  let current = [selected[0]]
  for (const node of selected.slice(1)) {
    if (!linked(network, "nvg", current[current.length - 1].slot, node.slot, side)) {
      if (current.length >= 2) found.push(current)
      current = [node]
      continue
    }
    const trial = [...current, node]
    const line = lineThrough(trial[0], trial[trial.length - 1])
    if (line && deviation(line, trial) <= tol + 1e-9) current = trial
    else {
      if (current.length >= 2) found.push(current)
      current = [node]
    }
  }
  if (current.length >= 2) found.push(current)
  return found
}

function overlapSpan(upper: MotifNode[], lower: MotifNode[]) {
  const lo = Math.max(upper[0].index, lower[0].index)
  const hi = Math.min(upper[upper.length - 1].index, lower[lower.length - 1].index)
  if (hi <= lo) return 0
  const shortest = Math.min(
    upper[upper.length - 1].index - upper[0].index,
    lower[lower.length - 1].index - lower[0].index
  )
  if (shortest <= 0) return 1
  return (hi - lo) / shortest
}

function findBreakout(
  values: number[],
  dates: Array<string | null>,
  activity: number[],
  start: number,
  level: number | Line,
  direction: BreakoutDirection
): Breakout | null {
  const at = (index: number) => (typeof level === "number" ? level : lineAt(level, index))
  for (let index = start + 1; index < values.length; index += 1) {
    const bound = at(index)
    const crossed = direction === "down" ? values[index] < bound : values[index] > bound
    if (!crossed) continue
    let ratio = 0
    if (activity.length && index >= 0 && index < activity.length) {
      const window = activity.slice(Math.max(0, index - ACTIVITY_PERIOD), index)
      const mean = window.length ? window.reduce((a, b) => a + b, 0) / window.length : 0
      ratio = mean > 0 ? activity[index] / mean : 0
    }
    const volumeOk = activity.length > 0 && activityConfirms(activity, index, ACTIVITY_PERIOD)
    let holds = true
    for (let ahead = index + 1; ahead < Math.min(values.length, index + 1 + HOLD_BARS); ahead += 1) {
      const edge = at(ahead)
      if (direction === "down" ? values[ahead] >= edge : values[ahead] <= edge) {
        holds = false
        break
      }
    }
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

function score(error: number) {
  const total = Math.max(0, error)
  return Math.max(0.05, Math.min(0.99, 1 / (1 + 6 * total)))
}

function weigh(fit: number, first: number, last: number, pivots: number, window: number) {
  const span = Math.max(1, window - 1)
  const coverage = Math.min(1, (last - first) / span / 0.6)
  const support = Math.min(1, pivots / 5)
  return Math.max(0.01, Math.min(0.99, fit * (0.35 + 0.65 * (0.55 * coverage + 0.45 * support))))
}

function assemble(
  figure: FigureId,
  options: {
    pivots: FigurePivot[]
    guides: Guide[]
    fit: number
    dates: Array<string | null>
    length: number
    breakout: Breakout | null
    target: number | null
    slopeBias?: SlopeBias
  }
): MotifHit {
  const indexes = options.pivots.length ? options.pivots.map((pivot) => pivot.index) : [0]
  const first = Math.min(...indexes)
  const last = Math.max(...indexes)
  const hit: MotifHit = {
    figure,
    label: labelOf(figure),
    kind: kindOf(figure),
    signal: signalOf(figure),
    confidence: roundHalfEven(weigh(score(options.fit), first, last, options.pivots.length, options.length), 4),
    from_index: first,
    to_index: last,
    from: first < options.dates.length ? options.dates[first] : null,
    to: last < options.dates.length ? options.dates[last] : null,
    pivots: options.pivots,
    guides: options.guides,
    breakout: options.breakout,
    target: options.target == null ? null : { value: options.target, basis: targetBasis(figure) },
    detector: "motif",
    ...(options.slopeBias ? { slopeBias: options.slopeBias } : {}),
  }
  return hit
}

function pivotOf(node: MotifNode, role: FigurePivot["role"]): FigurePivot {
  return { index: node.index, date: node.date, value: node.price, role }
}

function guideOf(role: string, points: Array<[number, number]>, kind = "segment"): Guide {
  return {
    role,
    kind,
    dashed: true,
    points: points.map(([index, value]) => ({ index, value })),
  }
}

function matchReversals(
  network: MotifNetwork,
  values: number[],
  dates: Array<string | null>,
  activity: number[],
  eps: number
) {
  const out: MotifHit[] = []
  const span = network.span
  if (span <= 0) return out
  const levelBand = band(network, eps)
  const highs = network.nodes.filter((node) => node.type === "H")
  const lows = network.nodes.filter((node) => node.type === "L")
  const length = network.length
  const passes: Array<[boolean, MotifNode[], MotifNode[]]> = [
    [false, highs, lows],
    [true, lows, highs],
  ]
  for (const [inverted, extremes, counters] of passes) {
    const figureEte: FigureId = inverted ? "ete_inv" : "ete"
    const direction: BreakoutDirection = inverted ? "up" : "down"
    for (let slot = 0; slot < extremes.length - 2; slot += 1) {
      const left = extremes[slot]
      const head = extremes[slot + 1]
      const right = extremes[slot + 2]
      const prominence = inverted
        ? Math.min(left.price - head.price, right.price - head.price)
        : Math.min(head.price - left.price, head.price - right.price)
      if (prominence < MIN_PROMINENCE * span) continue
      if (Math.abs(left.price - right.price) > Math.max(levelBand, eps * 2 * span)) continue
      if (linked(network, "hvg", left.slot, right.slot)) continue
      const peak = (node: MotifNode) =>
        node.index === 0 || node.index === length - 1 ? 0 : node.saliency
      if (peak(head) + 1e-12 < Math.max(peak(left), peak(right))) continue
      const necks = counters.filter((node) => left.index < node.index && node.index < right.index)
      if (necks.length < 2) continue
      const neckA = necks[0]
      const neckB = necks[necks.length - 1]
      const line = lineThrough(neckA, neckB)
      if (!line) continue
      const depth = Math.abs(head.price - lineAt(line, head.index))
      if (depth <= eps * span) continue
      const breakout = findBreakout(values, dates, activity, right.index, line, direction)
      const anchor = breakout ? breakout.index : length - 1
      const neckAt = lineAt(line, anchor)
      out.push(
        assemble(figureEte, {
          pivots: [
            pivotOf(left, "left_shoulder"),
            pivotOf(neckA, "neck_left"),
            pivotOf(head, "head"),
            pivotOf(neckB, "neck_right"),
            pivotOf(right, "right_shoulder"),
          ],
          guides: [
            guideOf("neckline", [
              [neckA.index, lineAt(line, neckA.index)],
              [anchor, neckAt],
            ]),
          ],
          fit: Math.abs(left.price - right.price) / span,
          dates,
          length,
          breakout,
          target: direction === "down" ? neckAt - depth : neckAt + depth,
        })
      )
    }
    const multiples: Array<[number, FigureId]> = inverted
      ? [
          [3, "triple_bottom"],
          [2, "double_bottom"],
        ]
      : [
          [3, "triple_top"],
          [2, "double_top"],
        ]
    for (const [count, figure] of multiples) {
      for (let slot = 0; slot <= extremes.length - count; slot += 1) {
        const group = extremes.slice(slot, slot + count)
        const prices = group.map((node) => node.price)
        const hi = Math.max(...prices)
        const lo = Math.min(...prices)
        if (hi - lo > levelBand) continue
        if (count === 2 && !linked(network, "hvg", group[0].slot, group[1].slot)) continue
        if (
          count === 3 &&
          !(
            linked(network, "hvg", group[0].slot, group[1].slot) &&
            linked(network, "hvg", group[1].slot, group[2].slot)
          )
        ) {
          continue
        }
        const mids = counters.filter(
          (node) => group[0].index < node.index && node.index < group[group.length - 1].index
        )
        if (mids.length !== count - 1) continue
        const midPrices = mids.map((node) => node.price)
        const level = inverted ? Math.max(...midPrices) : Math.min(...midPrices)
        const extreme = inverted ? lo : hi
        const height = Math.abs(extreme - level)
        if (height <= MIN_PULLBACK * span) continue
        const center = prices.reduce((a, b) => a + b, 0) / prices.length
        const others = extremes.filter(
          (node) => !group.includes(node) && Math.abs(node.price - center) <= levelBand
        )
        if (others.length) continue
        const breakout = findBreakout(
          values,
          dates,
          activity,
          group[group.length - 1].index,
          level,
          direction
        )
        const role = inverted ? "bottom" : "top"
        const counterRole = inverted ? "resistance" : "support"
        out.push(
          assemble(figure, {
            pivots: [
              ...group.map((node) => pivotOf(node, role)),
              ...mids.map((node) => pivotOf(node, counterRole)),
            ],
            guides: [
              guideOf(
                counterRole,
                [
                  [group[0].index, level],
                  [breakout ? breakout.index : length - 1, level],
                ],
                "level"
              ),
            ],
            fit: (hi - lo) / span,
            dates,
            length,
            breakout,
            target: direction === "down" ? level - height : level + height,
          })
        )
      }
    }
  }
  return out
}

function matchBounds(
  network: MotifNetwork,
  values: number[],
  dates: Array<string | null>,
  activity: number[]
) {
  const out: MotifHit[] = []
  if (network.span <= 0) return out
  const uppers = chains(network, 1)
  const lowers = chains(network, -1)
  const length = network.length
  for (const upperNodes of uppers) {
    for (const lowerNodes of lowers) {
      if (overlapSpan(upperNodes, lowerNodes) <= 0) continue
      const upper = lineThrough(upperNodes[0], upperNodes[upperNodes.length - 1])
      const lower = lineThrough(lowerNodes[0], lowerNodes[lowerNodes.length - 1])
      if (!upper || !lower) continue
      const first = Math.min(upperNodes[0].index, lowerNodes[0].index)
      const last = Math.max(
        upperNodes[upperNodes.length - 1].index,
        lowerNodes[lowerNodes.length - 1].index
      )
      const named = classifyBounds(upper, lower, first, last)
      if (!named) continue
      const err = (deviation(upper, upperNodes) + deviation(lower, lowerNodes)) / network.span
      const base = Math.abs(lineAt(upper, first) - lineAt(lower, first))
      if (base <= 0) continue
      const median = medianLine(upper, lower)
      const guides = [
        guideOf("upper", [
          [first, lineAt(upper, first)],
          [last, lineAt(upper, last)],
        ]),
        guideOf("lower", [
          [first, lineAt(lower, first)],
          [last, lineAt(lower, last)],
        ]),
        guideOf(
          "median",
          [
            [first, lineAt(median, first)],
            [last, lineAt(median, last)],
          ],
          "median"
        ),
      ]
      let breakout: Breakout | null
      if (named.expected === "any") {
        const down = findBreakout(values, dates, activity, last, lower, "down")
        const up = findBreakout(values, dates, activity, last, upper, "up")
        const cands = [down, up].filter((item): item is Breakout => item != null)
        breakout = cands.length ? cands.reduce((a, b) => (a.index <= b.index ? a : b)) : null
      } else {
        const rail = named.expected === "down" ? lower : upper
        breakout = findBreakout(values, dates, activity, last, rail, named.expected)
      }
      const origin = breakout ? breakout.value : values.length ? values[values.length - 1] : 0
      const way = breakout ? breakout.direction : named.expected
      const target = way === "down" ? origin - base : origin + base
      const pivots = [
        ...upperNodes.map((node) => pivotOf(node, "upper")),
        ...lowerNodes.map((node) => pivotOf(node, "lower")),
      ].sort((a, b) => a.index - b.index)
      out.push(
        assemble(named.figure, {
          pivots,
          guides,
          fit: err,
          dates,
          length,
          breakout,
          target,
          slopeBias: slopeBiasOf(upper, lower, first, last),
        })
      )
    }
  }
  return out
}

function matchFlag(
  network: MotifNetwork,
  values: number[],
  dates: Array<string | null>,
  activity: number[]
) {
  const out: MotifHit[] = []
  const legs = network.legs
  if (network.span <= 0 || legs.length < 4) return out
  for (let pos = 0; pos < legs.length; pos += 1) {
    const pole = legs[pos]
    if (pole.slope !== "steep" || pole.tertile < 2) continue
    const rest = legs.slice(pos + 1, pos + 4)
    if (rest.length < 3 || rest.some((leg) => leg.slope === "steep")) continue
    const pauseStart = rest[0].start
    const pauseEnd = rest[rest.length - 1].end
    const pause = values.slice(pauseStart, pauseEnd + 1)
    if (pause.length < 4) continue
    const half = Math.floor(pause.length / 2)
    const head = Math.max(...pause.slice(0, half)) - Math.min(...pause.slice(0, half))
    const tail = Math.max(...pause.slice(half)) - Math.min(...pause.slice(half))
    const figure: FigureId = head > 0 && tail < 0.75 * head ? "pennant" : "flag"
    const direction: BreakoutDirection | "flat" = pole.direction === "up" ? "up" : pole.direction === "down" ? "down" : "flat"
    if (direction === "flat") continue
    const level = direction === "up" ? Math.max(...pause) : Math.min(...pause)
    const breakout = findBreakout(values, dates, activity, pauseEnd, level, direction)
    const poleLen = Math.abs(pole.dy)
    const origin = breakout ? breakout.value : values[values.length - 1]
    const startNode = network.nodes.find((node) => node.index === pole.start)
    const endNode = network.nodes.find((node) => node.index === pauseEnd) ?? network.nodes[network.nodes.length - 1]
    if (!startNode || !endNode) continue
    out.push(
      assemble(figure, {
        pivots: [pivotOf(startNode, "pole_start"), pivotOf(endNode, "pole_end")],
        guides: [guideOf("pause", [[pauseStart, Math.min(...pause)], [pauseEnd, Math.max(...pause)]], "level")],
        fit: 0.05,
        dates,
        length: network.length,
        breakout,
        target: direction === "up" ? origin + poleLen : origin - poleLen,
      })
    )
    break
  }
  return out
}

function matchCup(
  network: MotifNetwork,
  values: number[],
  dates: Array<string | null>,
  activity: number[],
  eps: number
) {
  const out: MotifHit[] = []
  const nodes = network.nodes
  if (network.span <= 0 || nodes.length < 4) return out
  const levelBand = band(network, eps)
  const highs = nodes.filter((node) => node.type === "H")
  const lows = nodes.filter((node) => node.type === "L")
  for (let leftI = 0; leftI < highs.length; leftI += 1) {
    const left = highs[leftI]
    for (const right of highs.slice(leftI + 1)) {
      if (Math.abs(left.price - right.price) > levelBand) continue
      const bowl = lows.filter((node) => left.index < node.index && node.index < right.index)
      if (!bowl.length) continue
      const bottom = bowl.reduce((a, b) => (a.price <= b.price ? a : b))
      const depth = left.price - bottom.price
      if (depth < 0.28 * network.span) continue
      const interior = nodes.filter(
        (node) => left.index < node.index && node.index < right.index && node !== bottom
      )
      if (interior.some((node) => node.saliency > bottom.saliency)) continue
      const handle = lows.filter((node) => node.index > right.index)
      if (!handle.length) continue
      const handleLow = handle[0]
      if (handleLow.price <= bottom.price) continue
      if (right.price - handleLow.price > 0.5 * depth) continue
      const lip = (left.price + right.price) / 2
      const breakout = findBreakout(values, dates, activity, handleLow.index, lip, "up")
      out.push(
        assemble("cup_handle", {
          pivots: [
            pivotOf(left, "lip_left"),
            pivotOf(bottom, "bottom"),
            pivotOf(right, "lip_right"),
            pivotOf(handleLow, "handle_low"),
          ],
          guides: [guideOf("lip", [[left.index, lip], [right.index, lip]], "level")],
          fit: Math.abs(left.price - right.price) / network.span,
          dates,
          length: network.length,
          breakout,
          target: (breakout ? breakout.value : values[values.length - 1]) + depth,
        })
      )
      return out
    }
  }
  return out
}

export function matchNetwork(
  network: MotifNetwork,
  values: number[],
  dates: Array<string | null>,
  activity: number[],
  eps = 0.05
) {
  const ys = values.map(Number)
  return [
    ...matchReversals(network, ys, dates, activity, eps),
    ...matchBounds(network, ys, dates, activity),
    ...matchFlag(network, ys, dates, activity),
    ...matchCup(network, ys, dates, activity, eps),
  ]
}

function rolesOf(hit: FigureHit) {
  const groups = new Map<string, number[]>()
  for (const pivot of hit.pivots) {
    const list = groups.get(pivot.role) ?? []
    list.push(pivot.index)
    groups.set(pivot.role, list)
  }
  const out = new Map<string, number[]>()
  for (const [role, indexes] of groups) out.set(role, [...indexes].sort((a, b) => a - b))
  return out
}

export function sameMotif(left: FigureHit, right: FigureHit, tol = INDEX_TOL) {
  if (left.figure !== right.figure) return false
  const a = rolesOf(left)
  const b = rolesOf(right)
  if (a.size !== b.size) return false
  for (const [role, indexes] of a) {
    const other = b.get(role)
    if (!other || other.length !== indexes.length) return false
    if (indexes.some((value, index) => Math.abs(value - other[index]) > tol)) return false
  }
  return true
}

export function stableHits(groups: MotifHit[][]) {
  const flat = groups.flatMap((hits, level) => hits.map((hit) => ({ level, hit })))
  const used = new Set<number>()
  const kept: MotifHit[] = []
  const levels = Math.max(1, groups.length)
  for (let index = 0; index < flat.length; index += 1) {
    if (used.has(index)) continue
    const buddies = [index]
    const seen = new Set([flat[index].level])
    for (let other = 0; other < flat.length; other += 1) {
      if (other === index || used.has(other)) continue
      if (sameMotif(flat[index].hit, flat[other].hit)) {
        buddies.push(other)
        seen.add(flat[other].level)
      }
    }
    if (seen.size < 2) continue
    for (const buddy of buddies) used.add(buddy)
    const best = buddies
      .map((buddy) => flat[buddy].hit)
      .reduce((a, b) => (a.confidence >= b.confidence ? a : b))
    const persistence = seen.size / levels
    kept.push({
      ...best,
      pivots: [...best.pivots],
      guides: [...best.guides],
      persistence: roundHalfEven(persistence, 4),
      confidence: roundHalfEven(Math.min(0.99, best.confidence * (0.55 + 0.45 * persistence)), 4),
    })
  }
  return kept
}

/** Motifs stables d'une fenêtre. Liste vide si le tracé est trop court. */
export function readFigures(
  values: number[],
  dates?: Array<string | null> | null,
  activity?: number[] | null,
  options: { eps?: number; taus?: ArrayLike<number>; variable?: boolean } = {}
) {
  const ys = values.map(Number)
  if (ys.length < 8) return []
  let labels = dates ? [...dates] : ys.map(() => null)
  if (labels.length < ys.length) labels = [...labels, ...ys.slice(labels.length).map(() => null)]
  const act = (activity ?? []).map(Number)
  const variable = options.variable ?? true
  const levels = pyramid(ys, options.taus ?? DEFAULT_TAUS, { variable, dates: labels })
  const groups = levels.map((level) => {
    const network = buildNetwork(ys, { tau: level.tau, variable, dates: labels, level })
    return matchNetwork(network, ys, labels, act, options.eps ?? 0.05)
  })
  return stableHits(groups)
}

function zoneOverlap(left: FigureHit, right: FigureHit) {
  const lo = Math.max(left.from_index, right.from_index)
  const hi = Math.min(left.to_index, right.to_index)
  if (hi <= lo) return 0
  const shortest = Math.min(left.to_index - left.from_index, right.to_index - right.from_index)
  if (shortest <= 0) return 0
  return (hi - lo) / shortest
}

/**
 * Même figure sur la même zone : la lecture géométrique est confirmée.
 * Le motif ne redessine pas la figure déjà vue. Il s'ajoute seulement
 * lorsqu'aucune lecture géométrique ne couvre la zone.
 */
export function applyAgreement<T extends FigureHit>(geometric: T[], motifs: MotifHit[]): T[] {
  const extra: MotifHit[] = []
  for (const motif of motifs) {
    const host = geometric.find(
      (hit) => hit.figure === motif.figure && zoneOverlap(hit, motif) > 0.5
    )
    if (!host) {
      extra.push(motif)
      continue
    }
    host.confidence = roundHalfEven(Math.min(0.99, host.confidence * AGREEMENT), 4)
    ;(host as FigureHit & { agreed?: boolean }).agreed = true
  }
  return [...geometric, ...(extra as T[])]
}
