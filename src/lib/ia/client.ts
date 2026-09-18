import { consumeSse, type IaStreamEvent } from "@/lib/ia/sse"
import type { IaChatMessage, IaProviderId } from "@/lib/ia/models"
import type { IaSnapshotPayload } from "@/lib/ia/providers"
import type { LlmUsageSurface } from "@/lib/ia/record-usage"

export async function streamIaChat(
  body: {
    provider: IaProviderId
    model?: string | null
    messages: IaChatMessage[]
    snapshot?: IaSnapshotPayload | null
    systemPrompt?: string | null
    deepen?: boolean
    surface?: LlmUsageSurface
  },
  handlers: {
    onEvent: (event: IaStreamEvent) => void
    signal?: AbortSignal
  }
) {
  const response = await fetch("/api/ia/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal: handlers.signal,
    cache: "no-store",
  })
  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("text/event-stream")) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error || `HTTP ${response.status}`)
  }
  if (!response.body) throw new Error("réponse vide")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const emit = (raw: string) => {
    const event = JSON.parse(raw) as IaStreamEvent
    handlers.onEvent(event)
    if (event.type === "error") throw new Error(event.error)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      const flushed = consumeSse(`${buffer}\n\n`)
      for (const raw of flushed.events) emit(raw)
      return
    }
    buffer += decoder.decode(value, { stream: true })
    const consumed = consumeSse(buffer)
    buffer = consumed.rest
    for (const raw of consumed.events) emit(raw)
    if (consumed.done) return
  }
}
