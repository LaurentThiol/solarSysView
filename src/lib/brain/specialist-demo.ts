import { scrollDemoTarget } from "@/lib/brain/demo"
import type { SpecialistHorizon, SpecialistTask } from "@/lib/brain/specialists"
import type { VariableName } from "@/lib/analysis"

export const DEMO_SPECIALIST = {
  name: "Paire impair",
  target: "parity" as VariableName,
  task: "auto" as SpecialistTask | "auto",
  horizon: "value" as SpecialistHorizon,
  indicators: ["lag1", "lag2", "rsi", "macd", "bollinger"],
  instructions:
    "Forecast du nombre de pairs (0–5) à t+1. S’abstenir si la confiance est basse. Pas une grille.",
}

export const DEMO_SPECIALIST_NOTE =
  "Démo Spécialistes : formulaire Paire impair, skill vs hasard, épinglage s’il existe. Pas d’entraînement lancé tout seul."

const PENDING_PINS_KEY = "synchro.brain.pending-pins"

export const DEMO_SPECIALIST_STEPS = [
  {
    id: "intro",
    label: "Quoi",
    hint: "Un réseau, une série nommée",
    target: "specialists",
    title: "Spécialistes",
    body: "Un petit réseau par question : parité, somme, étendue… Il forecast t+1 de cette série, avec σ et un skill. Ce n’est jamais une grille 5+2.",
  },
  {
    id: "name",
    label: "Nom",
    hint: "Devient @specialist.paire-impair",
    target: "spec-name",
    title: "Nom",
    body: "Le libellé devient le handle. « Paire impair » → @specialist.paire-impair, sauvé dans .brain/specialists/ pour réemploi.",
  },
  {
    id: "target",
    label: "Cible",
    hint: "La série à prévoir",
    target: "spec-target",
    title: "Cible",
    body: "Quelle série le réseau doit-il lire ? Pairs/impairs (0–5), somme, étendue… Pas les 5+2. La démo prend la parité.",
  },
  {
    id: "task",
    label: "Forme",
    hint: "Classes, binaire ou régression",
    target: "spec-task",
    title: "Forme",
    body: "auto choisit tout seul : classes pour une parité 0–5, régression pour une somme. Binaire = plus de pairs, ou pas.",
  },
  {
    id: "horizon",
    label: "Horizon",
    hint: "t+1 ou le Δ",
    target: "spec-horizon",
    title: "Horizon",
    body: "valeur = le prochain point de la série. Δ = son évolution. La démo reste sur la valeur t+1.",
  },
  {
    id: "features",
    label: "Indicateurs",
    hint: "Features causales jusqu’à t",
    target: "spec-features",
    title: "Indicateurs",
    body: "Entrées du réseau, calculées jusqu’au tirage t — pas de fuite du futur. Lags, RSI, MACD, Bollinger… La démo reprend le jeu par défaut.",
  },
  {
    id: "instructions",
    label: "Consignes",
    hint: "Collées au modèle",
    target: "spec-instructions",
    title: "Instructions",
    body: "Texte collé à Brain : comment lire ce spécialiste, quand s’abstenir. Obligatoire. Ce n’est pas un prompt de grille.",
  },
  {
    id: "force",
    label: "Hasard",
    hint: "Skill ≤ 0 = ne bat pas le nul",
    target: "spec-force",
    title: "Sauver même si skill ≤ 0",
    body: "Le skill dit s’il bat le modèle nul (hasard / persist). ≤ 0 : on ne sauve pas, sauf si tu forces. Un skill plat n’autorise pas une 5+2.",
  },
  {
    id: "train",
    label: "Entraîner",
    hint: "Ère formule, 20 / 50 / 100",
    target: "spec-train",
    title: "Entraîner",
    body: "Sur l’ère formule, noté sur les 20 / 50 / 100 derniers. CPU, une minute tout au plus. La démo ne lance pas l’entraînement : ça écrit sur disque.",
  },
  {
    id: "saved",
    label: "Sauvés",
    hint: "Réinférer un forecast t+1",
    target: "spec-saved",
    title: "Sauvés",
    body: "Les réseaux déjà écrits. Réinférer calcule un nouveau t+1. Skill 20/50/100 et le verdict vs le hasard restent collés à la fiche.",
  },
  {
    id: "pin",
    label: "Épingler",
    hint: "Brain ne voit que la table",
    target: "spec-pin",
    title: "Épingler",
    body: "Pose @specialist.* sur la table de Brain. S’il n’est pas épinglé, Brain ne le cite pas. La démo épingle le premier sauvé, s’il y en a un.",
  },
] as const

export type SpecialistDemoStepId = (typeof DEMO_SPECIALIST_STEPS)[number]["id"]
export type SpecialistDemoStep = (typeof DEMO_SPECIALIST_STEPS)[number]

export function specialistDemoStepOf(id: SpecialistDemoStepId): SpecialistDemoStep {
  const step = DEMO_SPECIALIST_STEPS.find((item) => item.id === id)
  if (!step) throw new Error(`étape de démo inconnue: ${id}`)
  return step
}

export function specialistDemoStepIndex(id: SpecialistDemoStepId) {
  return DEMO_SPECIALIST_STEPS.findIndex((item) => item.id === id)
}

export function isLastSpecialistDemoStep(id: SpecialistDemoStepId) {
  return specialistDemoStepIndex(id) === DEMO_SPECIALIST_STEPS.length - 1
}

function demoQuery(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  return (params.get("demo") ?? "").trim().toLowerCase()
}

export function isSpecialistDemoQuery(search: string) {
  const value = demoQuery(search)
  return (
    value === "specialistes" ||
    value === "specialist" ||
    value === "specialiste" ||
    value === "spécialistes"
  )
}

export function specialistDemoWantsStart(search: string, pathname = "") {
  if (isSpecialistDemoQuery(search)) return true
  const value = demoQuery(search)
  const path = pathname.replace(/\/$/, "").toLowerCase()
  if (!path.includes("specialist") && !path.includes("spécialist")) return false
  return value === "1" || value === "true" || value === "oui"
}

export function specialistDemoHighlight(
  step: SpecialistDemoStepId | null,
  ids: SpecialistDemoStepId[],
  elevate = false
) {
  if (!step || !ids.includes(step)) return ""
  return elevate
    ? "ring-2 ring-primary/80 ring-offset-2 ring-offset-background relative z-[70]"
    : "ring-2 ring-primary/80 ring-offset-2 ring-offset-background"
}

export function scrollSpecialistDemo(target: string) {
  scrollDemoTarget(target)
}

export function waitDemoMs(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

export function readPendingBrainPins() {
  if (typeof window === "undefined") return [] as string[]
  try {
    const raw = window.sessionStorage.getItem(PENDING_PINS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

export function queueBrainPin(id: string) {
  if (typeof window === "undefined" || !id) return
  const ids = readPendingBrainPins()
  if (!ids.includes(id)) ids.push(id)
  window.sessionStorage.setItem(PENDING_PINS_KEY, JSON.stringify(ids))
}

export function takePendingBrainPins() {
  const ids = readPendingBrainPins()
  if (typeof window !== "undefined") window.sessionStorage.removeItem(PENDING_PINS_KEY)
  return ids
}

export function clearPendingBrainPins() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(PENDING_PINS_KEY)
}
