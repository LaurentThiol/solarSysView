import { apiBase } from "@/lib/api-base"
import { liveEnv } from "@/lib/env-file"
import { isPlaceholder } from "@/lib/secrets"
import { IMAGE_MAX_CHARS, JSON_BUDGET, packCharBudget } from "@/lib/capture/snapshot"
import {
  guessVision,
  isGeminiChatModel,
  isLocalChatModel,
  isLocalTextChatModel,
  isModelId,
  isOpenAiChatModel,
  mergeModelOptions,
  modelSequence,
  openaiUsesMaxCompletionTokens,
  pickAvailableModel,
  pickLocalTextModel,
  pickLocalVisionModel,
  preferredModel,
  resolveRequestedModel,
  stripGeminiName,
  supportsLocalThink,
  type IaChatMessage,
  type IaModelOption,
  type IaProviderId,
} from "@/lib/ia/models"
import {
  isNativeOllamaKind,
  localChatCompletionsUrl,
  localLlmCandidates,
  localLlmOffMessage,
  localLlmSearchBases,
  localNativeChatUrl,
  localProbeUrls,
  normalizeLocalLlmBase,
  probeKindFromUrl,
  type LocalProbeKind,
} from "@/lib/ia/local-url"
import { localGenParams, localPackBudget, ollamaNumCtx } from "@/lib/ia/local-options"
import { llmFetch } from "@/lib/ia/loopback-fetch"
import { IA_SYSTEM_PROMPT, IA_VISION_NOTE_MAX, IA_VISION_PASS_PROMPT } from "@/lib/ia/prompt"
import { usageFromPayload, type IaTokenUsage } from "@/lib/ia/usage"
import {
  geminiDeltaText,
  ollamaDeltaText,
  openaiDeltaText,
  readNdjson,
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
  visionOnly?: boolean
  visionNotes?: string | null
}

export type IaVisionPass = {
  model: string
  ok: boolean
  error: string | null
  promptTokens: number | null
  completionTokens: number | null
  estimated: boolean
  latencyMs: number | null
}

export type IaCompleteOk = {
  ok: true
  text: string
  model: string
  provider: IaProviderId
  requested: string
  imageOmitted: boolean
  visionModel?: string | null
  visionFailed?: boolean
  visionPass?: IaVisionPass | null
  promptTokens: number | null
  completionTokens: number | null
  estimated: boolean
  latencyMs: number | null
}

export type IaCompleteErr = { ok: false; error: string; visionPass?: IaVisionPass | null }

function googleKey() {
  const value = (liveEnv("GOOGLE_API_KEY") || liveEnv("GEMINI_API_KEY")).trim()
  return value && !isPlaceholder(value) ? value : ""
}

function openaiKey() {
  const value = liveEnv("OPENAI_API_KEY").trim()
  return value && !isPlaceholder(value) ? value : ""
}

export { localChatCompletionsUrl, localModelsUrl, normalizeLocalLlmBase } from "@/lib/ia/local-url"
export { setLlmTransport } from "@/lib/ia/loopback-fetch"

export function localLlmBase() {
  const fromEnv = (liveEnv("LOCAL_LLM_BASE_URL") || liveEnv("OLLAMA_HOST")).trim()
  return normalizeLocalLlmBase(fromEnv || "http://127.0.0.1:11434")
}

