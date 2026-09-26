// Définitions du glossaire : une entrée par courbe lue, une par figure de la table.
// Le dessin vient des gabarits d'école (curve-shapes / sketch-shapes), pas de l'archive.

import { foldGlossaryQuery } from "@/lib/copy"

import {
  FIGURE_IDS,
  FIGURE_KINDS,
  FIGURE_LABELS,
  type FigureId,
  type FigureKind,
  signalOf,
  targetBasis,
} from "./catalog"
import { BALL_VARIABLES, PLAIN_VARIABLES, STAR_VARIABLES, VARIABLE_LABELS } from "./curves"

export const FIGURE_KIND_LABELS: Record<FigureKind, string> = {
  reversal_down: "Retournement baissier",
  reversal_up: "Retournement haussier",
  continuation: "Continuation",
  range: "Range",
}

export type ChartismeGlossarySide = "courbes" | "figures"

export type ChartismeGlossaryEntry = {
  id: string
  side: ChartismeGlossarySide
  group: string
  groupLabel: string
  label: string
  text: string
  signal?: string
  target?: string
}

type CurveId =
  | (typeof PLAIN_VARIABLES)[number]
  | (typeof BALL_VARIABLES)[number]
  | (typeof STAR_VARIABLES)[number]

const CURVE_GROUP_LABELS = {
  libres: "Variables libres",
  rangs: "Rangs n1–n5",
  ecarts: "Écarts g1–g4",
  etoiles: "Étoiles",
  presences: "Retard et présence",
} as const

type CurveGroupId = keyof typeof CURVE_GROUP_LABELS

const CURVE_GROUP: Record<CurveId, CurveGroupId> = {
  sum: "libres",
  spread: "libres",
  parity: "libres",
  high_low: "libres",
  consecutive: "libres",
  centroid: "libres",
  n1: "rangs",
  n2: "rangs",
  n3: "rangs",
  n4: "rangs",
  n5: "rangs",
  g1: "ecarts",
  g2: "ecarts",
  g3: "ecarts",
  g4: "ecarts",
  star_sum: "etoiles",
  e1: "etoiles",
  e2: "etoiles",
  delay: "presences",
  hit: "presences",
  star_delay: "presences",
  star_hit: "presences",
}

const CURVE_CONTEXT: Record<CurveId, string> = {
  sum: "Somme des cinq numéros, autour de 130. Pas de plancher serré : une cassure y a de la place, contrairement à n1 ou n5.",
  spread:
    "Plus grand numéro moins le plus petit. Une hausse ouvre la grille, une baisse la resserre. Ce n’est pas un cours.",
  parity:
    "Nombre de pairs parmi les cinq, de 0 à 5. La série est en marches : un sommet est un palier, pas un pic.",
  high_low:
    "Combien de numéros valent au moins 26. Même lecture en paliers que la parité : occupation du haut de grille.",
  consecutive:
    "Paires qui se suivent, comme 12 puis 13. Valeurs rares, souvent un plateau de zéros. Les figures continues s’y forment sur peu de niveaux.",
  centroid: "Moyenne des cinq numéros, le centre de la grille. Elle bouge moins que n1 ou n5 pris seuls.",
  n1: "Plus petit numéro du tirage. Il vit contre le plancher 1 : une baisse a peu de marge, une hausse éloigne le tirage du bord.",
  n2: "Deuxième numéro une fois le tirage trié. Lié à n1 et n3 par construction : une figure ici se retrouve en partie sur les rangs voisins.",
  n3: "Numéro du milieu, une fois trié. Le plus éloigné des bords 1 et 50, donc le rang où une cassure a le plus de place.",
  n4: "Quatrième numéro trié. Comme n2, une partie du mouvement est déjà dans les rangs d’à côté.",
  n5: "Plus grand numéro. Il vit contre le plafond 50 : une hausse bute vite, une baisse ramène le tirage vers le centre.",
  g1: "Écart entre le 2ᵉ et le 1er numéro. Dit si le bas de grille est collé. Un canal ici est un espacement stable, pas un niveau.",
  g2: "Écart n3 − n2. Découpe le milieu-bas de l’étendue. Les quatre écarts, additionnés, retrouvent max − min.",
  g3: "Écart n4 − n3. Même lecture que g2, un cran plus haut dans la grille triée.",
  g4: "Écart entre le plus grand et le 4ᵉ. Un élargissement éloigne n5 de n4 ; ce n’est pas une hausse de n5 seul.",
  star_sum: "Somme des deux étoiles, de 2 à 24. Même rôle que la somme des numéros, sur le pool 1–12.",
  e1: "Plus petite étoile. Plancher 1, et un plafond pratique bien plus bas que celui de n1.",
  e2: "Plus grande étoile, plafonnée à 12. Une cassure n’y a pas la marge de n5.",
  delay:
    "Retard d’une boule : dent de scie qui retombe à chaque sortie. Une cassure est souvent la sortie elle-même. Les 50 boules partagent cette forme.",
  hit: "Présence d’une boule, 0 ou 1. Impulsions. Tête-épaules et biseaux s’y lisent mal : la série n’a que deux niveaux.",
  star_delay: "Même dent de scie que le retard d’une boule, sur chacune des 12 étoiles.",
  star_hit:
    "Présence d’une étoile, 0 ou 1. Même limite que la présence d’une boule : deux niveaux, pas une courbe continue.",
}

