import { INDEPENDENCE_DISCLAIMER } from "@/lib/capture/snapshot"
import type { BrainFiche, WorkingObject } from "@/lib/brain/types"

export type LectureMeta = {
  banner?: string
  n?: number
  source?: string
}

function formatLast(fiche: BrainFiche | undefined) {
  if (!fiche) return ""
  return Object.entries(fiche.last)
    .filter(([, value]) => value != null && value !== "")
    .slice(0, 6)
    .map(([key, value]) => `${key} ${value}`)
    .join(" · ")
}

function lineFor(item: WorkingObject) {
  const fiche = item.fiche
  const bits = [`${item.handle} · ${item.summary || item.label}`]
  const last = formatLast(fiche)
  if (last && !item.summary?.includes(last.split(" · ")[0] ?? "")) {
    bits.push(last)
  }
  if (fiche?.flags?.length) bits.push(`à relire : ${fiche.flags.join(", ")}`)
  if (fiche?.error) bits.push(`souci : ${fiche.error}`)
  return bits.join(" — ")
}

export function lectureFromWorkingSet(objects: WorkingObject[], meta: LectureMeta = {}): string {
  const inPrompt = objects.filter((item) => item.inPrompt)
  const lines: string[] = ["Lecture de la table (chiffres calculés, sans modèle)."]
  if (meta.banner || meta.n != null) {
    const windowBits = [
      meta.banner,
      meta.n != null ? `${meta.n} tirages` : null,
      meta.source ? `source ${meta.source}` : null,
    ].filter(Boolean)
    if (windowBits.length) lines.push(`Fenêtre : ${windowBits.join(" · ")}.`)
  }
  lines.push("")
  if (!inPrompt.length) {
    lines.push("Table vide. Épingle un nom (@rsi, @ete, @fft…) pour que je lise quelque chose.")
    lines.push("")
    lines.push(INDEPENDENCE_DISCLAIMER)
    return lines.join("\n")
  }

  const byLab = new Map<string, WorkingObject[]>()
  for (const item of inPrompt) {
    if (item.kind === "analog") continue
    const lab = item.fiche?.lab ?? "autre"
    const list = byLab.get(lab) ?? []
    list.push(item)
    byLab.set(lab, list)
  }
  for (const [lab, items] of byLab) {
    lines.push(`## ${lab}`)
    for (const item of items) lines.push(`- ${lineFor(item)}`)
  }

  const flagged = inPrompt.filter((item) => item.fiche?.flagged)
  lines.push("")
  if (flagged.length) {
    lines.push(
      `À relire (${flagged.length}) : ${flagged.map((item) => item.handle).join(", ")}.`
    )
  } else {
    lines.push("Aucune fiche flaggée sur cette fenêtre.")
  }

  const analogs = inPrompt.filter((item) => item.kind === "analog")
  if (analogs.length) {
    lines.push("")
    lines.push("Jumeaux (ressemblance d’archive, pas un pronostic) :")
    for (const item of analogs) {
      lines.push(`- ${lineFor(item)}`)
    }
  }

  const specialists = inPrompt.filter((item) => item.fiche?.lab === "specialist")
  lines.push("")
  if (specialists.length) {
    lines.push("Pronostic (hypothèse) :")
    for (const item of specialists) {
      const forecast = item.fiche?.last.forecast
      const skill = item.fiche?.last.skill ?? item.fiche?.last.skill_50
      lines.push(
        `- ${item.handle} forecast t+1 ${forecast ?? "—"} · skill ${skill ?? "—"} · ${item.fiche?.last.verdict ?? "—"}`
      )
    }
    lines.push(
      "Ce forecast est une série nommée (parité, somme…), pas une grille 5+2. Une 5+2, si on en propose une, est une hypothèse séparée."
    )
  } else {
    lines.push(
      "Pronostic : pas de spécialiste sur la table. RSI, figures et spectres décrivent l’archive ; je n’invente pas de 5+2 à partir d’eux."
    )
  }

  lines.push("")
  lines.push(INDEPENDENCE_DISCLAIMER)
  return lines.join("\n")
}

export const TABLE_LECTURE_MODEL = "table"
export const DEMO_QUESTION =
  "Que disent @rsi, @macd, @adx, @ete, @fft, @cluster et @score sur cette fenêtre ? S’il y a un spécialiste, cite le forecast. Une 5+2, si tu en proposes une, est une hypothèse séparée."
