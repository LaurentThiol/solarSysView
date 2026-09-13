import { liveEnv } from "@/lib/env-file"
import { isPlaceholder } from "@/lib/secrets"
import { IMAGE_MAX_CHARS, JSON_BUDGET } from "@/lib/capture/snapshot"
import {
  guessVision,
  isGeminiChatModel,
  isModelId,
  isOpenAiChatModel,
  mergeModelOptions,
  modelSequence,
  openaiUsesMaxCompletionTokens,
  preferredModel,
  resolveRequestedModel,
  stripGeminiName,
  type IaChatMessage,
  type IaModelOption,
  type IaProviderId,
} from "@/lib/ia/models"
import { IA_SYSTEM_PROMPT } from "@/lib/ia/prompt"

export type { IaChatMessage, IaProviderId } from "@/lib/ia/models"

export type IaSnapshotPayload = {
  lab?: string
  tab?: string | null
  route?: string
  capturedAt?: string
  gitSha?: string | null
  archive?: unknown
  summary?: string[]
  tech?: unknown
  disclaimer?: string
  question?: string
  imageDataUrl?: string | null
}

export type IaCompleteOk = {
  ok: true
  text: string
  model: string
  provider: IaProviderId
  requested: string
  imageOmitted: boolean
}

export type IaCompleteErr = { ok: false; error: string }

function googleKey() {
  const value = (liveEnv("GOOGLE_API_KEY") || liveEnv("GEMINI_API_KEY")).trim()
  return value && !isPlaceholder(value) ? value : ""
}

function openaiKey() {
  const value = liveEnv("OPENAI_API_KEY").trim()
  return value && !isPlaceholder(value) ? value : ""
}

const LIVE_TIMEOUT_MS = 5_000

async function listGeminiIds(key: string): Promise<string[] | null> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(LIVE_TIMEOUT_MS), cache: "no-store" }
    )
    if (!response.ok) return null
    const data = (await response.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>
    }
    const ids = (data.models ?? [])
      .map((item) => ({
        id: stripGeminiName(item.name || ""),
        methods: item.supportedGenerationMethods,
      }))
      .filter((item) => isGeminiChatModel(item.id, item.methods) && isModelId(item.id))
      .map((item) => item.id)
    return ids
  } catch {
    return null
  }
}

async function listOpenAiIds(key: string): Promise<string[] | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
      cache: "no-store",
    })
    if (!response.ok) return null
    const data = (await response.json()) as { data?: Array<{ id?: string }> }
    return (data.data ?? [])
      .map((item) => item.id || "")
      .filter((id) => isOpenAiChatModel(id) && isModelId(id))
  } catch {
    return null
  }
}

export async function iaStatus(options: { live?: boolean } = {}) {
  const google = Boolean(googleKey())
  const openai = Boolean(openaiKey())
  const fallback: IaProviderId | null = google ? "google" : openai ? "openai" : null
  let liveGoogle: string[] | null = null
  let liveOpenAI: string[] | null = null
  if (options.live) {
    const tasks: Array<Promise<void>> = []
    if (google) {
      tasks.push(
        listGeminiIds(googleKey()).then((ids) => {
          liveGoogle = ids
        })
      )
    }
    if (openai) {
      tasks.push(
        listOpenAiIds(openaiKey()).then((ids) => {
          liveOpenAI = ids
        })
      )
    }
    await Promise.all(tasks)
  }
  const models: IaModelOption[] = mergeModelOptions({
    google,
    openai,
    liveGoogle,
    liveOpenAI,
  })
  return {
    google,
    openai,
    default: fallback,
    defaultModel: fallback ? preferredModel(fallback) : null,
    live: {
      google: google ? liveGoogle !== null : null,
      openai: openai ? liveOpenAI !== null : null,
    },
    models,
  }
}

function clipTech(tech: unknown) {
  try {
    const json = JSON.stringify(tech ?? {})
    if (json.length <= JSON_BUDGET) return json
    return `${json.slice(0, JSON_BUDGET)}\n… [tronqué]`
  } catch {
    return "{}"
  }
}

function snapshotText(snapshot: IaSnapshotPayload | null | undefined) {
  if (!snapshot) return ""
  const lines = [
    "Pack de lecture Synchro (données sous-jacentes, pas un pronostic).",
    snapshot.disclaimer || "",
    `Laboratoire : ${snapshot.lab ?? "?"} · onglet : ${snapshot.tab ?? "—"} · route : ${snapshot.route ?? "—"}`,
    snapshot.capturedAt ? `Capturé : ${snapshot.capturedAt}` : "",
    snapshot.gitSha ? `Git : ${snapshot.gitSha}` : "",
    snapshot.archive ? `Archive : ${JSON.stringify(snapshot.archive)}` : "",
    snapshot.summary?.length ? `Résumé :\n- ${snapshot.summary.join("\n- ")}` : "",
    `Données techniques JSON :\n${clipTech(snapshot.tech)}`,
  ]
  return lines.filter(Boolean).join("\n")
}

function parseDataUrl(dataUrl: string | null | undefined) {
  if (!dataUrl || dataUrl.length > IMAGE_MAX_CHARS) return null
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i)
  if (!match) return null
  return { mime: match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase(), data: match[2].replace(/\s/g, "") }
}

function withOptionalImage(snapshot: IaSnapshotPayload | null, model: string, provider: IaProviderId) {
  const hasImage = Boolean(snapshot?.imageDataUrl)
  const vision = guessVision(model, provider)
  if (!snapshot || vision) return { snapshot, imageOmitted: false }
  return {
    snapshot: { ...snapshot, imageDataUrl: undefined },
    imageOmitted: hasImage,
  }
}

