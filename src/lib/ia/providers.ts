import { apiBase } from "@/lib/api-base"
import { liveEnv } from "@/lib/env-file"
import { isPlaceholder } from "@/lib/secrets"
import { IMAGE_MAX_CHARS, JSON_BUDGET } from "@/lib/capture/snapshot"
import {
  guessVision,
  isGeminiChatModel,
  isLocalChatModel,
  isModelId,
  isOpenAiChatModel,
  mergeModelOptions,
  modelSequence,
  openaiUsesMaxCompletionTokens,
  pickAvailableModel,
  preferredModel,
  resolveRequestedModel,
  stripGeminiName,
  type IaChatMessage,
  type IaModelOption,
  type IaProviderId,
} from "@/lib/ia/models"
import { localChatCompletionsUrl, localModelsUrl, normalizeLocalLlmBase } from "@/lib/ia/local-url"
import { IA_SYSTEM_PROMPT } from "@/lib/ia/prompt"
import {
  geminiDeltaText,
  openaiDeltaText,
  readSseJson,
  type IaStreamEvent,
} from "@/lib/ia/sse"

export type { IaChatMessage, IaProviderId } from "@/lib/ia/models"
export type { IaStreamEvent } from "@/lib/ia/sse"

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

export { localChatCompletionsUrl, localModelsUrl, normalizeLocalLlmBase } from "@/lib/ia/local-url"

export function localLlmBase() {
  const fromEnv = (liveEnv("LOCAL_LLM_BASE_URL") || liveEnv("OLLAMA_HOST")).trim()
  return normalizeLocalLlmBase(fromEnv || "http://127.0.0.1:11434")
}

function systemText(override?: string | null) {
  const text = (override ?? requestSystem)?.trim()
  if (text && text.length > 0 && text.length <= 12_000) return text
  return IA_SYSTEM_PROMPT
}

let requestSystem: string | null = null

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

function chatIdsFromNames(names: string[]) {
  return names.filter((id) => isModelId(id) && isLocalChatModel(id))
}

async function listLocalIds(base: string, timeoutMs = LIVE_TIMEOUT_MS): Promise<string[] | null> {
  try {
    const tags = await fetch(`${base}/api/tags`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    })
    if (tags.ok) {
      const data = (await tags.json()) as { models?: Array<{ name?: string }> }
      return chatIdsFromNames((data.models ?? []).map((item) => item.name || ""))
    }
  } catch {
    /* llama-server / LM Studio have no /api/tags */
  }
  try {
    const response = await fetch(localModelsUrl(base), {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    })
    if (!response.ok) return null
    const data = (await response.json()) as { data?: Array<{ id?: string }> }
    return chatIdsFromNames((data.data ?? []).map((item) => item.id || ""))
  } catch {
    return null
  }
}

async function listLocalIdsViaPython(): Promise<string[] | null> {
  const python = apiBase()
  if (!python) return null
  try {
    const response = await fetch(`${python}/api/brain/status`, {
      signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
      cache: "no-store",
    })
    if (!response.ok) return null
    const data = (await response.json()) as {
      ollama?: { ok?: boolean; models?: string[] }
    }
    if (!data.ollama?.ok) return null
    return chatIdsFromNames(data.ollama.models ?? [])
  } catch {
    return null
  }
}

type LocalProbe = { ok: boolean; ids: string[] | null; at: number; host: string }

let localProbeCache: LocalProbe | null = null
const LOCAL_PROBE_TTL_MS = 10_000
const LOCAL_PROBE_TIMEOUT_MS = 1_500

export function clearLocalLlmProbeCache() {
  localProbeCache = null
}

export async function probeLocalLlm(host = localLlmBase(), timeoutMs = LOCAL_PROBE_TIMEOUT_MS): Promise<LocalProbe> {
  if (
    localProbeCache &&
    localProbeCache.host === host &&
    Date.now() - localProbeCache.at < LOCAL_PROBE_TTL_MS
  ) {
    return localProbeCache
  }
  let ids = await listLocalIds(host, timeoutMs)
  if (ids === null) ids = await listLocalIdsViaPython()
  const probe: LocalProbe = { ok: ids !== null, ids, at: Date.now(), host }
  localProbeCache = probe
  return probe
}

