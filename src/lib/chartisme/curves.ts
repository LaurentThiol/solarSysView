import { series, type AnalysisDraw, type VariableName } from "@/lib/analysis"
import { activityFromClose } from "@/lib/ta"

/**
 * Jumeau TS de `synchro/chartisme/export.py`.
 *
 * Sur Netlify `apiBase()` est vide : aucun backend Python ne répond et le
 * bundle de courbes ne peut pas être lu du disque. L'onglet doit donc savoir
 * reconstruire une courbe depuis les tirages déjà en mémoire.
 */

export const N_POOL = 50
export const S_POOL = 12

/**
 * Courbes sans indice de boule.
 *
 * `n1`…`n5` et `e1`, `e2` sont les statistiques d'ordre du tirage — le plus petit
 * numéro, le deuxième, etc. Séparées exprès : chacune a son propre régime, et
 * l'espace de règles doit pouvoir viser `n1` sans viser `n5`. Le plus petit
 * numéro vit contre le plancher 1, le plus grand contre le plafond 50, et une
 * cassure ne veut pas dire la même chose sur les deux.
 *
 * `g1`…`g4` sont les écarts entre rangs voisins. Ils disent comment le tirage
 * occupe la grille, et ils le disent mieux que les rangs : ceux-ci sont ordonnés
 * par construction, donc corrélés entre eux, si bien qu'une figure lue sur l'un
 * se retrouve en partie sur les autres sans rien ajouter.
 */
export const PLAIN_VARIABLES = [
  "sum",
  "spread",
  "parity",
  "high_low",
  "consecutive",
  "centroid",
  "n1",
  "n2",
  "n3",
  "n4",
  "n5",
  "g1",
  "g2",
  "g3",
  "g4",
  "star_sum",
  "e1",
  "e2",
] as const

export const BALL_VARIABLES = ["delay", "hit"] as const

export const STAR_VARIABLES = ["star_delay", "star_hit"] as const

export const VARIABLE_LABELS: Record<string, string> = {
  sum: "Somme des numéros",
  spread: "Étendue (max − min)",
  parity: "Pairs / impairs",
  high_low: "Numéros ≥ 26",
  consecutive: "Paires consécutives",
  centroid: "Centre de masse",
  n1: "Plus petit numéro",
  n2: "2ᵉ numéro trié",
  n3: "3ᵉ numéro trié",
  n4: "4ᵉ numéro trié",
  n5: "Plus grand numéro",
  g1: "Écart n2 − n1",
  g2: "Écart n3 − n2",
  g3: "Écart n4 − n3",
  g4: "Écart n5 − n4",
  delay: "Retard d'une boule",
  hit: "Présence d'une boule",
  star_sum: "Somme des étoiles",
  e1: "Plus petite étoile",
  e2: "Plus grande étoile",
  star_delay: "Retard d'une étoile",
  star_hit: "Présence d'une étoile",
}

export type CurveSpec = { variable: string; n: number | null }

export type Curve = {
  id: string
  variable: string
  n: number | null
  label: string
  draw_count: number
  from_date: string | null
  to_date: string | null
  dates: string[]
  values: number[]
  activity: number[]
}

export type CurveMeta = Omit<Curve, "dates" | "values" | "activity">

export function curveId(variable: string, n: number | null) {
  return n === null ? variable : `${variable}:${n}`
}

export function parseCurveId(cid: string): CurveSpec {
  if (!cid.includes(":")) return { variable: cid, n: null }
  const [variable, raw] = cid.split(":", 2)
  const n = Number.parseInt(raw, 10)
  return { variable, n: Number.isFinite(n) ? n : null }
}

export function curveLabel(variable: string, n: number | null) {
  const base = VARIABLE_LABELS[variable] ?? variable
  if (n === null) return base
  return `${base} — ${variable.startsWith("star_") ? "étoile" : "boule"} ${n}`
}

export function curveSpecs(
  options: { plain?: boolean; balls?: boolean; stars?: boolean } = {}
): CurveSpec[] {
  const { plain = true, balls = true, stars = true } = options
  const specs: CurveSpec[] = []
  if (plain) {
    for (const variable of PLAIN_VARIABLES) specs.push({ variable, n: null })
  }
  if (balls) {
    for (const variable of BALL_VARIABLES) {
      for (let n = 1; n <= N_POOL; n += 1) specs.push({ variable, n })
    }
  }
  if (stars) {
    for (const variable of STAR_VARIABLES) {
      for (let n = 1; n <= S_POOL; n += 1) specs.push({ variable, n })
    }
  }
  return specs
}

export function buildCurve(draws: AnalysisDraw[], variable: string, n: number | null): Curve {
  const payload = series(draws, variable as VariableName, n ?? undefined)
  const dates = payload.points.map((point) => point.date)
  const values = payload.values.map((value) => Number(value))
  return {
    id: curveId(variable, n),
    variable,
    n,
    label: curveLabel(variable, n),
    draw_count: payload.drawCount,
    from_date: dates[0] ?? null,
    to_date: dates[dates.length - 1] ?? null,
    dates,
    values,
    activity: activityFromClose(values),
  }
}

/** Le catalogue complet, sans les séries — pour peupler un sélecteur. */
export function curveCatalog(draws: AnalysisDraw[]): CurveMeta[] {
  const dates = draws.map((draw) => draw.date).sort()
  return curveSpecs().map(({ variable, n }) => ({
    id: curveId(variable, n),
    variable,
    n,
    label: curveLabel(variable, n),
    draw_count: dates.length,
    from_date: dates[0] ?? null,
    to_date: dates[dates.length - 1] ?? null,
  }))
}
