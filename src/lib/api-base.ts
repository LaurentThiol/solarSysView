export function apiBase(): string {
  const fromEnv =
    process.env.SYNCHRO_API_URL || process.env.NEXT_PUBLIC_API_URL || ""
  if (fromEnv) return fromEnv.replace(/\/$/, "")
  if (process.env.NETLIFY === "true" || process.env.NODE_ENV === "production") {
    return ""
  }
  return "http://127.0.0.1:8000"
}

export function isNetlify(): boolean {
  return process.env.NETLIFY === "true"
}

export function isLocalHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"
}