export async function iaStatus(options: { live?: boolean } = {}) {
  const google = Boolean(googleKey())
  const openai = Boolean(openaiKey())
  const host = localLlmBase()
  let liveGoogle: string[] | null = null
  let liveOpenAI: string[] | null = null
  const extra: Array<Promise<void>> = []
  if (options.live) {
    if (google) {
      extra.push(
        listGeminiIds(googleKey()).then((ids) => {
          liveGoogle = ids
        })
      )
    }
    if (openai) {
      extra.push(
        listOpenAiIds(openaiKey()).then((ids) => {
          liveOpenAI = ids
        })
      )
    }
  }
  const localPromise = probeLocalLlm(host)
  const [localProbe] = await Promise.all([localPromise, ...extra])
  const liveLocal = localProbe.ids
  const local = localProbe.ok
  const fallback: IaProviderId | null = google ? "google" : openai ? "openai" : local ? "local" : null
  const models: IaModelOption[] = mergeModelOptions({
    google,
    openai,
    local,
    liveGoogle,
    liveOpenAI,
    liveLocal,
  })
  return {
    google,
    openai,
    local,
    localHost: host,
    default: fallback,
    defaultModel: fallback ? pickAvailableModel(models, fallback) ?? preferredModel(fallback) : null,
    live: {
      google: google ? liveGoogle !== null : null,
      openai: openai ? liveOpenAI !== null : null,
      local,
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

function requestSignal(external?: AbortSignal) {
  const timeout = AbortSignal.timeout(45_000)
  if (!external) return timeout
  if (typeof AbortSignal.any === "function") return AbortSignal.any([external, timeout])
  return timeout
}

type OnceOk = { ok: true; text: string }
type OnceErr = { ok: false; error: string; retry: boolean }
type OnceResult = OnceOk | OnceErr

async function generateGeminiOnce(
  model: string,
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  key: string,
  signal?: AbortSignal
): Promise<OnceResult> {
  const packed = withOptionalImage(snapshot, model, "google")
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText() }] },
        contents: geminiContents(messages, packed.snapshot),
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
      signal: requestSignal(signal),
    }
  )
  const raw = await response.text()
  if (!response.ok) {
    return {
      ok: false,
      error: `Gemini HTTP ${response.status}${raw ? ` · ${raw.slice(0, 220)}` : ""}`,
      retry: shouldRetryStatus(response.status, raw),
    }
  }
  const data = JSON.parse(raw) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
    error?: { message?: string }
  }
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") ?? ""
  if (!text.trim()) {
    return {
      ok: false,
      error: data.error?.message || data.candidates?.[0]?.finishReason || "réponse vide",
      retry: true,
    }
  }
  return { ok: true, text: text.trim() }
}

async function streamGeminiOnce(
  model: string,
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  key: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal
): Promise<OnceResult> {
  const packed = withOptionalImage(snapshot, model, "google")
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemText() }] },
    contents: geminiContents(messages, packed.snapshot),
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
  })
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: requestSignal(signal),
    }
  )
  if (!response.ok) {
    const raw = await response.text().catch(() => "")
    if (shouldRetryStatus(response.status, raw)) {
      return generateGeminiOnce(model, messages, snapshot, key, signal)
    }
    return {
      ok: false,
      error: `Gemini HTTP ${response.status}${raw ? ` · ${raw.slice(0, 220)}` : ""}`,
      retry: false,
    }
  }
  let text = ""
  try {
    await readSseJson(
      response,
      (payload) => {
        const chunk = geminiDeltaText(payload)
        if (!chunk) return
        text += chunk
        onDelta(chunk)
      },
      signal
    )
  } catch (error) {
    if (signal?.aborted) throw error
    if (text.trim()) return { ok: true, text: text.trim() }
    return generateGeminiOnce(model, messages, snapshot, key, signal)
  }
  if (!text.trim()) return generateGeminiOnce(model, messages, snapshot, key, signal)
  return { ok: true, text: text.trim() }
}

async function completeGemini(
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  requested: string,
  signal?: AbortSignal
): Promise<IaCompleteOk | IaCompleteErr> {
  const key = googleKey()
  if (!key) return { ok: false, error: "GOOGLE_API_KEY absente (Admin)." }
  let lastError = "Gemini indisponible"
  for (const model of modelSequence("google", requested)) {
    const packed = withOptionalImage(snapshot, model, "google")
    const result = await generateGeminiOnce(model, messages, snapshot, key, signal)
    if (result.ok) {
      return {
        ok: true,
        text: result.text,
        model,
        provider: "google",
        requested,
        imageOmitted: packed.imageOmitted,
      }
    }
    lastError = result.error
    if (!result.retry) return { ok: false, error: lastError }
  }
  return { ok: false, error: lastError }
}

