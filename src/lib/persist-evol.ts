/** Reprise d’une boule au tirage n−1 ou n−2 de la fenêtre : +1 ou 0. */

export type PersistSource = {
  date: string
  weekday?: string
  id: number
  numbers: readonly number[]
  stars: readonly number[]
  star_pool?: number
}

export type PersistPoint = {
  date: string
  weekday?: string
  id: number
  prevDate: string | null
  lag2Date: string | null
  numbers: 0 | 1 | null
  stars: 0 | 1 | null
  numbers2: 0 | 1 | null
  stars2: 0 | 1 | null
  repeatedNumbers: number[]
  repeatedStars: number[]
  repeatedNumbers2: number[]
  repeatedStars2: number[]
}

function intersection(current: readonly number[], previous: readonly number[]): number[] {
  const prev = new Set(previous)
  const seen = new Set<number>()
  const out: number[] = []
  for (const value of current) {
    if (!prev.has(value) || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  out.sort((a, b) => a - b)
  return out
}

function flag(values: readonly number[]): 0 | 1 {
  return values.length > 0 ? 1 : 0
}

function against(current: PersistSource, earlier: PersistSource | undefined) {
  if (!earlier) {
    return {
      date: null as string | null,
      numbers: null as 0 | 1 | null,
      stars: null as 0 | 1 | null,
      repeatedNumbers: [] as number[],
      repeatedStars: [] as number[],
    }
  }
  const repeatedNumbers = intersection(current.numbers, earlier.numbers)
  const repeatedStars = intersection(current.stars, earlier.stars)
  return {
    date: earlier.date,
    numbers: flag(repeatedNumbers),
    stars: flag(repeatedStars),
    repeatedNumbers,
    repeatedStars,
  }
}

/** +1 si l’intersection n’est pas vide. n−1 manque au premier point, n−2 aux deux premiers. */
export function toPersistSeries(draws: readonly PersistSource[]): PersistPoint[] {
  const ordered = [...draws].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  return ordered.map((draw, index) => {
    const prev = against(draw, index > 0 ? ordered[index - 1] : undefined)
    const lag2 = against(draw, index > 1 ? ordered[index - 2] : undefined)
    return {
      date: draw.date,
      weekday: draw.weekday,
      id: draw.id,
      prevDate: prev.date,
      lag2Date: lag2.date,
      numbers: prev.numbers,
      stars: prev.stars,
      numbers2: lag2.numbers,
      stars2: lag2.stars,
      repeatedNumbers: prev.repeatedNumbers,
      repeatedStars: prev.repeatedStars,
      repeatedNumbers2: lag2.repeatedNumbers,
      repeatedStars2: lag2.repeatedStars,
    }
  })
}

export type PersistShare = {
  hits: number
  total: number
  share: number
  streak: number
}

/** Part des +1 et longueur de la série de +1 en cours. Le trou du premier tirage ne compte pas. */
export function persistShare(
  values: readonly (number | null | undefined)[]
): PersistShare | null {
  const finite = values.filter((value): value is 0 | 1 => value === 0 || value === 1)
  if (finite.length === 0) return null
  let hits = 0
  for (const value of finite) hits += value
  let streak = 0
  for (let index = finite.length - 1; index >= 0; index -= 1) {
    if (finite[index] !== 1) break
    streak += 1
  }
  return { hits, total: finite.length, share: hits / finite.length, streak }
}

function binom(n: number, k: number) {
  let result = 1
  for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i
  return result
}

/** 1 − C(45,5) / C(50,5) : au moins un numéro commun à deux grilles indépendantes. */
export function numberPersistTheory(): number {
  return 1 - binom(45, 5) / binom(50, 5)
}

/** 1 − C(pool−2, 2) / C(pool, 2). Seulement les pools 11 et 12. */
export function starPersistTheory(pool: number): number | null {
  if (pool !== 11 && pool !== 12) return null
  return 1 - binom(pool - 2, 2) / binom(pool, 2)
}

/** Pool d’étoiles commun à la fenêtre. `null` s’il change, ou s’il n’y a aucun tirage. */
export function sharedStarPool(draws: readonly { star_pool?: number }[]): number | null {
  let pool: number | null = null
  for (const draw of draws) {
    const value = draw.star_pool ?? 12
    if (pool == null) pool = value
    else if (pool !== value) return null
  }
  return pool
}
