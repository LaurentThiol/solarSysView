import type { BraveNote } from "./brave-filter"
import { CURVE_KEYS, curveValues, type RankPoint } from "./curves"
import { GOLDEN_RATIOS } from "./golden"
import {
  activeVersion,
  GESTURES,
  LONG_DAYS,
  parseSkillParams,
  SHORT_WINDOWS,
  SPANS,
  type SkillParams,
} from "./skills"
import { formatCents, type RunnerMind } from "./thought"

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
    "À chaque tirage, tu dessines un vecteur par courbe. Les sommes passent d’abord, puis la décennie, puis les rangs : la case jouée est ramenée sur les totales.",
    "Tu paies 2,50 € par tour. Chaque numéro trouvé parmi les cinq boules rapporte 2 €, chaque étoile trouvée parmi les deux étoiles rapporte 2 €, quel que soit le rang.",
    "Réponds par un seul objet JSON, sans texte autour. Deux actions :",
    `{"action":"skill","name":"…","phrase":"…","curve":"${CURVE_KEYS.join("|")}|*","gesture":"${GESTURES.join("|")}","ratio":${GOLDEN_RATIOS.join("|")},"span":"${SPANS.join("|")}","window":${SHORT_WINDOWS.join("|")} ou 2 à 60,"days":null ou ${LONG_DAYS.join("|")} ou 7 à 365}`,
    '{"action":"brave","query":"…"}',
    "Une skill sur une courbe déjà pilotée en devient une nouvelle version. Une seule skill nouvelle par lancement.",
    "L’examen rejoue les derniers tirages, que tu ne lis pas. La skill n’est gardée que si le solde d’examen monte.",
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
    ...(input.drawing ? [`Ton dessin : ${input.drawing}`] : []),
    ...(notes.length ? ["Notes Brave :", ...notes] : []),
    "Propose une action.",
  ].join("\n")

  return { system, user }
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

export function parseAction(text: string): IaAction | null {
  const raw = extractJson(text)
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
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
