import { VARIABLE_NAMES, type VariableName } from "@/lib/analysis"
import { WINDOW_PRESETS, type WindowPreset } from "@/lib/analysis-window"
import { STUDY_PRESETS, type StudyPreset } from "@/lib/chartisme/window"

export { asDrawDate } from "@/lib/draw-date"

export function readLabSearch(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

export function asWindowPreset(value: string | null): WindowPreset | null {
  if (!value) return null
  return (WINDOW_PRESETS as readonly string[]).includes(value) ? (value as WindowPreset) : null
}

export function asStudyPreset(value: string | null): StudyPreset | null {
  if (!value) return null
  return (STUDY_PRESETS as readonly string[]).includes(value) ? (value as StudyPreset) : null
}

export function asVariableName(value: string | null): VariableName | null {
  if (!value) return null
  return (VARIABLE_NAMES as readonly string[]).includes(value) ? (value as VariableName) : null
}

export function asPositiveInt(value: string | null, min: number, max: number): number | null {
  if (!value) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

export function asOneOf<T extends string>(value: string | null, ids: readonly T[]): T | null {
  if (!value) return null
  return (ids as readonly string[]).includes(value) ? (value as T) : null
}
