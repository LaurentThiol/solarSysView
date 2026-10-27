"use client"

import { useEffect, useState } from "react"

import { COVARIATE_BLOCK_KEY, COVARIATE_BLOCKS, readStoredBlock, writeStoredBlock } from "@/lib/nextdata/blocks"

/** Jeton posé par une ligne de bloc. Il suit nextData et nextDataTraining dans l’onglet. */
export function useCovariateBlock(families: string[]) {
  const [block, setBlock] = useState<string | null>(null)

  useEffect(() => {
    const sync = () => setBlock(readStoredBlock())
    sync()
    const onStorage = (event: StorageEvent) => {
      if (event.key !== COVARIATE_BLOCK_KEY) return
      sync()
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  useEffect(() => {
    if (!block) return
    const family = COVARIATE_BLOCKS[block]?.family
    if (!family || !families.includes(family)) {
      writeStoredBlock(null)
      setBlock(null)
    }
  }, [block, families])

  function choose(next: string | null) {
    const safe = next && next in COVARIATE_BLOCKS ? next : null
    writeStoredBlock(safe)
    setBlock(safe)
  }

  return [block, choose] as const
}

export function CovariateBlockToken({
  block,
  disabled,
  onClear,
}: {
  block: string | null
  disabled?: boolean
  onClear: () => void
}) {
  const label = block ? COVARIATE_BLOCKS[block]?.label : null
  if (!label) return null
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClear}
      data-covariate-block={block}
      aria-label={`${label}, retirer`}
      className="rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs text-foreground"
    >
      {label}
    </button>
  )
}
