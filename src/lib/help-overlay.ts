export const GLOSSARY_SECTIONS = ["vocab", "proba", "memo", "chartisme"] as const
export type GlossarySection = (typeof GLOSSARY_SECTIONS)[number]

export const GLOSSARY_SECTION_LABELS: Record<GlossarySection, string> = {
  vocab: "Vocabulaire",
  proba: "Probabilités",
  memo: "Mémo",
  chartisme: "Chartisme",
}

export const GLOSSARY_QUERY = "glossaire"
export const ADDRESS_QUERY = "adresse"
export const LAST_GLOSSARY_SECTION_KEY = "synchro.glossary.section"

const ADDRESS_TRUTHY = new Set(["1", "true", "oui", "adresse"])

export function asGlossarySection(raw: string | null | undefined): GlossarySection | null {
  if (!raw) return null
  const value = raw.trim().toLowerCase()
  if (value === "vocabulaire" || value === "glossary") return "vocab"
  if (value === "probabilites" || value === "probabilités") return "proba"
  if (value === "courbes" || value === "figures") return "chartisme"
  if ((GLOSSARY_SECTIONS as readonly string[]).includes(value)) return value as GlossarySection
  return null
}

export function isAddressQuery(raw: string | null | undefined): boolean {
  if (!raw) return false
  return ADDRESS_TRUTHY.has(raw.trim().toLowerCase())
}

export function legacyAnalyseHelpTab(tab: string | null | undefined): {
  glossary: GlossarySection | null
  adresse: boolean
} | null {
  const value = tab?.trim().toLowerCase()
  if (value === "proba" || value === "memo") return { glossary: value, adresse: false }
  if (value === "adresse") return { glossary: null, adresse: true }
  return null
}

export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  )
}

export function readHelpOverlay(search: string): {
  glossary: GlossarySection | null
  adresse: boolean
} {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const legacy = legacyAnalyseHelpTab(params.get("tab"))
  const glossary = asGlossarySection(params.get(GLOSSARY_QUERY)) ?? legacy?.glossary ?? null
  const adresse = isAddressQuery(params.get(ADDRESS_QUERY)) || Boolean(legacy?.adresse)
  if (glossary) return { glossary, adresse: false }
  return { glossary: null, adresse }
}

export function applyHelpOverlaySearch(
  search: string,
  input: { glossary?: GlossarySection | null; adresse?: boolean | null }
): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  if (legacyAnalyseHelpTab(params.get("tab"))) params.delete("tab")

  if (input.glossary !== undefined) {
    if (input.glossary) {
      params.set(GLOSSARY_QUERY, input.glossary)
      params.delete(ADDRESS_QUERY)
    } else {
      params.delete(GLOSSARY_QUERY)
    }
  }
  if (input.adresse !== undefined) {
    if (input.adresse) {
      params.set(ADDRESS_QUERY, "1")
      params.delete(GLOSSARY_QUERY)
    } else {
      params.delete(ADDRESS_QUERY)
    }
  }
  return params.toString()
}

export function rewriteLegacyHelpSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const legacy = legacyAnalyseHelpTab(params.get("tab"))
  if (!legacy) return null
  return applyHelpOverlaySearch(search, {
    glossary: legacy.glossary,
    adresse: legacy.adresse,
  })
}

export function lastGlossarySection(): GlossarySection {
  try {
    if (typeof sessionStorage === "undefined") return "vocab"
    return asGlossarySection(sessionStorage.getItem(LAST_GLOSSARY_SECTION_KEY)) ?? "vocab"
  } catch {
    return "vocab"
  }
}

export function rememberGlossarySection(section: GlossarySection) {
  try {
    if (typeof sessionStorage === "undefined") return
    sessionStorage.setItem(LAST_GLOSSARY_SECTION_KEY, section)
  } catch {
    /* quota / navigation privée */
  }
}
