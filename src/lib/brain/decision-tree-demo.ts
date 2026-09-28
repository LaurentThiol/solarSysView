export const DEMO_TREE_STEPS = [
  {
    id: "question",
    label: "Question",
    hint: "Flux, boules ou figures",
    target: "tree-question",
    title: "Question",
    body: "Le tableau est déjà là : une ligne est l’état juste avant le tirage t. Flux, boules ou figures changent ses colonnes et son étiquette. « Lire le flux » le fait couper par un arbre.",
  },
  {
    id: "lecture",
    label: "Lecture",
    hint: "Tableau, recherche, remaniements",
    target: "tree-progress",
    title: "Lecture",
    body: "La barre suit le calcul réel : le tableau du flux, la recherche de l'arbre, chaque remaniement, puis le dessin. Échap ou Annuler arrête.",
  },
  {
    id: "verdict",
    label: "Verdict",
    hint: "Le score réel contre l'ordre détruit",
    target: "tree-verdict",
    title: "Verdict",
    body: "La phrase dit si un seuil tient. L'histogramme montre les scores obtenus quand l'ordre des tirages est détruit. Le trait est le score réel.",
  },
  {
    id: "arbre",
    label: "Arbre",
    hint: "Le dessin et les feuilles",
    target: "tree-drawing",
    title: "Arbre",
    body: "Chaque coupure est un histogramme, avec le seuil en trait. À droite, les feuilles portent le même numéro que le dessin, et leur contrôle hors échantillon.",
  },
  {
    id: "suite",
    label: "Suite",
    hint: "Spécialiste, Jeux ou règle",
    target: "tree-next",
    title: "Suite",
    body: "Une seule action principale : entraîner le spécialiste, envoyer les chances vers Jeux, ou préparer une règle chartiste. Rien n'est écrit en silence.",
  },
] as const

export type DecisionTreeDemoStepId = (typeof DEMO_TREE_STEPS)[number]["id"]

export const DEMO_TREE_READING = {
  ok: true,
  slug: "demo-flux",
  question: "shape",
  label: "sum_high",
  series: null as string | null,
  phrase: "la somme du tirage t est haute (≥ 140.00)",
  era: "current",
  weekday: null as string | null,
  beats_independence: true,
  verdict: "flux",
  verdict_text:
    "Le flux porte un seuil : 0.61 sur le contrôle, contre 0.50 en moyenne sur l'ordre détruit (p = 0,02).",
  p: 0.02,
  p_adjusted: 0.04,
  holdout_score: 0.61,
  null_mean: 0.5,
  null_scores: [0.48, 0.51, 0.47, 0.52, 0.49, 0.5, 0.46, 0.53, 0.5, 0.49],
  permutations: 10,
  criterion: "gini",
  max_depth: 2,
  min_samples_leaf: 20,
  train_n: 212,
  holdout_n: 48,
  class_names: ["somme basse", "somme haute"],
  feature_names: ["sum.step", "n1.last"],
  feature_labels: { "sum.step": "somme · pas", "n1.last": "n1 · dernière" },
  rules: [
    {
      node: 4,
      path: [
        { node: 0, feature: "sum.step", label: "somme · pas", sense: "gt", threshold: 18, text: "somme · pas > 18.00" },
      ],
      predicted: 1,
      class_name: "somme haute",
      train_n: 212,
      train_rate: 0.64,
      holdout_n: 48,
      holdout_rate: 0.58,
      weak: false,
      positive: true,
    },
    {
      node: 3,
      path: [
        { node: 0, feature: "sum.step", label: "somme · pas", sense: "le", threshold: 18, text: "somme · pas ≤ 18.00" },
        { node: 1, feature: "n1.last", label: "n1 · dernière", sense: "le", threshold: 12.4, text: "n1 · dernière ≤ 12.40" },
      ],
      predicted: 0,
      class_name: "somme basse",
      train_n: 80,
      train_rate: 0.55,
      holdout_n: 12,
      holdout_rate: 0.42,
      weak: true,
      positive: false,
    },
  ],
  drawing: "text",
  tree_text: "|--- somme · pas > 18.00\n|   |--- feuille 4\n|--- somme · pas ≤ 18.00\n    |--- feuille 3\n",
  tree_svg: null as string | null,
  case_svg: null as string | null,
  path_svg: null as string | null,
  case: {
    leaf: 4,
    predicted: 1,
    class_name: "somme haute",
    proba: [0.36, 0.64],
  },
  latest: { x: [20, 8], date: "2026-09-01" },
  ball_scores: [] as { ball: number; proba: number; leaf: number }[],
  drafts: [
    {
      name: "Somme · flux",
      target: "sum",
      task: "binary",
      horizon: "value",
      indicators: ["lag1"],
      instructions: "Arbre decisionTree sur le flux. SI somme · pas > 18.00 ALORS somme haute.",
      origin: "demo-flux",
      label_phrase: "la somme du tirage t est haute",
    },
  ],
  chartisme_rules: [] as Record<string, unknown>[],
  suggestions: [
    { question: "shape", label: "parity_high", text: "Changer la forme demandée" },
    { question: "series", series: "sum", text: "Lire seulement la somme" },
  ],
  specialists: [] as { slug: string; name: string; handle: string }[],
  draw_count: 400,
  created_at: "2026-09-01T12:00:00+00:00",
  threshold: 140,
  sense: "ge",
  label_cut: "learned",
  cut_text: "Coupe apprise : somme ≥ 140.00, choisie parmi 5 sur l'apprentissage.",
  cut_scores: [
    { threshold: 120, share: 0.7, cv_score: 0.52, chosen: false },
    { threshold: 140, share: 0.5, cv_score: 0.61, chosen: true },
  ],
  window_mode: "learned",
  indicators: ["last", "step", "slope", "z20"],
  windows: [
    {
      series: "sum",
      measure: "zscore",
      label: "somme · z-score",
      period: 13,
      default: 20,
      kept: "sum.zscore@13",
      changed: true,
      lag: 6,
      scores: [
        { period: 8, score: 0.02 },
        { period: 13, score: 0.11 },
        { period: 20, score: 0.04 },
      ],
    },
  ],
}

export function decisionTreeDemoWantsStart(search: string, pathname = "") {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const value = (params.get("demo") ?? "").trim().toLowerCase()
  const path = pathname.replace(/\/$/, "").toLowerCase()
  if (!path.includes("decision-tree")) return false
  return value === "1" || value === "true" || value === "oui" || value === "decisiontree"
}
