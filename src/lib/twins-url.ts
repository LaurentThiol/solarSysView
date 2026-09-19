import { asDrawDate } from "./draw-date.ts"
import {
  FINGERPRINT_AXES,
  parseFingerprintAxes,
  type FingerprintAxis,
} from "./fingerprints.ts"

export function axesFromSearch(raw: string | null | undefined): FingerprintAxis[] | null {
  if (!raw?.trim()) return null
  const parts = raw.split(",").map((item) => item.trim()).filter(Boolean)
  if (!parts.length) return null
  const axes = parseFingerprintAxes(parts)
  return axes.length ? axes : null
}

export function readTwinsSearch(search: string): {
  queryDate: string | null
  axes: FingerprintAxis[] | null
} {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  return {
    queryDate: asDrawDate(params.get("query")),
    axes: axesFromSearch(params.get("axes")),
  }
}

export function applyTwinsSearch(
  search: string,
  input: { queryDate?: string | null; axes?: readonly string[] | null }
): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  params.set("tab", "jumeaux")
  const query = asDrawDate(input.queryDate ?? null)
  if (query) params.set("query", query)
  else params.delete("query")
  const axes = input.axes?.length ? parseFingerprintAxes(input.axes.map((item) => item.trim())) : []
  if (axes.length && axes.length !== FINGERPRINT_AXES.length) {
    params.set("axes", axes.join(","))
  } else {
    params.delete("axes")
  }
  return params.toString()
}
