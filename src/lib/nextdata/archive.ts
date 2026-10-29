/** Archive de tirages : combien de tirages du mardi et du vendredi manquent après le dernier connu. */

const DRAW_WEEKDAYS = new Set([2, 5])
const MAX_SCAN_DAYS = 400

function parseDay(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
  if (!match) return null
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

/** Dates des mardis et vendredis après `lastDate`, avant `today` (AAAA-MM-JJ, exclus l’un et l’autre).
 *  Le jour même ne compte pas : le tirage de ce soir n’a pas encore eu lieu. */
export function missingDrawDates(lastDate: string | null | undefined, today: string): string[] {
  const start = lastDate ? parseDay(lastDate) : null
  const end = parseDay(today)
  if (!start || !end) return []
  const out: string[] = []
  const cursor = new Date(start)
  for (let step = 0; step < MAX_SCAN_DAYS; step += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    if (cursor.getTime() >= end.getTime()) break
    if (DRAW_WEEKDAYS.has(cursor.getUTCDay())) out.push(cursor.toISOString().slice(0, 10))
  }
  return out
}

export function localDay(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}
