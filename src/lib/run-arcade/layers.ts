import {
  coherenceReading,
  numberCoherence,
  numberCoherenceTheory,
  starCoherence,
  starCoherenceTheory,
} from "@/lib/delta-coherence"
import { edgeMotion, summarizeEdgeMotion, type EdgeMotion, type EdgeMotionSummary } from "@/lib/delta-evol"
import { formatShortDate } from "@/lib/draws"
import { theoreticalSlots, type PoolKind } from "@/lib/pronostic/bounds"

import { buildTrack, type RankPoint } from "./curves"
import { formatRatio, nearestGolden, type GoldenRatio } from "./golden"
import { revealedPast } from "./thought"

export type NumberGaps = {
  g1: number
  g2: number
  g3: number
  g4: number
}

export type RankPlace = {
  key: "n2" | "n3" | "n4"
  place: number
  golden: GoldenRatio | null
}

export type GapMeans = NumberGaps & { stars: number }

export type LayerWindowReading = {
  count: number
  gaps: GapMeans | null
  numberCoherence: number | null
  starCoherence: number | null
  numberLaw: number
  starLaw: number
  edges: EdgeMotionSummary
  starEdges: EdgeMotionSummary
}

export type LayerFocus = {
  index: number
  point: RankPoint
  gaps: NumberGaps
  starGap: number
  places: RankPlace[]
  motion: EdgeMotion | null
  starMotion: EdgeMotion | null
}

const INTERIOR = ["n2", "n3", "n4"] as const

/**
 * Tirages que les deux fenêtres ont le droit de lire.
 * Hors course : la piste des années n−1 et n. En course : le passé révélé, sans le tirage caché.
 */
export function layerPoints(input: {
  series: readonly RankPoint[]
  track: readonly RankPoint[]
  running: boolean
  cursor: number | null
}): RankPoint[] {
  if (input.running && input.cursor != null) return revealedPast(input.track, input.cursor)
  return buildTrack(input.series)
}

export function numberGaps(point: RankPoint): NumberGaps {
  return {
    g1: point.n2 - point.n1,
    g2: point.n3 - point.n2,
    g3: point.n4 - point.n3,
    g4: point.n5 - point.n4,
  }
}

export function starGap(point: RankPoint) {
  return point.e2 - point.e1
}

/** Place de n2, n3 et n4 entre n1 et n5. Le nombre d’or n’est cité qu’à 0,05 près. */
export function rankPlaces(point: RankPoint): RankPlace[] {
  const span = point.n5 - point.n1
  if (span <= 0) return []
  return INTERIOR.map((key) => {
    const place = (point[key] - point.n1) / span
    return { key, place, golden: nearestGolden(place) }
  })
}

export function slotBands(kind: PoolKind) {
  return theoreticalSlots(kind)
}

