import { apiBase } from "@/lib/api-base"
import { isAuthenticated } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) {
    return Response.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }
  const url = apiBase()
  if (!url) {
    return Response.json(
      { ok: false, error: "API Python non configurée (lancez ./launch en local)." },
      { status: 400 }
    )
  }
  try {
    const response = await fetch(`${url}/api/sync`, {
      method: "POST",
      signal: AbortSignal.timeout(120_000),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      return Response.json(
        { ok: false, error: (payload as { detail?: string })?.detail || `HTTP ${response.status}` },
        { status: 400 }
      )
    }
    return Response.json(payload)
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "synchro impossible" },
      { status: 502 }
    )
  }
}
