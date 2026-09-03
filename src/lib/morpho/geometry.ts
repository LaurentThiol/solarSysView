import { N_COLS, N_ROWS, numberCell, occupancy, starCell } from "./board"
import { MOTIF_IDS, captionFromFacts, factsFrom, type MotifId } from "./lexicon"

const CENTER_ROWS = new Set([1, 2, 3])
const CENTER_COLS = new Set([2, 3, 4, 5, 6, 7])

export type Portrait = {
  numbers: number[]
  stars: number[]
  cells: [number, number][]
  star_cells: [number, number][]
  motifs: MotifId[]
  descriptors: Record<string, number>
  facts: string[]
  caption: string
  flags: number[]
  occupancy: number[]
  date?: string | null
  weekday?: string
}

function lineGroups(cells: [number, number][]) {
  const rows = new Map<number, number>()
  const cols = new Map<number, number>()
  const diagA = new Map<number, number>()
  const diagB = new Map<number, number>()
  const bump = (m: Map<number, number>, k: number) => m.set(k, (m.get(k) ?? 0) + 1)
  for (const [r, c] of cells) {
    bump(rows, r)
    bump(cols, c)
    bump(diagA, r - c)
    bump(diagB, r + c)
  }
  const maxOf = (m: Map<number, number>) => (m.size ? Math.max(...m.values()) : 0)
  return {
    max_row: maxOf(rows),
    max_col: maxOf(cols),
    max_diag: Math.max(maxOf(diagA), maxOf(diagB)),
  }
}

function isLine(cells: [number, number][]) {
  if (cells.length < 5) return false
  const g = lineGroups(cells)
  return g.max_row >= 5 || g.max_col >= 5 || g.max_diag >= 5
}

function hasWedge(cells: [number, number][]) {
  if (isLine(cells) || cells.length < 5) return false
  const g = lineGroups(cells)
  return g.max_row >= 3 || g.max_col >= 3 || g.max_diag >= 3
}

function mirrorPairs(cells: [number, number][]) {
  const occ = new Set(cells.map(([r, c]) => `${r},${c}`))
  const seen = new Set<string>()
  let pairs = 0
  for (const [r, c] of cells) {
    const key = `${r},${c}`
    if (seen.has(key)) continue
    const mc = N_COLS - 1 - c
    if (mc === c) continue
    const mk = `${r},${mc}`
    if (occ.has(mk)) {
      pairs += 1
      seen.add(key)
      seen.add(mk)
    }
  }
  return pairs
}

function isWShape(cells: [number, number][]) {
  if (cells.length !== 5) return false
  const byRow = new Map<number, number[]>()
  for (const [r, c] of cells) {
    const list = byRow.get(r) ?? []
    list.push(c)
    byRow.set(r, list)
  }
  if (byRow.size !== 3) return false
  const rows = [...byRow.keys()].sort((a, b) => a - b)
  if (rows.map((r) => byRow.get(r)!.length).join() !== "2,1,2") return false
  const mid = byRow.get(rows[1])![0]
  const others = [...byRow.get(rows[0])!, ...byRow.get(rows[2])!]
  return Math.min(...others) < mid && mid < Math.max(...others)
}

function r4(n: number) {
  return Math.round(n * 10000) / 10000
}

