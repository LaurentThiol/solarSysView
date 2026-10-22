/**
 * Lien de reprise sur « Chaque numéro » et « Chaque étoile » :
 * un même numéro (ou une même étoile) présent au tirage suivant
 * de la fenêtre. La hauteur du graphe est la valeur, donc le trait
 * est horizontal ; le rang (n4 → n2) peut changer.
 */

import { NUMBER_RANK_KEYS, type NumberRankKey } from "@/lib/next/couple-chart"

export const STAR_RANK_KEYS = ["e1", "e2"] as const

export type StarRankKey = (typeof STAR_RANK_KEYS)[number]

export type RepeatRankKey = NumberRankKey | StarRankKey

export type RepeatLink<K extends string = RepeatRankKey> = {
  value: number
  fromDate: string
  toDate: string
  fromKey: K
  toKey: K
}

type DatedRanks<K extends string> = { date: string } & Partial<Record<K, number>>

/** Reprises entre tirages consécutifs de la série affichée. Un trou coupe le lien. */
export function repeatLinks<K extends string>(
  series: readonly DatedRanks<K>[],
  keys: readonly K[]
): RepeatLink<K>[] {
  const links: RepeatLink<K>[] = []
  for (let index = 0; index < series.length - 1; index += 1) {
    const left = series[index]
    const right = series[index + 1]
    const onRight = new Map<number, K>()
    for (const key of keys) {
      const value = right[key]
      if (typeof value !== "number" || !Number.isFinite(value)) continue
      if (!onRight.has(value)) onRight.set(value, key)
    }
    const seen = new Set<number>()
    for (const key of keys) {
      const value = left[key]
      if (typeof value !== "number" || !Number.isFinite(value) || seen.has(value)) continue
      const toKey = onRight.get(value)
      if (!toKey) continue
      seen.add(value)
      links.push({
        value,
        fromDate: left.date,
        toDate: right.date,
        fromKey: key,
        toKey,
      })
    }
  }
  return links
}

export type RepeatStreak = {
  value: number
  draws: number
}

/**
 * Chaînes d’au moins trois tirages de suite pour la même valeur.
 * Deux liens 23→23→23 comptent pour 3 tirages.
 */
export function repeatStreaks<K extends string>(links: readonly RepeatLink<K>[]): RepeatStreak[] {
  const byValue = new Map<number, RepeatLink<K>[]>()
  for (const link of links) {
    const bucket = byValue.get(link.value)
    if (bucket) bucket.push(link)
    else byValue.set(link.value, [link])
  }
  const streaks: RepeatStreak[] = []
  for (const [value, bucket] of byValue) {
    const ordered = [...bucket].sort((a, b) => a.fromDate.localeCompare(b.fromDate))
    let run = 1
    for (let index = 0; index < ordered.length; index += 1) {
      const current = ordered[index]
      const next = ordered[index + 1]
      if (next && next.fromDate === current.toDate) {
        run += 1
        continue
      }
      if (run >= 2) streaks.push({ value, draws: run + 1 })
      run = 1
    }
  }
  streaks.sort((a, b) => b.draws - a.draws || a.value - b.value)
  return streaks
}

export function repeatsAt<K extends string>(
  links: readonly RepeatLink<K>[],
  date: string,
  side: "prev" | "next"
): RepeatLink<K>[] {
  return links.filter((link) => (side === "prev" ? link.toDate : link.fromDate) === date)
}

function repriseWord(count: number) {
  return count > 1 ? "reprises" : "reprise"
}

function formatMove<K extends string>(link: RepeatLink<K>) {
  if (link.fromKey === link.toKey) return `${link.value} (${link.fromKey})`
  return `${link.value} (${link.fromKey}→${link.toKey})`
}

/** Ligne d’infobulle : reprises qui touchent ce tirage, vers le précédent ou le suivant. */
export function formatRepeatTouch<K extends string>(
  links: readonly RepeatLink<K>[],
  date: string,
  side: "prev" | "next"
): string {
  const rows = repeatsAt(links, date, side)
  if (rows.length === 0) return ""
  const where = side === "prev" ? "du précédent" : "vers le suivant"
  return `Reprise ${where} : ${rows.map(formatMove).join(", ")}`
}

/** Légende sous le graphe. `noun` est « numéro » ou « étoile ». */
export function formatRepeatCaption<K extends string>(
  links: readonly RepeatLink<K>[],
  noun: "numéro" | "étoile"
): string {
  if (links.length === 0) {
    return noun === "étoile"
      ? "Aucune étoile reprise d’un tirage au suivant."
      : "Aucun numéro repris d’un tirage au suivant."
  }
  const steps = new Set(links.map((link) => link.fromDate)).size
  const streaks = repeatStreaks(links)
  const hold =
    streaks.length === 0
      ? ""
      : ` ${streaks
          .slice(0, 4)
          .map((streak) => `${streak.value} tient ${streak.draws} tirages`)
          .join(", ")}${streaks.length > 4 ? "…" : ""}.`
  const same = noun === "étoile" ? "la même étoile" : "le même numéro"
  return `${links.length} ${repriseWord(links.length)} sur ${steps} pas.${hold} Trait pointillé horizontal : ${same}, d’un tirage au suivant.`
}

export function repeatKeysFor(mode: "eachNumber" | "eachStar"): readonly RepeatRankKey[] {
  return mode === "eachNumber" ? NUMBER_RANK_KEYS : STAR_RANK_KEYS
}
