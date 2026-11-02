import type { BraveNote } from "./brave-filter"
import { CURVE_KEYS, curveValues, type RankPoint } from "./curves"
import { GOLDEN_RATIOS } from "./golden"
import {
  activeVersion,
  DAYS_MAX,
  DAYS_MIN,
  GESTURES,
  parseSkillParams,
  SPANS,
  WINDOW_MAX,
  WINDOW_MIN,
  type SkillParams,
} from "./skills"
import { formatCents, lectureWord, LECTURE_KEYS, type Lecture, type LectureWord, type RunnerMind } from "./thought"

/** Exemple JSON déjà valide, que le modèle peut recopier tel quel. */
export const SKILL_EXAMPLE = {
  action: "skill",
  name: "Somme lente",
  phrase: "Σn rejoint sa moyenne",
  query: "",
  curve: "sumNumbers",
  gesture: "moyenne",
  ratio: 0.618,
  span: "bande",
  window: 8,
  days: 60,
  lecture: {
    tangente: "correspond",
    masque: "correspond",
    cercle: "correspond",
    pas: "correspond",
    vecteur: "correspond",
  },
} as const

export const BRAVE_EXAMPLE = {
  action: "brave",
  name: "",
  phrase: "",
  query: "somme des numéros EuroMillions",
  curve: "sumNumbers",
  gesture: "moyenne",
  ratio: 0.618,
  span: "bande",
  window: 8,
  days: 0,
  lecture: {
    tangente: "correspond",
    masque: "correspond",
    cercle: "correspond",
    pas: "correspond",
    vecteur: "correspond",
  },
} as const

export type IaAction =
  | { kind: "skill"; params: SkillParams; name: string; phrase: string }
  | { kind: "brave"; query: string }

/** Tirages relus dans le prompt, du plus ancien au plus récent. */
export const PROMPT_ROWS = 12

export type PromptInput = {
  mind: RunnerMind
  /** Passé lisible moins la fenêtre d’examen. */
  past: readonly RankPoint[]
  /** Premier tirage encore caché : une version écrite après ne compte pas. */
  hiddenDate: string
  examCents: number | null
  notes: readonly BraveNote[]
  drawing: string | null
}

export function buildPrompt(input: PromptInput) {
  const system = [
    `Tu es ${input.mind.name}, un runner de runArcade.`,
    "Tu cours sur des courbes EuroMillions déjà révélées : Σn (somme des 5 numéros, 15 à 240), Σ★ (somme des 2 étoiles, 3 à 23), n1 à n5, e1 et e2, d0 à d4 (numéros par décennie 1–10 … 41–50, leur somme vaut 5).",
    "À chaque tirage, tu dessines un vecteur par courbe. La somme passe d’abord, puis les rangs : la case jouée reste près de la pensée et la somme l’ajuste. Elle ne se cale pas sur 10, 20, 30, 40 ou 50. La décennie affichée est celle des numéros joués.",
    "Tu paies 2,50 € par tour. Chaque numéro trouvé parmi les cinq boules rapporte 2 €, chaque étoile trouvée parmi les deux étoiles rapporte 2 €, quel que soit le rang.",
    "Réponds par un seul objet JSON, sans texte autour. Deux actions, chacune déjà valide :",
    `Skill : ${JSON.stringify(SKILL_EXAMPLE)}`,
    `Recherche : ${JSON.stringify(BRAVE_EXAMPLE)}`,
    `curve : ${CURVE_KEYS.join(", ")} ou *. gesture : ${GESTURES.join(", ")}. ratio : ${GOLDEN_RATIOS.join(", ")}. span : ${SPANS.join(", ")}. window : entier de ${WINDOW_MIN} à ${WINDOW_MAX}. days : 0 s’il n’y a pas de fenêtre longue, sinon un entier de ${DAYS_MIN} à ${DAYS_MAX}.`,
    "Une skill sur une courbe déjà pilotée en devient une nouvelle version. Une seule skill nouvelle par lancement.",
    "L’examen rejoue les derniers tirages, que tu ne lis pas. La skill n’est gardée que si le solde d’examen monte.",
    "Le dessin porte une lecture déjà mesurée. Recopie-la dans lecture, cinq champs : tangente, masque, cercle, pas, vecteur. Chaque champ vaut correspond ou ecarte. ecarte veut dire s’écarte. Tu ne changes pas ces mots.",
  ].join("\n")

  const skills = input.mind.skills
    .map((skill) => {
      const version = activeVersion(skill, input.hiddenDate)
      if (!version) return null
      const scale = version.days ? `, ${version.days} jours` : ""
      return `- ${skill.name} v${version.version} : ${version.phrase} (courbe ${version.curve}, geste ${version.gesture}, ratio ${version.ratio}, span ${version.span}, fenêtre ${version.window} tirages${scale})`
    })
    .filter(Boolean)

  const rows = input.past.slice(-PROMPT_ROWS).map((point) => {
    const values = curveValues(point)
    return `${point.date} · n ${point.n1} ${point.n2} ${point.n3} ${point.n4} ${point.n5} · ★ ${point.e1} ${point.e2} · Σn ${values.sumNumbers} · Σ★ ${values.sumStars} · d ${values.d0}${values.d1}${values.d2}${values.d3}${values.d4}`
  })

  const notes = input.notes.slice(0, 5).map((note) => `- ${note.title} — ${note.snippet}`)

  const user = [
    "Tes skills :",
    ...(skills.length ? skills : ["- aucune"]),
    `Solde d’examen actuel : ${input.examCents == null ? "inconnu" : formatCents(input.examCents)}.`,
    `Derniers tirages lus (${rows.length}), du plus ancien au plus récent :`,
    ...rows,
    ...(input.drawing
      ? [
          `Ton dessin : ${input.drawing}`,
          "L’image montre le bout de la courbe, vingt tirages au plus, là où sont les calques.",
        ]
      : []),
    ...(notes.length ? ["Notes Brave :", ...notes] : []),
    "Propose une action.",
  ].join("\n")

  return { system, user }
}

