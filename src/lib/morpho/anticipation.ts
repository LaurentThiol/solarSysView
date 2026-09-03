import { analyzeDraw, detect, jaccard, type Portrait } from "./geometry"
import { MOTIF_IDS, labelOf } from "./lexicon"

function sample(rng: () => number, n: number, max: number) {
  const pool = Array.from({ length: max }, (_, i) => i + 1)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, n).sort((a, b) => a - b)
}

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function wilson(successes: number, n: number) {
  if (n <= 0) return { p: 0, lo: 0, hi: 1 }
  const p = successes / n
  const z = 1.96
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denom
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom
  return { p, lo: Math.max(0, center - margin), hi: Math.min(1, center + margin) }
}

export function anticipateLocal(
  draws: { date: string; weekday?: string; numbers: number[]; stars: number[] }[],
  opts?: { nSim?: number; seed?: number; minJaccard?: number }
) {
  const nSim = opts?.nSim ?? 400
  const seed = opts?.seed ?? 0
  const minJaccard = opts?.minJaccard ?? 0.5
  const portraits: Portrait[] = draws
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(analyzeDraw)
  if (portraits.length < 2) {
    return { ok: false as const, error: "il faut au moins deux tirages", current: portraits[0] ?? null }
  }
  const current = portraits[portraits.length - 1]
  const matches: Portrait[] = []
  for (let i = 0; i < portraits.length - 1; i++) {
    if (jaccard(portraits[i].motifs, current.motifs) >= minJaccard) {
      matches.push(portraits[i + 1])
    }
  }
  const rng = mulberry32(seed)
  const nullCounts: Record<string, number> = Object.fromEntries(MOTIF_IDS.map((m) => [m, 0]))
  for (let i = 0; i < nSim; i++) {
    const portrait = detect(sample(rng, 5, 50), sample(rng, 2, 12))
    for (const motif of portrait.motifs) nullCounts[motif] += 1
  }
  const n = matches.length
  const classes = MOTIF_IDS.map((id) => {
    const observed = matches.filter((p) => p.motifs.includes(id)).length
    const p0 = nullCounts[id] / nSim
    const w = n ? wilson(observed, n) : { p: null as number | null, lo: null, hi: null }
    return {
      id,
      label: labelOf(id),
      empirical: w.p == null ? null : Math.round(w.p * 10000) / 10000,
      wilson_lo: w.lo == null ? null : Math.round(w.lo * 10000) / 10000,
      wilson_hi: w.hi == null ? null : Math.round(w.hi * 10000) / 10000,
      null: Math.round(p0 * 10000) / 10000,
      observed,
      n,
      current: current.motifs.includes(id),
    }
  }).sort((a, b) => {
    const da = a.empirical == null ? -1 : Math.abs(a.empirical - a.null)
    const db = b.empirical == null ? -1 : Math.abs(b.empirical - b.null)
    return db - da
  })
  return {
    ok: true as const,
    current: {
      date: current.date,
      motifs: current.motifs,
      caption: current.caption,
      weekday: current.weekday,
    },
    matches: n,
    min_jaccard: minJaccard,
    n_sim: nSim,
    classes,
  }
}
