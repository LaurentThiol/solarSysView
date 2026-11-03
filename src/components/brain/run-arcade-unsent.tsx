"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

import { HelpTip } from "@/components/help"
import { Button } from "@/components/ui/button"
import type { ChampionRecord } from "@/lib/run-arcade/champion"
import { retryUnsent, serverUnsentState, subscribeUnsent, unsentState } from "@/lib/run-arcade/client"
import { RUN_ARCADE_HELP } from "@/lib/run-arcade/help"

const NAMES_SHOWN = 3
const NOTE_MS = 10_000

function unsentSentence(items: readonly ChampionRecord[]) {
  const names = items.map((item) => `génération ${item.generation} · ${item.runner}`)
  const shown =
    names.length > NAMES_SHOWN + 1
      ? [...names.slice(0, NAMES_SHOWN), `${names.length - NAMES_SHOWN} autres`]
      : names
  const lead =
    items.length === 1
      ? "1 champion gardé dans ce navigateur, pas encore écrit dans Neon"
      : `${items.length} champions gardés dans ce navigateur, pas encore écrits dans Neon`
  return `${lead} : ${shown.join(", ")}.`
}

/** Les champions que Neon n’a pas confirmés, et le bouton qui les renvoie. Rien à l’écran quand la file est vide. */
export function UnsentChampions({ onWritten }: { onWritten?: (written: readonly ChampionRecord[]) => void }) {
  const state = useSyncExternalStore(subscribeUnsent, unsentState, serverUnsentState)
  const [note, setNote] = useState<string | null>(null)
  const waiting = state.items.length

  useEffect(() => {
    if (!note || waiting > 0) return
    const timer = window.setTimeout(() => setNote(null), NOTE_MS)
    return () => window.clearTimeout(timer)
  }, [note, waiting])

  async function retry() {
    const result = await retryUnsent()
    setNote(result.text)
    if (result.sent > 0) onWritten?.(result.written)
  }

  const idle = waiting > 0 && !state.sending
  if (!idle && !note) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="run-arcade-unsent">
      {idle ? (
        <>
          <p className="text-destructive">{unsentSentence(state.items)}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void retry()}>
            Réessayer l’écriture
          </Button>
          <HelpTip {...RUN_ARCADE_HELP.services} />
        </>
      ) : null}
      {note ? <p className="text-muted-foreground">{note}</p> : null}
    </div>
  )
}
