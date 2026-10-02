"use client"

import { useMemo } from "react"

import { DrawChart } from "@/components/draw-chart"
import { HelpTip, HelpWrap, TitleHelp } from "@/components/help"
import { BallVolume, type VolumeSegment } from "@/components/next/ball-volume"
import { Button } from "@/components/ui/button"
import { formatCoupleAgo } from "@/lib/next/couple"
import { NEXT_TRIPLE_FIELD_HELP } from "@/lib/next/triple-help"
import {
  formatTripleKey,
  othersOf,
  triplesTouching,
  type TripleLink,
  type TripleSchema,
} from "@/lib/next/triple"
import type { Draw } from "@/lib/draws"
import { cn } from "@/lib/utils"

function segmentsOf(links: readonly TripleLink[]): VolumeSegment[] {
  const map = new Map<string, VolumeSegment>()
  for (const link of links) {
    const pairs: [number, number][] = [
      [link.a, link.b],
      [link.a, link.c],
      [link.b, link.c],
    ]
    for (const [left, right] of pairs) {
      const a = Math.min(left, right)
      const b = Math.max(left, right)
      const key = `${a}-${b}`
      const prev = map.get(key)
      if (!prev || link.affinity > prev.affinity) map.set(key, { a, b, affinity: link.affinity })
    }
  }
  return [...map.values()]
}

export function TripleVolume({
  schema,
  active,
  onSelect,
}: {
  schema: TripleSchema
  active: readonly number[]
  onSelect: (ball: number | null) => void
}) {
  const layers = useMemo(() => {
    const activeSet = new Set(active)
    const incident = (link: TripleLink) =>
      activeSet.has(link.a) || activeSet.has(link.b) || activeSet.has(link.c)
    const hot = segmentsOf(schema.links.filter(incident))
    const hotKeys = new Set(hot.map((segment) => `${segment.a}-${segment.b}`))
    const dim = segmentsOf(schema.edges.filter((link) => !incident(link))).filter(
      (segment) => !hotKeys.has(`${segment.a}-${segment.b}`)
    )
    return { dim, hot, maxAffinity: schema.edges[0]?.affinity ?? 0 }
  }, [active, schema.edges, schema.links])

  return (
    <BallVolume
      points={schema.points}
      active={active}
      dim={layers.dim}
      hot={layers.hot}
      maxAffinity={layers.maxAffinity}
      volumeHelp={NEXT_TRIPLE_FIELD_HELP.volume}
      frameHelp={NEXT_TRIPLE_FIELD_HELP.frame}
      onSelect={onSelect}
    />
  )
}

export function TripleStress({ stress }: { stress: number | null }) {
  const label =
    stress == null
      ? "—"
      : stress.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  return (
    <p className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
      Stress {label}
      <HelpTip {...NEXT_TRIPLE_FIELD_HELP.stress} />
    </p>
  )
}

function dateList(dates: readonly string[]) {
  const shown = dates.slice(0, 6)
  const rest = dates.length - shown.length
  return rest > 0 ? `${shown.join(" · ")} · +${rest}` : shown.join(" · ")
}