function openaiMessages(
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  system?: string | null
) {
  const pack = snapshotText(snapshot)
  const image = parseDataUrl(snapshot?.imageDataUrl)
  const out: Array<Record<string, unknown>> = [{ role: "system", content: systemText(system) }]
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

function openaiPayload(
  model: string,
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  stream = false,
  system?: string | null
) {
  const body: Record<string, unknown> = {
    model,
    messages: openaiMessages(messages, snapshot, system),
  }
  if (openaiUsesMaxCompletionTokens(model)) {
    body.max_completion_tokens = 4096
  } else {
    body.temperature = 0.3
    body.max_tokens = 4096
  }
  if (stream) body.stream = true
  return body
}

async function generateOpenAIOnce(
  model: string,
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  key: string,
  signal?: AbortSignal,
  endpoint?: { url: string; label: string }
): Promise<OnceResult> {
  const packed = withOptionalImage(snapshot, model, endpoint ? "local" : "openai")
  const url = endpoint?.url ?? "https://api.openai.com/v1/chat/completions"
  const label = endpoint?.label ?? "OpenAI"
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${key || "local"}`,
    },
    body: JSON.stringify(openaiPayload(model, messages, packed.snapshot)),
    signal: requestSignal(signal),
  })
  const raw = await response.text()
  if (!response.ok) {
    return {
      ok: false,
      error: `${label} HTTP ${response.status}${raw ? ` · ${raw.slice(0, 220)}` : ""}`,
      retry: shouldRetryStatus(response.status, raw),
    }
  }
  const data = JSON.parse(raw) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
  }
  const text = data.choices?.[0]?.message?.content?.trim() || ""
  if (!text) {
    return { ok: false, error: data.error?.message || "réponse vide", retry: true }
  }
  return { ok: true, text }
}

async function streamOpenAIOnce(
  model: string,
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  key: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  endpoint?: { url: string; label: string }
): Promise<OnceResult> {
  const packed = withOptionalImage(snapshot, model, endpoint ? "local" : "openai")
  const url = endpoint?.url ?? "https://api.openai.com/v1/chat/completions"
  const label = endpoint?.label ?? "OpenAI"
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${key || "local"}`,
    },
    body: JSON.stringify(openaiPayload(model, messages, packed.snapshot, true)),
    signal: requestSignal(signal),
  })
  if (!response.ok) {
    const raw = await response.text().catch(() => "")
    if (shouldRetryStatus(response.status, raw)) {
      return generateOpenAIOnce(model, messages, snapshot, key, signal, endpoint)
    }
    return {
      ok: false,
      error: `${label} HTTP ${response.status}${raw ? ` · ${raw.slice(0, 220)}` : ""}`,
      retry: false,
    }
  }
  let text = ""
  try {
    await readSseJson(
      response,
      (payload) => {
        const chunk = openaiDeltaText(payload)
        if (!chunk) return
        text += chunk
        onDelta(chunk)
      },
      signal
    )
  } catch (error) {
    if (signal?.aborted) throw error
    if (text.trim()) return { ok: true, text: text.trim() }
    return generateOpenAIOnce(model, messages, snapshot, key, signal, endpoint)
  }
  if (!text.trim()) return generateOpenAIOnce(model, messages, snapshot, key, signal, endpoint)
  return { ok: true, text: text.trim() }
}

async function completeOpenAI(
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  requested: string,
  signal?: AbortSignal
): Promise<IaCompleteOk | IaCompleteErr> {
  const key = openaiKey()
  if (!key) return { ok: false, error: "OPENAI_API_KEY absente (Admin)." }
  let lastError = "OpenAI indisponible"
  for (const model of modelSequence("openai", requested)) {
    const packed = withOptionalImage(snapshot, model, "openai")
    const result = await generateOpenAIOnce(model, messages, snapshot, key, signal)
    if (result.ok) {
      return {
        ok: true,
        text: result.text,
        model,
        provider: "openai",
        requested,
        imageOmitted: packed.imageOmitted,
      }
    }
    lastError = result.error
    if (!result.retry) return { ok: false, error: lastError }
  }
  return { ok: false, error: lastError }
}

export async function completeIa(options: {
  provider: IaProviderId
  model?: string | null
  messages: IaChatMessage[]
  snapshot?: IaSnapshotPayload | null
  signal?: AbortSignal
  systemPrompt?: string | null
}): Promise<IaCompleteOk | IaCompleteErr> {
  requestSystem = options.systemPrompt ?? null
  try {
    const requested = resolveRequestedModel(options.provider, options.model)
    if (!requested) {
      return { ok: false, error: "Aucun modèle pour ce fournisseur." }
    }
    if (options.provider === "google") {
      return completeGemini(options.messages, options.snapshot ?? null, requested, options.signal)
    }
    if (options.provider === "local") {
      return completeLocal(options.messages, options.snapshot ?? null, requested, options.signal)
    }
    return completeOpenAI(options.messages, options.snapshot ?? null, requested, options.signal)
  } finally {
    requestSystem = null
  }
}