function systemText(override?: string | null) {
  const text = override?.trim()
  if (text && text.length > 0 && text.length <= 12_000) return text
  return IA_SYSTEM_PROMPT
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

function chatIdsFromNames(names: string[]) {
  return names.filter((id) => isModelId(id) && isLocalChatModel(id))
}

function idsFromLocalPayload(data: {
  models?: Array<{ name?: string }>
  data?: Array<{ id?: string }>
  version?: string
}): string[] | null {
  if (Array.isArray(data.models)) {
    return chatIdsFromNames(data.models.map((item) => item.name || ""))
  }
  if (Array.isArray(data.data)) {
    return chatIdsFromNames(data.data.map((item) => item.id || ""))
  }
  if (data.version) return []
  return null
}

async function probeLocalUrl(
  url: string,
  timeoutMs: number
): Promise<{ ids: string[] | null; kind: LocalProbeKind | null; error?: string }> {
  try {
    const response = await llmFetch(url, { method: "GET", cache: "no-store" }, timeoutMs)
    if (!response.ok) return { ids: null, kind: null, error: `HTTP ${response.status} ${url}` }
    const data = (await response.json()) as {
      models?: Array<{ name?: string }>
      data?: Array<{ id?: string }>
      version?: string
    }
    const ids = idsFromLocalPayload(data)
    if (ids === null) return { ids: null, kind: null, error: `réponse inattendue ${url}` }
    return { ids, kind: probeKindFromUrl(url) }
  } catch (error) {
    return { ids: null, kind: null, error: error instanceof Error ? error.message : String(error) }
  }
}

async function listLocalIdsViaPython(): Promise<string[] | null> {
  const python = apiBase()
  if (!python) return null
  try {
    const response = await llmFetch(
      `${python}/api/brain/status`,
      { method: "GET", cache: "no-store" },
      LIVE_TIMEOUT_MS
    )
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

type LocalProbe = {
  ok: boolean
  ids: string[] | null
  kind: LocalProbeKind | null
  at: number
  host: string
  error?: string
}

let localProbeCache: (LocalProbe & { requested: string }) | null = null
const LOCAL_PROBE_TTL_MS = 10_000
const LOCAL_PROBE_TIMEOUT_MS = 800
const LOCAL_CHAT_TIMEOUT_MS = 180_000
const CLOUD_CHAT_TIMEOUT_MS = 45_000

export function clearLocalLlmProbeCache() {
  localProbeCache = null
}

export async function probeLocalLlm(host = localLlmBase(), timeoutMs = LOCAL_PROBE_TIMEOUT_MS): Promise<LocalProbe> {
  if (
    localProbeCache &&
    localProbeCache.ok &&
    localProbeCache.requested === host &&
    Date.now() - localProbeCache.at < LOCAL_PROBE_TTL_MS
  ) {
    return localProbeCache
  }
  const attempts = await Promise.all(
    localLlmSearchBases(host).map(async (candidate) => {
      const probes = await Promise.all(localProbeUrls(candidate).map((url) => probeLocalUrl(url, timeoutMs)))
      const hit = probes.find((item) => item.ids !== null)
      const error = probes.map((item) => item.error).filter(Boolean)[0]
      return { ids: hit?.ids ?? null, host: candidate, kind: hit?.kind ?? null, error }
    })
  )
  let hit = attempts.find((item) => item.ids !== null)
  let pythonFallback = false
  if (!hit) {
    const ids = await listLocalIdsViaPython()
    if (ids !== null) {
      hit = { ids, host, kind: "openai", error: undefined }
      pythonFallback = true
    } else attempts.push({ ids: null, host, kind: null, error: "API Python : Ollama injoignable" })
  }
  const probe: LocalProbe = {
    ok: Boolean(hit),
    ids: hit?.ids ?? null,
    kind: pythonFallback ? "openai" : hit?.kind ?? null,
    at: Date.now(),
    host: hit?.host ?? host,
    error: hit
      ? undefined
      : localLlmOffMessage(attempts.map((item) => item.error).filter(Boolean)[0]),
  }
  localProbeCache = probe.ok ? { ...probe, requested: host } : null
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
  const localHost = localProbe.host
  const fallback: IaProviderId | null = google ? "google" : openai ? "openai" : local ? "local" : null
  const models: IaModelOption[] = mergeModelOptions({
    google,
    openai,
    local,
    liveGoogle,
    liveOpenAI,
    liveLocal,
  })
  const envModel = liveEnv("LOCAL_LLM_MODEL").trim()
  return {
    google,
    openai,
    local,
    localHost,
    localModelEnv: envModel || null,
    default: fallback,
    defaultModel: fallback
      ? pickAvailableModel(models, fallback, null, {
          envModel,
          liveIds: liveLocal,
        }) ?? preferredModel(fallback)
      : null,
    live: {
      google: google ? liveGoogle !== null : null,
      openai: openai ? liveOpenAI !== null : null,
      local,
    },
    models,
  }
}

function clipTech(tech: unknown, budget = JSON_BUDGET) {
  try {
    const json = JSON.stringify(tech ?? {})
    if (json.length <= budget) return json
    return `${json.slice(0, budget)}\n… [tronqué]`
  } catch {
    return "{}"
  }
}

function snapshotText(snapshot: IaSnapshotPayload | null | undefined, budget = JSON_BUDGET) {
  if (!snapshot) return ""
  if (snapshot.visionOnly) {
    return [
      "Capture d’écran Synchro. Décris seulement ce qui se voit.",
      `Laboratoire : ${snapshot.lab ?? "?"} · onglet : ${snapshot.tab ?? "—"} · route : ${snapshot.route ?? "—"}`,
      snapshot.capturedAt ? `Capturé : ${snapshot.capturedAt}` : "",
      snapshot.question ? `Question : ${snapshot.question}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  }
  const header = [
    "Pack de lecture Synchro (données sous-jacentes ; un pronostic est une hypothèse, pas une certitude).",
    snapshot.disclaimer || "",
    `Laboratoire : ${snapshot.lab ?? "?"} · onglet : ${snapshot.tab ?? "—"} · route : ${snapshot.route ?? "—"}`,
    snapshot.capturedAt ? `Capturé : ${snapshot.capturedAt}` : "",
    snapshot.gitSha ? `Git : ${snapshot.gitSha}` : "",
    snapshot.archive ? `Archive : ${JSON.stringify(snapshot.archive)}` : "",
    snapshot.summary?.length ? `Résumé :\n- ${snapshot.summary.join("\n- ")}` : "",
    snapshot.visionNotes
      ? `Notes visuelles (VLM, hypothèse d’écran, pas une source chiffrée) :\n${snapshot.visionNotes}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
  const techBudget = Math.max(1_000, budget - header.length - 28)
  return `${header}\nDonnées techniques JSON :\n${clipTech(snapshot.tech, techBudget)}`
}

export function localTwoPassEnabled() {
  const raw = liveEnv("IA_LOCAL_TWO_PASS").trim().toLowerCase()
  return raw !== "0" && raw !== "false" && raw !== "off"
}

export function visionUnloadEnabled() {
  const raw = liveEnv("IA_VISION_UNLOAD").trim().toLowerCase()
  return raw === "1" || raw === "true" || raw === "on"
}

export function clipVisionNotes(text: string) {
  const trimmed = text.trim()
  if (trimmed.length <= IA_VISION_NOTE_MAX) return trimmed
  return `${trimmed.slice(0, IA_VISION_NOTE_MAX)}\n… [tronqué]`
}

function visionHeaderSnapshot(snapshot: IaSnapshotPayload): IaSnapshotPayload {
  return {
    lab: snapshot.lab,
    tab: snapshot.tab,
    route: snapshot.route,
    capturedAt: snapshot.capturedAt,
    question: snapshot.question,
    imageDataUrl: snapshot.imageDataUrl,
    visionOnly: true,
  }
}

function lastUserMessages(messages: IaChatMessage[]) {
  const last = [...messages].reverse().find((item) => item.role === "user")
  return last ? [last] : messages
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

function requestSignal(external?: AbortSignal, timeoutMs = CLOUD_CHAT_TIMEOUT_MS) {
  const timeout = AbortSignal.timeout(timeoutMs)
  if (!external) return timeout
  if (typeof AbortSignal.any === "function") return AbortSignal.any([external, timeout])
  return timeout
}

type OnceOk = { ok: true; text: string; usage?: IaTokenUsage }
type OnceErr = { ok: false; error: string; retry: boolean }
type OnceResult = OnceOk | OnceErr

function onceOk(text: string, payload: unknown, started: number): OnceOk {
  return { ok: true, text, usage: usageFromPayload(payload, text, started) }
}

function toCompleteOk(input: {
  text: string
  model: string
  provider: IaProviderId
  requested: string
  imageOmitted: boolean
  visionModel?: string | null
  visionFailed?: boolean
  visionPass?: IaVisionPass | null
  usage?: IaTokenUsage
}): IaCompleteOk {
  return {
    ok: true,
    text: input.text,
    model: input.model,
    provider: input.provider,
    requested: input.requested,
    imageOmitted: input.imageOmitted,
    visionModel: input.visionModel ?? null,
    visionFailed: Boolean(input.visionFailed),
    visionPass: input.visionPass ?? null,
    promptTokens: input.usage?.promptTokens ?? null,
    completionTokens: input.usage?.completionTokens ?? null,
    estimated: Boolean(input.usage?.estimated),
    latencyMs: input.usage?.latencyMs ?? null,
  }
}

async function generateGeminiOnce(
  model: string,
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  key: string,
  signal?: AbortSignal,
  system?: string | null
): Promise<OnceResult> {
  const packed = withOptionalImage(snapshot, model, "google")
  const started = Date.now()
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText(system) }] },
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
  return onceOk(text.trim(), data, started)
}

async function streamGeminiOnce(
  model: string,
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  key: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  system?: string | null
): Promise<OnceResult> {
  const packed = withOptionalImage(snapshot, model, "google")
  const started = Date.now()
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemText(system) }] },
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
      return generateGeminiOnce(model, messages, snapshot, key, signal, system)
    }
    return {
      ok: false,
      error: `Gemini HTTP ${response.status}${raw ? ` · ${raw.slice(0, 220)}` : ""}`,
      retry: false,
    }
  }
  let text = ""
  let lastPayload: unknown = null
  try {
    await readSseJson(
      response,
      (payload) => {
        lastPayload = payload
        const chunk = geminiDeltaText(payload)
        if (!chunk) return
        text += chunk
        onDelta(chunk)
      },
      signal
    )
  } catch (error) {
    if (signal?.aborted) throw error
    if (text.trim()) return onceOk(text.trim(), lastPayload, started)
    return generateGeminiOnce(model, messages, snapshot, key, signal, system)
  }
  if (!text.trim()) return generateGeminiOnce(model, messages, snapshot, key, signal, system)
  return onceOk(text.trim(), lastPayload, started)
}

