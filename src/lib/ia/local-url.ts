const DEFAULT_LOCAL_LLM = "http://127.0.0.1:11434"

export function isLoopbackHostname(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase()
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "0.0.0.0"
}

export function normalizeLocalLlmBase(raw: string) {
  let base = raw.trim().replace(/\/$/, "")
  if (!base) base = DEFAULT_LOCAL_LLM
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(base)) base = `http://${base}`
  return base.replace("://localhost", "://127.0.0.1").replace("://[::1]", "://127.0.0.1")
}

export function localLlmCandidates(primary: string) {
  const bases = [primary]
  if (primary.includes("://127.0.0.1")) {
    bases.push(primary.replace("://127.0.0.1", "://localhost"))
    bases.push(primary.replace("://127.0.0.1", "://[::1]"))
  } else if (primary.includes("://localhost")) {
    bases.push(primary.replace("://localhost", "://127.0.0.1"))
    bases.push(primary.replace("://localhost", "://[::1]"))
  } else if (primary.includes("://[::1]")) {
    bases.push(primary.replace("://[::1]", "://127.0.0.1"))
    bases.push(primary.replace("://[::1]", "://localhost"))
  }
  return [...new Set(bases)]
}

const EXTRA_LOCAL_LLM_BASES = [
  "http://127.0.0.1:11434",
  "http://127.0.0.1:1234",
  "http://127.0.0.1:1234/v1",
  "http://127.0.0.1:8080/v1",
  "http://127.0.0.1:8080",
]

export function localLlmSearchBases(primary: string) {
  const out: string[] = []
  for (const base of [primary, ...EXTRA_LOCAL_LLM_BASES]) {
    for (const candidate of localLlmCandidates(base)) {
      if (!out.includes(candidate)) out.push(candidate)
    }
  }
  return out
}

export function localLlmOffMessage(error?: string | null) {
  const raw = (error || "").trim()
  if (!raw || /ECONNREFUSED|ECONNRESET|Connection refused|Errno 111|111/i.test(raw)) {
    return "Ollama n'écoute pas sur 11434. Lancez l'app Ollama (ou : ollama serve). LM Studio : LOCAL_LLM_BASE_URL=http://127.0.0.1:1234/v1"
  }
  return raw
}

export function localModelsUrl(base: string) {
  if (/\/v1$/.test(base)) return `${base}/models`
  return `${base}/v1/models`
}

export function localChatCompletionsUrl(base: string) {
  if (/\/v1$/.test(base)) return `${base}/chat/completions`
  return `${base}/v1/chat/completions`
}

export function localNativeChatUrl(base: string) {
  return `${base.replace(/\/v1$/, "")}/api/chat`
}

export type LocalProbeKind = "tags" | "version" | "openai"

export function probeKindFromUrl(url: string): LocalProbeKind | null {
  let path = url
  try {
    path = new URL(url).pathname
  } catch {
    /* keep raw */
  }
  if (path.includes("/api/tags")) return "tags"
  if (path.includes("/api/version")) return "version"
  if (path.endsWith("/v1/models") || path.endsWith("/models")) return "openai"
  return null
}

export function isNativeOllamaKind(kind?: LocalProbeKind | null) {
  return kind === "tags" || kind === "version"
}

export function localProbeUrls(base: string) {
  return [`${base}/api/tags`, localModelsUrl(base), `${base}/api/version`]
}
