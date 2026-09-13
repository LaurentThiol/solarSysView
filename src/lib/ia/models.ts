export type IaProviderId = "google" | "openai"

export type IaModelTier = "fast" | "balanced" | "precise"

export type IaChatMessage = {
  role: "user" | "assistant"
  content: string
  model?: string
  provider?: IaProviderId
  requested?: string
}

export type IaModelDef = {
  id: string
  provider: IaProviderId
  label: string
  hint: string
  vision: boolean
  tier: IaModelTier
  preferred?: boolean
}

export type IaModelOption = IaModelDef & {
  available: boolean
  source: "catalog" | "live"
}

export const IA_MODELS: IaModelDef[] = [
  {
    id: "gemini-2.5-flash",
    provider: "google",
    label: "Flash 2.5",
    hint: "rapide, vision",
    vision: true,
    tier: "fast",
    preferred: true,
  },
  {
    id: "gemini-2.5-pro",
    provider: "google",
    label: "Pro 2.5",
    hint: "plus précis",
    vision: true,
    tier: "precise",
  },
  {
    id: "gemini-2.5-flash-lite",
    provider: "google",
    label: "Lite 2.5",
    hint: "économique",
    vision: true,
    tier: "fast",
  },
  {
    id: "gemini-2.0-flash",
    provider: "google",
    label: "Flash 2.0",
    hint: "stable",
    vision: true,
    tier: "fast",
  },
  {
    id: "gemini-flash-latest",
    provider: "google",
    label: "Flash (dernier)",
    hint: "alias Google",
    vision: true,
    tier: "fast",
  },
  {
    id: "gemini-3-flash-preview",
    provider: "google",
    label: "Flash 3",
    hint: "aperçu",
    vision: true,
    tier: "balanced",
  },
  {
    id: "gemini-3.1-pro-preview",
    provider: "google",
    label: "Pro 3.1",
    hint: "aperçu, plus précis",
    vision: true,
    tier: "precise",
  },
  {
    id: "gpt-4o",
    provider: "openai",
    label: "GPT-4o",
    hint: "vision, équilibré",
    vision: true,
    tier: "balanced",
    preferred: true,
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    label: "GPT-4o mini",
    hint: "rapide",
    vision: true,
    tier: "fast",
  },
  {
    id: "gpt-4.1",
    provider: "openai",
    label: "GPT-4.1",
    hint: "plus récent",
    vision: true,
    tier: "balanced",
  },
  {
    id: "gpt-4.1-mini",
    provider: "openai",
    label: "GPT-4.1 mini",
    hint: "rapide",
    vision: true,
    tier: "fast",
  },
  {
    id: "gpt-5-mini",
    provider: "openai",
    label: "GPT-5 mini",
    hint: "rapide",
    vision: true,
    tier: "fast",
  },
  {
    id: "gpt-5",
    provider: "openai",
    label: "GPT-5",
    hint: "plus récent",
    vision: true,
    tier: "precise",
  },
]

const LIVE_EXTRA_CAP = 10

export function isModelId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(value)
}

export function providerLabel(id: IaProviderId) {
  return id === "google" ? "Gemini" : "OpenAI"
}

export function providerOfModel(id: string): IaProviderId | null {
  const lower = id.toLowerCase()
  if (lower.startsWith("gemini") || lower.startsWith("models/gemini")) return "google"
  if (/^(gpt-|o1|o3|o4-mini)/.test(lower)) return "openai"
  return null
}

export function preferredModel(provider: IaProviderId) {
  return (
    IA_MODELS.find((item) => item.provider === provider && item.preferred)?.id ??
    IA_MODELS.find((item) => item.provider === provider)?.id ??
    null
  )
}

export function modelLabel(id: string, models: Array<Pick<IaModelDef, "id" | "label">> = IA_MODELS) {
  return models.find((item) => item.id === id)?.label ?? id
}

export function catalogModels(provider: IaProviderId) {
  return IA_MODELS.filter((item) => item.provider === provider)
}

