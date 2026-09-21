import { apiBase } from "@/lib/api-base"
import { llmFetch } from "@/lib/ia/loopback-fetch"
import type { IaProviderId } from "@/lib/ia/models"

export type LlmUsageSurface = "brain" | "ia" | "morpho" | "embed" | "ping"

export type LlmUsageEvent = {
  surface: LlmUsageSurface
  provider: IaProviderId | "ollama" | "hf"
  model?: string | null
  ok: boolean
  error?: string | null
  promptTokens?: number | null
  completionTokens?: number | null
  estimated?: boolean
  latencyMs?: number | null
}

export function chatSurface(lab?: string | null, requested?: string | null): LlmUsageSurface {
  if (requested === "brain" || requested === "ia") return requested
  if (lab === "brain") return "brain"
  return "ia"
}

export type VisionPassUsage = {
  model: string
  ok: boolean
  error?: string | null
  promptTokens?: number | null
  completionTokens?: number | null
  estimated?: boolean
  latencyMs?: number | null
}

export function chatUsageEvents(input: {
  surface: LlmUsageSurface
  provider: IaProviderId | "ollama" | "hf"
  model?: string | null
  ok: boolean
  error?: string | null
  promptTokens?: number | null
  completionTokens?: number | null
  estimated?: boolean
  latencyMs?: number | null
  visionPass?: VisionPassUsage | null
}): LlmUsageEvent[] {
  const events: LlmUsageEvent[] = []
  if (input.visionPass) {
    events.push({
      surface: input.surface,
      provider: "local",
      model: input.visionPass.model,
      ok: input.visionPass.ok,
      error: input.visionPass.error ?? null,
      promptTokens: input.visionPass.promptTokens ?? null,
      completionTokens: input.visionPass.completionTokens ?? null,
      estimated: Boolean(input.visionPass.estimated),
      latencyMs: input.visionPass.latencyMs ?? null,
    })
  }
  events.push({
    surface: input.surface,
    provider: input.provider,
    model: input.model,
    ok: input.ok,
    error: input.error ?? null,
    promptTokens: input.promptTokens ?? null,
    completionTokens: input.completionTokens ?? null,
    estimated: Boolean(input.estimated),
    latencyMs: input.latencyMs ?? null,
  })
  return events
}

export async function recordLlmUsage(event: LlmUsageEvent): Promise<void> {
  const base = apiBase()
  if (!base) return
  try {
    await llmFetch(
      `${base}/api/llm/usage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          surface: event.surface,
          provider: event.provider,
          model: event.model || "",
          ok: event.ok,
          error: event.error || null,
          prompt_tokens: event.promptTokens ?? null,
          completion_tokens: event.completionTokens ?? null,
          estimated: Boolean(event.estimated),
          latency_ms: event.latencyMs ?? null,
        }),
      },
      4_000
    )
  } catch {
    /* le journal ne doit pas faire échouer le chat */
  }
}
