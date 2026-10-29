"use client"

import { useMemo } from "react"

import { localDay, missingDrawDates } from "@/lib/nextdata/archive"

const LISTED = 3

/** Prévient quand des tirages du mardi ou du vendredi manquent après le dernier de l’archive :
 *  le prochain tirage calculé suit ce dernier tirage, et peut déjà être passé. */
export function StaleArchiveNote({
  lastDate,
  source,
  loading,
}: {
  lastDate: string | undefined
  source: string
  loading: boolean
}) {
  // L’archive embarquée a son propre bandeau.
  const missing = useMemo(
    () => (loading || source === "json" ? [] : missingDrawDates(lastDate, localDay())),
    [lastDate, loading, source]
  )
  if (!missing.length) return null
  const listed = missing.slice(0, LISTED).join(", ") + (missing.length > LISTED ? "…" : "")
  return (
    <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm" role="status">
      L’archive s’arrête au {lastDate} : {missing.length === 1 ? "un tirage du mardi ou du vendredi manque" : `${missing.length} tirages du mardi ou du vendredi manquent`}{" "}
      ({listed}). Le prochain tirage calculé suit le dernier de l’archive, il est donc déjà passé : resynchronisez l’archive
      avant de lire le résultat.
    </p>
  )
}
