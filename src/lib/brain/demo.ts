import { parseHandle, type HandleContext } from "@/lib/brain/handles"
import type { CatalogEntry } from "@/lib/brain/catalog"
import { resolveEntry } from "@/lib/brain/resolve"
import type { ResolveContext, WalkerJob, WorkingObject } from "@/lib/brain/types"
import type { CombinationGrid } from "@/lib/combinations"

export const DEMO_HANDLES = ["rsi", "macd", "adx", "ete", "fft", "cluster", "score"] as const

export const DEMO_LAB_FOR: Record<(typeof DEMO_HANDLES)[number], HandleContext["activeLab"]> = {
  rsi: "analyse",
  macd: "analyse",
  adx: "analyse",
  ete: "chartisme",
  fft: "harmo",
  cluster: "morpho",
  score: "combinaisons",
}

export const DEMO_WATCH_ID = "analyse/rsi"

export const DEMO_GRID: CombinationGrid = {
  numbers: [7, 12, 23, 34, 45],
  stars: [2, 8],
}

export const DEMO_NOTE =
  "Démo Brain : table lue sans modèle, @rsi suivi, mini-balayage consigné. Pas une grille à jouer."

export const DEMO_STEPS = [
  {
    id: "window",
    label: "Fenêtre",
    hint: "100 derniers tirages, série somme",
    target: "window",
    title: "Fenêtre",
    body: "La démo pose les 100 derniers tirages, série somme. C’est la même fenêtre que les autres labs.",
  },
  {
    id: "pin",
    label: "Épingles",
    hint: "Un handle par lab + un spécialiste s’il existe",
    target: "library",
    title: "Épingles",
    body: "Un nom par lab : @rsi, @macd, @adx, @ete, @fft, @cluster, @score. Un spécialiste déjà entraîné est collé s’il existe.",
  },
  {
    id: "table",
    label: "Table",
    hint: "Fiches résolues : c’est le prompt",
    target: "table",
    title: "Sur la table",
    body: "Exactement ce que Brain reçoit. Les fiches sont calculées sur les tirages chargés. S’il n’est pas ici, Brain ne le voit pas.",
  },
  {
    id: "chat",
    label: "Lecture",
    hint: "Brain lit la table, chiffres réels",
    target: "discussion",
    title: "Lecture",
    body: "Brain lit la table sans Ollama. Chiffres réels, pas un texte inventé. Une 5+2, s’il y en a une, serait une hypothèse séparée.",
  },
  {
    id: "watch",
    label: "Suivi",
    hint: "@rsi à chaque synchro",
    target: "library",
    title: "Suivi",
    body: "L’étoile sur @rsi le recalcule à chaque synchro, sans LLM.",
  },
  {
    id: "scan",
    label: "Balayage",
    hint: "Mini agent sur les fiches de la démo",
    target: "scan",
    title: "Balayage",
    body: "Mini-agent sur les fiches de la démo seulement. D’habitude, rien ne part tout seul.",
  },
  {
    id: "journal",
    label: "Carnet",
    hint: "Lectures + note datées",
    target: "journal",
    title: "Carnet",
    body: "Lectures datées et une note. Neon si disponible, sinon cet ordinateur.",
  },
] as const

export type DemoStepId = (typeof DEMO_STEPS)[number]["id"]

export function demoWantsStart(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const value = (params.get("demo") ?? "").trim().toLowerCase()
  if (
    value === "specialistes" ||
    value === "specialist" ||
    value === "specialiste" ||
    value === "spécialistes"
  ) {
    return false
  }
  return value === "1" || value === "true" || value === "oui"
}

export function demoEntries(extra: CatalogEntry[] = [], ctx: HandleContext = {}): CatalogEntry[] {
  const out: CatalogEntry[] = []
  for (const handle of DEMO_HANDLES) {
    const parsed = parseHandle(`@${handle}`, { ...ctx, activeLab: DEMO_LAB_FOR[handle] })
    if (parsed.entry && !out.some((item) => item.id === parsed.entry?.id)) {
      out.push(parsed.entry)
    }
  }
  for (const entry of extra) {
    if (entry.lab !== "specialist") continue
    if (out.some((item) => item.id === entry.id)) continue
    out.push(entry)
    break
  }
  return out
}

export function demoJobs(entries: CatalogEntry[] = demoEntries()): WalkerJob[] {
  return entries.map((entry) => ({
    id: entry.id,
    catalogId: entry.id,
    handle: `@${entry.handle}`,
    label: entry.label,
    lab: entry.lab,
    mode: "catalog" as const,
    status: "queued" as const,
  }))
}

export function demoLabsCovered(entries: CatalogEntry[] = demoEntries()): string[] {
  return [...new Set(entries.map((entry) => entry.lab))]
}

export async function resolveDemoPins(
  ctx: Omit<ResolveContext, "entry">,
  entries: CatalogEntry[] = demoEntries()
): Promise<WorkingObject[]> {
  const objects: WorkingObject[] = []
  for (const entry of entries) {
    const fiche = await resolveEntry({ ...ctx, entry, grid: ctx.grid ?? DEMO_GRID })
    objects.push({
      kind: "pin",
      id: entry.id,
      handle: `@${entry.handle}`,
      label: entry.label,
      inPrompt: true,
      summary: fiche.summary,
      fiche,
    })
  }
  return objects
}

export function scrollDemoTarget(target: string) {
  if (typeof document === "undefined") return
  const node = document.querySelector(`[data-demo="${target}"]`)
  node?.scrollIntoView({ behavior: "smooth", block: "center" })
}
