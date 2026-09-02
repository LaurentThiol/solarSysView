import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const execFileAsync = promisify(execFile)

function apiBase(): string {
  const fromEnv =
    process.env.SYNCHRO_API_URL || process.env.NEXT_PUBLIC_API_URL || ""
  if (fromEnv) return fromEnv.replace(/\/$/, "")
  if (process.env.NETLIFY === "true" || process.env.NODE_ENV === "production") {
    return ""
  }
  return "http://127.0.0.1:8000"
}

async function gitInfo() {
  const opts = { timeout: 3000, cwd: process.cwd() }
  try {
    const { stdout: sha } = await execFileAsync(
      "git",
      ["rev-parse", "--short", "HEAD"],
      opts
    )
    const { stdout: branch } = await execFileAsync(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      opts
    )
    const { stdout: dirty } = await execFileAsync(
      "git",
      ["status", "--porcelain"],
      opts
    )
    let ahead = 0
    let behind = 0
    try {
      const { stdout: counts } = await execFileAsync(
        "git",
        ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
        opts
      )
      const parts = counts.trim().split(/\s+/).map(Number)
      behind = parts[0] || 0
      ahead = parts[1] || 0
    } catch {
      // pas d'upstream
    }
    return {
      ok: true,
      sha: sha.trim(),
      branch: branch.trim(),
      dirty: dirty.trim().length > 0,
      ahead,
      behind,
    }
  } catch {
    return { ok: false as const }
  }
}

async function backendStatus(url: string) {
  if (!url) {
    return { ok: false, url: "", error: "API locale non configurée" }
  }
  try {
    const alive = await fetch(`${url}/api/alive`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    })
    if (!alive.ok) {
      return { ok: false, url, error: `alive HTTP ${alive.status}` }
    }
    const healthRes = await fetch(`${url}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
    const health = await healthRes.json().catch(() => null)
    return { ok: true, url, health }
  } catch (error) {
    return {
      ok: false,
      url,
      error: error instanceof Error ? error.message : "injoignable",
    }
  }
}

export async function GET() {
  const url = apiBase()
  const [backend, git] = await Promise.all([backendStatus(url), gitInfo()])
  const health =
    backend && "health" in backend
      ? (backend.health as {
          neon?: Record<string, unknown>
          draws?: number | null
          latest?: Record<string, unknown> | null
        } | null)
      : null
  return NextResponse.json({
    frontend: { ok: true },
    backend,
    neon: health?.neon ?? { ok: false, configured: false },
    git,
    draws: health?.draws ?? null,
    latest: health?.latest ?? null,
  })
}
