import {
  SUM_BOUNDS,
  applyGains,
  sectionDrivers,
  type TubeFrame,
  type TubeGains,
  type TubeLevel,
  type TubeSection,
  type TubeSource,
} from "./model"

/**
 * Score d'intervalle (Gneiting & Raftery) : largeur + 2/α × dépassement.
 * Plus bas = mieux. Élargir le tube ne suffit pas, la largeur se paie.
 */
export function intervalScore(lower: number, upper: number, value: number, alpha: number): number {
  const below = value < lower ? (2 / alpha) * (lower - value) : 0
  const above = value > upper ? (2 / alpha) * (value - upper) : 0
  return upper - lower + below + above
}

export type TubeScore = {
  n: number
  level: TubeLevel
  coverageNominal: number | null
  coverageDeformed: number | null
  widthNominal: number | null
  widthDeformed: number | null
  scoreNominal: number | null
  scoreDeformed: number | null
  /** (nominal − déformé) / nominal : positif si la déformation améliore le score. */
  gain: number | null
}

export function tubeScore(sections: readonly TubeSection[], level: TubeLevel): TubeScore {
  const n = sections.length
  if (!n) {
    return {
      n,
      level,
      coverageNominal: null,
      coverageDeformed: null,
      widthNominal: null,
      widthDeformed: null,
      scoreNominal: null,
      scoreDeformed: null,
      gain: null,
    }
  }
  const alpha = 1 - level
  let inNominal = 0
  let inDeformed = 0
  let widthNominal = 0
  let widthDeformed = 0
  let scoreNominal = 0
  let scoreDeformed = 0
  for (const s of sections) {
    if (s.insideNominal) inNominal += 1
    if (s.insideDeformed) inDeformed += 1
    widthNominal += s.upper - s.lower
    widthDeformed += s.deformedUpper - s.deformedLower
    scoreNominal += intervalScore(s.lower, s.upper, s.sum, alpha)
    scoreDeformed += intervalScore(s.deformedLower, s.deformedUpper, s.sum, alpha)
  }
  scoreNominal /= n
  scoreDeformed /= n
  return {
    n,
    level,
    coverageNominal: inNominal / n,
    coverageDeformed: inDeformed / n,
    widthNominal: widthNominal / n,
    widthDeformed: widthDeformed / n,
    scoreNominal,
    scoreDeformed,
    gain: scoreNominal > 0 ? (scoreNominal - scoreDeformed) / scoreNominal : null,
  }
}

/** PRNG reproductible (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = state
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

export type TubeNull = {
  rounds: number
  observed: number | null
  nullMean: number | null
  /** Tirages mélangés qui font au moins aussi bien que l'ordre réel. */
  asGood: number
  /** (1 + asGood) / (1 + rounds). Proche de 1 : le calendrier des forces n'apporte rien. */
  p: number | null
}

/**
 * On garde les mêmes déformations (mêmes glissements, mêmes largeurs) mais on
 * mélange les dates où elles tombent. Si l'ordre réel ne bat pas ces mélanges,
 * le tube déformé ne lit rien du flux.
 */
export function tubeNull(
  frame: TubeFrame,
  sources: readonly TubeSource[],
  gains: TubeGains,
  { rounds = 199, seed = 20260929 }: { rounds?: number; seed?: number } = {}
): TubeNull {
  const sections = frame.sections
  if (!sections.length || rounds < 1) {
    return { rounds: 0, observed: null, nullMean: null, asGood: 0, p: null }
  }
  const alpha = 1 - frame.options.level
  const drivers = sections.map((section) => sectionDrivers(section, sources))
  const meanScore = (order: number[]) => {
    let total = 0
    for (let i = 0; i < sections.length; i += 1) {
      const s = applyGains(sections[i], drivers[order[i]], gains)
      total += intervalScore(s.deformedLower, s.deformedUpper, s.sum, alpha)
    }
    return total / sections.length
  }
  const identity = sections.map((_, i) => i)
  const observed = meanScore(identity)
  const random = seededRandom(seed)
  const order = [...identity]
  let asGood = 0
  let nullTotal = 0
  for (let round = 0; round < rounds; round += 1) {
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    const score = meanScore(order)
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

export function tubeDomain(sections: readonly TubeSection[], pad = 6): [number, number] {
  if (!sections.length) return [SUM_BOUNDS.min, SUM_BOUNDS.max]
  let lo = Infinity
  let hi = -Infinity
  for (const s of sections) {
    lo = Math.min(lo, s.lower, s.deformedLower, s.sum)
    hi = Math.max(hi, s.upper, s.deformedUpper, s.sum)
  }
  return [
    Math.max(SUM_BOUNDS.min, Math.floor(lo - pad)),
    Math.min(SUM_BOUNDS.max, Math.ceil(hi + pad)),
  ]
}

export type TubeStrainSummary = {
  stretched: number
  compressed: number
  meanFactor: number | null
  meanAbsShift: number | null
}

export function tubeStrainSummary(sections: readonly TubeSection[]): TubeStrainSummary {
  if (!sections.length) return { stretched: 0, compressed: 0, meanFactor: null, meanAbsShift: null }
  let stretched = 0
  let compressed = 0
  let factor = 0
  let shift = 0
  for (const s of sections) {
    if (s.widthFactor > 1.001) stretched += 1
    else if (s.widthFactor < 0.999) compressed += 1
    factor += s.widthFactor
    shift += Math.abs(s.shift)
  }
  return {
    stretched,
    compressed,
    meanFactor: factor / sections.length,
    meanAbsShift: shift / sections.length,
  }
}
