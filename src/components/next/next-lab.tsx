"use client"

import { useCallback, useMemo, useRef, useState } from "react"

import { useRegisterCapture } from "@/components/capture"
import { DrawChart } from "@/components/draw-chart"
import { HelpTip, HelpWrap, LabelHelp, TitleHelp } from "@/components/help"
import { CountFloorControl } from "@/components/next/count-floor"
import { CoupleStress, CoupleVolume } from "@/components/next/couple-view"
import { PronosticNextPanel } from "@/components/next/pronostic-next"
import { TripleReading } from "@/components/next/triple-view"
import { SiteHeaderSlot } from "@/components/site-header-slot"
import { WeekdayScopeControl } from "@/components/weekday-scope-control"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PillTabPanel, PillTabs } from "@/components/ui/pill-tabs"
import { WINDOW_PRESET_LABELS, resolveWindow } from "@/lib/analysis-window"
import {
  NEXT_WINDOW_PRESETS,
  coupleSchema,
  defaultCoupleSortDir,
  formatCoupleAgo,
  formatCoupleReading,
  linksTouching,
  partnerOf,
  sortCoupleLinks,
  type CoupleLink,
  type CoupleSortKey,
  type NextWindowPreset,
} from "@/lib/next/couple"
import type { CaptureContext } from "@/lib/capture/snapshot"
import { NEXT_FIELD_HELP } from "@/lib/next/help"
import {
  detailEmptyCopy,
  hiddenCountCopy,
  linksAtLeast,
  listEmptyCopy,
  observedLine,
} from "@/lib/next/min-count"
import { PRONOSTIC_NEXT_HELP } from "@/lib/next/pronostic-help"
import { NEXT_TRIPLE_FIELD_HELP } from "@/lib/next/triple-help"
import { formatTripleKey, tripleSchema, type TripleLink } from "@/lib/next/triple"
import { useDraws } from "@/lib/use-draws"
import { useLabTab } from "@/lib/use-lab-tab"
import { useMinCount } from "@/lib/use-min-count"
import { useWeekdayScope } from "@/lib/use-weekday-scope"
import { weekdayFilterDay, type WeekdayScope } from "@/lib/weekday-scope"
import { cn } from "@/lib/utils"

const TABS = [
  {
    id: "couple",
    label: "Couple",
    help: NEXT_FIELD_HELP.tab,
  },
  {
    id: "triple",
    label: "Triple",
    help: NEXT_TRIPLE_FIELD_HELP.tab,
  },
  {
    id: "pronosticNext",
    label: "pronosticNext",
    help: PRONOSTIC_NEXT_HELP.tab,
  },
] as const

type TabId = (typeof TABS)[number]["id"]
const TAB_IDS = TABS.map((item) => item.id) as TabId[]

const SHORT_LABEL: Record<NextWindowPreset, string> = {
  last_20: "20",
  last_50: "50",
  last_100: "100",
  last_200: "200",
  year: "Année",
  year_n1: "Année n−1",
  year_n2: "Année n−2",
}

const COUPLE_COLUMNS: {
  key: CoupleSortKey
  label: string
  help: (typeof NEXT_FIELD_HELP)[keyof typeof NEXT_FIELD_HELP]
  pad: boolean
}[] = [
  { key: "pair", label: "Couple", help: NEXT_FIELD_HELP.pair, pad: true },
  { key: "count", label: "Compte", help: NEXT_FIELD_HELP.count, pad: true },
  { key: "weight", label: "Poids", help: NEXT_FIELD_HELP.weight, pad: true },
  { key: "ago", label: "Dernière co-sortie", help: NEXT_FIELD_HELP.ago, pad: false },
]

const REVERSE_HELP = {
  title: "reverse",
  body: "L’archive va du plus ancien au plus récent. Ici la lecture part du dernier tirage de la fenêtre : le rang 0 est le plus récent, et le poids décroît jusqu’au plus ancien.",
} as const