async function completeGemini(
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  requested: string,
  signal?: AbortSignal,
  system?: string | null
): Promise<IaCompleteOk | IaCompleteErr> {
  const key = googleKey()
  if (!key) return { ok: false, error: "GOOGLE_API_KEY absente (Admin)." }
  let lastError = "Gemini indisponible"
  for (const model of modelSequence("google", requested)) {
    const packed = withOptionalImage(snapshot, model, "google")
    const result = await generateGeminiOnce(model, messages, snapshot, key, signal, system)
    if (result.ok) {
      return toCompleteOk({
        text: result.text,
        model,
        provider: "google",
        requested,
        imageOmitted: packed.imageOmitted,
        usage: result.usage,
      })
    }
    lastError = result.error
    if (!result.retry) return { ok: false, error: lastError }
  }
  return { ok: false, error: lastError }
}

function openaiMessages(
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  system?: string | null,
  budget = JSON_BUDGET
) {
  const pack = snapshotText(snapshot, budget)
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
  system?: string | null,
  opts?: { deepen?: boolean; local?: boolean }
) {
  const deepen = Boolean(opts?.deepen && opts.local)
  const params = localGenParams(deepen)
  const budget = localPackBudget(false)
  const body: Record<string, unknown> = {
    model,
    messages: openaiMessages(messages, snapshot, system, budget),
  }
  if (openaiUsesMaxCompletionTokens(model) && !opts?.local) {
    body.max_completion_tokens = params.predict
  } else {
    body.temperature = params.temperature
    body.max_tokens = params.predict
    if (params.topP != null) body.top_p = params.topP
  }
  if (stream) {
    body.stream = true
    if (!opts?.local) body.stream_options = { include_usage: true }
  }
  return body
}

