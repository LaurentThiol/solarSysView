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

/** Rangs et écarts que la figure doit montrer, dans l’ordre du calcul. */
export function rankPathLabels(trace: Arbitration): { ranks: string[]; gaps: string[] } {
  return {
    ranks: [...trace.numbers.map((row) => row.rank), ...trace.stars.map((row) => row.rank)],
    gaps: [...trace.gaps.map((gap) => gap.name), trace.star_gap.name],
  }
}