function geminiContents(messages: IaChatMessage[], snapshot: IaSnapshotPayload | null) {
  const pack = snapshotText(snapshot)
  const image = parseDataUrl(snapshot?.imageDataUrl)
  const contents: Array<{ role: "user" | "model"; parts: Array<Record<string, unknown>> }> = []
  messages.forEach((message, index) => {
    if (message.role === "assistant") {
      contents.push({ role: "model", parts: [{ text: message.content }] })
      return
    }
    const parts: Array<Record<string, unknown>> = []
    if (index === 0 && pack) {
      parts.push({ text: `${pack}\n\nQuestion :\n${message.content}` })
      if (image) {
        parts.push({ inlineData: { mimeType: image.mime, data: image.data } })
      }
    } else {
      parts.push({ text: message.content })
    }
    contents.push({ role: "user", parts })
  })
  return contents
}

function shouldRetryStatus(status: number, raw: string) {
  if (status === 404 || status === 429 || status >= 500) return true
  if (status === 400 && /model|not found|does not exist/i.test(raw)) return true
  return false
}

async function completeGemini(
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  requested: string
): Promise<IaCompleteOk | IaCompleteErr> {
  const key = googleKey()
  if (!key) return { ok: false, error: "GOOGLE_API_KEY absente (Admin)." }
  let lastError = "Gemini indisponible"
  for (const model of modelSequence("google", requested)) {
    const packed = withOptionalImage(snapshot, model, "google")
    const bodyBase = {
      systemInstruction: { parts: [{ text: IA_SYSTEM_PROMPT }] },
      contents: geminiContents(messages, packed.snapshot),
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    }
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bodyBase),
        signal: AbortSignal.timeout(45_000),
      }
    )
    const raw = await response.text()
    if (!response.ok) {
      lastError = `Gemini HTTP ${response.status}${raw ? ` · ${raw.slice(0, 220)}` : ""}`
      if (shouldRetryStatus(response.status, raw)) continue
      return { ok: false, error: lastError }
    }
    const data = JSON.parse(raw) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
      error?: { message?: string }
    }
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") ?? ""
    if (!text.trim()) {
      lastError = data.error?.message || data.candidates?.[0]?.finishReason || "réponse vide"
      continue
    }
    return {
      ok: true,
      text: text.trim(),
      model,
      provider: "google",
      requested,
      imageOmitted: packed.imageOmitted,
    }
  }
  return { ok: false, error: lastError }
}

function openaiMessages(messages: IaChatMessage[], snapshot: IaSnapshotPayload | null) {
  const pack = snapshotText(snapshot)
  const image = parseDataUrl(snapshot?.imageDataUrl)
  const out: Array<Record<string, unknown>> = [{ role: "system", content: IA_SYSTEM_PROMPT }]
  messages.forEach((message, index) => {
    if (message.role === "assistant") {
      out.push({ role: "assistant", content: message.content })
      return
    }
    if (index === 0 && (pack || image)) {
      const content: Array<Record<string, unknown>> = [
        { type: "text", text: pack ? `${pack}\n\nQuestion :\n${message.content}` : message.content },
      ]
      if (image) {
        content.push({
          type: "image_url",
          image_url: { url: `data:${image.mime};base64,${image.data}` },
        })
      }
      out.push({ role: "user", content })
      return
    }
    out.push({ role: "user", content: message.content })
  })
  return out
}

function openaiPayload(model: string, messages: IaChatMessage[], snapshot: IaSnapshotPayload | null) {
  const body: Record<string, unknown> = {
    model,
    messages: openaiMessages(messages, snapshot),
  }
  if (openaiUsesMaxCompletionTokens(model)) {
    body.max_completion_tokens = 4096
  } else {
    body.temperature = 0.3
    body.max_tokens = 4096
  }
  return body
}

async function completeOpenAI(
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  requested: string
): Promise<IaCompleteOk | IaCompleteErr> {
  const key = openaiKey()
  if (!key) return { ok: false, error: "OPENAI_API_KEY absente (Admin)." }
  let lastError = "OpenAI indisponible"
  for (const model of modelSequence("openai", requested)) {
    const packed = withOptionalImage(snapshot, model, "openai")
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(openaiPayload(model, messages, packed.snapshot)),
      signal: AbortSignal.timeout(45_000),
    })
    const raw = await response.text()
    if (!response.ok) {
      lastError = `OpenAI HTTP ${response.status}${raw ? ` · ${raw.slice(0, 220)}` : ""}`
      if (shouldRetryStatus(response.status, raw)) continue
      return { ok: false, error: lastError }
    }
    const data = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }
    const text = data.choices?.[0]?.message?.content?.trim() || ""
    if (!text) {
      lastError = data.error?.message || "réponse vide"
      continue
    }
    return {
      ok: true,
      text,
      model,
      provider: "openai",
      requested,
      imageOmitted: packed.imageOmitted,
    }
  }
  return { ok: false, error: lastError }
}

export async function completeIa(options: {
  provider: IaProviderId
  model?: string | null
  messages: IaChatMessage[]
  snapshot?: IaSnapshotPayload | null
}): Promise<IaCompleteOk | IaCompleteErr> {
  const requested = resolveRequestedModel(options.provider, options.model)
  if (!requested) {
    return { ok: false, error: "Aucun modèle pour ce fournisseur." }
  }
  if (options.provider === "google") {
    return completeGemini(options.messages, options.snapshot ?? null, requested)
  }
  return completeOpenAI(options.messages, options.snapshot ?? null, requested)
}
