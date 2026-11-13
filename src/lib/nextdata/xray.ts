/** Rayons X : choisir la trace affichée, et la mettre en lignes. */

import { visibleTrainingShift } from "@/lib/nextdata/training-progress"

export type XrayCheck = {
  id: string
  ok: boolean
  detail: string
}

export type XrayBand = { lo: number; mid: number; hi: number }

export type XrayNeighbor = {
  numbers: number[]
  stars: number[]
  score: number
  distance?: number | null
  frequency?: number | null
  couples?: number | null
  triples?: number | null
  pulse?: number | null
}

export type Xray = {
  cadre: {
    rows: number
    focus: number
    focus_requested: number
    focus_start: number
    years: string[]
    years_present: string[]
    weekday: string
    date: string
    star_pool: number
    t: number
    previous_date: string | null
  }
  reglage: {
    families: string[]
    block: string | null
    block_requested: string | null
    block_family: string | null
    excluded: string[]
    estimators: number
    chronos: boolean
    persist: { radius: number; limit: number } | null
    mode: string
    library: string
  }
  pas: {
    parts: string[]
    engine: string
    error: string | null
    origin: Record<string, string>
    fingerprints: Record<string, string>
    assembly: string
    darts: string[]
  }
  matrice: {
    lags: number
    past: number
    loss_rows: number
    weight_3: number
    weight_1: number
    columns: Record<string, { past: number; future: number }>
  }
  quantiles: Record<string, XrayBand>
  chronos: {
    applies: boolean
    available: boolean
    weights: Record<string, number>
    window: number
    window_of: number
    half: boolean
    holdout_mae_lgb: number | null
    holdout_mae_chronos: number | null
    medians: Record<string, number>
    targets: Record<string, string>
    window_t: number[]
    scored_t: number
  }
  arbitrage: {
    ranks: {
      rank: string
      chain: number | null
      level: number | null
      delta: number | null
      weights: { chain?: number; level?: number; delta?: number }
      clipped: number | null
      grid: number | null
    }[]
    gaps: { name: string; blend: number | null; clipped: number | null; lo: number | null; hi: number | null; hit: boolean }[]
  } | null
  projection: {
    raw: number[]
    ordered: number[]
    after_sum: number[]
    after_spread: number[]
    center: { numbers: number[]; stars: number[] }
    stars_raw: number[]
    stars_ordered: number[]
    stars_after_sum: number[]
    neighbors: XrayNeighbor[]
    valid: boolean
  }
  calibrage: {
    steps: number
    need: number
    calibrated: boolean
    history_t: number[]
    edges: Record<string, { down?: number; up?: number }>
    fields: Record<string, { raw: XrayBand; moved: XrayBand | null; down: number | null; up: number | null }>
  }
  persist: {
    on: boolean
    radius: number | null
    limit: number | null
    swaps: { kind?: string; from?: number; to?: number; lag?: number; distance?: number }[]
    held: { numbers: number; stars: number } | null
    numbers: number[]
    stars: number[]
    source_numbers: number[]
    source_stars: number[]
  }
  controles: XrayCheck[]
}

export type XrayCard = {
  id: string
  title: string
  event: string
  rule: string
}

export const XRAY_CARDS: XrayCard[] = [
  {
    id: "cadre",
    title: "Cadre",
    event: "Archive filtrée",
    rule: "Le jour et les années coupent l’archive. Le focus est la queue de ce cadre.",
  },
  {
    id: "reglage",
    title: "Réglage",
    event: "Boutons",
    rule: "Les familles cochées entrent dans LightGBM, CatBoost et Chronos. Un bloc ne retire ses colonnes que si sa famille est cochée.",
  },
  {
    id: "pas",
    title: "Pas",
    event: "Morceaux du cache",
    rule: "Un pas s’ajuste sur les seuls tirages d’avant. Le cache garde les morceaux. L’assemblage se refait à chaque lecture.",
  },
  {
    id: "matrice",
    title: "Matrice",
    event: "Lignes de perte",
    rule: "Les lignes de perte et leurs poids se déduisent du cadre, sans réajuster les arbres.",
  },
  {
    id: "quantiles",
    title: "Quantiles",
    event: "Bandes du modèle",
    rule: "Bandes 10–90 après Darts, s’il a remplacé une médiane, et avant le mélange Chronos.",
  },
  {
    id: "chronos",
    title: "Chronos",
    event: "Mélange",
    rule: "L’étage 1 mélange seulement la somme et la somme des étoiles. n1 n’y entre pas. CatBoost reste seul. Une lecture demandée qui n’a rien donné à l’étage 1 est signalée.",
  },
  {
    id: "arbitrage",
    title: "Arbitrage",
    event: "Centre de chaque rang",
    rule: "Le centre mélange le niveau et le delta. La chaîne ne pèse que si ces deux prévisions manquent. Un écart qui sort de sa bande est ramené au bord.",
  },
  {
    id: "projection",
    title: "Projection",
    event: "Grille entière",
    rule: "La chaîne devient des entiers croissants, puis la somme et l’étendue rapprochent la grille. Le faisceau garde le voisin au meilleur score.",
  },
  {
    id: "calibrage",
    title: "Calibrage",
    event: "Bandes déplacées",
    rule: "Le bord se déplace du manque de rang 0,9 sur les pas d’avant. Sous neuf pas, la bande reste brute.",
  },
  {
    id: "persist",
    title: "Persist",
    event: "Échanges après la grille",
    rule: "Une boule prévue dans le rayon de n−1 ou n−2 cède sa place, jusqu’à la limite. Celles déjà tenues comptent.",
  },
]

