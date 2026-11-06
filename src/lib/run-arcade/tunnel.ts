/**
 * Tunnel de moyen terme, sur une courbe.
 *
 * La bande est le plus bas et le plus haut des points d’il y a 1 à 10 jours.
 * Le dernier point ne la pose pas : s’il en sort, il n’y a pas de tunnel.
 * On garde ensuite la plus longue durée, de 10 à 30 jours, qui finit à ce point
 * et dont tous les points tiennent dans cette bande. Au-delà de 30 jours, on coupe.
 * La bande ne joue pas le ticket.
 */

import { curveAt, type CurveKey, type RankPoint } from "./curves"
import { daysBetween } from "./soir"

export const TUNNEL_MIN_DAYS = 10
export const TUNNEL_MAX_DAYS = 30

export type TunnelPoint = {
  date: string
  value: number
}

export type TunnelHit = {
  days: number
  lo: number
  hi: number
  /** Indice du premier point du tunnel, dans le tableau reçu. */
  from: number
  /** Indice du dernier point. */
  to: number
}

export type Tunnel = {
  phrase: string
  hit: TunnelHit | null
}

const NONE: Tunnel = { phrase: "pas de tunnel", hit: null }

function formatLevel(value: number) {
  const rounded = Math.round(value * 10) / 10
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(1).replace(".", ",")
}

export function tunnelPhrase(hit: TunnelHit) {
  return `tunnel ${hit.days} jours, de ${formatLevel(hit.lo)} à ${formatLevel(hit.hi)}`
}

/** Plus longue bande de 10 à 30 jours qui finit au dernier point. Les points sont dans l’ordre, le dernier est le plus récent. */
export function tunnel(points: readonly TunnelPoint[]): Tunnel {
  const last = points.length - 1
  if (last < 1) return NONE
  const end = points[last].date
  const ages = points.map((point) => daysBetween(end, point.date))

  let span = 0
  for (const age of ages) {
    if (Number.isFinite(age) && age > span) span = age
  }

  let lo = Infinity
  let hi = -Infinity
  let counted = 0
  for (let index = 0; index < points.length; index += 1) {
    const age = ages[index]
    if (!Number.isFinite(age) || age <= 0 || age > TUNNEL_MIN_DAYS) continue
    const value = points[index].value
    if (!Number.isFinite(value)) continue
    counted += 1
    if (value < lo) lo = value
    if (value > hi) hi = value
  }
  if (counted === 0 || !Number.isFinite(lo) || !Number.isFinite(hi)) return NONE

  const inside = (value: number) => Number.isFinite(value) && value >= lo && value <= hi
  for (let index = 0; index < points.length; index += 1) {
    if (ages[index] === 0 && !inside(points[index].value)) return NONE
  }

  let breakAge = Infinity
  for (let index = 0; index < points.length; index += 1) {
    const age = ages[index]
    if (!Number.isFinite(age) || age <= 0) continue
    if (!inside(points[index].value) && age < breakAge) breakAge = age
  }

  const room = Number.isFinite(breakAge) ? breakAge - 1 : span
  const days = Math.min(TUNNEL_MAX_DAYS, span, room)
  if (days < TUNNEL_MIN_DAYS) return NONE

  let from = last
  for (let index = 0; index < points.length; index += 1) {
    const age = ages[index]
    if (!Number.isFinite(age) || age < 0 || age > days) continue
    if (index < from) from = index
  }

  const hit: TunnelHit = { days, lo, hi, from, to: last }
  return { phrase: tunnelPhrase(hit), hit }
}

/** Même lecture, sur une courbe du passé révélé. */
export function tunnelOf(past: readonly RankPoint[], key: CurveKey): Tunnel {
  return tunnel(past.map((point) => ({ date: point.date, value: curveAt(point, key) })))
}