export function guessVision(id: string, provider: IaProviderId) {
  const known = IA_MODELS.find((item) => item.id === id)
  if (known) return known.vision
  if (provider === "google") return /gemini/i.test(id) && !/(embed|tts|imagen|veo)/i.test(id)
  return /^(gpt-4o|gpt-4\.1|gpt-5)/.test(id)
}

export function openaiUsesMaxCompletionTokens(model: string) {
  return /^(o1|o3|o4-mini|gpt-5)/.test(model)
}

export function stripGeminiName(name: string) {
  return name.replace(/^models\//, "")
}

export function isGeminiChatModel(id: string, methods?: string[]) {
  if (methods && !methods.includes("generateContent")) return false
  const lower = id.toLowerCase()
  if (!lower.includes("gemini")) return false
  return !/(embed|imagen|veo|tts|aqa|robotics|computer-use)/.test(lower)
}

export function isOpenAiChatModel(id: string) {
  if (/(audio|realtime|transcribe|tts|search|embed|whisper|dall-e|image|moderation|instruct|codex)/i.test(id)) {
    return false
  }
  return /^(gpt-4o|gpt-4\.1|gpt-5|o3|o4-mini|o1)/.test(id)
}

export function resolveRequestedModel(provider: IaProviderId, requested?: string | null) {
  if (isModelId(requested) && providerOfModel(requested) === provider) return requested
  return preferredModel(provider)
}

export function modelSequence(provider: IaProviderId, requested?: string | null) {
  const catalogIds = catalogModels(provider).map((item) => item.id)
  const out: string[] = []
  const requestedId = resolveRequestedModel(provider, requested)
  if (requestedId) out.push(requestedId)
  for (const id of catalogIds) {
    if (!out.includes(id)) out.push(id)
  }
  return out
}

function extraFromLive(
  provider: IaProviderId,
  liveIds: string[],
  catalogIds: Set<string>
): IaModelOption[] {
  const extras: IaModelOption[] = []
  const sorted = [...liveIds].sort((left, right) => {
    const dated = (id: string) => (/\d{4}-\d{2}/.test(id) ? 1 : 0)
    if (dated(left) !== dated(right)) return dated(left) - dated(right)
    return left.length - right.length || left.localeCompare(right)
  })
  for (const id of sorted) {
    if (catalogIds.has(id) || extras.some((item) => item.id === id)) continue
    if (provider === "google" && !isGeminiChatModel(id)) continue
    if (provider === "openai" && !isOpenAiChatModel(id)) continue
    extras.push({
      id,
      provider,
      label: id,
      hint: "visible sur cette clé",
      vision: guessVision(id, provider),
      tier: "balanced",
      available: true,
      source: "live",
    })
    if (extras.length >= LIVE_EXTRA_CAP) break
  }
  return extras
}

export function mergeModelOptions(input: {
  google: boolean
  openai: boolean
  liveGoogle: string[] | null
  liveOpenAI: string[] | null
}): IaModelOption[] {
  const catalog: IaModelOption[] = IA_MODELS.map((item) => {
    const enabled = item.provider === "google" ? input.google : input.openai
    return { ...item, available: enabled, source: "catalog" as const }
  })
  const extras: IaModelOption[] = []
  if (input.google && input.liveGoogle) {
    extras.push(
      ...extraFromLive(
        "google",
        input.liveGoogle,
        new Set(catalog.filter((item) => item.provider === "google").map((item) => item.id))
      )
    )
  }
  if (input.openai && input.liveOpenAI) {
    extras.push(
      ...extraFromLive(
        "openai",
        input.liveOpenAI,
        new Set(catalog.filter((item) => item.provider === "openai").map((item) => item.id))
      )
    )
  }
  return [...catalog, ...extras]
}

export function pickAvailableModel(
  models: IaModelOption[],
  provider: IaProviderId,
  stored?: string | null
) {
  const available = models.filter((item) => item.provider === provider && item.available)
  if (!available.length) return null
  if (stored && available.some((item) => item.id === stored)) return stored
  return available.find((item) => item.preferred)?.id ?? available[0].id
}
