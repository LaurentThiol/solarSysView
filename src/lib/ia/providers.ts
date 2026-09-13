import { liveEnv } from "@/lib/env-file"
import { isPlaceholder } from "@/lib/secrets"
import { IMAGE_MAX_CHARS, JSON_BUDGET } from "@/lib/capture/snapshot"
import { IA_SYSTEM_PROMPT } from "@/lib/ia/prompt"

export type IaProviderId = "google" | "openai"

export type IaChatMessage = {
  role: "user" | "assistant"
  content: string
}

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

function googleKey() {
  const value = (liveEnv("GOOGLE_API_KEY") || liveEnv("GEMINI_API_KEY")).trim()
  return value && !isPlaceholder(value) ? value : ""
}

function openaiKey() {
  const value = liveEnv("OPENAI_API_KEY").trim()
  return value && !isPlaceholder(value) ? value : ""
}

export function iaStatus() {
  const google = Boolean(googleKey())
  const openai = Boolean(openaiKey())
  const fallback: IaProviderId | null = google ? "google" : openai ? "openai" : null
  return { google, openai, default: fallback }
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

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
]

const OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini"]

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

async function completeGemini(messages: IaChatMessage[], snapshot: IaSnapshotPayload | null) {
  const key = googleKey()
  if (!key) return { ok: false as const, error: "GOOGLE_API_KEY absente (Admin)." }
  const bodyBase = {
    systemInstruction: { parts: [{ text: IA_SYSTEM_PROMPT }] },
    contents: geminiContents(messages, snapshot),
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
  }
  let lastError = "Gemini indisponible"
  for (const model of GEMINI_MODELS) {
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
    if (response.status === 404) {
      lastError = `modèle ${model} introuvable`
      continue
    }
    if (!response.ok) {
      lastError = `Gemini HTTP ${response.status}${raw ? ` · ${raw.slice(0, 220)}` : ""}`
      if (response.status === 429 || response.status >= 500) continue
      return { ok: false as const, error: lastError }
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
    return { ok: true as const, text: text.trim(), model, provider: "google" as const }
  }
  return { ok: false as const, error: lastError }
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

async function completeOpenAI(messages: IaChatMessage[], snapshot: IaSnapshotPayload | null) {
  const key = openaiKey()
  if (!key) return { ok: false as const, error: "OPENAI_API_KEY absente (Admin)." }
  let lastError = "OpenAI indisponible"
  for (const model of OPENAI_MODELS) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 4096,
        messages: openaiMessages(messages, snapshot),
      }),
      signal: AbortSignal.timeout(45_000),
    })
    const raw = await response.text()
    if (response.status === 404) {
      lastError = `modèle ${model} introuvable`
      continue
    }
    if (!response.ok) {
      lastError = `OpenAI HTTP ${response.status}${raw ? ` · ${raw.slice(0, 220)}` : ""}`
      if (response.status === 429 || response.status >= 500) continue
      return { ok: false as const, error: lastError }
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
    return { ok: true as const, text, model, provider: "openai" as const }
  }
  return { ok: false as const, error: lastError }
}

export async function completeIa(options: {
  provider: IaProviderId
  messages: IaChatMessage[]
  snapshot?: IaSnapshotPayload | null
}) {
  if (options.provider === "google") {
    return completeGemini(options.messages, options.snapshot ?? null)
  }
  return completeOpenAI(options.messages, options.snapshot ?? null)
}