export function TripleReading({
  schema,
  draws,
  selected,
  pinned,
  pinnedTriple,
  tick,
  onSelectBall,
  onSelectLink,
}: {
  schema: TripleSchema
  draws: Draw[]
  selected: number | null
  pinned: string | null
  pinnedTriple: { a: number; b: number; c: number } | null
  tick: number
  onSelectBall: (ball: number | null) => void
  onSelectLink: (link: TripleLink) => void
}) {
  const active = useMemo(() => {
    const balls = new Set<number>()
    if (selected != null) balls.add(selected)
    if (pinnedTriple) {
      balls.add(pinnedTriple.a)
      balls.add(pinnedTriple.b)
      balls.add(pinnedTriple.c)
    }
    return [...balls]
  }, [pinnedTriple, selected])
  const touched = selected == null ? [] : triplesTouching(schema.links, selected)
  const selectedPoint = schema.points.find((point) => point.ball === selected)

  return (
    <>
      <div className="flex justify-end">
        <TripleStress stress={schema.stress} />
      </div>
      <TripleVolume schema={schema} active={active} onSelect={onSelectBall} />

      <div id="next-evolution" className="min-w-0 scroll-mt-24">
        <DrawChart draws={draws} triple={pinnedTriple} tripleTick={tick} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
        <section className="min-w-0 rounded-xl border border-border bg-card/40 p-3" aria-label="Triplets">
          <div className="mb-2 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">
                <TitleHelp help={NEXT_TRIPLE_FIELD_HELP.triples}>Triplets</TitleHelp>
              </h2>
              <p
                className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground"
                data-triple-count={schema.links.length}
              >
                {schema.links.length} observé{schema.links.length > 1 ? "s" : ""}
                <HelpTip {...NEXT_TRIPLE_FIELD_HELP.observed} />
              </p>
            </div>
            <p className="text-xs text-muted-foreground">Un clic relie le triplet dans Chaque numéro.</p>
          </div>
          {schema.links.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">Aucune co-sortie dans cette fenêtre.</p>
          ) : (
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-1 pr-3 font-medium" scope="col">
                      <TitleHelp help={NEXT_TRIPLE_FIELD_HELP.trio} className="whitespace-nowrap">
                        Triplet
                      </TitleHelp>
                    </th>
                    <th className="py-1 pr-3 font-medium" scope="col">
                      <TitleHelp help={NEXT_TRIPLE_FIELD_HELP.count} className="whitespace-nowrap">
                        Compte
                      </TitleHelp>
                    </th>
                    <th className="py-1 pr-3 font-medium" scope="col">
                      <TitleHelp help={NEXT_TRIPLE_FIELD_HELP.weight} className="whitespace-nowrap">
                        Poids
                      </TitleHelp>
                    </th>
                    <th className="py-1 font-medium" scope="col">
                      <TitleHelp help={NEXT_TRIPLE_FIELD_HELP.ago} className="whitespace-nowrap">
                        Dernière co-sortie
                      </TitleHelp>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {schema.links.map((link) => {
                    const key = formatTripleKey(link)
                    const on =
                      pinned === key ||
                      (selected != null && (link.a === selected || link.b === selected || link.c === selected))
                    return (
                      <tr key={key} className={cn("border-t border-border", on && "bg-primary/15")}>
                        <td className="py-1 pr-3">
                          <button
                            type="button"
                            className="tabular-nums underline-offset-2 hover:underline"
                            aria-pressed={pinned === key}
                            title="Relier ce triplet dans Chaque numéro"
                            onClick={() => onSelectLink(link)}
                          >
                            {link.a}–{link.b}–{link.c}
                          </button>
                        </td>
                        <td className="py-1 pr-3 tabular-nums">{link.count}</td>
                        <td className="py-1 pr-3 tabular-nums">{link.affinity}</td>
                        <td className="py-1 tabular-nums">{formatCoupleAgo(link.ago)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="min-w-0 rounded-xl border border-border bg-card/40 p-3" aria-label="Boule choisie">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium">
                <TitleHelp help={NEXT_TRIPLE_FIELD_HELP.ball}>
                  {selectedPoint ? `Boule ${selected}` : "Boule"}
                </TitleHelp>
              </h2>
              {selectedPoint ? (
                <p className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                  {selectedPoint.appearances} sortie{selectedPoint.appearances > 1 ? "s" : ""} dans la fenêtre
                  <HelpTip {...NEXT_TRIPLE_FIELD_HELP.appearances} />
                </p>
              ) : null}
            </div>
            {selectedPoint ? (
              <HelpWrap help={NEXT_TRIPLE_FIELD_HELP.clear}>
                <Button type="button" size="xs" variant="outline" onClick={() => onSelectBall(null)}>
                  Effacer
                </Button>
              </HelpWrap>
            ) : null}
          </div>
          {selected == null || !selectedPoint ? (
            <p className="text-sm text-muted-foreground">
              Choisissez une boule sur le schéma, ou un triplet dans la liste. Le triplet choisi est relié dans Chaque numéro. Les dates de co-sortie se lisent de la plus récente à la plus ancienne.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {touched.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune co-sortie dans la fenêtre.</p>
              ) : (
                <ul className="flex max-h-[28rem] flex-col gap-2 overflow-auto">
                  {touched.map((link) => {
                    const [left, right] = othersOf(link, selected)
                    const key = formatTripleKey(link)
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          className={cn(
                            "w-full rounded-lg border border-transparent px-2 py-1.5 text-left text-sm hover:bg-muted/60",
                            pinned === key && "border-border bg-primary/15"
                          )}
                          aria-pressed={pinned === key}
                          onClick={() => onSelectLink(link)}
                        >
                          <span className="tabular-nums">
                            {selected}–{left}–{right} · {link.count} fois · poids {link.affinity} · {formatCoupleAgo(link.ago)}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{dateList(link.dates)}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </aside>
      </div>
    </>
  )
}
