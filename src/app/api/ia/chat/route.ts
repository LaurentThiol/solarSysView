import { NextResponse } from "next/server"

import { isAuthenticated } from "@/lib/admin-auth"
import { isNetlify } from "@/lib/api-base"
import { completeIa, iaStatus, type IaChatMessage, type IaProviderId, type IaSnapshotPayload } from "@/lib/ia/providers"

export const dynamic = "force-dynamic"
export const maxDuration = 60

type Body = {
  provider?: IaProviderId
  messages?: IaChatMessage[]
  snapshot?: IaSnapshotPayload | null
}

export async function POST(request: Request) {
  if (isNetlify() && !(await isAuthenticated(request))) {
    return NextResponse.json(
      { ok: false, error: "Authentification admin requise hors localhost." },
      { status: 401 }
    )
  }
  const status = iaStatus()
  const body = (await request.json().catch(() => null)) as Body | null
  if (!body) {
    return NextResponse.json({ ok: false, error: "Requête invalide" }, { status: 400 })
  }
  const provider: IaProviderId | null =
    body.provider === "google" || body.provider === "openai"
      ? body.provider
      : status.default
  if (!provider) {
    return NextResponse.json(
      { ok: false, error: "Aucune clé Gemini / OpenAI. Configure-les dans Admin." },
      { status: 400 }
    )
  }
  if (provider === "google" && !status.google) {
    return NextResponse.json({ ok: false, error: "GOOGLE_API_KEY absente (Admin)." }, { status: 400 })
  }
  if (provider === "openai" && !status.openai) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY absente (Admin)." }, { status: 400 })
  }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-40) : []
  const cleaned = messages.filter(
    (message) =>
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string" &&
      message.content.trim()
  )
  if (!cleaned.length) {
    return NextResponse.json({ ok: false, error: "Message vide" }, { status: 400 })
  }
  if (cleaned[cleaned.length - 1]?.role !== "user") {
    return NextResponse.json({ ok: false, error: "Le dernier message doit venir de l’utilisateur." }, { status: 400 })
  }
  for (const message of cleaned) {
    if (message.content.length > 8000) {
      return NextResponse.json({ ok: false, error: "Message trop long" }, { status: 400 })
    }
  }
  try {
    const result = await completeIa({
      provider,
      messages: cleaned,
      snapshot: body.snapshot ?? null,
    })
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 })
    }
    return NextResponse.json({
      ok: true,
      text: result.text,
      model: result.model,
      provider: result.provider,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "échec IA" },
      { status: 502 }
    )
  }
}
