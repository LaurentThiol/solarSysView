import { NextRequest, NextResponse } from "next/server"

import { liveEnv } from "@/lib/env-file"
import { isNativeOllamaKind, localChatCompletionsUrl, localNativeChatUrl } from "@/lib/ia/local-url"
import { llmFetch } from "@/lib/ia/loopback-fetch"
import { pickLocalTextModel, pickLocalVisionModel } from "@/lib/ia/models"
import { probeLocalLlm } from "@/lib/ia/providers"
import { recordLlmUsage } from "@/lib/ia/record-usage"
import { localThinkText, localThinkTokens, requestLocalThink } from "@/lib/run-arcade/local-call"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const TIMEOUT_MS = 120_000
const IMAGE_MAX = 3_000_000

type ThinkBody = { system?: unknown; user?: unknown; seed?: unknown; image?: unknown }

function cleanImage(raw: unknown) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > IMAGE_MAX) return null
  return raw.replace(/^data:image\/[a-z+]+;base64,/i, "")
}

/** Appel court de runArcade : une réponse JSON, peu de jetons, une graine fixe. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as ThinkBody | null
  const system = typeof body?.system === "string" ? body.system.slice(0, 8_000) : ""
  const user = typeof body?.user === "string" ? body.user.slice(0, 16_000) : ""
  const seed = Number.isFinite(Number(body?.seed)) ? Math.trunc(Number(body?.seed)) : 1
  const image = cleanImage(body?.image)
  if (!system || !user) {
    return NextResponse.json({ ok: false, error: "prompt vide" }, { status: 400 })
  }

  const probe = await probeLocalLlm()
  if (!probe.ok || !probe.ids) {
    return NextResponse.json(
      { ok: false, absent: true, error: probe.error || "LLM local injoignable" },
      { status: 503 }
    )
  }
  const native = isNativeOllamaKind(probe.kind)
  const visionModel = native ? pickLocalVisionModel(probe.ids, null) : null
  const textModel = pickLocalTextModel(probe.ids, null, liveEnv("LOCAL_LLM_MODEL").trim())
  const useImage = Boolean(image && visionModel)
  const model = useImage ? visionModel : (textModel ?? visionModel)
  if (!model) {
    return NextResponse.json({ ok: false, absent: true, error: "aucun modèle local de conversation" }, { status: 503 })
  }

  const messages = [
    { role: "system", content: system },
    useImage ? { role: "user", content: user, images: [image] } : { role: "user", content: user },
  ]
  const started = Date.now()
  try {
    const url = native ? localNativeChatUrl(probe.host) : localChatCompletionsUrl(probe.host)
    const parsed = await requestLocalThink({ native, model, messages, seed }, async (payload) => {
      const response = await llmFetch(
        url,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
        TIMEOUT_MS
      )
      return { ok: response.ok, status: response.status, text: await response.text() }
    })
    const text = localThinkText(native, parsed)
    if (!text) throw new Error("réponse vide")
    const latencyMs = Date.now() - started
    const tokens = localThinkTokens(parsed, text, `${system}\n${user}`, started, started + latencyMs)
    void recordLlmUsage({
      surface: "brain",
      provider: "local",
      model,
      ok: true,
      promptTokens: tokens.promptTokens,
      completionTokens: tokens.completionTokens,
      estimated: tokens.estimated,
      latencyMs,
    })
    return NextResponse.json({
      ok: true,
      text,
      latencyMs,
      model,
      vision: Boolean(visionModel),
      promptTokens: tokens.promptTokens,
      completionTokens: tokens.completionTokens,
      estimated: tokens.estimated,
    })
  } catch (error) {
    const latencyMs = Date.now() - started
    const message = error instanceof Error ? error.message : "échec"
    void recordLlmUsage({ surface: "brain", provider: "local", model, ok: false, error: message, latencyMs })
    return NextResponse.json({ ok: false, error: message, latencyMs }, { status: 502 })
  }
}
