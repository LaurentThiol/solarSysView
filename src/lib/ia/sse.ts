import type { IaProviderId } from "@/lib/ia/models"

export type IaStreamEvent =
  | { type: "status"; text: string }
  | {
      type: "meta"
      model: string
      provider: IaProviderId
      requested: string
      imageOmitted: boolean
      visionModel?: string | null
      visionFailed?: boolean
    }
  | { type: "delta"; text: string }
  | {
      type: "done"
      text: string
      model: string
      provider: IaProviderId
      requested: string
      imageOmitted: boolean
      visionModel?: string | null
      visionFailed?: boolean
      promptTokens?: number | null
      completionTokens?: number | null
      estimated?: boolean
      latencyMs?: number | null
    }
  | { type: "error"; error: string }

export function encodeSse(data: IaStreamEvent | Record<string, unknown>) {
  return `data: ${JSON.stringify(data)}\n\n`
}

export function consumeSse(buffer: string): { events: string[]; rest: string; done: boolean } {
  const events: string[] = []
  let rest = buffer.replace(/\r\n/g, "\n")
  let done = false
  while (true) {
    const sep = rest.indexOf("\n\n")
    if (sep < 0) break
    const block = rest.slice(0, sep)
    rest = rest.slice(sep + 2)
    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^\s/, ""))
    if (!dataLines.length) continue
    const data = dataLines.join("\n").trim()
    if (data === "[DONE]") {
      done = true
      break
    }
    if (data) events.push(data)
  }
  return { events, rest, done }
}

export function geminiDeltaText(payload: unknown) {
  if (!payload || typeof payload !== "object") return ""
  const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates
  const parts = candidates?.[0]?.content?.parts
  if (!parts?.length) return ""
  return parts.map((part) => part.text || "").join("")
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text
        }
        return ""
      })
      .join("")
  }
  if (content && typeof content === "object") {
    try {
      return JSON.stringify(content)
    } catch {
      return ""
    }
  }
  return ""
}

export function openaiDeltaText(payload: unknown) {
  if (!payload || typeof payload !== "object") return ""
  const record = payload as {
    error?: { message?: string }
    choices?: Array<{ delta?: { content?: string | null }; message?: { content?: string } }>
  }
  if (record.error?.message) throw new Error(record.error.message)
  return record.choices?.[0]?.delta?.content || ""
}

/** Réponse non streamée : le texte est dans message.content, pas dans delta. */
export function openaiCompletionText(payload: unknown) {
  if (!payload || typeof payload !== "object") return ""
  const record = payload as {
    error?: { message?: string }
    choices?: Array<{
      message?: { content?: unknown }
      delta?: { content?: string | null }
    }>
  }
  if (record.error?.message) throw new Error(record.error.message)
  const choice = record.choices?.[0]
  const message = textOf(choice?.message?.content)
  if (message.trim()) return message
  return typeof choice?.delta?.content === "string" ? choice.delta.content : ""
}

export async function readNdjson(
  response: Response,
  onJson: (payload: unknown) => void,
  signal?: AbortSignal
) {
  if (!response.body) throw new Error("réponse vide")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
      const { done, value } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        onJson(JSON.parse(trimmed))
      }
      if (done) {
        const rest = buffer.trim()
        if (rest) onJson(JSON.parse(rest))
        return
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* already released */
    }
  }
}

export function ollamaDeltaText(payload: unknown) {
  if (!payload || typeof payload !== "object") return ""
  const record = payload as {
    error?: string
    message?: { content?: string | null }
    response?: string
  }
  if (record.error) throw new Error(record.error)
  if (typeof record.message?.content === "string") return record.message.content
  if (typeof record.response === "string") return record.response
  return ""
}

export async function readSseJson(
  response: Response,
  onJson: (payload: unknown) => void,
  signal?: AbortSignal
) {
  if (!response.body) throw new Error("réponse vide")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
      const { done, value } = await reader.read()
      if (done) {
        const flushed = consumeSse(`${buffer}\n\n`)
        for (const event of flushed.events) onJson(JSON.parse(event))
        return
      }
      buffer += decoder.decode(value, { stream: true })
      const consumed = consumeSse(buffer)
      buffer = consumed.rest
      for (const event of consumed.events) onJson(JSON.parse(event))
      if (consumed.done) return
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* already released */
    }
  }
}
