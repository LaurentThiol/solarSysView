export type IaTokenUsage = {
  promptTokens: number | null
  completionTokens: number | null
  estimated: boolean
  latencyMs: number | null
}

export function emptyUsage(latencyMs: number | null = null): IaTokenUsage {
  return { promptTokens: null, completionTokens: null, estimated: false, latencyMs }
}

export function estimateTokens(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return Math.max(1, Math.round(trimmed.length / 4))
}

export function fallbackUsage(text: string, latencyMs: number | null = null): IaTokenUsage {
  return {
    promptTokens: null,
    completionTokens: estimateTokens(text),
    estimated: true,
    latencyMs,
  }
}

function intOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value)
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function nsToMs(value: unknown): number | null {
  const ns = intOrNull(value)
  if (ns == null) return null
  return Math.round(ns / 1e6)
}

function hasReportedTokens(usage: IaTokenUsage) {
  return usage.promptTokens != null || usage.completionTokens != null
}

export function parseProviderUsage(payload: unknown): IaTokenUsage | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>

  const ollamaPrompt = intOrNull(record.prompt_eval_count)
  const ollamaCompletion = intOrNull(record.eval_count)
  if (ollamaPrompt != null || ollamaCompletion != null) {
    return {
      promptTokens: ollamaPrompt,
      completionTokens: ollamaCompletion,
      estimated: false,
      latencyMs: nsToMs(record.total_duration),
    }
  }

  const gemini = record.usageMetadata
  if (gemini && typeof gemini === "object") {
    const meta = gemini as Record<string, unknown>
    const prompt = intOrNull(meta.promptTokenCount)
    const completion = intOrNull(meta.candidatesTokenCount)
    if (prompt != null || completion != null) {
      return {
        promptTokens: prompt,
        completionTokens: completion,
        estimated: false,
        latencyMs: null,
      }
    }
  }

  const openai = record.usage
  if (openai && typeof openai === "object") {
    const meta = openai as Record<string, unknown>
    const prompt = intOrNull(meta.prompt_tokens)
    const completion = intOrNull(meta.completion_tokens)
    if (prompt != null || completion != null) {
      return {
        promptTokens: prompt,
        completionTokens: completion,
        estimated: false,
        latencyMs: null,
      }
    }
  }

  return null
}

export function usageFromPayload(
  payload: unknown,
  text: string,
  startedMs: number,
  nowMs = Date.now()
): IaTokenUsage {
  const latencyMs = Math.max(0, nowMs - startedMs)
  const parsed = parseProviderUsage(payload)
  if (parsed && hasReportedTokens(parsed)) {
    return { ...parsed, latencyMs: parsed.latencyMs ?? latencyMs }
  }
  return fallbackUsage(text, latencyMs)
}
