import { INDEPENDENCE_DISCLAIMER, JSON_BUDGET, withinBudget } from "@/lib/capture/snapshot"
import type { IaSnapshotPayload } from "@/lib/ia/providers"
import type { WorkingObject } from "@/lib/brain/types"

export const SPECIALIST_DISCLAIMER =
  "Un spécialiste Brain publie un forecast de série nommée (parité, somme…) avec son skill vs le hasard. Ce n’est pas une recommandation de grille 5+2."

export function workingSetPayload(objects: WorkingObject[]): Record<string, unknown> {
  const inPrompt = objects.filter((item) => item.inPrompt)
  const hasSpecialist = inPrompt.some((item) => item.fiche?.lab === "specialist" || item.handle.includes("specialist."))
  return withinBudget({
    kind: "brain-working-set",
    disclaimer: hasSpecialist ? `${INDEPENDENCE_DISCLAIMER} ${SPECIALIST_DISCLAIMER}` : INDEPENDENCE_DISCLAIMER,
    objects: inPrompt.map((item) => ({
      kind: item.kind,
      id: item.id,
      handle: item.handle,
      label: item.label,
      summary: item.summary,
      score: item.score ?? null,
      last: item.fiche?.last ?? null,
      flags: item.fiche?.flags ?? [],
      window: item.fiche?.window ?? null,
      reading: item.fiche?.reading ?? null,
      instructions: item.fiche?.last?.instructions ?? item.fiche?.reading ?? null,
      lab: item.fiche?.lab ?? null,
    })),
  })
}

export function packWorkingSet(objects: WorkingObject[]): IaSnapshotPayload {
  const inPrompt = objects.filter((item) => item.inPrompt)
  const summary = inPrompt.slice(0, 8).map((item) => `${item.handle} · ${item.summary}`)
  if (!summary.length) summary.push("Working set vide.")
  const tech = workingSetPayload(objects)
  let json = "{}"
  try {
    json = JSON.stringify(tech)
  } catch {
    json = "{}"
  }
  if (json.length > JSON_BUDGET) {
    summary.push(`Pack tronqué (${json.length} octets).`)
  }
  return {
    lab: "brain",
    tab: "objets",
    route: "/brain",
    summary,
    tech,
    disclaimer: INDEPENDENCE_DISCLAIMER,
  }
}

export function objectsEqualPrompt(objects: WorkingObject[], packed: IaSnapshotPayload) {
  const sent = (packed.tech as { objects?: Array<{ id?: string }> } | undefined)?.objects ?? []
  const promptIds = objects.filter((item) => item.inPrompt).map((item) => item.id)
  const packedIds = sent.map((item) => item.id).filter(Boolean) as string[]
  return JSON.stringify(promptIds) === JSON.stringify(packedIds)
}
