import { specialistCatalogEntry, specialistEntries } from "@/lib/brain/specialists"
import { VARIABLE_LABELS, VARIABLE_NAMES, type VariableName } from "@/lib/analysis"
import { FIGURE_IDS, FIGURE_LABELS, canonicalFigure, type FigureId } from "@/lib/chartisme/catalog"
import { MOTIF_IDS, MOTIF_LABELS } from "@/lib/morpho/lexicon"

export type BrainLab = "analyse" | "chartisme" | "harmo" | "morpho" | "combinaisons" | "specialist"

export type CatalogKind = "indicator" | "variable" | "figure" | "spectrum" | "motif" | "grid" | "specialist" | "analog" | "tree"

export type CatalogEntry = {
  id: string
  handle: string
  aliases: string[]
  lab: BrainLab
  family: string
  kind: CatalogKind
  label: string
  units: string
  reading: string
  defaults: {
    variable?: VariableName
    period?: number
  }
}

export type NamedPack = {
  id: string
  label: string
  handles: string[]
}

const ANALYSE_INDICATORS: Array<Omit<CatalogEntry, "lab" | "kind" | "id">> = [
  {
    handle: "rsi",
    aliases: ["rsi14"],
    family: "momentum",
    label: "RSI",
    units: "0–100",
    reading: "Oscillateur de la série choisie. 70 / 30 sont des zones, pas un signal de tirage.",
    defaults: { period: 14 },
  },
  {
    handle: "macd",
    aliases: [],
    family: "momentum",
    label: "MACD",
    units: "ligne / signal / hist.",
    reading: "Écart d’EMA sur la série. Décrit la pente récente, pas le prochain tirage.",
    defaults: { period: 12 },
  },
  {
    handle: "adx",
    aliases: ["dmi"],
    family: "tendance",
    label: "ADX / DMI",
    units: "0–100",
    reading: "Force de tendance de la série. Sous 20 : régime de range pédagogique.",
    defaults: { period: 14 },
  },
  {
    handle: "stoch",
    aliases: ["stochastique", "stochk"],
    family: "momentum",
    label: "Stochastique %K",
    units: "0–100",
    reading: "Position dans la fourchette récente de la série.",
    defaults: { period: 14 },
  },
  {
    handle: "cci",
    aliases: [],
    family: "momentum",
    label: "CCI",
    units: "sans dimension",
    reading: "Écart à la moyenne typique. Extrêmes ±100 / ±200.",
    defaults: { period: 20 },
  },
  {
    handle: "williams",
    aliases: ["willr", "wr"],
    family: "momentum",
    label: "Williams %R",
    units: "−100–0",
    reading: "Oscillateur miroir du stochastique.",
    defaults: { period: 14 },
  },
  {
    handle: "atr",
    aliases: [],
    family: "volatilite",
    label: "ATR",
    units: "unité de la série",
    reading: "Étendue moyenne. Pas un volume de marché.",
    defaults: { period: 14 },
  },
  {
    handle: "bollinger",
    aliases: ["bb", "percentb"],
    family: "volatilite",
    label: "Bollinger",
    units: "%B",
    reading: "%B > 1 ou < 0 = extrêmes de la fenêtre, pas une cassure de hasard.",
    defaults: { period: 20 },
  },
  {
    handle: "keltner",
    aliases: ["kc"],
    family: "volatilite",
    label: "Keltner",
    units: "bande",
    reading: "Canal d’ATR. Un squeeze = Bollinger ⊂ Keltner.",
    defaults: { period: 20 },
  },
  {
    handle: "donchian",
    aliases: ["dc"],
    family: "volatilite",
    label: "Donchian",
    units: "plus haut / plus bas",
    reading: "Canal des extrêmes. Turtle pédagogique.",
    defaults: { period: 20 },
  },
  {
    handle: "ichimoku",
    aliases: ["kumo"],
    family: "niveaux",
    label: "Ichimoku",
    units: "tenkan / kijun / kumo",
    reading: "Chikou est affiché, ce n’est pas un signal temps réel.",
    defaults: { period: 9 },
  },
  {
    handle: "supertrend",
    aliases: ["st"],
    family: "tendance",
    label: "Supertrend",
    units: "direction",
    reading: "Suivi de tendance ATR. Confirme, n’anticipe pas.",
    defaults: { period: 10 },
  },
  {
    handle: "psar",
    aliases: ["sar"],
    family: "tendance",
    label: "Parabolic SAR",
    units: "points",
    reading: "Points de retournement pédagogiques sur la série.",
    defaults: {},
  },
  {
    handle: "mfi",
    aliases: [],
    family: "flux",
    label: "MFI",
    units: "0–100",
    reading: "Money flow sur l’activité-proxy, pas un carnet d’ordres.",
    defaults: { period: 14 },
  },
  {
    handle: "vwap",
    aliases: [],
    family: "flux",
    label: "VWAP",
    units: "unité de la série",
    reading: "Recalé sur la fenêtre de travail.",
    defaults: {},
  },
  {
    handle: "squeeze",
    aliases: [],
    family: "volatilite",
    label: "Squeeze",
    units: "booléen",
    reading: "Bollinger à l’intérieur de Keltner. Compression, pas un départ.",
    defaults: {},
  },
  {
    handle: "wma",
    aliases: [],
    family: "moyennes",
    label: "WMA",
    units: "unité de la série",
    reading: "Moyenne pondérée. Confirme la pente.",
    defaults: { period: 20 },
  },
  {
    handle: "hma",
    aliases: [],
    family: "moyennes",
    label: "HMA",
    units: "unité de la série",
    reading: "Hull moving average de la série.",
    defaults: { period: 20 },
  },
]