async function generateOpenAIOnce(
  model: string,
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  key: string,
  signal?: AbortSignal,
  endpoint?: { url: string; label: string },
  deepen = false,
  system?: string | null
): Promise<OnceResult> {
  const packed = withOptionalImage(snapshot, model, endpoint ? "local" : "openai")
  const url = endpoint?.url ?? "https://api.openai.com/v1/chat/completions"
  const label = endpoint?.label ?? "OpenAI"
  const local = Boolean(endpoint)
  const timeoutMs = local ? LOCAL_CHAT_TIMEOUT_MS : CLOUD_CHAT_TIMEOUT_MS
  const started = Date.now()
  const response = await llmFetch(
    url,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${key || "local"}`,
      },
      body: JSON.stringify(openaiPayload(model, messages, packed.snapshot, false, system, { deepen, local })),
      signal: requestSignal(signal, timeoutMs),
    },
    timeoutMs
  )
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
  return onceOk(text, data, started)
}

async function streamOpenAIOnce(
  model: string,
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  key: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  endpoint?: { url: string; label: string },
  deepen = false,
  system?: string | null
): Promise<OnceResult> {
  const packed = withOptionalImage(snapshot, model, endpoint ? "local" : "openai")
  const url = endpoint?.url ?? "https://api.openai.com/v1/chat/completions"
  const label = endpoint?.label ?? "OpenAI"
  const local = Boolean(endpoint)
  const timeoutMs = local ? LOCAL_CHAT_TIMEOUT_MS : CLOUD_CHAT_TIMEOUT_MS
  const started = Date.now()
  const response = await llmFetch(
    url,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${key || "local"}`,
      },
      body: JSON.stringify(openaiPayload(model, messages, packed.snapshot, true, system, { deepen, local })),
      signal: requestSignal(signal, timeoutMs),
    },
    timeoutMs
  )
  if (!response.ok) {
    const raw = await response.text().catch(() => "")
    if (shouldRetryStatus(response.status, raw)) {
      return generateOpenAIOnce(model, messages, snapshot, key, signal, endpoint, deepen, system)
    }
    return {
      ok: false,
      error: `${label} HTTP ${response.status}${raw ? ` · ${raw.slice(0, 220)}` : ""}`,
      retry: false,
    }
  }
  let text = ""
  let lastPayload: unknown = null
  try {
    await readSseJson(
      response,
      (payload) => {
        lastPayload = payload
        const chunk = openaiDeltaText(payload)
        if (!chunk) return
        text += chunk
        onDelta(chunk)
      },
      signal
    )
  } catch (error) {
    if (signal?.aborted) throw error
    if (text.trim()) return onceOk(text.trim(), lastPayload, started)
    return generateOpenAIOnce(model, messages, snapshot, key, signal, endpoint, deepen, system)
  }
  if (!text.trim()) return generateOpenAIOnce(model, messages, snapshot, key, signal, endpoint, deepen, system)
  return onceOk(text.trim(), lastPayload, started)
}

