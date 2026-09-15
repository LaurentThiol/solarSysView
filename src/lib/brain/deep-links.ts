import type { WindowPreset } from "@/lib/analysis-window"
import type { VariableName } from "@/lib/analysis"
import type { CatalogEntry } from "@/lib/brain/catalog"

export type DeepLinkTarget = {
  href: string
  lab: string
}

export function deepLinkFor(input: {
  entry: CatalogEntry
  variable?: VariableName | null
  n?: number | null
  periodX?: number
  preset?: WindowPreset
  curveId?: string | null
}): DeepLinkTarget {
  const preset = input.preset ?? "last_100"
  const variable = input.variable ?? input.entry.defaults.variable ?? "sum"
  const params = new URLSearchParams()
  params.set("preset", preset)
  if (input.periodX) params.set("x", String(input.periodX))
  if (input.entry.lab === "analyse") {
    params.set("variable", variable)
    if (input.n != null) params.set("n", String(input.n))
    return { href: `/analyse?${params}`, lab: "analyse" }
  }
  if (input.entry.lab === "chartisme") {
    params.set("curve", input.curveId || (input.n != null ? `${variable}:${input.n}` : variable))
    return { href: `/chartisme?${params}`, lab: "chartisme" }
  }
  if (input.entry.lab === "harmo") {
    params.set("variable", variable)
    params.set("tab", input.entry.handle === "stft" || input.entry.handle === "ridges" ? "tf" : "melange")
    if (input.n != null) params.set("n", String(input.n))
    return { href: `/harmo?${params}`, lab: "harmo" }
  }
  if (input.entry.lab === "morpho") {
    return { href: "/morpho", lab: "morpho" }
  }
  return { href: "/combinaisons", lab: "combinaisons" }
}

export function citation(handle: string, readingId?: number | null) {
  if (readingId != null) return `@${handle.replace(/^@/, "")}#${readingId}`
  return handle.startsWith("@") ? handle : `@${handle}`
}
