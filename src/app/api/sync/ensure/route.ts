import { NextResponse } from "next/server"

import {
  apiBase,
  ENSURE_TIMEOUT_MS,
  isLocalHost,
  isNetlify,
  requestHostname,
} from "@/lib/api-base"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  if (isNetlify() || !isLocalHost(requestHostname(request))) {
    return NextResponse.json(
      { ok: false, error: "Rattrapage autorisé uniquement en local." },
      { status: 403 }
    )
  }
  const url = apiBase()
  if (!url) {
    return NextResponse.json(
      { ok: false, error: "API Python non configurée (lancez ./launch en local)." },
      { status: 400 }
    )
  }
  try {
    const response = await fetch(`${url}/api/sync/ensure`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(ENSURE_TIMEOUT_MS),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            (payload as { detail?: string })?.detail || `HTTP ${response.status}`,
        },
        { status: 400 }
      )
    }
    return NextResponse.json(payload)
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "synchro impossible",
      },
      { status: 502 }
    )
  }
}