async function completeOpenAI(
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  requested: string,
  signal?: AbortSignal,
  system?: string | null
): Promise<IaCompleteOk | IaCompleteErr> {
  const key = openaiKey()
  if (!key) return { ok: false, error: "OPENAI_API_KEY absente (Admin)." }
  let lastError = "OpenAI indisponible"
  for (const model of modelSequence("openai", requested)) {
    const packed = withOptionalImage(snapshot, model, "openai")
    const result = await generateOpenAIOnce(model, messages, snapshot, key, signal, undefined, false, system)
    if (result.ok) {
      return toCompleteOk({
        text: result.text,
        model,
        provider: "openai",
        requested,
        imageOmitted: packed.imageOmitted,
        usage: result.usage,
      })
    }
    lastError = result.error
    if (!result.retry) return { ok: false, error: lastError }
  }
  return { ok: false, error: lastError }
}

function ollamaMessages(
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  budget: number,
  system?: string | null
) {
  const pack = snapshotText(snapshot, budget)
  const image = parseDataUrl(snapshot?.imageDataUrl)
  const out: Array<Record<string, unknown>> = [{ role: "system", content: systemText(system) }]
  messages.forEach((message, index) => {
    if (message.role === "assistant") {
      out.push({ role: "assistant", content: message.content })
      return
    }
    const text = index === 0 && pack ? `${pack}\n\nQuestion :\n${message.content}` : message.content
    if (index === 0 && image) {
      out.push({ role: "user", content: text, images: [image.data] })
      return
    }
    out.push({ role: "user", content: text })
  })
  return out
}

export function buildOllamaChatBody(
  model: string,
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  options: { stream?: boolean; deepen?: boolean; system?: string | null; keepAlive?: string | number } = {}
) {
  const deepen = Boolean(options.deepen)
  const params = localGenParams(deepen)
  const packed = withOptionalImage(snapshot, model, "local")
  const body: Record<string, unknown> = {
    model,
    stream: Boolean(options.stream),
    keep_alive: options.keepAlive ?? "30m",
    messages: ollamaMessages(messages, packed.snapshot, packCharBudget(ollamaNumCtx()), options.system),
    options: {
      num_ctx: ollamaNumCtx(),
      num_predict: params.predict,
      temperature: params.temperature,
      ...(params.topP != null ? { top_p: params.topP } : {}),
    },
  }
  if (deepen && supportsLocalThink(model)) body.think = true
  return body
}

async function generateOllamaOnce(
  host: string,
  model: string,
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  signal?: AbortSignal,
  deepen = false,
  system?: string | null,
  keepAlive: string | number = "30m"
): Promise<OnceResult> {
  const url = localNativeChatUrl(host)
  const started = Date.now()
  const response = await llmFetch(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildOllamaChatBody(model, messages, snapshot, { stream: false, deepen, system, keepAlive })),
      signal: requestSignal(signal, LOCAL_CHAT_TIMEOUT_MS),
    },
    LOCAL_CHAT_TIMEOUT_MS
  )
  const raw = await response.text()
  if (!response.ok) {
    return {
      ok: false,
      error: `LLM local HTTP ${response.status}${raw ? ` · ${raw.slice(0, 220)}` : ""}`,
      retry: shouldRetryStatus(response.status, raw),
    }
  }
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return { ok: false, error: "réponse Ollama illisible", retry: true }
  }
  const text = ollamaDeltaText(payload).trim()
  if (!text) {
    return { ok: false, error: "réponse vide", retry: true }
  }
  return onceOk(text, payload, started)
}

