/** Lecture Pulse affichée à côté des covariables de nextData. */

export type PulseReading = {
  lobe: number
  mass: number
  star_lobe: number
  star_mass: number
}

function share(value: number) {
  if (!Number.isFinite(value)) return "—"
  return `${Math.round(value * 100)} %`
}

/** Quatre parts du tirage visé : boules et étoiles, en lobe et en masse. */
export function pulseCaption(pulse: PulseReading) {
  return `Boules en lobe ${share(pulse.lobe)}, masse ${share(pulse.mass)} · étoiles ${share(pulse.star_lobe)}, masse ${share(pulse.star_mass)}`
}