function asLectureWord(value: string): LectureWord | null {
  if (value === "correspond") return "correspond"
  if (value === "ecarte" || value === "s’écarte" || value === "s'écarte") return "ecarte"
  return null
}

/** Lecture lue dans le dessin (« À recopier ») ou dans la phrase d’observation. */
export function lectureFromText(text: string): Lecture | null {
  const copy = text.match(/À recopier : ([^\n]+)/)
  const source = copy?.[1] ?? text
  const lecture = {} as Lecture
  for (const key of LECTURE_KEYS) {
    const match = source.match(new RegExp(`${key} (correspond|ecarte|s’écarte|s'écarte)`))
    const word = match ? asLectureWord(match[1]) : null
    if (!word) return null
    lecture[key] = word
  }
  return lecture
}

function parseLecture(raw: unknown): Lecture | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const lecture = {} as Lecture
  for (const key of LECTURE_KEYS) {
    if (record[key] !== "correspond" && record[key] !== "ecarte") return null
    lecture[key] = record[key]
  }
  return lecture
}

/** Mots qui contredisent la mesure. Vide si la lecture manque ou si elle recopie. */
export function lectureRefusal(text: string, expected: Lecture): string | null {
  const raw = extractJson(text)
  if (!raw || typeof raw !== "object") return null
  const lecture = parseLecture((raw as Record<string, unknown>).lecture)
  if (!lecture) return null
  const clashes = LECTURE_KEYS.filter((key) => lecture[key] !== expected[key])
  if (clashes.length === 0) return null
  const model = clashes.map((key) => `${key} ${lectureWord(lecture[key])}`).join(" », « ")
  const measure = clashes.map((key) => `${key} ${lectureWord(expected[key])}`).join(" », « ")
  return `le modèle écrit « ${model} », la mesure dit « ${measure} »`
}

function extractJson(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown
  } catch {
    return null
  }
}

export function parseAction(text: string, expected?: Lecture | null): IaAction | null {
  const raw = extractJson(text)
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  if (expected) {
    const lecture = parseLecture(record.lecture)
    if (!lecture || LECTURE_KEYS.some((key) => lecture[key] !== expected[key])) return null
  }
  if (record.action === "brave") {
    const query = String(record.query ?? "").replace(/\s+/g, " ").trim()
    return query ? { kind: "brave", query: query.slice(0, 200) } : null
  }
  if (record.action === "skill") {
    const source = record.skill && typeof record.skill === "object" ? record.skill : record
    const params = parseSkillParams(source)
    if (!params) return null
    const name = String(record.name ?? (source as Record<string, unknown>).name ?? "Skill IA").trim().slice(0, 60)
    const phrase = String(record.phrase ?? (source as Record<string, unknown>).phrase ?? "").trim().slice(0, 200)
    return { kind: "skill", params, name: name || "Skill IA", phrase }
  }
  return null
}
