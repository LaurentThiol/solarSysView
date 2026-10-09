/** Ce que nextData et nextDataTraining disent de Chronos. */

/** Pas d’avant qui règlent les poids : même valeur que `CHRONOS_WINDOW` dans synchro/nextdata/backtest.py. */
export const CHRONOS_WINDOW = 10

export type ChronosNote = {
  available?: boolean
  weight?: number
  weights?: Record<string, number>
  window?: number
  holdout_mae_lgb?: number | null
  holdout_mae_chronos?: number | null
}

export type ChronosStatus = {
  requested?: boolean
  used?: boolean
  error?: string | null
}

/** Bandeau quand Chronos est demandé et n’a rien mélangé, null sinon. */
export function chronosBanner(chronos: ChronosStatus | null | undefined): string | null {
  if (!chronos?.requested || chronos.used) return null
  return `${chronos.error || "Chronos n’a pas répondu."} LightGBM et CatBoost restent seuls.`
}

/** Part de Chronos dans la somme mélangée d’une lecture LightGBM. */
export function chronosShare(note: ChronosNote | null | undefined): string | null {
  if (!note?.available) return null
  const share = Math.round((1 - (note.weight ?? 1)) * 100)
  if ((note.window ?? 0) < CHRONOS_WINDOW) return `Chronos ${share} %, faute de ${CHRONOS_WINDOW} tirages d’avant`
  return `Chronos ${share} % de la somme`
}