function mean(values: Array<number | null>) {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (finite.length === 0) return null
  return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

function meanGaps(points: readonly RankPoint[]): GapMeans | null {
  if (points.length === 0) return null
  const gaps = points.map(numberGaps)
  const stars = points.map(starGap)
  return {
    g1: mean(gaps.map((gap) => gap.g1)) ?? 0,
    g2: mean(gaps.map((gap) => gap.g2)) ?? 0,
    g3: mean(gaps.map((gap) => gap.g3)) ?? 0,
    g4: mean(gaps.map((gap) => gap.g4)) ?? 0,
    stars: mean(stars) ?? 0,
  }
}

function stepOf(prev: RankPoint, next: RankPoint) {
  return {
    n1: next.n1 - prev.n1,
    n2: next.n2 - prev.n2,
    n3: next.n3 - prev.n3,
    n4: next.n4 - prev.n4,
    n5: next.n5 - prev.n5,
    e1: next.e1 - prev.e1,
    e2: next.e2 - prev.e2,
  }
}

/** Mesures des tirages visibles : écarts moyens, cohérence, bords. */
export function readWindow(points: readonly RankPoint[]): LayerWindowReading {
  const steps = []
  for (let index = 1; index < points.length; index += 1) {
    steps.push(stepOf(points[index - 1], points[index]))
  }
  return {
    count: points.length,
    gaps: meanGaps(points),
    numberCoherence: mean(steps.map((step) => numberCoherence(step))),
    starCoherence: mean(steps.map((step) => starCoherence(step))),
    numberLaw: numberCoherenceTheory(),
    starLaw: starCoherenceTheory(),
    edges: summarizeEdgeMotion(steps.map((step) => ({ n1: step.n1, n5: step.n5 }))),
    starEdges: summarizeEdgeMotion(steps.map((step) => ({ n1: step.e1, n5: step.e2 }))),
  }
}

/** Tirage choisi, avec le pas qui y arrive depuis le tirage d’avant. */
export function readFocus(points: readonly RankPoint[], index: number): LayerFocus | null {
  const point = points[index]
  if (!point) return null
  const prev = index > 0 ? points[index - 1] : null
  const step = prev ? stepOf(prev, point) : null
  return {
    index,
    point,
    gaps: numberGaps(point),
    starGap: starGap(point),
    places: rankPlaces(point),
    motion: step ? edgeMotion(step.n1, step.n5) : null,
    starMotion: step ? edgeMotion(step.e1, step.e2) : null,
  }
}

function comma(value: number) {
  const rounded = Math.round(value * 100) / 100
  const text = rounded.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")
  return text.replace(".", ",")
}

function senseClause(count: number, subject: "rangs" | "étoiles", coherence: number | null, law: number) {
  if (count < 2) return "Un seul tirage dans le cadre."
  const span = `Sur ces ${count} tirages`
  const reading = coherenceReading(coherence)
  const verb =
    subject === "rangs"
      ? reading === "same"
        ? "les rangs vont souvent dans le même sens"
        : reading === "split"
          ? "les rangs se contredisent souvent"
          : reading === "mixed"
            ? "les rangs partagent leur sens"
            : "les rangs ne bougent pas"
      : reading === "same"
        ? "les étoiles vont souvent dans le même sens"
        : reading === "split"
          ? "les étoiles se contredisent souvent"
          : reading === "mixed"
            ? "les étoiles partagent leur sens"
            : "les étoiles ne bougent pas"
  if (coherence == null) return `${span}, ${verb}.`
  return `${span}, ${verb} (cohérence ${comma(coherence)}, loi de l’urne ${comma(law)}).`
}

function pasClause(motion: EdgeMotion | null) {
  if (motion === "slide") return "Le pas glisse."
  if (motion === "stretch") return "Le pas s’étire."
  if (motion === "squeeze") return "Le pas se resserre."
  if (motion === "still") return "Un bord du pas ne bouge pas."
  return ""
}

function goldenClause(places: readonly RankPlace[]) {
  return places
    .filter((place) => place.golden != null)
    .map((place) => `${place.key} est à ${comma(place.place)} de l’étendue, proche de ${formatRatio(place.golden ?? 0)}.`)
    .join(" ")
}

export function numberPhrase(reading: LayerWindowReading, focus: LayerFocus, latest: boolean) {
  const head = senseClause(reading.count, "rangs", reading.numberCoherence, reading.numberLaw)
  const label = latest ? "Dernier profil" : `Profil du ${formatShortDate(focus.point.date)}`
  const gaps = `${label} : écarts ${focus.gaps.g1}, ${focus.gaps.g2}, ${focus.gaps.g3}, ${focus.gaps.g4}.`
  return [head, gaps, goldenClause(focus.places), pasClause(focus.motion)].filter(Boolean).join(" ")
}

export function starPhrase(reading: LayerWindowReading, focus: LayerFocus, latest: boolean) {
  const head = senseClause(reading.count, "étoiles", reading.starCoherence, reading.starLaw)
  const label = latest ? "Dernier écart" : `Écart du ${formatShortDate(focus.point.date)}`
  const mean = reading.gaps ? comma(reading.gaps.stars) : "—"
  const gap = `${label} : ${focus.starGap}, moyenne ${mean}.`
  return [head, gap, pasClause(focus.starMotion)].filter(Boolean).join(" ")
}

export function numberStats(reading: LayerWindowReading) {
  const edges = reading.edges
  const means = reading.gaps
    ? `Moyennes ${comma(reading.gaps.g1)}, ${comma(reading.gaps.g2)}, ${comma(reading.gaps.g3)}, ${comma(reading.gaps.g4)}.`
    : ""
  return `Glisse ${edges.slide}, s’étire ${edges.stretch}, se resserre ${edges.squeeze}. ${means}`.trim()
}

export function starStats(reading: LayerWindowReading) {
  const edges = reading.starEdges
  const mean = reading.gaps ? `Moyenne de l’écart ${comma(reading.gaps.stars)}.` : ""
  return `Glisse ${edges.slide}, s’étire ${edges.stretch}, se resserre ${edges.squeeze}. ${mean}`.trim()
}