function ReverseIndicator({ help = false }: { help?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1" data-next-reverse>
      <Badge aria-label="reverse, lecture du plus récent vers le plus ancien">reverse</Badge>
      {help ? <HelpTip {...REVERSE_HELP} /> : null}
    </span>
  )
}

function dateList(dates: readonly string[]) {
  const shown = dates.slice(0, 6)
  const rest = dates.length - shown.length
  return rest > 0 ? `${shown.join(" · ")} · +${rest}` : shown.join(" · ")
}

export function NextLab() {
  const [weekday, setWeekday] = useWeekdayScope()
  const { draws, source } = useDraws("current", weekday)
  const [tab, setTab] = useLabTab(TAB_IDS, "couple")
  const pronosticCapture = useRef<CaptureContext | null>(null)
  const keepPronosticCapture = useCallback((context: CaptureContext) => {
    pronosticCapture.current = context
  }, [])
  const [preset, setPreset] = useState<NextWindowPreset>("last_50")
  const [selected, setSelected] = useState<number | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [coupleTick, setCoupleTick] = useState(0)
  const [tripleSelected, setTripleSelected] = useState<number | null>(null)
  const [triplePinned, setTriplePinned] = useState<string | null>(null)
  const [tripleTick, setTripleTick] = useState(0)
  const [sortKey, setSortKey] = useState<CoupleSortKey>("weight")
  const [sortDir, setSortDir] = useState(defaultCoupleSortDir("weight"))
  const [minCount, setMinCount] = useMinCount()

  const archive = useMemo(
    () => [...draws].sort((left, right) => left.date.localeCompare(right.date)),
    [draws]
  )
  const resolved = useMemo(
    () =>
      resolveWindow(archive, {
        preset,
        warmup: 0,
        weekday: weekdayFilterDay(weekday),
      }),
    [archive, preset, weekday]
  )
  const windowDraws = useMemo(
    () => resolved.work.map((draw) => ({ date: draw.date, numbers: draw.numbers })),
    [resolved]
  )
  const schema = useMemo(() => coupleSchema(windowDraws), [windowDraws])
  const triples = useMemo(() => tripleSchema(windowDraws), [windowDraws])
  const active = useMemo(() => {
    const balls = new Set<number>()
    if (selected != null) balls.add(selected)
    if (pinned) {
      for (const value of pinned.split("-")) {
        const ball = Number(value)
        if (Number.isInteger(ball)) balls.add(ball)
      }
    }
    return [...balls]
  }, [pinned, selected])
  const pinnedCouple = useMemo(() => {
    if (!pinned) return null
    const [left, right] = pinned.split("-").map((value) => Number(value))
    if (!Number.isInteger(left) || !Number.isInteger(right)) return null
    return { a: left, b: right }
  }, [pinned])
  const pinnedTriple = useMemo(() => {
    if (!triplePinned) return null
    const [a, b, c] = triplePinned.split("-").map((value) => Number(value))
    if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(c)) return null
    return { a, b, c }
  }, [triplePinned])
  const touched = selected == null ? [] : linksTouching(schema.links, selected)
  const selectedPoint = schema.points.find((point) => point.ball === selected)
  const absent = schema.points.filter((point) => point.appearances === 0).map((point) => point.ball)
  const sortedLinks = useMemo(
    () => sortCoupleLinks(schema.links, sortKey, sortDir),
    [schema.links, sortDir, sortKey]
  )
  const visibleLinks = useMemo(() => linksAtLeast(sortedLinks, minCount), [minCount, sortedLinks])
  const visibleTouched = linksAtLeast(touched, minCount)
  const hiddenTouched = hiddenCountCopy(touched.length - visibleTouched.length, minCount)

  function toggleCoupleSort(key: CoupleSortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    setSortDir(defaultCoupleSortDir(key))
  }

  useRegisterCapture(() => {
    if (tab === "pronosticNext" && pronosticCapture.current) return pronosticCapture.current
    const reading = tab === "triple" ? triples : schema
    const pinnedLabel = tab === "triple" ? triplePinned : pinned
    const edges =
      tab === "triple"
        ? triples.edges
            .slice(0, 5)
            .map((link) => `${link.a}–${link.b}–${link.c} (${link.affinity})`)
            .join(", ")
        : schema.edges
            .slice(0, 5)
            .map((link) => `${link.a}–${link.b} (${link.affinity})`)
            .join(", ")
    return {
      lab: "next",
      tab,
      summary: [
        `reverse · ${formatCoupleReading(reading)}`,
        pinnedLabel ? `Lien ${pinnedLabel} dans Chaque numéro` : "",
        minCount <= 1 ? "Compte : tous" : `Compte ≥ ${minCount}`,
        reading.stress == null ? "Stress —" : `Stress ${reading.stress.toFixed(3)}`,
        edges,
      ].filter((line) => line.length > 0),
      tech: {
        preset,
        weekday,
        drawCount: reading.drawCount,
        newest: reading.newest,
        oldest: reading.oldest,
        stress: reading.stress,
        minCount,
        edges:
          tab === "triple"
            ? triples.edges.slice(0, 12).map((link) => ({
                a: link.a,
                b: link.b,
                c: link.c,
                count: link.count,
                affinity: link.affinity,
                ago: link.ago,
              }))
            : schema.edges.slice(0, 12).map((link) => ({
                a: link.a,
                b: link.b,
                count: link.count,
                affinity: link.affinity,
                ago: link.ago,
              })),
      },
      archive: {
        n: reading.drawCount,
        from: reading.oldest,
        to: reading.newest,
        source,
      },
    }
  })

  function selectBall(ball: number | null) {
    setPinned(null)
    if (ball == null) {
      setSelected(null)
      return
    }
    setSelected((prev) => (prev === ball ? null : ball))
  }

  function selectSpace(next: NextWindowPreset) {
    setPreset(next)
    setSelected(null)
    setPinned(null)
    setTripleSelected(null)
    setTriplePinned(null)
  }

  function selectWeekday(next: WeekdayScope) {
    setWeekday(next)
    setSelected(null)
    setPinned(null)
    setTripleSelected(null)
    setTriplePinned(null)
  }

  function selectTripleBall(ball: number | null) {
    setTriplePinned(null)
    if (ball == null) {
      setTripleSelected(null)
      return
    }
    setTripleSelected((prev) => (prev === ball ? null : ball))
  }

  function selectTripleLink(link: TripleLink) {
    setTripleSelected(link.a)
    setTriplePinned(formatTripleKey(link))
    setTripleTick((value) => value + 1)
    requestAnimationFrame(() => {
      document.getElementById("next-evolution")?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
  }

  function selectLink(link: CoupleLink) {
    setSelected(link.a)
    setPinned(`${link.a}-${link.b}`)
    setCoupleTick((tick) => tick + 1)
    requestAnimationFrame(() => {
      document.getElementById("next-evolution")?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
  }

  return (
    <div className="flex flex-col gap-4" data-next-lab>
      <SiteHeaderSlot>
        <div className="border-t border-border/80" role="status">
          <div className="mx-auto flex w-full max-w-[92rem] items-center gap-2 px-[max(1rem,env(safe-area-inset-left))] py-1.5 pr-[max(1rem,env(safe-area-inset-right))] sm:px-6">
            <ReverseIndicator help />
            <p className="min-w-0 text-xs text-muted-foreground">
              Lecture du plus récent vers le plus ancien.
            </p>
          </div>
        </div>
      </SiteHeaderSlot>
      <PillTabs idPrefix="next" label="Next" value={tab} onValueChange={setTab} items={TABS} />
      {tab === "couple" || tab === "triple" ? (
      <PillTabPanel idPrefix="next" tab={tab} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <WeekdayScopeControl
              value={weekday}
              onChange={selectWeekday}
              help={NEXT_FIELD_HELP.jour}
            />
            <LabelHelp label="Espace" help={NEXT_FIELD_HELP.space}>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Espace temporel">
                {NEXT_WINDOW_PRESETS.map((item) => (
                  <Button
                    key={item}
                    type="button"
                    size="sm"
                    variant={preset === item ? "default" : "outline"}
                    aria-pressed={preset === item}
                    onClick={() => selectSpace(item)}
                  >
                    {SHORT_LABEL[item]}
                  </Button>
                ))}
              </div>
            </LabelHelp>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            <ReverseIndicator />
            <span>
              {formatCoupleReading(schema)} · {WINDOW_PRESET_LABELS[preset]} ·{" "}
              {source === "neon" ? "Neon" : "JSON local"}
            </span>
            <HelpTip {...NEXT_FIELD_HELP.summary} />
          </p>
          <p className="inline-flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {schema.drawCount
              ? `Le plus récent pèse ${schema.drawCount}, le plus ancien pèse 1.`
              : "Le plus récent pèse n, le plus ancien pèse 1."}{" "}
            {tab === "triple" ? (
              <>
                Le poids d’un triplet est la somme de ces poids sur les tirages où les trois boules sortent ensemble.
                Un clic dans Triplets relie ces trois boules dans la vue Chaque numéro.
              </>
            ) : (
              <>
                Le poids d’un couple est la somme de ces poids sur les tirages où les deux boules sortent ensemble.
                Un clic dans Couples relie ces deux boules dans la vue Chaque numéro.
              </>
            )}
            <HelpTip {...NEXT_FIELD_HELP.reading} />
          </p>
          {absent.length ? (
            <p className="text-xs text-muted-foreground">
              <TitleHelp help={NEXT_FIELD_HELP.absent}>Absentes ({absent.length})</TitleHelp>
              {" : "}
              {absent.join(", ")}
            </p>
          ) : null}
        </div>

        {tab === "triple" ? (
          <TripleReading
            schema={triples}
            draws={resolved.work}
            selected={tripleSelected}
            pinned={triplePinned}
            pinnedTriple={pinnedTriple}
            tick={tripleTick}
            minCount={minCount}
            onMinCount={setMinCount}
            onSelectBall={selectTripleBall}
            onSelectLink={selectTripleLink}
          />
        ) : (
          <>
        <div className="flex justify-end">
          <CoupleStress stress={schema.stress} />
        </div>
        <CoupleVolume schema={schema} active={active} onSelect={selectBall} />

        <div id="next-evolution" className="min-w-0 scroll-mt-24">
          <DrawChart draws={resolved.work} couple={pinnedCouple} coupleTick={coupleTick} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
          <section className="min-w-0 rounded-xl border border-border bg-card/40 p-3" aria-label="Couples">
            <div className="mb-2 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium">
                  <TitleHelp help={NEXT_FIELD_HELP.couples}>Couples</TitleHelp>
                </h2>
                <p
                  className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground"
                  data-couple-count={schema.links.length}
                  data-couple-shown={visibleLinks.length}
                >
                  {observedLine(visibleLinks.length, schema.links.length, minCount)}
                  <HelpTip {...NEXT_FIELD_HELP.observed} />
                </p>
              </div>
              <CountFloorControl
                value={minCount}
                onChange={setMinCount}
                help={NEXT_FIELD_HELP.minCount}
              />
              <p className="text-xs text-muted-foreground">
                Un clic sur un en-tête trie la colonne. Un clic sur une ligne relie le couple dans Chaque numéro.
              </p>
            </div>
            {visibleLinks.length === 0 ? (
              <p className="py-8 text-sm text-muted-foreground">
                {listEmptyCopy("couple", schema.links.length, minCount)}
              </p>
            ) : (
              <div
                className="max-h-[32rem] overflow-auto"
                data-couple-sort-key={sortKey}
                data-couple-sort-dir={sortDir}
              >
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-xs text-muted-foreground">
                      {COUPLE_COLUMNS.map((column) => {
                        const active = sortKey === column.key
                        return (
                          <th
                            key={column.key}
                            className={cn("py-1 font-medium", column.pad && "pr-3")}
                            scope="col"
                            aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                          >
                            <TitleHelp help={column.help} className="whitespace-nowrap">
                              <button
                                type="button"
                                className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-medium text-inherit hover:text-foreground"
                                onClick={() => toggleCoupleSort(column.key)}
                              >
                                {column.label}
                                <span
                                  aria-hidden
                                  className={cn("w-3 text-[10px] leading-none", !active && "opacity-40")}
                                >
                                  {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                                </span>
                              </button>
                            </TitleHelp>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLinks.map((link) => {
                      const key = `${link.a}-${link.b}`
                      const on = pinned === key || (selected != null && (link.a === selected || link.b === selected))
                      const quiet = link.count === 1 && pinned !== key
                      return (
                        <tr
                          key={key}
                          data-link-count={link.count}
                          className={cn(
                            "border-t border-border",
                            on && "bg-primary/15",
                            quiet && "text-muted-foreground opacity-60"
                          )}
                        >
                          <td className="py-1 pr-3">
                            <button
                              type="button"
                              className="tabular-nums underline-offset-2 hover:underline"
                              aria-pressed={pinned === key}
                              title="Relier ce couple dans Chaque numéro"
                              onClick={() => selectLink(link)}
                            >
                              {link.a}–{link.b}
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
                  <TitleHelp help={NEXT_FIELD_HELP.ball}>
                    {selectedPoint ? `Boule ${selected}` : "Boule"}
                  </TitleHelp>
                </h2>
                {selectedPoint ? (
                  <p className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                    {selectedPoint.appearances} sortie{selectedPoint.appearances > 1 ? "s" : ""} dans la fenêtre
                    <HelpTip {...NEXT_FIELD_HELP.appearances} />
                  </p>
                ) : null}
              </div>
              {selectedPoint ? (
                <HelpWrap help={NEXT_FIELD_HELP.clear}>
                  <Button type="button" size="xs" variant="outline" onClick={() => selectBall(null)}>
                    Effacer
                  </Button>
                </HelpWrap>
              ) : null}
            </div>
            {selected == null || !selectedPoint ? (
              <p className="text-sm text-muted-foreground">
                Choisissez une boule sur le schéma, ou un couple dans la liste. Le couple choisi est relié dans Chaque numéro. Les dates de co-sortie se lisent de la plus récente à la plus ancienne.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {visibleTouched.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {detailEmptyCopy(touched.length, minCount)}
                  </p>
                ) : (
                  <ul className="flex max-h-[28rem] flex-col gap-2 overflow-auto">
                    {hiddenTouched ? (
                      <li className="px-2 text-xs text-muted-foreground">{hiddenTouched}</li>
                    ) : null}
                    {visibleTouched.map((link) => {
                      const other = partnerOf(link, selected)
                      const key = `${link.a}-${link.b}`
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            className={cn(
                              "w-full rounded-lg border border-transparent px-2 py-1.5 text-left text-sm hover:bg-muted/60",
                              pinned === key && "border-border bg-primary/15",
                              link.count === 1 && pinned !== key && "text-muted-foreground opacity-60"
                            )}
                            aria-pressed={pinned === key}
                            onClick={() => selectLink(link)}
                          >
                            <span className="tabular-nums">
                              {selected}–{other} · {link.count} fois · poids {link.affinity} · {formatCoupleAgo(link.ago)}
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
        )}
      </PillTabPanel>
      ) : null}
      <PillTabPanel
        idPrefix="next"
        tab="pronosticNext"
        className={cn("flex flex-col gap-4", tab !== "pronosticNext" && "hidden")}
      >
        <PronosticNextPanel
          active={tab === "pronosticNext"}
          draws={archive}
          source={source}
          weekday={weekday}
          onWeekday={selectWeekday}
          onCapture={keepPronosticCapture}
        />
      </PillTabPanel>
    </div>
  )
}
