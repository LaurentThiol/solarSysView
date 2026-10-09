/** Trace de l’arbitrage des rangs, dessinée par RankPath. */

export type RankWeights = {
  chain: number
  level: number
  delta: number
}

export type RankReading = {
  rank: string
  chain: number | null
  level: number | null
  delta: number | null
  weights: RankWeights
  blend: number | null
  clipped: number | null
  grid: number | null
  /** n1 seul, avec Chronos : sa médiane et sa part dans le niveau. */
  chronos?: { value: number; share: number } | null
}

export type GapReading = {
  name: string
  blend: number | null
  lo: number | null
  hi: number | null
  clipped: number | null
  hit: boolean
}

export type Arbitration = {
  numbers: RankReading[]
  gaps: GapReading[]
  stars: RankReading[]
  star_gap: GapReading
  sum_target: number | null
  sum_grid: number | null
  star_sum_target: number | null
  star_sum_grid: number | null
}

/** Ce que Chronos apporte au niveau d’un rang, null s’il n’y entre pas. */
export function chronosPart(rank: RankReading, fmt: (value: number) => string): string | null {
  if (!rank.chronos) return null
  return `dont Chronos ${fmt(rank.chronos.value)} · ${Math.round(rank.chronos.share * 100)} %`
}

/** Rangs et écarts que la figure doit montrer, dans l’ordre du calcul. */
export function rankPathLabels(trace: Arbitration): { ranks: string[]; gaps: string[] } {
  return {
    ranks: [...trace.numbers.map((row) => row.rank), ...trace.stars.map((row) => row.rank)],
    gaps: [...trace.gaps.map((gap) => gap.name), trace.star_gap.name],
  }
}
