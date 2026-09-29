import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { NextResponse } from "next/server"

import { isAuthenticated } from "@/lib/admin-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 90

const CACHE = path.join(process.cwd(), ".run", "dependency-watch.json")

type CacheFile = {
  fingerprint: string
  report: Record<string, unknown>
}

function isReport(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false
  const report = value as Record<string, unknown>
  return (
    typeof report.generated_at === "string" &&
    Array.isArray(report.decisions) &&
    Array.isArray(report.behind) &&
    Array.isArray(report.gate)
  )
}

async function fingerprint(root: string): Promise<string> {
  const hash = createHash("sha256")
  const names = ["package.json", "package-lock.json"]
  const entries = await readdir(root)
  for (const name of entries.filter((entry) => entry.startsWith("requirements") && entry.endsWith(".txt")).sort()) {
    names.push(name)
  }
  try {
    const workflows = (await readdir(path.join(root, ".github", "workflows")))
      .filter((entry) => entry.endsWith(".yml") || entry.endsWith(".yaml"))
      .sort()
    for (const name of workflows) names.push(path.join(".github", "workflows", name))
  } catch {
    // Pas de workflows : le reste du dépôt se suit quand même.
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

function runWatch(root: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["scripts/dependency_watch.py", "--json"], {
      cwd: root,
      env: process.env,
    })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error("La lecture des registres a dépassé 90 s."))
    }, 90_000)
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
        reject(new Error("python3 est introuvable. Le suivi hebdomadaire reste l’action GitHub."))
        return
      }
      reject(error)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        const detail = stderr.trim().slice(0, 400)
        reject(new Error(detail || `python3 a quitté avec le code ${code}`))
        return
      }
      const start = stdout.indexOf("{")
      const end = stdout.lastIndexOf("}")
      if (start < 0 || end < start) {
        reject(new Error("Le suivi n’a pas renvoyé de JSON."))
        return
      }
      try {
        const report = JSON.parse(stdout.slice(start, end + 1)) as unknown
        if (!isReport(report)) {
          reject(new Error("JSON de suivi incomplet."))
          return
        }
        resolve(report)
      } catch {
        reject(new Error("JSON de suivi illisible."))
      }
    })
  })
}

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }
  const root = process.cwd()
  const current = await fingerprint(root)
  const refresh = new URL(request.url).searchParams.get("refresh") === "1"
  if (!refresh) {
    const cached = await readCache(current)
    if (cached) {
      return NextResponse.json({ ok: true, cached: true, stale: cached.stale, report: cached.report })
    }
    return NextResponse.json({ ok: true, cached: false, stale: false, report: null })
  }
  try {
    const report = await runWatch(root)
    await mkdir(path.dirname(CACHE), { recursive: true })
    const body: CacheFile = { fingerprint: current, report }
    await writeFile(CACHE, JSON.stringify(body))
    return NextResponse.json({ ok: true, cached: false, stale: false, report })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lecture des bibliothèques impossible"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
