import { ollamaNumCtx } from "@/lib/ia/local-options"
import { ollamaDeltaText, openaiCompletionText } from "@/lib/ia/sse"
import { estimateTokens, usageFromPayload } from "@/lib/ia/usage"

import { CURVE_KEYS } from "./curves"
import { GOLDEN_RATIOS } from "./golden"
import { DAYS_MAX, GESTURES, SPANS, WINDOW_MAX, WINDOW_MIN } from "./skills"

/** Une action JSON tient en quelques centaines de jetons. */
const PREDICT = 320
const TEMPERATURE = 0.2

export type LocalPost = (body: unknown) => Promise<{ ok: boolean; status: number; text: string }>

/** Grammaire Ollama : courbe, geste, span et ratio restent dans la liste. */
export function actionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      action: { type: "string", enum: ["skill", "brave"] },
      name: { type: "string" },
      phrase: { type: "string" },
      query: { type: "string" },
      curve: { type: "string", enum: ["*", ...CURVE_KEYS] },
      gesture: { type: "string", enum: [...GESTURES] },
      ratio: { type: "number", enum: [...GOLDEN_RATIOS] },
      span: { type: "string", enum: [...SPANS] },
      window: { type: "integer", minimum: WINDOW_MIN, maximum: WINDOW_MAX },
      days: { type: "integer", minimum: 0, maximum: DAYS_MAX },
      lecture: {
        type: "object",
        additionalProperties: false,
        properties: {
          tangente: { type: "string", enum: ["correspond", "ecarte"] },
          masque: { type: "string", enum: ["correspond", "ecarte"] },
          cercle: { type: "string", enum: ["correspond", "ecarte"] },
          pas: { type: "string", enum: ["correspond", "ecarte"] },
          vecteur: { type: "string", enum: ["correspond", "ecarte"] },
        },
        required: ["tangente", "masque", "cercle", "pas", "vecteur"],
      },
    },
    required: ["action", "name", "phrase", "query", "curve", "gesture", "ratio", "span", "window", "days", "lecture"],
  }
}

export function localThinkPayload(input: {
  native: boolean
  model: string
  messages: unknown
  seed: number
  schema: boolean
}) {
  if (input.native) {
    return {
      model: input.model,
      stream: false as const,
      format: input.schema ? actionSchema() : "json",
      keep_alive: "30m",
      messages: input.messages,
      options: {
        num_ctx: ollamaNumCtx(),
        num_predict: PREDICT,
        temperature: TEMPERATURE,
        seed: input.seed,
      },
    }
  }
  return {
    model: input.model,
    stream: false as const,
    temperature: TEMPERATURE,
    seed: input.seed,
    max_tokens: PREDICT,
    response_format: { type: "json_object" as const },
    messages: input.messages,
  }
}

function schemaRejected(status: number, body: string) {
  if (status === 400) return true
  return status === 500 && /format|schema|grammar|structured/i.test(body)
}

/**
 * Ollama reçoit le schéma. Une grammaire refusée repart une fois en JSON libre.
 * llama-server et LM Studio restent sur l’objet JSON OpenAI.
 */
export async function requestLocalThink(
  input: { native: boolean; model: string; messages: unknown; seed: number },
  post: LocalPost
) {
  let response = await post(localThinkPayload({ ...input, schema: input.native }))
  if (!response.ok && input.native && schemaRejected(response.status, response.text)) {
    response = await post(localThinkPayload({ ...input, schema: false }))
  }
  if (!response.ok) {
    const raw = response.text
    throw new Error(`LLM local HTTP ${response.status}${raw ? ` · ${raw.slice(0, 160)}` : ""}`)
  }
  try {
    return JSON.parse(response.text) as unknown
  } catch {
    throw new Error("réponse Ollama illisible")
  }
}

function objectContent(payload: unknown) {
  if (!payload || typeof payload !== "object") return ""
  const content = (payload as { message?: { content?: unknown } }).message?.content
  if (!content || typeof content === "string") return ""
  try {
    return JSON.stringify(content)
  } catch {
    return ""
  }
}

/** Texte de l’action. Natif : message.content. Compatible : choices[0].message.content. */
export function localThinkText(native: boolean, payload: unknown) {
  const primary = (native ? ollamaDeltaText(payload) : openaiCompletionText(payload)).trim()
  if (primary) return primary
  const secondary = (native ? openaiCompletionText(payload) : ollamaDeltaText(payload)).trim()
  if (secondary) return secondary
  return objectContent(payload).trim()
}

/** Compteurs du fournisseur. S’il n’en donne pas, estimation sur le prompt et la réponse. */
export function localThinkTokens(payload: unknown, text: string, prompt: string, startedMs: number, nowMs = Date.now()) {
  const usage = usageFromPayload(payload, text, startedMs, nowMs)
  if (!usage.estimated) {
    return {
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      estimated: false,
    }
  }
  return {
    promptTokens: estimateTokens(prompt),
    completionTokens: usage.completionTokens ?? estimateTokens(text),
    estimated: true,
  }
}