async function streamOllamaOnce(
  host: string,
  model: string,
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  deepen = false,
  system?: string | null,
  keepAlive: string | number = "30m"
): Promise<OnceResult> {
  const url = localNativeChatUrl(host)
  const started = Date.now()
  const response = await llmFetch(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildOllamaChatBody(model, messages, snapshot, { stream: true, deepen, system, keepAlive })),
      signal: requestSignal(signal, LOCAL_CHAT_TIMEOUT_MS),
    },
    LOCAL_CHAT_TIMEOUT_MS
  )
  if (!response.ok) {
    const raw = await response.text().catch(() => "")
    if (shouldRetryStatus(response.status, raw)) {
      return generateOllamaOnce(host, model, messages, snapshot, signal, deepen, system, keepAlive)
    }
    return {
      ok: false,
      error: `LLM local HTTP ${response.status}${raw ? ` · ${raw.slice(0, 220)}` : ""}`,
      retry: false,
    }
  }
  let text = ""
  let lastPayload: unknown = null
  try {
    await readNdjson(
      response,
      (payload) => {
        lastPayload = payload
        const chunk = ollamaDeltaText(payload)
        if (!chunk) return
        text += chunk
        onDelta(chunk)
      },
      signal
    )
  } catch (error) {
    if (signal?.aborted) throw error
    if (text.trim()) return onceOk(text.trim(), lastPayload, started)
    return generateOllamaOnce(host, model, messages, snapshot, signal, deepen, system, keepAlive)
  }
  if (!text.trim()) return generateOllamaOnce(host, model, messages, snapshot, signal, deepen, system, keepAlive)
  return onceOk(text.trim(), lastPayload, started)
}

export async function completeIa(options: {
  provider: IaProviderId
  model?: string | null
  messages: IaChatMessage[]
  snapshot?: IaSnapshotPayload | null
  signal?: AbortSignal
  systemPrompt?: string | null
  deepen?: boolean
}): Promise<IaCompleteOk | IaCompleteErr> {
  const system = options.systemPrompt ?? null
  const deepen = options.provider === "local" && Boolean(options.deepen)
  const requested = resolveRequestedModel(options.provider, options.model)
  if (!requested) {
    return { ok: false, error: "Aucun modèle pour ce fournisseur." }
  }
  if (options.provider === "google") {
    return completeGemini(options.messages, options.snapshot ?? null, requested, options.signal, system)
  }
  if (options.provider === "local") {
    return completeLocal(options.messages, options.snapshot ?? null, requested, options.signal, deepen, system)
  }
  return completeOpenAI(options.messages, options.snapshot ?? null, requested, options.signal, system)
}

type LocalPassPlan = {
  snapshot: IaSnapshotPayload | null
  models: string[]
  imageOmitted: boolean
  visionModel: string | null
  visionFailed: boolean
  visionPass: IaVisionPass | null
}

async function generateLocalOnce(
  native: boolean,
  base: string,
  model: string,
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  signal?: AbortSignal,
  deepen = false,
  system?: string | null,
  keepAlive: string | number = "30m"
): Promise<OnceResult> {
  if (native) return generateOllamaOnce(base, model, messages, snapshot, signal, deepen, system, keepAlive)
  return generateOpenAIOnce(
    model,
    messages,
    snapshot,
    "local",
    signal,
    { url: localChatCompletionsUrl(base), label: "LLM local" },
    deepen,
    system
  )
}

function visionPassFrom(
  model: string,
  ok: boolean,
  error: string | null,
  usage?: IaTokenUsage,
  latencyMs?: number | null
): IaVisionPass {
  return {
    model,
    ok,
    error,
    promptTokens: usage?.promptTokens ?? null,
    completionTokens: usage?.completionTokens ?? null,
    estimated: Boolean(usage?.estimated),
    latencyMs: usage?.latencyMs ?? latencyMs ?? null,
  }
}

async function collectVisionNotes(
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload,
  visionId: string,
  bases: string[],
  native: boolean,
  signal?: AbortSignal
): Promise<{ notes: string | null; pass: IaVisionPass }> {
  const keepAlive = visionUnloadEnabled() ? 0 : "30m"
  const visionSnap = visionHeaderSnapshot(snapshot)
  const visionMessages = lastUserMessages(messages)
  let lastError = "lecture visuelle échouée"
  let lastLatency: number | null = null
  for (const base of bases) {
    const started = Date.now()
    try {
      const result = await generateLocalOnce(
        native,
        base,
        visionId,
        visionMessages,
        visionSnap,
        signal,
        false,
        IA_VISION_PASS_PROMPT,
        keepAlive
      )
      const latencyMs = Date.now() - started
      if (result.ok) {
        const notes = clipVisionNotes(result.text)
        if (notes) {
          return { notes, pass: visionPassFrom(visionId, true, null, result.usage, latencyMs) }
        }
        lastError = "lecture visuelle vide"
        lastLatency = result.usage?.latencyMs ?? latencyMs
        continue
      }
      lastError = result.error
      lastLatency = latencyMs
    } catch (error) {
      lastError = error instanceof Error ? error.message : "lecture visuelle échouée"
      lastLatency = Date.now() - started
    }
  }
  return { notes: null, pass: visionPassFrom(visionId, false, lastError, undefined, lastLatency) }
}

