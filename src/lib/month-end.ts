/** Repères de fin de mois sur une courbe dont l’abscisse est une date de tirage. */

const ISO_DAY = /^(\d{4})-(\d{2})-\d{2}/

export const MONTH_END_NOTE =
  "Un trait vertical fin marque chaque fin de mois, entre le dernier tirage du mois et le premier du suivant."

/** `YYYY-MM` d’une date ISO, ou une chaîne vide si la date n’est pas un jour calendaire. */
export function calendarMonth(isoDate: string): string {
  const match = ISO_DAY.exec(isoDate)
  if (!match) return ""
  const month = Number(match[2])
  if (month < 1 || month > 12) return ""
  return `${match[1]}-${match[2]}`
}

export type MonthBoundary = {
  /** Dernier point tracé du mois qui se termine. */
  date: string
  /** Premier point tracé du mois suivant. */
  next: string
  /** Mois qui se termine, `YYYY-MM`. */
  month: string
}

/**
 * Frontières entre points consécutifs dont le mois civil change.
 * L’ordre est celui de la courbe, pas un tri supplémentaire.
 */
export function monthBoundaries(dates: readonly string[]): MonthBoundary[] {
  const boundaries: MonthBoundary[] = []
  for (let index = 0; index < dates.length - 1; index += 1) {
    const date = dates[index]
    const next = dates[index + 1]
    if (!date || !next) continue
    const month = calendarMonth(date)
    const nextMonth = calendarMonth(next)
    if (!month || !nextMonth || month === nextMonth) continue
    boundaries.push({ date, next, month })
  }
  return boundaries
}

export function withMonthEndNote<T extends { body: string }>(help: T): T {
  if (help.body.includes(MONTH_END_NOTE)) return help
  return { ...help, body: `${help.body}\n\n${MONTH_END_NOTE}` }
}
