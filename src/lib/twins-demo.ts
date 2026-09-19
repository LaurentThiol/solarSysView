import {
  DEFAULT_TWIN_K,
  FINGERPRINT_AXES,
  buildFingerprintIndex,
  type FingerprintAxis,
  type FingerprintDraw,
} from "./fingerprints.ts"

/** Masque pédagogique : trois axes nommés, comme un croisement Brain @sum + @spread + @parity. */
export const DEMO_MASK_AXES: FingerprintAxis[] = ["sum", "spread", "parity"]

export const TWINS_DEMO_STEPS = [
  {
    id: "window",
    label: "Fenêtre",
    hint: "Le même jeu que le reste d’Analyse",
    target: "twins-window",
    title: "La fenêtre, c’est l’index",
    body: "Jumeaux ne charge pas toute l’archive : il portraitise uniquement les tirages de cette fenêtre. Changez le preset plus haut, l’index et les voisins suivent. Les tirages restent indépendants — on décrit l’archive, on ne prévoit pas le prochain 5+2.",
  },
  {
    id: "axes",
    label: "Axes",
    hint: "18 variables, hors delay / hit",
    target: "twins-axes",
    title: "Un portrait, pas une boule",
    body: "Chaque puce est une variable d’Analyse. Delay et hit restent dehors : ce n’est pas un attribut du tirage, c’est l’histoire d’une boule. « Tous » remet le portrait complet. Les couleurs de la heatmap sont des z-scores vs la moyenne de cette fenêtre.",
  },
  {
    id: "mask",
    label: "Masque",
    hint: "Somme × étendue × parité",
    target: "twins-axes",
    title: "Croiser, c’est nommer les colonnes",
    body: "La démo ne garde que somme, étendue et parité. Les 8 voisins se recalculent sur ces trois axes seulement — le même geste qu’épingler @sum + @spread + @parity dans Brain. Les filtres Jeux imposent des bornes ; ici on demande des jumeaux.",
  },
  {
    id: "heatmap",
    label: "Heatmap",
    hint: "Clic d’une ligne = query",
    target: "twins-heatmap",
    title: "L’index, vu de face",
    body: "Une ligne = un tirage, une colonne = un axe coché. Bleu = sous la moyenne de fenêtre, ambre = au-dessus. La démo a choisi un tirage qui n’est pas le dernier : c’est maintenant la query. Cliquez une autre date pour changer de portrait.",
  },
  {
    id: "twins",
    label: "Voisins",
    hint: "k = 8, deltas en unités Analyse",
    target: "twins-list",
    title: "Huit plus proches",
    body: "Cosinus sur les z-scores du masque. Le score dit « même forme », les puces disent où ça colle (parity 0) ou décroche (sum −2). Un clic overlay le radar. Ce n’est pas P(prochain tirage).",
  },
  {
    id: "analogs",
    label: "Brain",
    hint: "Même index, handle @analogs",
    target: "twins-radar",
    title: "Le même geste dans Brain",
    body: "Épingler @analogs (alias @jumeaux) injecte ces voisins dans la table, params + delta, sans passer par nomic. « Ouvrir » sur la fiche ramène ici. Le LLM lit des cas concrets, pas une prédiction.",
  },
] as const

export type TwinsDemoStepId = (typeof TWINS_DEMO_STEPS)[number]["id"]
export type TwinsDemoStep = (typeof TWINS_DEMO_STEPS)[number]

export function twinsDemoStepOf(id: TwinsDemoStepId): TwinsDemoStep {
  const step = TWINS_DEMO_STEPS.find((item) => item.id === id)
  if (!step) throw new Error(`étape de démo Jumeaux inconnue: ${id}`)
  return step
}

export function twinsDemoWantsStart(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const value = (params.get("demo") ?? "").trim().toLowerCase()
  return (
    value === "1" ||
    value === "true" ||
    value === "oui" ||
    value === "jumeaux" ||
    value === "twins"
  )
}

export function demoQueryDate(draws: readonly FingerprintDraw[]): string | null {
  const ordered = [...draws].map((draw) => draw.date).sort((a, b) => a.localeCompare(b))
  if (ordered.length >= 2) return ordered[ordered.length - 2] ?? null
  return ordered.at(-1) ?? null
}

export function demoTwinPreview(draws: readonly FingerprintDraw[]) {
  const queryDate = demoQueryDate(draws)
  return buildFingerprintIndex(draws, {
    axes: DEMO_MASK_AXES,
    queryDate,
    k: DEFAULT_TWIN_K,
  })
}

export function isDemoMask(axes: readonly string[]) {
  return axes.length === DEMO_MASK_AXES.length && DEMO_MASK_AXES.every((axis) => axes.includes(axis))
}

export function scrollTwinsDemoTarget(target: string) {
  if (typeof document === "undefined") return
  document.querySelector(`[data-demo="${target}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })
}

export const TWINS_DEMO_ALL_AXES: FingerprintAxis[] = [...FINGERPRINT_AXES]
