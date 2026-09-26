/** Vignette de fiche. Même géométrie que synchro/lexicon/cards.py. */

const WELL = "#12182a"
const GRID = "#31405c"
const INK = "#f4efe4"
const CHORD = "#9fd0f5"

const SENSES = ["monte", "baisse", "stable"] as const
const REGISTERS = ["05", "1", "sup"] as const

type Sense = (typeof SENSES)[number]
type Register = (typeof REGISTERS)[number]

function isSense(value: string): value is Sense {
  return (SENSES as readonly string[]).includes(value)
}

function isRegister(value: string): value is Register {
  return (REGISTERS as readonly string[]).includes(value)
}

export function seriesFor(sense: Sense, register: Register) {
  const values: number[] = []
  for (let index = 0; index < 20; index += 1) {
    const t = index / 19
    let base = 0.5
    if (sense === "monte") base = 0.18 + t * 0.64
    if (sense === "baisse") base = 0.82 - t * 0.64
    let noise = 0
    if (register === "1" && (index === 6 || index === 13)) noise = index === 6 ? 0.14 : -0.14
    if (register === "sup" && index % 4 === 2) noise = Math.floor(index / 4) % 2 === 0 ? 0.28 : -0.28
    values.push(Math.min(0.94, Math.max(0.06, base + noise)))
  }
  return values
}

export function sketchSvg(sense: Sense, register: Register) {
  const width = 480
  const height = 168
  const left = 20
  const right = 460
  const top = 16
  const bottom = 148
  const span = bottom - top
  const coords = seriesFor(sense, register).map((value, index) => {
    const x = left + (index * (right - left)) / 19
    const y = bottom - value * span
    return [x, y] as const
  })
  const [x0, y0] = coords[0]
  const [x1, y1] = coords[coords.length - 1]
  const grids = [0.25, 0.5, 0.75]
    .map((frac) => {
      const gy = bottom - frac * span
      return `<line x1="${left}" y1="${gy.toFixed(1)}" x2="${right}" y2="${gy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`
    })
    .join("")
  const points = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  const label = `${sense}:${register}`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${label}">` +
    `<title>${label}</title>` +
    `<rect width="${width}" height="${height}" rx="12" fill="${WELL}"/>` +
    grids +
    `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${CHORD}" stroke-width="2" stroke-dasharray="7 5" stroke-linecap="round"/>` +
    `<polyline fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${points}"/>` +
    `<circle cx="${x0.toFixed(1)}" cy="${y0.toFixed(1)}" r="4.5" fill="${CHORD}"/>` +
    `<circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="4.5" fill="${CHORD}"/>` +
    `</svg>`
  )
}

/** Vignette fraîche pour un symbole de sens. Chaîne vide si le symbole n'est pas du code. */
export function sketchForSymbol(symbol: string | null | undefined) {
  if (!symbol) return ""
  const [sense, register] = symbol.split(":")
  if (!sense || !register || !isSense(sense) || !isRegister(register)) return ""
  return sketchSvg(sense, register)
}

/** Ancienne vignette #0f172a : le trait se confondait avec la carte. */
export function readableSvg(svg: string | undefined) {
  if (!svg) return ""
  return svg
    .replaceAll('stroke="#0f172a"', `stroke="${INK}"`)
    .replaceAll('stroke="#94a3b8"', `stroke="${CHORD}"`)
    .replaceAll('stroke-width="1.5"', 'stroke-width="2.5"')
    .replaceAll('stroke-width="1"', 'stroke-width="1.75"')
}