export function detect(numbers: number[], stars: number[]): Portrait {
  const nums = [...numbers].map(Number).sort((a, b) => a - b)
  const sts = [...stars].map(Number).sort((a, b) => a - b)
  const cells = nums.map(numberCell)
  const scells = sts.map(starCell)
  const g = lineGroups(cells)
  const rows = cells.map(([r]) => r)
  const cols = cells.map(([, c]) => c)
  const minR = Math.min(...rows)
  const maxR = Math.max(...rows)
  const minC = Math.min(...cols)
  const maxC = Math.max(...cols)
  const area = (maxR - minR + 1) * (maxC - minC + 1)
  const meanR = rows.reduce((a, b) => a + b, 0) / cells.length
  const meanC = cols.reduce((a, b) => a + b, 0) / cells.length
  const centerN = cells.filter(([r, c]) => CENTER_ROWS.has(r) && CENTER_COLS.has(c)).length
  const periN = cells.filter(([r, c]) => r === 0 || r === N_ROWS - 1 || c === 0 || c === N_COLS - 1).length
  const topN = cells.filter(([r]) => r <= 1).length
  const botN = cells.filter(([r]) => r >= 3).length
  const leftN = cells.filter(([, c]) => c <= 2).length
  const rightN = cells.filter(([, c]) => c >= 7).length
  let starCheb = 99
  if (scells.length === 2) {
    const [[r1, c1], [r2, c2]] = scells
    starCheb = Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2))
  }

  const motifs: MotifId[] = []
  if (g.max_row >= 3) motifs.push("align_h")
  if (g.max_col >= 3) motifs.push("align_v")
  if (g.max_diag >= 3) motifs.push("diagonal")
  if (isLine(cells)) motifs.push("line")
  if (hasWedge(cells)) motifs.push("wedge")
  if (area <= 9) motifs.push("cluster")
  if (area >= 30) motifs.push("spread")
  if (centerN >= 3) motifs.push("center")
  if (periN >= 4) motifs.push("periphery")
  if (topN >= 3) motifs.push("top")
  if (botN >= 3) motifs.push("bottom")
  if (leftN >= 3) motifs.push("left")
  if (rightN >= 3) motifs.push("right")
  if (mirrorPairs(cells) >= 2) motifs.push("mirror_v")
  if (isWShape(cells)) motifs.push("w_shape")
  if (starCheb <= 1) motifs.push("stars_adj")
  if (scells.length === 2 && scells[0][0] === scells[1][0]) motifs.push("stars_same_row")

  const descriptors = {
    centroid_row: r4(meanR),
    centroid_col: r4(meanC),
    bbox_area: area,
    bbox_h: maxR - minR + 1,
    bbox_w: maxC - minC + 1,
    compactness: r4(5 / area),
    center_n: centerN,
    periphery_n: periN,
    max_row: g.max_row,
    max_col: g.max_col,
    max_diag: g.max_diag,
    mirror_pairs: mirrorPairs(cells),
    star_chebyshev: starCheb,
  }
  const facts = factsFrom(motifs, descriptors)
  return {
    numbers: nums,
    stars: sts,
    cells,
    star_cells: scells,
    motifs,
    descriptors,
    facts,
    caption: captionFromFacts(facts),
    flags: MOTIF_IDS.map((id) => (motifs.includes(id) ? 1 : 0)),
    occupancy: occupancy(nums, sts),
  }
}

export function analyzeDraw(draw: {
  date?: string
  draw_date?: string
  weekday?: string
  numbers: number[]
  stars: number[]
}): Portrait {
  const portrait = detect(draw.numbers, draw.stars)
  portrait.date = draw.date ?? draw.draw_date ?? null
  portrait.weekday = draw.weekday
  return portrait
}

export function signatureVector(portrait: Portrait) {
  const d = portrait.descriptors
  return [
    ...portrait.flags.map(Number),
    d.centroid_row / 4,
    d.centroid_col / 9,
    d.compactness,
    d.bbox_area / 50,
    Math.min(d.star_chebyshev, 6) / 6,
    ...portrait.occupancy.map(Number),
  ]
}

export function cosine(a: number[], b: number[]) {
  let num = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    num += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (!na || !nb) return 0
  return num / (Math.sqrt(na) * Math.sqrt(nb))
}

export function jaccard(a: string[], b: string[]) {
  const sa = new Set(a)
  const sb = new Set(b)
  if (!sa.size && !sb.size) return 1
  if (!sa.size || !sb.size) return 0
  let inter = 0
  for (const x of sa) if (sb.has(x)) inter += 1
  return inter / (sa.size + sb.size - inter)
}

export function neighborScore(a: Portrait, b: Portrait) {
  return 0.7 * cosine(signatureVector(a), signatureVector(b)) + 0.3 * jaccard(a.motifs, b.motifs)
}

export function neighborsOf(
  query: Portrait,
  draws: { date: string; weekday?: string; numbers: number[]; stars: number[] }[],
  k = 8
) {
  return draws
    .map((draw) => analyzeDraw(draw))
    .filter((p) => p.date !== query.date)
    .map((p) => ({ ...p, score: Math.round(neighborScore(query, p) * 10000) / 10000 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
