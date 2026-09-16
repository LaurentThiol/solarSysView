import type { BrainFiche } from "@/lib/brain/types"

function num(value: number | string | boolean | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function flagReasons(fiche: Pick<BrainFiche, "handle" | "lab" | "last" | "error">): string[] {
  if (fiche.error) return []
  const last = fiche.last
  const reasons: string[] = []
  if (fiche.handle === "rsi") {
    const rsi = num(last.rsi)
    if (rsi != null && (rsi >= 70 || rsi <= 30)) reasons.push("RSI hors 30–70")
  }
  if (fiche.handle === "adx") {
    const adx = num(last.adx)
    const regime = typeof last.regime === "string" ? last.regime : ""
    if ((adx != null && adx >= 25) || (regime && regime !== "range" && regime !== "inconnu")) {
      reasons.push("ADX hors range")
    }
  }
  if (fiche.handle === "macd") {
    /* trop bruyant : l’histogramme est presque toujours non nul */
  }
  if (fiche.handle === "bollinger") {
    const pb = num(last.percentB)
    if (pb != null && (pb > 1 || pb < 0)) reasons.push("%B hors [0, 1]")
  }
  if (fiche.handle === "squeeze" && last.squeeze === true) reasons.push("squeeze actif")
  if (fiche.handle === "stoch") {
    const k = num(last.stochK)
    if (k != null && (k >= 80 || k <= 20)) reasons.push("stochastique extrême")
  }
  if (fiche.handle === "cci") {
    const cci = num(last.cci)
    if (cci != null && Math.abs(cci) >= 100) reasons.push("CCI extrême")
  }
  if (fiche.lab === "chartisme") {
    const hits = num(last.hits) ?? 0
    if (hits > 0) reasons.push("lecture géométrique")
  }
  if (fiche.lab === "harmo") {
    const peaks = num(last.peaks) ?? 0
    if (peaks > 0 || last.cycles_per_draw != null) reasons.push("pic spectral")
  }
  if (fiche.lab === "morpho" && last.present === true) reasons.push("motif présent")
  if (fiche.lab === "combinaisons" && last.pEmpirical != null) reasons.push("grille profilée")
  if (fiche.lab === "specialist") {
    const skill = num(last.skill) ?? num(last.skill_50)
    if (skill != null && skill > 0) reasons.push("spécialiste bat le nul")
    if (last.abstain === true) reasons.push("spécialiste s’abstient")
  }
  return reasons
}

export function flagFiche(fiche: Omit<BrainFiche, "flags" | "flagged" | "summary"> & { summary?: string }): Pick<BrainFiche, "flags" | "flagged"> {
  const flags = flagReasons(fiche)
  return { flags, flagged: flags.length > 0 }
}
