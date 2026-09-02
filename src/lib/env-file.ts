import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export const ENV_PATH = join(process.cwd(), ".env")
export const ENV_EXAMPLE_PATH = join(process.cwd(), ".env.example")

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

export function readEnvFile(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {}
  return parseEnv(readFileSync(ENV_PATH, "utf8"))
}

export function liveEnv(key: string): string {
  const fromProcess = (process.env[key] || "").trim()
  if (fromProcess) return fromProcess
  return (readEnvFile()[key] || "").trim()
}

function quoteEnvValue(value: string): string {
  if (/[\s#"'$\\]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
  }
  return value
}

export function upsertEnv(updates: Record<string, string | null>): string {
  const source = existsSync(ENV_PATH)
    ? readFileSync(ENV_PATH, "utf8")
    : existsSync(ENV_EXAMPLE_PATH)
      ? readFileSync(ENV_EXAMPLE_PATH, "utf8")
      : ""
  const lines = source ? source.split(/\r?\n/) : []
  const seen = new Set<string>()
  const next: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    const eq = trimmed.indexOf("=")
    const key =
      trimmed && !trimmed.startsWith("#") && eq > 0
        ? trimmed.slice(0, eq).trim()
        : ""
    if (key && Object.prototype.hasOwnProperty.call(updates, key)) {
      seen.add(key)
      const value = updates[key]
      if (value == null || value === "") {
        next.push(`# ${key}=`)
      } else {
        next.push(`${key}=${quoteEnvValue(value)}`)
      }
      continue
    }
    next.push(line)
  }

  for (const [key, value] of Object.entries(updates)) {
    if (seen.has(key)) continue
    if (value == null || value === "") continue
    if (next.length > 0 && next[next.length - 1] !== "") next.push("")
    next.push(`${key}=${quoteEnvValue(value)}`)
  }

  const text = next.join("\n").replace(/\n*$/, "\n")
  writeFileSync(ENV_PATH, text, { encoding: "utf8", mode: 0o600 })
  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === "") {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  return ENV_PATH
}
