import { promises as fs } from "node:fs"
import path from "node:path"

import { NextResponse } from "next/server"

import { apiBase, isLocalHost, isNetlify } from "@/lib/api-base"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function requestHost(request: Request): string {
  const host = request.headers.get("host") || ""
  if (host.startsWith("[")) {
    const end = host.indexOf("]")
    return end >= 0 ? host.slice(1, end) : host
  }
  return host.split(":")[0]
}

function runDir(): string {
  return process.env.SYNCHRO_RUN_DIR || path.join(process.cwd(), ".run")
}

async function markStopped(): Promise<void> {
  const dir = runDir()
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, "stopped"),
    String(Math.floor(Date.now() / 1000)),
    "utf8"
  )
}

function scheduleSelfStop(): void {
  setTimeout(() => {
    try {
      process.kill(process.pid, "SIGTERM")
    } catch {
      process.exit(0)
    }
  }, 400)
}

export async function POST(request: Request) {
  if (isNetlify() || !isLocalHost(requestHost(request))) {
    return NextResponse.json(
      { ok: false, error: "Arrêt autorisé uniquement en local." },
      { status: 403 }
    )
  }

  try {
    await markStopped()
  } catch {
    // le fichier stopped est un signal pour ./launch ; l'arrêt continue sans
  }

  const url = apiBase()
  if (url) {
    try {
      await fetch(`${url}/api/shutdown`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(2000),
      })
    } catch {
      // l'API peut déjà être arrêtée
    }
  }

  scheduleSelfStop()
  return NextResponse.json({ ok: true })
}
