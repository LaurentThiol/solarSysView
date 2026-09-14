/**
 * Courbe de Hilbert : les tirages successifs restent voisins sur la carte.
 * Ordre n → grille 2^n × 2^n, indice d ∈ [0, 4^n).
 */

function rotate(n: number, x: number, y: number, rx: number, ry: number): [number, number] {
  if (ry !== 0) return [x, y]
  if (rx === 1) {
    x = n - 1 - x
    y = n - 1 - y
  }
  return [y, x]
}

export function hilbertOrderFor(count: number) {
  const need = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, count))))
  return Math.max(1, Math.ceil(Math.log2(need)))
}

export function hilbertXY(order: number, d: number): [number, number] {
  let x = 0
  let y = 0
  let t = Math.max(0, Math.floor(d))
  for (let s = 1; s < 1 << order; s *= 2) {
    const rx = 1 & (t >> 1)
    const ry = 1 & (t ^ rx)
    ;[x, y] = rotate(s, x, y, rx, ry)
    x += s * rx
    y += s * ry
    t >>= 2
  }
  return [x, y]
}

export function hilbertIndex(order: number, x: number, y: number) {
  let d = 0
  let xx = x
  let yy = y
  for (let s = 1 << (order - 1); s > 0; s >>= 1) {
    const rx = xx & s ? 1 : 0
    const ry = yy & s ? 1 : 0
    d += s * s * ((3 * rx) ^ ry)
    ;[xx, yy] = rotate(s, xx, yy, rx, ry)
  }
  return d
}
