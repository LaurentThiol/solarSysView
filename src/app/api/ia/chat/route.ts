import { NextResponse } from "next/server"

import { isAuthenticated } from "@/lib/admin-auth"
import { isNetlify } from "@/lib/api-base"
import {
  completeIa,
  iaStatus,
  streamIa,
  type IaChatMessage,
  type IaProviderId,
  type IaSnapshotPayload,
} from "@/lib/ia/providers"
import { encodeSse, type IaStreamEvent } from "@/lib/ia/sse"

export const dynamic = "force-dynamic"
export const maxDuration = 60

type Body = {
  provider?: IaProviderId
  model?: string | null
  messages?: IaChatMessage[]
  snapshot?: IaSnapshotPayload | null
  stream?: boolean
}

type ChatRequest = {
  provider: IaProviderId
  model?: string | null
  messages: IaChatMessage[]
  snapshot: IaSnapshotPayload | null
  stream: boolean
}

function cleanedMessages(messages: IaChatMessage[]) {
  return messages.filter(
    (message) =>
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string" &&
      message.content.trim()
  )
}

async function resolveChat(request: Request): Promise<{ error: NextResponse } | ChatRequest> {
  if (isNetlify() && !(await isAuthenticated(request))) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Authentification admin requise hors localhost." },
        { status: 401 }
      ),
    }
  }
  const status = await iaStatus()
  const body = (await request.json().catch(() => null)) as Body | null
  if (!body) {
    return { error: NextResponse.json({ ok: false, error: "Requête invalide" }, { status: 400 }) }
  }
  const provider: IaProviderId | null =
    body.provider === "google" || body.provider === "openai" ? body.provider : status.default
  if (!provider) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Aucune clé Gemini / OpenAI. Configure-les dans Admin." },
        { status: 400 }
      ),
    }
  }
  if (provider === "google" && !status.google) {
    return {
      error: NextResponse.json({ ok: false, error: "GOOGLE_API_KEY absente (Admin)." }, { status: 400 }),
    }
  }
  if (provider === "openai" && !status.openai) {
    return {
      error: NextResponse.json({ ok: false, error: "OPENAI_API_KEY absente (Admin)." }, { status: 400 }),
    }
  }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-40) : []
  const cleaned = cleanedMessages(messages)
  if (!cleaned.length) {
    return { error: NextResponse.json({ ok: false, error: "Message vide" }, { status: 400 }) }
  }
  if (cleaned[cleaned.length - 1]?.role !== "user") {
    return {
      error: NextResponse.json(
        { ok: false, error: "Le dernier message doit venir de l’utilisateur." },
        { status: 400 }
      ),
    }
  }
  for (const message of cleaned) {
    if (message.content.length > 8000) {
      return { error: NextResponse.json({ ok: false, error: "Message trop long" }, { status: 400 }) }
    }
  }
  return {
    provider,
    model: body.model,
    messages: cleaned,
    snapshot: body.snapshot ?? null,
    stream: Boolean(body.stream),
  }
}

export async function POST(request: Request) {
  const parsed = await resolveChat(request)
  if ("error" in parsed) return parsed.error
  const { provider, model, messages, snapshot, stream } = parsed

  if (!stream) {
    try {
      const result = await completeIa({
        provider,
        model,
        messages,
        snapshot,
        signal: request.signal,
      })
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 502 })
      }
      return NextResponse.json({
        ok: true,
        text: result.text,
        model: result.model,
        provider: result.provider,
        requested: result.requested,
        imageOmitted: result.imageOmitted,
      })
    } catch (error) {
      if (request.signal.aborted) {
        return NextResponse.json({ ok: false, error: "interrompu" }, { status: 400 })
      }
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "échec IA" },
        { status: 502 }
      )
    }
  }

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: IaStreamEvent) => {
        controller.enqueue(encoder.encode(encodeSse(event)))
      }
      try {
        await streamIa(
          { provider, model, messages, snapshot, signal: request.signal },
          send
        )
      } catch (error) {
        if (!request.signal.aborted) {
          send({
            type: "error",
            error: error instanceof Error ? error.message : "échec IA",
          })
        }
      } finally {
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
    },
  })

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
