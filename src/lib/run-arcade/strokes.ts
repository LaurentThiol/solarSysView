import type { CurveKey, RankPoint } from "./curves"
import { curveValues } from "./curves"
import {
  gesturePhrase,
  versionAlive,
  type Gesture,
  type GestureLife,
  type SkillVersion,
} from "./skills"
import { blendTips, formatCents, gapSinceBirth, tipFor, type RunnerMind } from "./thought"

/** Trait d’une version encore en vie, sur la courbe affichée. */
export type VersionStroke = {
  id: string
  name: string
  gesture: Gesture
  gestureLabel: string
  tip: number
  /**
   * Écart au hasard depuis la naissance, en centimes, ramené à 0 s’il est nul ou négatif.
   * 0 : le trait est en pointillés et ne tire pas la pensée.
   */
  weight: number
  /** « 0 », ou le montant au-dessus du hasard. */
  label: string
}

export type CurveStrokes = {
  versions: VersionStroke[]
  /** Moyenne des pointes pondérée par le poids. Sans poids positif : la pointe la plus récente. */
  thought: number
}

type RankedTip = {
  tip: number
  weight: number
  cutoff: string
  version: number
  order: number
}

/** Même moyenne que `blendTips` : le dessin et le ticket partagent le calcul. */
export function blendedTip(rows: readonly RankedTip[]) {
  return blendTips(rows)
}

export { gapSinceBirth }

/** Versions encore en vie de la courbe affichée, pointe et poids. Une échue n’y est pas. */
export function curveStrokes(input: {
  mind: RunnerMind
  past: readonly RankPoint[]
  curve: CurveKey
  hiddenDate: string | null
  life: GestureLife | null
}): CurveStrokes {
  const dates = input.life?.dates ?? []
  const rows = input.past.map(curveValues)
  const versions: VersionStroke[] = []
  const ranked: RankedTip[] = []
  let order = 0
  for (const skill of input.mind.skills) {
    const living = skill.versions.filter((version) => {
      if (version.curve !== input.curve && version.curve !== "*") return false
      const life = input.life ? (input.life.draws[version.gesture] ?? null) : null
      return versionAlive(version, input.hiddenDate, life, dates)
    })
    for (const version of living) {
      const gap = gapSinceBirth(version, input.past)
      const weight = gap > 0 ? gap : 0
      const tip = tipFor(version, input.past, rows, input.curve, input.hiddenDate ?? undefined)
      versions.push({
        id: `${skill.id}-v${version.version}`,
        name: living.length > 1 ? `${skill.name} v${version.version}` : skill.name,
        gesture: version.gesture,
        gestureLabel: gesturePhrase(version.gesture),
        tip,
        weight,
        label: weight > 0 ? formatCents(weight) : "0",
      })
      ranked.push({ tip, weight, cutoff: version.cutoff, version: version.version, order })
      order += 1
    }
  }
  return { versions, thought: blendedTip(ranked) }
}