const FIGURE_CONTEXT: Record<Exclude<FigureId, "none">, string> = {
  ete: "Trois sommets, celui du milieu plus haut, posés sur une ligne de cou. La figure se confirme quand le tracé casse cette ligne vers le bas.",
  ete_inv:
    "Miroir de la tête et épaules : la tête est le creux le plus bas. La confirmation est une cassure de la ligne de cou vers le haut.",
  double_top:
    "Deux sommets à hauteur voisine, séparés par un creux. Le signal est la perte de ce support intermédiaire.",
  triple_top:
    "Trois sommets alignés, deux creux entre eux. Même signal que le double sommet : le support qui les relie cède.",
  double_bottom:
    "Deux creux à hauteur voisine. Le signal est le passage au-dessus de la résistance qui les sépare.",
  triple_bottom:
    "Trois creux alignés. La confirmation reste la cassure de la résistance intermédiaire, vers le haut.",
  wedge_rising:
    "Deux bornes qui montent et se resserrent. Le tracé fatigue vers le haut ; le signal est la sortie sous la borne basse.",
  wedge_falling:
    "Deux bornes qui descendent et se resserrent. Le signal est la sortie au-dessus de la borne haute.",
  triangle_sym:
    "Une borne descend, l’autre monte : le tracé se comprime. La sortie peut se faire d’un côté ou de l’autre.",
  triangle_asc: "Résistance plate, support qui monte. La lecture d’école attend la cassure de cette résistance.",
  triangle_desc: "Support plat, résistance qui descend. La lecture d’école attend la perte de ce support.",
  rectangle:
    "Deux horizontales. Le tracé tient entre un support et une résistance plats — pas un simple zigzag.",
  flag: "Mât raide, puis un petit canal contre ce mât. La sortie se lit dans le sens du mât, pas dans celui du drapeau.",
  pennant: "Même mât que le drapeau, mais le repos est un petit triangle. La sortie se lit encore dans le sens du mât.",
  cup_handle: "Creux arrondi en U, puis une petite anse sous la lèvre. Le signal est la cassure de cette lèvre.",
  diamond:
    "Élargissement puis resserrement : les bornes dessinent un losange. La sortie peut casser l’une ou l’autre.",
  broadening_top:
    "Les bornes s’écartent, sommets plus hauts et creux plus bas. Le signal d’école est la perte du dernier creux.",
  canal:
    "Deux droites parallèles. Haussier ou baissier qualifie la pente : ce n’est pas une autre figure. Le signal est la sortie d’une borne.",
}

const GROUP_ORDER = [
  "libres",
  "rangs",
  "ecarts",
  "etoiles",
  "presences",
  "reversal_down",
  "reversal_up",
  "continuation",
  "range",
] as const

function curveEntries(): ChartismeGlossaryEntry[] {
  const ids = [...PLAIN_VARIABLES, ...BALL_VARIABLES, ...STAR_VARIABLES] as CurveId[]
  return ids.map((id) => {
    const group = CURVE_GROUP[id]
    return {
      id,
      side: "courbes",
      group,
      groupLabel: CURVE_GROUP_LABELS[group],
      label: VARIABLE_LABELS[id] ?? id,
      text: CURVE_CONTEXT[id],
    }
  })
}

function figureEntries(): ChartismeGlossaryEntry[] {
  return FIGURE_IDS.filter((id): id is Exclude<FigureId, "none"> => id !== "none").map((id) => {
    const kind = FIGURE_KINDS[id]
    return {
      id,
      side: "figures",
      group: kind,
      groupLabel: FIGURE_KIND_LABELS[kind],
      label: FIGURE_LABELS[id],
      text: FIGURE_CONTEXT[id],
      signal: signalOf(id),
      target: targetBasis(id),
    }
  })
}

/** Courbes d’abord, dans l’ordre des familles, puis les figures dans l’ordre de la table. */
export function chartismeGlossary(): ChartismeGlossaryEntry[] {
  return [...curveEntries(), ...figureEntries()]
}

export function filterChartismeGlossary(
  query: string,
  side: "all" | ChartismeGlossarySide = "all",
  entries: readonly ChartismeGlossaryEntry[] = chartismeGlossary()
) {
  const needle = foldGlossaryQuery(query).trim()
  return entries.filter((entry) => {
    if (side !== "all" && entry.side !== side) return false
    if (!needle) return true
    const hay = foldGlossaryQuery(
      [entry.id, entry.label, entry.text, entry.groupLabel, entry.signal, entry.target]
        .filter(Boolean)
        .join(" ")
    )
    return hay.includes(needle)
  })
}

export function groupedChartismeGlossary(entries: readonly ChartismeGlossaryEntry[]) {
  const by = new Map<string, { id: string; label: string; entries: ChartismeGlossaryEntry[] }>()
  for (const entry of entries) {
    const found = by.get(entry.group)
    if (found) found.entries.push(entry)
    else by.set(entry.group, { id: entry.group, label: entry.groupLabel, entries: [entry] })
  }
  const rank = new Map<string, number>(GROUP_ORDER.map((id, index) => [id, index]))
  return [...by.values()].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99))
}
