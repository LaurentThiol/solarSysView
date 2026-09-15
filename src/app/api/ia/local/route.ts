import { NextResponse } from "next/server"

import { localLlmOffMessage } from "@/lib/ia/local-url"
import { probeLocalLlm } from "@/lib/ia/providers"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const probe = await probeLocalLlm()
  const error = probe.ok ? null : localLlmOffMessage(probe.error)
  return NextResponse.json({
    ok: probe.ok,
    local: probe.ok,
    localHost: probe.host,
    models: probe.ids,
    error,
  })
}