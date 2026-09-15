import { NextResponse } from "next/server"

import { probeLocalLlm } from "@/lib/ia/providers"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const probe = await probeLocalLlm()
  return NextResponse.json({
    ok: probe.ok,
    local: probe.ok,
    localHost: probe.host,
    models: probe.ids,
    error: probe.error ?? null,
  })
}