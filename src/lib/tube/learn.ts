/**
 * Gains appris, pas réglés à la main.
 *
 * Sur chaque bloc, on retient la grille {0, 0,5, 1}⁴ qui minimise le score
 * d'intervalle du bloc précédent, et on l'applique au bloc suivant.
 * Le premier bloc n'a pas de passé : gains nuls, hors score.
 * Le nul mélange les dates des forces, puis relance la même règle.
 */

import { intervalScore, seededRandom, tubeScore, type TubeNull, type TubeScore } from "./score"
import {
  applyGains,
  sectionDrivers,
  ZERO_GAINS,
  type TubeFrame,
  type TubeFrameSection,
  type TubeGains,
  type TubeSection,
  type TubeSource,
} from "./model"

export const GAIN_GRID_VALUES = [0, 0.5, 1] as const
export const TUBE_BLOCKS = [20, 40, 80] as const
export type TubeBlock = (typeof TUBE_BLOCKS)[number]

const GAIN_GRID: TubeGains[] = []
for (const etirement of GAIN_GRID_VALUES) {
  for (const cisaillement of GAIN_GRID_VALUES) {
    for (const compression of GAIN_GRID_VALUES) {
      for (const asymetrie of GAIN_GRID_VALUES) {
        GAIN_GRID.push({ etirement, cisaillement, compression, asymetrie })
      }
    }
  }
}

type TubeDriver = ReturnType<typeof sectionDrivers>

export type LearnedTube = {
  sections: TubeSection[]
  /** `null` sur le bloc d'amorce : gains nuls, section hors score. */
  blockGains: (TubeGains | null)[]
  block: number
}

function blockGains(
  sections: readonly TubeFrameSection[],
  drivers: readonly TubeDriver[],
  from: number,
  to: number,
  level: TubeFrame["options"]["level"]
): TubeGains {
  const width = to - from
  if (width < 1) return ZERO_GAINS
  const alpha = 1 - level
  let best = ZERO_GAINS
  let bestScore = Number.POSITIVE_INFINITY
  for (const gains of GAIN_GRID) {
    let total = 0
    for (let i = from; i < to; i += 1) {
      const section = applyGains(sections[i], drivers[i], gains)
      total += intervalScore(section.deformedLower, section.deformedUpper, section.sum, alpha)
    }
    const score = total / width
    if (score < bestScore - 1e-9) {
      bestScore = score
      best = gains
    }
  }
  return best
}

export function learnFromDrivers(
  frame: TubeFrame,
  drivers: readonly TubeDriver[],
  block: number
): LearnedTube {
  const size = Math.max(2, Math.floor(block))
  const sections = frame.sections
  const out: TubeSection[] = []
  const used: (TubeGains | null)[] = []
  for (let start = 0; start < sections.length; start += size) {
    const end = Math.min(sections.length, start + size)
    const gains = start === 0 ? ZERO_GAINS : blockGains(sections, drivers, start - size, start, frame.options.level)
    const tagged = start === 0 ? null : gains
    for (let i = start; i < end; i += 1) {
      used.push(tagged)
      out.push(applyGains(sections[i], drivers[i], gains))
    }
  }
  return { sections: out, blockGains: used, block: size }
}

export function learnTube(frame: TubeFrame, sources: readonly TubeSource[], block: number): LearnedTube {
  const drivers = frame.sections.map((section) => sectionDrivers(section, sources))
  return learnFromDrivers(frame, drivers, block)
}

export function scoreLearned(learned: LearnedTube, level: TubeFrame["options"]["level"]): TubeScore {
  return tubeScore(learned.sections.slice(learned.block), level)
}

/**
 * Même règle d'apprentissage, après mélange des dates des forces.
 * Le réglage n'est pas choisi à la main : un seul test.
 */
export function tubeLearnedNull(
  frame: TubeFrame,
  sources: readonly TubeSource[],
  block: number,
  { rounds = 99, seed = 20260929 }: { rounds?: number; seed?: number } = {}
): TubeNull {
  const sections = frame.sections
  const size = Math.max(2, Math.floor(block))
  if (sections.length <= size || rounds < 1) {
    return { rounds: 0, observed: null, nullMean: null, asGood: 0, p: null }
  }
  const drivers = sections.map((section) => sectionDrivers(section, sources))
  const observedPack = learnFromDrivers(frame, drivers, size)
  const observed = scoreLearned(observedPack, frame.options.level).scoreDeformed
  if (observed == null) return { rounds: 0, observed: null, nullMean: null, asGood: 0, p: null }
  const random = seededRandom(seed)
  const order = drivers.map((_, i) => i)
  let asGood = 0
  let nullTotal = 0
  for (let round = 0; round < rounds; round += 1) {
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    const shuffled = order.map((index) => drivers[index])
    const score = scoreLearned(learnFromDrivers(frame, shuffled, size), frame.options.level).scoreDeformed ?? observed
    nullTotal += score
    if (score <= observed + 1e-9) asGood += 1
  }
  return {
    rounds,
    observed,
    nullMean: nullTotal / rounds,
    asGood,
    p: (1 + asGood) / (1 + rounds),
  }
}