async function planLocalPass(
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  requested: string,
  liveIds: string[],
  bases: string[],
  native: boolean,
  signal?: AbortSignal,
  onStatus?: (text: string) => void
): Promise<LocalPassPlan> {
  const envModel = liveEnv("LOCAL_LLM_MODEL").trim()
  const textId = pickLocalTextModel(liveIds, requested, envModel)
  const visionId = pickLocalVisionModel(liveIds, requested)
  const hasImage = Boolean(snapshot?.imageDataUrl)
  const twoPass = Boolean(snapshot && hasImage && localTwoPassEnabled() && visionId)
  if (twoPass && snapshot && visionId) {
    onStatus?.("Lecture du visuel…")
    const collected = await collectVisionNotes(messages, snapshot, visionId, bases, native, signal)
    if (!collected.notes) onStatus?.("Lecture visuelle échouée, réponse sur le pack seul.")
    return {
      snapshot: { ...snapshot, imageDataUrl: undefined, visionNotes: collected.notes, visionOnly: false },
      models: [textId || visionId],
      imageOmitted: !collected.notes,
      visionModel: collected.notes ? visionId : null,
      visionFailed: !collected.notes,
      visionPass: collected.pass,
    }
  }
  if (hasImage && visionId && !localTwoPassEnabled()) {
    return { snapshot, models: [visionId], imageOmitted: false, visionModel: visionId, visionFailed: false, visionPass: null }
  }
  const fallback = modelSequence("local", requested).filter((id) => isLocalTextChatModel(id) || !isLocalChatModel(id))
  const models = textId ? [textId, ...fallback.filter((id) => id !== textId)] : fallback
  return {
    snapshot,
    models: models.length ? models : modelSequence("local", requested),
    imageOmitted: hasImage,
    visionModel: null,
    visionFailed: false,
    visionPass: null,
  }
}

async function completeLocal(
  messages: IaChatMessage[],
  snapshot: IaSnapshotPayload | null,
  requested: string,
  signal?: AbortSignal,
  deepen = false,
  system?: string | null
): Promise<IaCompleteOk | IaCompleteErr> {
  const probe = await probeLocalLlm()
  const native = isNativeOllamaKind(probe.kind)
  const bases = probe.ok ? [probe.host] : localLlmCandidates(localLlmBase())
  const liveIds = probe.ids ?? []
  const plan = await planLocalPass(messages, snapshot, requested, liveIds, bases, native, signal)
  let lastError = "LLM local injoignable (Ollama ?). Pas de bascule cloud."
  for (const base of bases) {
    for (const model of plan.models) {
      const packed = withOptionalImage(plan.snapshot, model, "local")
      try {
        const result = await generateLocalOnce(
          native,
          base,
          model,
          messages,
          plan.snapshot,
          signal,
          deepen,
          system,
          "30m"
        )
        if (result.ok) {
          return toCompleteOk({
            text: result.text,
            model,
            provider: "local",
            requested,
            imageOmitted: plan.imageOmitted || packed.imageOmitted,
            visionModel: plan.visionModel,
            visionFailed: plan.visionFailed,
            visionPass: plan.visionPass,
            usage: result.usage,
          })
        }
        lastError = result.error
        if (!result.retry) return { ok: false, error: lastError, visionPass: plan.visionPass }
      } catch (error) {
        lastError = error instanceof Error ? error.message : "LLM local injoignable. Pas de bascule cloud."
        break
      }
    }
  }
  return { ok: false, error: lastError, visionPass: plan.visionPass }
}

