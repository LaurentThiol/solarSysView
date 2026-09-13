import { liveEnv } from "@/lib/env-file"

export type ServiceId = "neon" | "google" | "openai" | "brave"

export type ServiceDef = {
  id: ServiceId
  label: string
  envKey: string
  consoleUrl: string
  consoleLabel: string
  docsUrl: string
  description: string
  placeholder: string
}

export const SERVICES: ServiceDef[] = [
  {
    id: "neon",
    label: "Neon",
    envKey: "DATABASE_URL",
    consoleUrl: "https://console.neon.tech",
    consoleLabel: "console.neon.tech",
    docsUrl: "https://neon.com/docs/connect/connect-from-any-app",
    description:
      "URI PostgreSQL pooled du projet Synchro. Le mot de passe du rôle (souvent npg_…) est dans l’URI.",
    placeholder:
      "postgresql://neondb_owner:…@ep-…-pooler.…neon.tech/neondb?sslmode=require",
  },
  {
    id: "google",
    label: "Google",
    envKey: "GOOGLE_API_KEY",
    consoleUrl: "https://aistudio.google.com/apikey",
    consoleLabel: "Google AI Studio",
    docsUrl: "https://ai.google.dev/gemini-api/docs/api-key",
    description:
      "Clé Gemini / AI Studio (AQ.… ou AIza…). Sert à l’onglet IA (lecture de capture, generateContent).",
    placeholder: "AQ.… ou AIza…",
  },
  {
    id: "openai",
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    consoleUrl: "https://platform.openai.com/api-keys",
    consoleLabel: "platform.openai.com",
    docsUrl: "https://platform.openai.com/docs/api-reference/authentication",
    description: "Clé secrète sk-… pour l’API chat. Sert à l’onglet IA (lecture de capture).",
    placeholder: "sk-…",
  },
  {
    id: "brave",
    label: "Brave Search",
    envKey: "BRAVE_API_KEY",
    consoleUrl: "https://api-dashboard.search.brave.com/app/keys",
    consoleLabel: "Brave Search dashboard",
    docsUrl: "https://api-dashboard.search.brave.com/documentation/guides/search/web",
    description: "Jeton X-Subscription-Token pour l’API Search (web).",
    placeholder: "BSA…",
  },
]

const PLACEHOLDER_MARKERS = ["USER:PASSWORD", "PASSWORD@", "changeme", "your-key"]

export function isPlaceholder(value: string): boolean {
  const v = value.trim()
  if (!v) return false
  return PLACEHOLDER_MARKERS.some((marker) => v.includes(marker))
}

export function maskSecret(value: string): string {
  const v = value.trim()
  if (!v) return ""
  if (v.length <= 8) return "••••"
  return `${v.slice(0, 4)}…${v.slice(-4)}`
}

export type NeonParts = {
  host: string
  user: string
  password: string
  database: string
  pooled: boolean
}

export function parseDatabaseUrl(url: string): NeonParts | null {
  const raw = url.trim()
  if (!raw || isPlaceholder(raw)) return null
  try {
    const normalized = raw.replace(/^postgres(ql)?(\+[^:]+)?:/i, "https:")
    const parsed = new URL(normalized)
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] || "")
    return {
      host: parsed.hostname,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database,
      pooled: parsed.hostname.includes("pooler"),
    }
  } catch {
    return null
  }
}

export function replaceNeonPassword(url: string, password: string): string {
  const trimmed = url.trim()
  try {
    const protocol =
      trimmed.match(/^(postgres(?:ql)?(?:\+[^:]+)?)/i)?.[1] || "postgresql"
    const parsed = new URL(trimmed.replace(/^postgres(ql)?(\+[^:]+)?:/i, "https:"))
    parsed.password = password
    return parsed.toString().replace(/^https:/, `${protocol}:`)
  } catch {
    return trimmed
  }
}

export function secretSnapshot(id: ServiceId) {
  const def = SERVICES.find((item) => item.id === id)!
  const value =
    id === "google"
      ? liveEnv(def.envKey) || liveEnv("GEMINI_API_KEY")
      : liveEnv(def.envKey)
  const configured = Boolean(value) && !isPlaceholder(value)
  const neon = id === "neon" ? parseDatabaseUrl(value) : null
  return {
    id,
    label: def.label,
    envKey: def.envKey,
    consoleUrl: def.consoleUrl,
    consoleLabel: def.consoleLabel,
    docsUrl: def.docsUrl,
    description: def.description,
    placeholder: def.placeholder,
    configured,
    hint: configured ? maskSecret(id === "neon" && neon?.password ? neon.password : value) : "",
    host: neon?.host || null,
    user: neon?.user || null,
    database: neon?.database || null,
    pooled: neon?.pooled || false,
    value: configured ? value : "",
    password: neon?.password || "",
  }
}
