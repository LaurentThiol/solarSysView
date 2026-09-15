import { INDEPENDENCE_DISCLAIMER, JSON_BUDGET, withinBudget } from "@/lib/capture/snapshot"
import type { IaSnapshotPayload } from "@/lib/ia/providers"
import type { WorkingObject } from "@/lib/brain/types"

export function workingSetPayload(objects: WorkingObject[]): Record<string, unknown> {
  const inPrompt = objects.filter((item) => item.inPrompt)
  return withinBudget({
    kind: "brain-working-set",
    disclaimer: INDEPENDENCE_DISCLAIMER,
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