export async function streamIa(
  options: {
    provider: IaProviderId
    model?: string | null
    messages: IaChatMessage[]
    snapshot?: IaSnapshotPayload | null
    signal?: AbortSignal
    systemPrompt?: string | null
    deepen?: boolean
  },
  onEvent: (event: IaStreamEvent) => void
): Promise<IaCompleteOk | IaCompleteErr> {
  const system = options.systemPrompt ?? null
  const deepen = options.provider === "local" && Boolean(options.deepen)
  const requested = resolveRequestedModel(options.provider, options.model)
    if (!requested) {
      const error = "Aucun modèle pour ce fournisseur."
      onEvent({ type: "error", error })
      return { ok: false, error }
    }
    const snapshot = options.snapshot ?? null
    const key =
      options.provider === "google" ? googleKey() : options.provider === "local" ? "local" : openaiKey()
    if (options.provider !== "local" && !key) {
      const error =
        options.provider === "google" ? "GOOGLE_API_KEY absente (Admin)." : "OPENAI_API_KEY absente (Admin)."
      onEvent({ type: "error", error })
      return { ok: false, error }
    }
    const localProbe = options.provider === "local" ? await probeLocalLlm() : null
    const native = isNativeOllamaKind(localProbe?.kind)
    const localBases =
      options.provider === "local"
        ? localProbe?.ok
          ? [localProbe.host]
          : localLlmCandidates(localLlmBase())
        : [""]
    const localPlan =
      options.provider === "local"
        ? await planLocalPass(
            options.messages,
            snapshot,
            requested,
            localProbe?.ids ?? [],
            localBases,
            native,
            options.signal,
            (text) => onEvent({ type: "status", text })
          )
        : null
    const workingSnapshot = localPlan?.snapshot ?? snapshot
    const modelIds = localPlan?.models ?? modelSequence(options.provider, requested)
    let lastError = "IA indisponible"
    for (const localBase of localBases) {
      const localEndpoint =
        options.provider === "local"
          ? { url: localChatCompletionsUrl(localBase), label: "LLM local" }
          : undefined
      let hostFailed = false
      for (const model of modelIds) {
        const packed = withOptionalImage(workingSnapshot, model, options.provider)
        const imageOmitted = localPlan ? localPlan.imageOmitted || packed.imageOmitted : packed.imageOmitted
        const visionModel = localPlan?.visionModel ?? null
        const visionFailed = Boolean(localPlan?.visionFailed)
        const visionPass = localPlan?.visionPass ?? null
        let emitted = false
        const onDelta = (chunk: string) => {
          if (!emitted) {
            emitted = true
            onEvent({
              type: "meta",
              model,
              provider: options.provider,
              requested,
              imageOmitted,
              visionModel,
              visionFailed,
            })
          }
          onEvent({ type: "delta", text: chunk })
        }
        try {
          const result =
            options.provider === "google"
              ? await streamGeminiOnce(model, options.messages, workingSnapshot, key, onDelta, options.signal, system)
              : options.provider === "local" && native
                ? await streamOllamaOnce(
                    localBase,
                    model,
                    options.messages,
                    workingSnapshot,
                    onDelta,
                    options.signal,
                    deepen,
                    system,
                    "30m"
                  )
                : await streamOpenAIOnce(
                    model,
                    options.messages,
                    workingSnapshot,
                    key,
                    onDelta,
                    options.signal,
                    localEndpoint,
                    deepen,
                    system
                  )
          if (result.ok) {
            const complete = toCompleteOk({
              text: result.text,
              model,
              provider: options.provider,
              requested,
              imageOmitted,
              visionModel,
              visionFailed,
              visionPass,
              usage: result.usage,
            })
            if (!emitted) {
              onEvent({
                type: "meta",
                model,
                provider: options.provider,
                requested,
                imageOmitted,
                visionModel,
                visionFailed,
              })
              onEvent({ type: "delta", text: result.text })
            }
            onEvent({
              type: "done",
              text: complete.text,
              model: complete.model,
              provider: complete.provider,
              requested: complete.requested,
              imageOmitted: complete.imageOmitted,
              visionModel: complete.visionModel,
              visionFailed: complete.visionFailed,
              promptTokens: complete.promptTokens,
              completionTokens: complete.completionTokens,
              estimated: complete.estimated,
              latencyMs: complete.latencyMs,
            })
            return complete
          }
          lastError = result.error
          if (emitted || !result.retry) {
            onEvent({ type: "error", error: lastError })
            return { ok: false, error: lastError, visionPass }
          }
        } catch (error) {
          if (options.signal?.aborted) throw error
          lastError =
            options.provider === "local"
              ? error instanceof Error
                ? error.message
                : "LLM local injoignable. Pas de bascule cloud."
              : error instanceof Error
                ? error.message
                : "échec IA"
          if (emitted) {
            onEvent({ type: "error", error: lastError })
            return { ok: false, error: lastError, visionPass }
          }
          if (options.provider === "local") {
            hostFailed = true
            break
          }
        }
      }
      if (!hostFailed && options.provider !== "local") break
    }
    onEvent({ type: "error", error: lastError })
    return { ok: false, error: lastError, visionPass: localPlan?.visionPass ?? null }
}
