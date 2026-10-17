/** Lecture Pulse affichée à côté des covariables de nextData. */

export type PulsePick = {
  n: number
  pi: number
  p: number
}

export type PulseReading = {
  balls: PulsePick[]
  stars: PulsePick[]
}

function share(value: number) {
  if (!Number.isFinite(value)) return "—"
  return `${Math.round(value * 100)} %`
}

function pLabel(value: number) {
  if (!Number.isFinite(value)) return "—"
  if (value < 0.001) return "< 0,001"
  return value.toFixed(3).replace(".", ",")
}

function pickLabel(pick: PulsePick) {
  return `${pick.n} ${share(pick.pi)} p ${pLabel(pick.p)}`
}

/** Chaque numéro retenu, avec son π et son p. L’ordre est celui du π. */
export function pulseCaption(pulse: PulseReading) {
  const balls = (pulse.balls ?? []).filter((pick) => pick.n > 0).map(pickLabel).join(" · ")
  const stars = (pulse.stars ?? []).filter((pick) => pick.n > 0).map(pickLabel).join(" · ")
  return `Boules ${balls || "—"} · étoiles ${stars || "—"}`
}
