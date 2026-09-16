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
  { id: "window", label: "Fenêtre", hint: "100 derniers tirages, série somme", target: "window" },
  { id: "pin", label: "Épingles", hint: "Un handle par lab + un spécialiste s’il existe", target: "library" },
  { id: "table", label: "Table", hint: "Fiches résolues : c’est le prompt", target: "table" },
  { id: "chat", label: "Lecture", hint: "Brain lit la table, chiffres réels", target: "discussion" },
  { id: "watch", label: "Suivi", hint: "@rsi à chaque synchro", target: "library" },
  { id: "scan", label: "Balayage", hint: "Mini agent sur les fiches de la démo", target: "scan" },
  { id: "journal", label: "Carnet", hint: "Lectures + note datées", target: "journal" },
] as const

export type DemoStepId = (typeof DEMO_STEPS)[number]["id"]

export function demoWantsStart(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const value = params.get("demo")
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