type ShiftLike = {
  x: number
  readings: Record<string, { xray?: Xray | null } | undefined>
}

/** L’interrupteur éteint ne montre rien. */
export function shownXray<T>(on: boolean, xray: T | null | undefined): T | null {
  return on && xray != null ? xray : null
}

/** La trace du décalage affiché, le même que la figure des rangs. */
export function trainingXray(shifts: ShiftLike[], pinned: number | null, reading: string): Xray | null {
  const shift = visibleTrainingShift(shifts, pinned)
  return shift?.readings[reading]?.xray ?? null
}

/** Premier écart, dans l’ordre des opérations. */
export function headEcart(xray: Xray | null | undefined): string | null {
  return xray?.controles.find((item) => !item.ok)?.detail ?? null
}

export function checksFor(xray: Xray, id: string): XrayCheck[] {
  return xray.controles.filter((item) => item.id === id || item.id.startsWith(`${id}.`))
}

function num(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  const text = Object.is(value, -0) ? "0" : String(value)
  return text.replace(".", ",")
}

function grid(numbers: number[], stars: number[]): string {
  return `${numbers.join(" ")} ★ ${stars.join(" ")}`
}

function band(value: XrayBand): string {
  return `${num(value.lo)} – ${num(value.mid)} – ${num(value.hi)}`
}

