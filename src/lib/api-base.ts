export function apiBase(): string {
  const fromEnv =
    process.env.SYNCHRO_API_URL || process.env.NEXT_PUBLIC_API_URL || ""
  if (fromEnv) return fromEnv.replace(/\/$/, "")
  if (process.env.NETLIFY === "true" || process.env.NODE_ENV === "production") {
    return ""
  }
  return "http://127.0.0.1:8000"
}

/** Attente /api/health : réveil Neon (scale-to-zero) + SELECT 1. */
export const HEALTH_TIMEOUT_MS = 20_000

/** Synchro FDJ (une archive récente) : téléchargement + upsert Neon. */
export const ENSURE_TIMEOUT_MS = 90_000

export function isNetlify(): boolean {
  return process.env.NETLIFY === "true"
}

export function isLocalHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"
}

export function requestHostname(request: Request): string {
  const host = request.headers.get("host") || ""
  if (host.startsWith("[")) {
    const end = host.indexOf("]")
    return end >= 0 ? host.slice(1, end) : host
  }
  return host.split(":")[0]
}
