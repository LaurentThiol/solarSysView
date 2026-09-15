import { catalogEntry } from "@/lib/brain/catalog"
import { markWatchlistRun, readWatchlist, saveReading } from "@/lib/brain/journal"
import { resolveEntry } from "@/lib/brain/resolve"
import type { ResolveContext } from "@/lib/brain/types"

export async function runWatchlist(ctx: Omit<ResolveContext, "entry">) {
  const ids = readWatchlist()
  if (!ids.length) return []
  const saved = []
  for (const id of ids) {
    const entry = catalogEntry(id)
    if (!entry) continue
    const fiche = await resolveEntry({ ...ctx, entry })
    saved.push(await saveReading({ fiche, source: "watchlist" }))
  }
  markWatchlistRun()
  return saved
}
