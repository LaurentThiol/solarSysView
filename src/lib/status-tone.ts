export type StatusTone = "ok" | "warn" | "err" | "off" | "load" | "info"

const TONE_RANK: Record<StatusTone, number> = {
  err: 5,
  warn: 4,
  load: 3,
  ok: 2,
  info: 1,
  off: 0,
}

export function worstStatusTone(tones: readonly StatusTone[]): StatusTone {
  return tones.reduce<StatusTone>((best, tone) => (TONE_RANK[tone] > TONE_RANK[best] ? tone : best), "off")
}
