import { execFile, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { NextResponse } from "next/server"

import { isNetlify } from "@/lib/api-base"
import { isAuthenticated } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 180

const CACHE = path.join(process.cwd(), ".run", "supply-chain.json")
const TOOLS = ["syft", "grype"] as const

type CacheFile = {
  fingerprint: string
  report: Record<string, unknown>
}

function isReport(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false
  const report = value as Record<string, unknown>
  const sbom = report.sbom
  return (
    typeof report.generated_at === "string" &&
    Array.isArray(report.findings) &&
    !!report.counts &&
    typeof report.counts === "object" &&
    !!sbom &&
    typeof sbom === "object"
  )
}

async function fingerprint(root: string): Promise<string> {
  const hash = createHash("sha256")
  const names = ["package-lock.json"]
  const entries = await readdir(root)
  for (const name of entries.filter((entry) => entry.startsWith("requirements") && entry.endsWith(".txt")).sort()) {
    names.push(name)
  }
  for (const name of names) {
    hash.update(name)
    hash.update("\0")
    try {
      hash.update(await readFile(path.join(root, name)))
    } catch {
      hash.update("missing")
    }
  }
  return hash.digest("hex")
}

async function readCache(current: string): Promise<{ report: Record<string, unknown>; stale: boolean } | null> {
  try {
    const parsed = JSON.parse(await readFile(CACHE, "utf8")) as CacheFile
    if (!isReport(parsed.report) || typeof parsed.fingerprint !== "string") return null
    return { report: parsed.report, stale: parsed.fingerprint !== current }
  } catch {
    return null
  }
}

function toolOnPath(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("which", [name], (error) => resolve(!error))
  })
}

async function missingTools(): Promise<string[]> {
  const checks = await Promise.all(TOOLS.map(async (name) => ({ name, ok: await toolOnPath(name) })))
  return checks.filter((item) => !item.ok).map((item) => item.name)
}

function toolsMissingFrom(stdout: string): string[] {
  try {
    const parsed = JSON.parse(stdout) as { tools_missing?: unknown }
    if (Array.isArray(parsed.tools_missing) && parsed.tools_missing.every((item) => typeof item === "string")) {
      return parsed.tools_missing
    }
  } catch {
    // Le message français reste sur stderr.
  }
  return [...TOOLS]
}

function runScan(root: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["scripts/supply_chain.py", "--json"], {
      cwd: root,
      env: process.env,
    })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error("Le scan a dépassé 180 s."))
    }, 180_000)
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk
    })
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      if (error.code === "ENOENT") {
        reject(new Error("python3 est introuvable. Le relevé du lundi reste l’action GitHub."))
        return
      }
      reject(error)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 2) {
        reject(Object.assign(new Error(stderr.trim() || "syft et grype sont introuvables."), {
          toolsMissing: toolsMissingFrom(stdout),
        }))
        return
      }
      if (code !== 0) {
        const detail = stderr.trim().slice(0, 400)
        reject(new Error(detail || `python3 a quitté avec le code ${code}`))
        return
      }
      const start = stdout.indexOf("{")
      const end = stdout.lastIndexOf("}")
      if (start < 0 || end < start) {
        reject(new Error("Le scan n’a pas renvoyé de JSON."))
        return
      }
      try {
        const report = JSON.parse(stdout.slice(start, end + 1)) as unknown
        if (!isReport(report)) {
          reject(new Error("JSON de scan incomplet."))
          return
        }
        resolve(report)
      } catch {
        reject(new Error("JSON de scan illisible."))
      }
    })
  })
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function cachedBody(
  cached: { report: Record<string, unknown>; stale: boolean } | null,
  extra: Record<string, unknown>,
) {
  return {
    ok: true,
    cached: Boolean(cached),
    stale: Boolean(cached?.stale),
    report: cached?.report ?? null,
    ...extra,
  }
}

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) {
    return json({ ok: false, error: "Non authentifié" }, 401)
  }
  const root = process.cwd()
  const current = await fingerprint(root)
  const refresh = new URL(request.url).searchParams.get("refresh") === "1"
  const netlify = isNetlify()
  if (!refresh) {
    const cached = await readCache(current)
    const tools_missing = netlify ? [] : await missingTools()
    return json(cachedBody(cached, { netlify, tools_missing }))
  }
  if (netlify) {
    const cached = await readCache(current)
    return json(
      cachedBody(cached, {
        netlify: true,
        tools_missing: [],
        message: "Le scan se lance sur la machine locale. Le lundi, l’action GitHub met à jour l’issue Failles connues.",
      }),
    )
  }
  try {
    const report = await runScan(root)
    await mkdir(path.dirname(CACHE), { recursive: true })
    const body: CacheFile = { fingerprint: current, report }
    await writeFile(CACHE, JSON.stringify(body))
    return json({ ok: true, cached: false, stale: false, netlify: false, tools_missing: [], report })
  } catch (error) {
    const toolsMissing = (error as { toolsMissing?: string[] }).toolsMissing
    if (toolsMissing) {
      const cached = await readCache(current)
      return json(cachedBody(cached, { netlify: false, tools_missing: toolsMissing }))
    }
    const message = error instanceof Error ? error.message : "Scan impossible"
    return json({ ok: false, error: message }, 500)
  }
}
