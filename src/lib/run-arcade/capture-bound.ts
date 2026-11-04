/** Borne de la capture du dessin : passé ce délai, la capture rend `null` et son hôte est démonté. */
export const CAPTURE_DRAW_TIMEOUT_MS = 4_000

let capturePending = false

/** Au plus une capture en attente : `true` si le créneau est pris, `false` s’il l’était déjà. */
export function tryCaptureSlot(): boolean {
  if (capturePending) return false
  capturePending = true
  return true
}

export function releaseCaptureSlot() {
  capturePending = false
}

/** Attend `work`, au plus `ms`. Passé ce délai, rend `null` sans attendre la fin du travail. */
export async function waitBounded<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let handle: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((resolve) => {
    handle = setTimeout(() => resolve(null), Math.max(0, ms))
  })
  try {
    return await Promise.race([work, late])
  } finally {
    if (handle !== undefined) clearTimeout(handle)
  }
}
