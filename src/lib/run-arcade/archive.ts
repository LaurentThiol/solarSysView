/** Tirages qu’il faut pour ouvrir une génération. */
export const LAUNCH_MIN_POINTS = 4

/**
 * Lancer attend la fin de la lecture. Au premier rendu la page n’a que l’extrait embarqué du site :
 * une course lancée alors partirait sur lui, s’arrêterait à sa dernière date et s’écrirait dans Neon comme les autres.
 */
export function launchReady(input: { loading: boolean; points: number }) {
  return !input.loading && input.points >= LAUNCH_MIN_POINTS
}

function frDay(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

/**
 * Avertissement quand la lecture est finie et que la page n’a que l’extrait embarqué (`source` « json »).
 * Pendant la lecture, la page dit « Archive en cours de lecture. » : l’extrait n’est pas encore une panne.
 */
export function archiveNotice(input: {
  loading: boolean
  source: "json" | "neon"
  points: readonly { date: string }[]
}) {
  if (input.loading || input.source !== "json" || input.points.length === 0) return null
  const first = input.points[0].date
  const last = input.points[input.points.length - 1].date
  const count = input.points.length
  return `Archive embarquée : la base des tirages n’a pas répondu. La page lit l’extrait livré avec le site, ${count} tirage${count > 1 ? "s" : ""} du ${frDay(first)} au ${frDay(last)}. Une course lancée ici s’arrête à cette date. Son champion est écrit comme les autres.`
}

/**
 * Ligne sous « Dernier tirage » du résultat. Persiste recopie le dernier tirage de l’archive.
 * Un champion qui date, ou dont la course s’est arrêtée avant la fin, a un autre dernier tirage : la ligne donne les deux.
 */
export function lastDrawLine(drawDate: string, archiveLastDate: string | null, format: (iso: string) => string) {
  if (archiveLastDate && archiveLastDate !== drawDate) {
    return `${format(drawDate)} : dernier tirage de la course de ce champion. Persiste recopie le dernier de l’archive, le ${format(archiveLastDate)}.`
  }
  return `${format(drawDate)}. Persiste recopie ce tirage.`
}

/** Les années de la piste, lues dans ses dates : « années 2025 et 2026 », ou « année 2026 » quand elle n’en couvre qu’une. */
export function trackYears(track: readonly { date: string }[]) {
  if (track.length === 0) return ""
  const first = track[0].date.slice(0, 4)
  const last = track[track.length - 1].date.slice(0, 4)
  return first === last ? `année ${last}` : `années ${first} et ${last}`
}