function analyseIndicators(): CatalogEntry[] {
  return ANALYSE_INDICATORS.map((item) => ({
    ...item,
    id: `analyse/${item.handle}`,
    lab: "analyse",
    kind: "indicator",
    defaults: { variable: "sum", period: item.defaults.period },
  }))
}

function analyseAnalogs(): CatalogEntry[] {
  return [
    {
      id: "analyse/analogs",
      handle: "analogs",
      aliases: ["jumeaux", "twins", "analog"],
      lab: "analyse",
      family: "jumeaux",
      kind: "analog",
      label: "Jumeaux",
      units: "cosinus · z-score",
      reading:
        "Tirages proches dans l’espace des variables Analyse (somme, étendue, parité…). Ressemblance d’archive, pas un pronostic.",
      defaults: { variable: "sum" },
    },
  ]
}

function analyseVariables(): CatalogEntry[] {
  return VARIABLE_NAMES.map((name) => ({
    id: `analyse/var/${name}`,
    handle: name,
    aliases: [],
    lab: "analyse" as const,
    family: "variable",
    kind: "variable" as const,
    label: VARIABLE_LABELS[name],
    units: "unité de la série",
    reading: "Série scalaire dérivée des tirages. Ce n’est pas un prix de marché.",
    defaults: { variable: name },
  }))
}

const FIGURE_ALIASES: Partial<Record<FigureId, string[]>> = {
  ete: ["hs", "tete", "tete-epaules"],
  ete_inv: ["hsi", "eteinv"],
  double_top: ["dt"],
  double_bottom: ["db"],
  triple_top: ["tt"],
  triple_bottom: ["tb"],
  canal: ["channel", "tunel", "tunnel", "tunnel_droit"],
  rectangle: ["range", "canal-plat", "canalplat"],
}

function figureReading(id: FigureId) {
  if (id === "canal") {
    return "Canal à deux rails. Haussier / baissier = pente des bornes, pas une figure à part. La cassure reste la règle d’or (activité > MM20 et tenue)."
  }
  if (id === "rectangle") {
    return "Canal plat : deux horizontales autour de la série, pas un zigzag de range. Alias : range, canal plat."
  }
  return "Lecture géométrique. Une cassure n’est retenue que si l’activité dépasse sa MM20 et si la clôture confirme."
}

function chartismeFigures(): CatalogEntry[] {
  return FIGURE_IDS.filter((id) => id !== "none").map((id) => ({
    id: `chartisme/${id}`,
    handle: id,
    aliases: FIGURE_ALIASES[id] ?? [],
    lab: "chartisme" as const,
    family: "figure",
    kind: "figure" as const,
    label: FIGURE_LABELS[id],
    units: "confiance géométrique",
    reading: figureReading(id),
    defaults: { variable: "sum" },
  }))
}

const HARMO: Array<Pick<CatalogEntry, "handle" | "aliases" | "label" | "reading" | "family">> = [
  {
    handle: "fft",
    aliases: ["spectre"],
    family: "tf",
    label: "FFT",
    reading: "Pics en cycles/tirage, pas des hertz. Méfie-toi de Nyquist et des fenêtres courtes.",
  },
  {
    handle: "welch",
    aliases: [],
    family: "tf",
    label: "Welch",
    reading: "Densité spectrale lissée. Unités cycles/tirage.",
  },
  {
    handle: "stft",
    aliases: ["tf"],
    family: "tf",
    label: "STFT",
    reading: "Spectrogramme. Une raie qui dérive n’est pas une prédiction.",
  },
  {
    handle: "ridges",
    aliases: ["ridge"],
    family: "tf",
    label: "Ridges",
    reading: "Crêtes temps-fréquence. Unités cycles/tirage.",
  },
  {
    handle: "comb",
    aliases: ["thd"],
    family: "acoustique",
    label: "Peigne / THD",
    reading: "Harmoniques d’un fondamental observé. Pas une mécanique du hasard.",
  },
]

function harmoEntries(): CatalogEntry[] {
  return HARMO.map((item) => ({
    ...item,
    id: `harmo/${item.handle}`,
    lab: "harmo" as const,
    kind: "spectrum" as const,
    units: "cycles/tirage",
    defaults: { variable: "sum" as VariableName },
  }))
}

