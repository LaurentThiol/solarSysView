import { DEFAULT_NUM_CTX, JSON_BUDGET, packCharBudget } from "@/lib/capture/snapshot"
import { liveEnv } from "@/lib/env-file"

export function ollamaNumCtx() {
  const raw = Number.parseInt(liveEnv("OLLAMA_NUM_CTX"), 10)
  if (Number.isFinite(raw) && raw >= 2048 && raw <= 131_072) return raw
  return DEFAULT_NUM_CTX
}

export function localPackBudget(native: boolean) {
  return native ? packCharBudget(ollamaNumCtx()) : JSON_BUDGET
}

export function localGenParams(deepen: boolean) {
  if (deepen) {
    return { temperature: 0.7, topP: 0.95 as number | undefined, predict: 8192 }
  }
  return { temperature: 0.3, topP: undefined as number | undefined, predict: 4096 }
}
