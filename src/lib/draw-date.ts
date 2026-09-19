/** Date de tirage `YYYY-MM-DD` (calendrier UTC). Pas d’alias `@/` : importable depuis Node. */

const DRAW_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function asDrawDate(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  const match = DRAW_DATE_RE.exec(trimmed)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null
  }
  return `${match[1]}-${match[2]}-${match[3]}`
}