function morphoMotifs(): CatalogEntry[] {
  return MOTIF_IDS.map((id) => ({
    id: `morpho/${id}`,
    handle: id,
    aliases: [],
    lab: "morpho" as const,
    family: "motif",
    kind: "motif" as const,
    label: MOTIF_LABELS[id],
    units: "présent / absent",
    reading: "Forme du glyphe 5×10. Description géométrique, pas une anticipation.",
    defaults: {},
  }))
}

function combinaisonsEntries(): CatalogEntry[] {
  return [
    {
      id: "combinaisons/score",
      handle: "score",
      aliases: ["pwin"],
      lab: "combinaisons",
      family: "grille",
      kind: "grid",
      label: "Score de grille",
      units: "loi + P̂ empirique",
      reading: "Loi officielle identique pour toute grille 5+2 ; P̂ = part des tirages où elle aurait été payée. Ce n’est pas P(prochain tirage).",
      defaults: {},
    },
    {
      id: "combinaisons/retard",
      handle: "retard",
      aliases: ["retards"],
      lab: "combinaisons",
      family: "grille",
      kind: "grid",
      label: "Retards de grille",
      units: "tirages",
      reading: "Retard des boules et étoiles de la grille épinglée dans la fenêtre.",
      defaults: {},
    },
    {
      id: "combinaisons/totaux",
      handle: "totaux",
      aliases: ["totaux-grille", "sum-grille"],
      lab: "combinaisons",
      family: "grille",
      kind: "grid",
      label: "Totaux de grille",
      units: "somme / percentile",
      reading: "Somme et totaux de sorties. Aident à choisir, ne changent pas P(rang).",
      defaults: {},
    },
  ]
}

export const BRAIN_CATALOG: CatalogEntry[] = [
  ...analyseIndicators(),
  ...analyseAnalogs(),
  ...analyseVariables(),
  ...chartismeFigures(),
  ...harmoEntries(),
  ...morphoMotifs(),
  ...combinaisonsEntries(),
]

export const BRAIN_PACKS: NamedPack[] = [
  { id: "tour", label: "Tour des labs", handles: ["rsi", "ete", "fft", "cluster", "score"] },
  { id: "momentum", label: "Momentum", handles: ["rsi", "macd", "adx"] },
  { id: "volatilite", label: "Volatilité", handles: ["atr", "bollinger", "squeeze"] },
  { id: "figures", label: "Figures clés", handles: ["ete", "double_bottom", "triangle_sym"] },
  { id: "harmo", label: "Harmo", handles: ["fft", "welch", "comb"] },
]

export const BRAIN_LABS: BrainLab[] = ["analyse", "chartisme", "harmo", "morpho", "combinaisons", "specialist"]

export const BRAIN_LAB_LABELS: Record<BrainLab, string> = {
  analyse: "Analyse",
  chartisme: "Chartisme",
  harmo: "Harmo",
  morpho: "Morpho",
  combinaisons: "Combinaisons",
  specialist: "Spécialistes",
}

const BY_ID = new Map(BRAIN_CATALOG.map((entry) => [entry.id, entry]))

export function catalogEntry(id: string): CatalogEntry | undefined {
  const hit = BY_ID.get(id) ?? specialistCatalogEntry(id)
  if (hit) return hit
  if (id.startsWith("chartisme/")) {
    const figure = canonicalFigure(id.slice("chartisme/".length))
    return BY_ID.get(`chartisme/${figure}`)
  }
  return undefined
}

export function catalogByHandle(handle: string, activeLab?: BrainLab | null): CatalogEntry[] {
  const key = handle.trim().toLowerCase()
  if (!key) return []
  const catalog = [...BRAIN_CATALOG, ...specialistEntries()]
  const matches = catalog.filter(
    (entry) => entry.handle === key || entry.aliases.includes(key)
  )
  if (activeLab) {
    const scoped = matches.filter((entry) => entry.lab === activeLab)
    if (scoped.length) return scoped
  }
  return matches
}

export function resolveHandleEntry(
  handle: string,
  activeLab?: BrainLab | null
): { entry: CatalogEntry | null; ambiguous: CatalogEntry[] } {
  const matches = catalogByHandle(handle, activeLab)
  if (matches.length === 1) return { entry: matches[0], ambiguous: [] }
  if (matches.length > 1) return { entry: null, ambiguous: matches }
  return { entry: null, ambiguous: [] }
}

export function catalogCollisions(): Array<{ handle: string; ids: string[] }> {
  const buckets = new Map<string, CatalogEntry[]>()
  for (const entry of BRAIN_CATALOG) {
    const keys = [entry.handle, ...entry.aliases]
    for (const key of keys) {
      const list = buckets.get(key) ?? []
      list.push(entry)
      buckets.set(key, list)
    }
  }
  const out: Array<{ handle: string; ids: string[] }> = []
  for (const [handle, entries] of buckets) {
    const sameLab = new Map<string, string[]>()
    for (const entry of entries) {
      const ids = sameLab.get(entry.lab) ?? []
      ids.push(entry.id)
      sameLab.set(entry.lab, ids)
    }
    for (const ids of sameLab.values()) {
      if (new Set(ids).size > 1) out.push({ handle, ids: [...new Set(ids)] })
    }
  }
  return out
}
