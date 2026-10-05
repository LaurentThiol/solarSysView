/**
 * Seuil de la colonne Compte, partagé par les listes Couples et Triplets.
 * 1 = toutes les co-sorties. Le départ est 2 : les sorties vues une seule fois quittent la liste.
 */

export const MIN_COUNT_OPTIONS = [1, 2, 3, 4] as const

export type MinCount = (typeof MIN_COUNT_OPTIONS)[number]

/** Ouverture de Couples et de Triplets : les co-sorties vues une seule fois sont masquées. */
export const DEFAULT_MIN_COUNT: MinCount = 2

export const MIN_COUNT_HELP = {
  title: "Compte minimum",
  body: "Seuil de la colonne Compte, partagé par Couples et Triplets. Au départ, 2 et plus : les co-sorties vues une seule fois quittent la liste. Tous les remet, en gris. 3 et plus, puis 4 et plus, ne gardent que les répétitions plus fréquentes. Le détail de la boule choisie suit le même seuil. Le volume, le stress et Chaque numéro restent sur les plus forts poids.",
  items: [
    {
      label: "Tous",
      text: "Chaque co-sortie de la fenêtre, y compris celles vues une seule fois. Ces lignes restent en gris.",
    },
    {
      label: "≥ 2",
      text: "Enlève les couples et les triplets sortis une seule fois. C’est le choix de départ.",
    },
    {
      label: "≥ 3",
      text: "Ne garde que les co-sorties répétées au moins trois fois.",
    },
    {
      label: "≥ 4",
      text: "Ne garde que les co-sorties répétées au moins quatre fois.",
    },
  ],
}

export function isMinCount(value: number): value is MinCount {
  return (MIN_COUNT_OPTIONS as readonly number[]).includes(value)
}

/** Paramètre d’URL `min`. Absent ou illisible : le seuil de départ. */
export function minCountFromParam(value: string | null | undefined): MinCount {
  if (value == null || value === "") return DEFAULT_MIN_COUNT
  const parsed = Number.parseInt(value, 10)
  return isMinCount(parsed) ? parsed : DEFAULT_MIN_COUNT
}

export function minCountLabel(min: MinCount): string {
  return min <= 1 ? "Tous" : `≥ ${min}`
}

export function minCountAria(min: MinCount): string {
  return min <= 1 ? "Tous les comptes, y compris une seule sortie" : `Au moins ${min} sorties`
}

export function linksAtLeast<T extends { count: number }>(links: readonly T[], min: number): T[] {
  const floor = Number.isFinite(min) ? Math.trunc(min) : 1
  if (floor <= 1) return [...links]
  return links.filter((link) => link.count >= floor)
}

export function observedLine(shown: number, total: number, min: number): string {
  const observed = `${total.toLocaleString("fr-FR")} observé${total > 1 ? "s" : ""}`
  if (min <= 1 || shown === total) return observed
  const displayed = `${shown.toLocaleString("fr-FR")} affiché${shown > 1 ? "s" : ""}`
  return `${displayed} · ${observed}`
}

export function listEmptyCopy(kind: "couple" | "triplet", total: number, min: number): string {
  if (total === 0 || min <= 1) return "Aucune co-sortie dans cette fenêtre."
  const noun = kind === "couple" ? "couple" : "triplet"
  return `Aucun ${noun} sorti au moins ${min} fois dans cette fenêtre. Le choix Tous les réaffiche.`
}

export function detailEmptyCopy(totalTouched: number, min: number): string {
  if (totalTouched === 0 || min <= 1) return "Aucune co-sortie dans la fenêtre."
  return `Aucune co-sortie au moins ${min} fois pour cette boule. Le choix Tous les réaffiche.`
}

export function hiddenCountCopy(hidden: number, min: number): string | null {
  if (hidden <= 0 || min <= 1) return null
  const noun = hidden > 1 ? "co-sorties masquées" : "co-sortie masquée"
  return `${hidden.toLocaleString("fr-FR")} ${noun}, compte inférieur à ${min}.`
}
