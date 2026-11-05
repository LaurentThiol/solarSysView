import type { CurveKey, RankPoint } from "./curves"
import { curveValues } from "./curves"
import { chanceBalance } from "./examen"
import {
  gesturePhrase,
  newSkill,
  versionAlive,
  type Gesture,
  type GestureLife,
  type SkillVersion,
} from "./skills"
import {
  countHits,
  formatCents,
  settlePurse,
  START_CENTS,
  TICKET_CENTS,
  think,
  tipFor,
  type RunnerMind,
} from "./thought"

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

/** La plus récente : coupure la plus tardive, puis numéro, puis place dans la liste. */
function later(a: RankedTip, b: RankedTip) {
  if (a.cutoff !== b.cutoff) return a.cutoff > b.cutoff
  if (a.version !== b.version) return a.version > b.version
  return a.order > b.order
}

/**
 * Pensée d’une courbe : moyenne des pointes, pondérée par l’écart au hasard.
 * Un poids nul ne tire pas. Si aucun poids n’est positif, la version la plus récente joue seule.
 */
export function blendedTip(rows: readonly RankedTip[]) {
  let mass = 0
  let sum = 0
  for (const row of rows) {
    if (!(row.weight > 0)) continue
    mass += row.weight
    sum += row.tip * row.weight
  }
  if (mass > 0) return sum / mass
  let best: RankedTip | null = null
  for (const row of rows) {
    if (!best || later(row, best)) best = row
  }
  return best ? best.tip : Number.NaN
}

function versionKey(version: SkillVersion) {
  return [
    version.curve,
    version.gesture,
    version.window,
    version.days ?? "",
    version.ratio,
    version.span,
    version.r ?? "",
    version.forme ?? "",
    version.n ?? "",
    version.cutoff,
    version.origin,
  ].join("|")
}

function pastStamp(past: readonly RankPoint[]) {
  const mid = past[Math.floor(past.length / 2)]
  const last = past[past.length - 1]
  return [
    past.length,
    past[0]?.date ?? "",
    mid?.date ?? "",
    mid?.n1 ?? "",
    last?.date ?? "",
    last?.n1 ?? "",
    last?.e2 ?? "",
  ].join("|")
}

const gapCache = new Map<string, number>()

function soloMind(version: SkillVersion): RunnerMind {
  const focus: CurveKey = version.curve === "*" ? "n1" : version.curve
  return {
    id: "poids",
    name: "poids",
    focus,
    skills: [
      newSkill(
        "poids",
        "poids",
        {
          curve: version.curve,
          gesture: version.gesture,
          ratio: version.ratio,
          span: version.span,
          window: version.window,
          days: version.days,
          suite: version.suite,
          r: version.r,
          forme: version.forme,
          n: version.n,
        },
        {
          cutoff: version.cutoff,
          origin: version.origin,
          examCents: null,
          phrase: version.phrase,
        }
      ),
    ],
  }
}

/**
 * Écart entre le solde de cette version et le hasard, sur les tirages révélés depuis sa naissance.
 * Le tirage caché n’est pas dans `past`. Sans tour joué, l’écart est nul.
 * En dessous du hasard, l’écart est négatif : l’écran l’écrit 0 et ne le fait pas peser.
 */
export function gapSinceBirth(version: SkillVersion, past: readonly RankPoint[]) {
  const key = `${versionKey(version)}|${pastStamp(past)}`
  const cached = gapCache.get(key)
  if (cached != null) return cached
  let cents = START_CENTS
  let turns = 0
  if (past.length >= 2) {
    const mind = soloMind(version)
    for (let index = 0; index < past.length; index += 1) {
      const hidden = past[index]
      if (version.cutoff && hidden.date <= version.cutoff) continue
      if (cents < TICKET_CENTS) break
      const seen = past.slice(0, index)
      if (seen.length < 2) continue
      const thought = think(mind, seen, { hiddenDate: hidden.date, plain: true })
      cents = settlePurse(cents, countHits(thought.guess, hidden))
      turns += 1
    }
  }
  const raw = turns > 0 ? cents - chanceBalance(turns).cents : 0
  const gap = Math.round(raw)
  gapCache.set(key, gap)
  return gap
}

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
