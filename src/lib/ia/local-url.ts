const DEFAULT_LOCAL_LLM = "http://127.0.0.1:11434"

export function normalizeLocalLlmBase(raw: string) {
  let base = raw.trim().replace(/\/$/, "")
  if (!base) base = DEFAULT_LOCAL_LLM
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(base)) base = `http://${base}`
  return base.replace("://localhost", "://127.0.0.1").replace("://[::1]", "://127.0.0.1")
}

export function localModelsUrl(base: string) {
  if (/\/v1$/.test(base)) return `${base}/models`
  return `${base}/v1/models`
}

export function localChatCompletionsUrl(base: string) {
  if (/\/v1$/.test(base)) return `${base}/chat/completions`
  return `${base}/v1/chat/completions`
}