async function completeLocal(
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  requested: string,
  signal?: AbortSignal
): Promise<IaCompleteOk | IaCompleteErr> {
  const endpoint = { url: localChatCompletionsUrl(localLlmBase()), label: "LLM local" }
  let lastError = "LLM local injoignable (Ollama ?). Pas de bascule cloud."
  for (const model of modelSequence("local", requested)) {
    const packed = withOptionalImage(snapshot, model, "local")
    try {
      const result = await generateOpenAIOnce(model, messages, snapshot, "local", signal, endpoint)
      if (result.ok) {
        return {
          ok: true,
          text: result.text,
          model,
          provider: "local",
          requested,
          imageOmitted: packed.imageOmitted,
        }
      }
      lastError = result.error
      if (!result.retry) return { ok: false, error: lastError }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "LLM local injoignable. Pas de bascule cloud.",
      }
    }
  }
  return { ok: false, error: lastError }
}

export async function streamIa(
  options: {
    provider: IaProviderId
    model?: string | null
    messages: IaChatMessage[]
    snapshot?: IaSnapshotPayload | null
    signal?: AbortSignal
    systemPrompt?: string | null
  },
  onEvent: (event: IaStreamEvent) => void
): Promise<IaCompleteOk | IaCompleteErr> {
  requestSystem = options.systemPrompt ?? null
  try {
    const requested = resolveRequestedModel(options.provider, options.model)
    if (!requested) {
      const error = "Aucun modèle pour ce fournisseur."
      onEvent({ type: "error", error })
      return { ok: false, error }
    }
    const snapshot = options.snapshot ?? null
    const localEndpoint =
      options.provider === "local"
        ? { url: localChatCompletionsUrl(localLlmBase()), label: "LLM local" }
        : undefined
    const key =
      options.provider === "google" ? googleKey() : options.provider === "local" ? "local" : openaiKey()
    if (options.provider !== "local" && !key) {
      const error =
        options.provider === "google" ? "GOOGLE_API_KEY absente (Admin)." : "OPENAI_API_KEY absente (Admin)."
      onEvent({ type: "error", error })
      return { ok: false, error }
    }
    let lastError = "IA indisponible"
    for (const model of modelSequence(options.provider, requested)) {
      const packed = withOptionalImage(snapshot, model, options.provider)
      let emitted = false
      const onDelta = (chunk: string) => {
        if (!emitted) {
          emitted = true
          onEvent({
            type: "meta",
            model,
            provider: options.provider,
            requested,
            imageOmitted: packed.imageOmitted,
          })
        }
        onEvent({ type: "delta", text: chunk })
      }
      try {
        const result =
          options.provider === "google"
            ? await streamGeminiOnce(model, options.messages, snapshot, key, onDelta, options.signal)
            : await streamOpenAIOnce(
                model,
                options.messages,
                snapshot,
                key,
                onDelta,
                options.signal,
                localEndpoint
              )
        if (result.ok) {
          if (!emitted) {
            onEvent({
              type: "meta",
              model,
              provider: options.provider,
              requested,
              imageOmitted: packed.imageOmitted,
            })
            onEvent({ type: "delta", text: result.text })
          }
          onEvent({
            type: "done",
            text: result.text,
            model,
            provider: options.provider,
            requested,
            imageOmitted: packed.imageOmitted,
          })
          return {
            ok: true,
            text: result.text,
            model,
            provider: options.provider,
            requested,
            imageOmitted: packed.imageOmitted,
          }
        }
        lastError = result.error
        if (emitted || !result.retry) {
          onEvent({ type: "error", error: lastError })
          return { ok: false, error: lastError }
        }
      } catch (error) {
        if (options.signal?.aborted) throw error
        lastError =
          options.provider === "local"
            ? "LLM local injoignable. Pas de bascule cloud."
            : error instanceof Error
              ? error.message
              : "échec IA"
        if (emitted || options.provider === "local") {
          onEvent({ type: "error", error: lastError })
          return { ok: false, error: lastError }
        }
      }
    }
    onEvent({ type: "error", error: lastError })
    return { ok: false, error: lastError }
  } finally {
    requestSystem = null
  }
}