export function xrayLines(xray: Xray, id: string): string[] {
  if (id === "cadre") {
    const cadre = xray.cadre
    return [
      `${cadre.rows} tirages · focus ${cadre.focus} · demandé ${cadre.focus_requested} · départ ${cadre.focus_start}`,
      `années ${cadre.years.join(" ") || "—"} · présentes ${cadre.years_present.join(" ") || "—"}`,
      `${cadre.weekday} · t ${cadre.t} · ${cadre.date} · urne ${cadre.star_pool}`,
      `tirage d’avant ${cadre.previous_date ?? "—"}`,
    ]
  }
  if (id === "reglage") {
    const reglage = xray.reglage
    const persist = reglage.persist ? `±${reglage.persist.radius}, ${reglage.persist.limit} numéros` : "éteint"
    return [
      `${reglage.library} · ${reglage.mode} · ${reglage.estimators} arbres`,
      `familles ${reglage.families.join(", ") || "—"}`,
      reglage.block ? `bloc ${reglage.block} · ${reglage.excluded.length} colonnes retirées` : "aucun bloc",
      `Chronos ${reglage.chronos ? "demandé" : "éteint"} · Persist ${persist}`,
    ]
  }
  if (id === "pas") {
    const pas = xray.pas
    const parts = pas.parts.map((part) => {
      const origin = pas.origin[part] ?? "—"
      const print = pas.fingerprints[part] ? ` ${pas.fingerprints[part]}` : ""
      return `${part} ${origin}${print}`
    })
    return [
      parts.join(" · ") || "aucun morceau",
      `moteur ${pas.engine} · assemblage ${pas.assembly}`,
      pas.darts.length ? `Darts : ${pas.darts.join(", ")}` : "Darts : aucune médiane remplacée",
      pas.error ? `erreur ${pas.error}` : "pas d’erreur de morceau",
    ]
  }
  if (id === "matrice") {
    const matrice = xray.matrice
    const columns = Object.entries(matrice.columns).map(
      ([family, count]) => `${family} ${count.past} passées, ${count.future} futures`
    )
    return [
      `${matrice.lags} décalages · ${matrice.past} lus dans le passé`,
      `${matrice.loss_rows} lignes de perte · poids ×3 : ${matrice.weight_3} · poids ×1 : ${matrice.weight_1}`,
      columns.join(" · ") || "aucune colonne de famille",
    ]
  }
  if (id === "quantiles") {
    return Object.entries(xray.quantiles).map(([name, value]) => `${name} ${band(value)}`)
  }
  if (id === "chronos") {
    const chronos = xray.chronos
    if (!chronos.applies) {
      return [xray.reglage.library === "catboost" ? "CatBoost n’est pas mélangé." : "Chronos n’est pas demandé."]
    }
    const weights = Object.entries(chronos.weights).map(([name, weight]) => `${name} ${num(weight)}`)
    const medians = Object.entries(chronos.medians).map(([name, value]) => `${name} ${num(value)}`)
    const targets = Object.entries(chronos.targets).map(([name, target]) => `${name} → ${target}`)
    return [
      `fenêtre ${chronos.window} sur ${chronos.window_of}${chronos.half ? " · moitié-moitié" : ""}`,
      weights.length ? `poids LightGBM ${weights.join(", ")}` : "pas de poids",
      medians.length ? `médianes Chronos ${medians.join(", ")}` : "pas de médiane Chronos",
      targets.join(" · "),
      `MAE d’avant LightGBM ${num(chronos.holdout_mae_lgb)} · Chronos ${num(chronos.holdout_mae_chronos)}`,
    ]
  }
  if (id === "arbitrage") {
    if (!xray.arbitrage) return ["Pas de niveau ni de delta."]
    const ranks = xray.arbitrage.ranks.map((rank) => {
      const weights = rank.weights
      return `${rank.rank} chaîne ${num(rank.chain)} · niveau ${num(rank.level)} · delta ${num(rank.delta)} · poids ${num(weights.chain)} / ${num(weights.level)} / ${num(weights.delta)} · tenu ${num(rank.clipped)} · grille ${num(rank.grid)}`
    })
    const gaps = xray.arbitrage.gaps.map(
      (gap) => `${gap.name} ${num(gap.blend)} → ${num(gap.clipped)} · bande ${num(gap.lo)}–${num(gap.hi)}${gap.hit ? " · bord" : ""}`
    )
    return [...ranks, ...gaps]
  }
  if (id === "projection") {
    const projection = xray.projection
    const path = [
      `brut ${projection.raw.map(num).join(" ")}`,
      `ordre ${projection.ordered.join(" ")}`,
      `après somme ${projection.after_sum.join(" ")}`,
      `après étendue ${projection.after_spread.join(" ")}`,
      `centre ${grid(projection.center.numbers, projection.center.stars)}`,
      `étoiles brut ${projection.stars_raw.map(num).join(" ")} · ordre ${projection.stars_ordered.join(" ")} · après somme ${projection.stars_after_sum.join(" ")}`,
    ]
    const neighbors = projection.neighbors.map(
      (item, index) =>
        `${index === 0 ? "retenu" : `voisin ${index}`} ${grid(item.numbers, item.stars)} · score ${num(item.score)} · distance ${num(item.distance)} · fréquence ${num(item.frequency)} · couples ${num(item.couples)} · triples ${num(item.triples)} · Pulse ${num(item.pulse)}`
    )
    return [...path, ...neighbors]
  }
  if (id === "calibrage") {
    const calibrage = xray.calibrage
    const head = calibrage.calibrated
      ? `bandes déplacées · ${calibrage.steps} pas d’avant`
      : `bande brute · ${calibrage.steps} pas d’avant, il en faut ${calibrage.need}`
    const fields = Object.entries(calibrage.fields).map(([name, field]) => {
      const move = field.moved ? ` → ${band(field.moved)}` : ""
      const edge = field.down != null || field.up != null ? ` · bas ${num(field.down)} haut ${num(field.up)}` : ""
      return `${name} ${band(field.raw)}${move}${edge}`
    })
    return [head, ...fields]
  }
  if (id === "persist") {
    const persist = xray.persist
    if (!persist.on) return ["Persist est éteint."]
    const swaps = persist.swaps.map(
      (swap) => `${swap.kind ?? "boule"} ${swap.from ?? "—"} → ${swap.to ?? "—"} · n−${swap.lag ?? "—"} · distance ${swap.distance ?? "—"}`
    )
    const held = persist.held ? `déjà tenus ${persist.held.numbers} numéros, ${persist.held.stars} étoile` : "rien de déjà tenu"
    return [
      `rayon ±${persist.radius} · limite ${persist.limit}`,
      `modèle ${grid(persist.source_numbers, persist.source_stars)}`,
      `Persist ${grid(persist.numbers, persist.stars)} · ${held}`,
      ...(swaps.length ? swaps : ["aucun échange"]),
    ]
  }
  return []
}
