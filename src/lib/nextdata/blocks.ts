/** Parts d’une famille que Méga retire une à une, sans Chronos. Les identifiants suivent synchro/nextdata/covariates.py. */

export const COVARIATE_BLOCKS: Record<string, { family: string; label: string; caption: string }> = {
  "calendrier-date": { family: "calendrier", label: "Sans la date", caption: "sans la date" },
  "calendrier-cycles": { family: "calendrier", label: "Sans les cycles", caption: "sans les cycles" },
  "forme-profil": { family: "forme", label: "Sans le profil", caption: "sans le profil" },
  "forme-retards": { family: "forme", label: "Sans les retards", caption: "sans les retards" },
  "couples-ago": { family: "couples", label: "Sans ancienneté des couples", caption: "sans ancienneté des couples" },
  "couples-count": { family: "couples", label: "Sans parts des couples", caption: "sans parts des couples" },
  "couples-affinity": { family: "couples", label: "Sans affinités des couples", caption: "sans affinités des couples" },
  "triples-ago": { family: "triples", label: "Sans ancienneté des triples", caption: "sans ancienneté des triples" },
  "triples-count": { family: "triples", label: "Sans parts des triples", caption: "sans parts des triples" },
  "triples-affinity": { family: "triples", label: "Sans affinités des triples", caption: "sans affinités des triples" },
  "pulse-numeros": { family: "pulse", label: "Sans Pulse numéros", caption: "sans Pulse numéros" },
  "pulse-etoiles": { family: "pulse", label: "Sans Pulse étoiles", caption: "sans Pulse étoiles" },
}

export const COVARIATE_BLOCK_KEY = "nextdata-covariate-block"

export function blockCaption(id: string | null | undefined) {
  if (!id) return ""
  return COVARIATE_BLOCKS[id]?.caption ?? `sans ${id}`
}

export function readStoredBlock(): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(COVARIATE_BLOCK_KEY)
    return raw && raw in COVARIATE_BLOCKS ? raw : null
  } catch {
    return null
  }
}

export function writeStoredBlock(id: string | null) {
  if (typeof window === "undefined") return
  const safe = id && id in COVARIATE_BLOCKS ? id : null
  try {
    if (safe) window.sessionStorage.setItem(COVARIATE_BLOCK_KEY, safe)
    else window.sessionStorage.removeItem(COVARIATE_BLOCK_KEY)
  } catch {
    // Session inaccessible : le jeton reste dans la page qui l’a posé.
  }
}
