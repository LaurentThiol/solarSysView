"use client"

import { useMemo, useState } from "react"

import { useRegisterCapture } from "@/components/capture"
import { HelpTip, LabelHelp } from "@/components/help"
import { CoupleStress, CoupleVolume } from "@/components/next/couple-view"
import { WeekdayScopeControl } from "@/components/weekday-scope-control"
import { Button } from "@/components/ui/button"
import { PillTabPanel, PillTabs } from "@/components/ui/pill-tabs"
import { WINDOW_PRESET_LABELS, resolveWindow } from "@/lib/analysis-window"
import {
  NEXT_WINDOW_PRESETS,
  coupleSchema,
  formatCoupleAgo,
  formatCoupleReading,
  linksTouching,
  partnerOf,
  type CoupleLink,
  type NextWindowPreset,
} from "@/lib/next/couple"
import { useDraws } from "@/lib/use-draws"
import { useLabTab } from "@/lib/use-lab-tab"
import { useWeekdayScope } from "@/lib/use-weekday-scope"
import { weekdayFilterDay, type WeekdayScope } from "@/lib/weekday-scope"
import { cn } from "@/lib/utils"

const TABS = [
  {
    id: "couple",
    label: "Couple",
    help: {
      title: "Couple",
      body: "Place les boules 1–50 selon le poids de leurs co-sorties dans la fenêtre, lu du tirage le plus récent au plus ancien.",
    },
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
  const [preset, setPreset] = useState<NextWindowPreset>("last_50")
  const [selected, setSelected] = useState<number | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)

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
  const schema = useMemo(
    () => coupleSchema(resolved.work.map((draw) => ({ date: draw.date, numbers: draw.numbers }))),
    [resolved]
  )
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
  const touched = selected == null ? [] : linksTouching(schema.links, selected)
  const selectedPoint = schema.points.find((point) => point.ball === selected)
  const absent = schema.points.filter((point) => point.appearances === 0).map((point) => point.ball)

  useRegisterCapture(() => ({
    lab: "next",
    tab,
    summary: [
      formatCoupleReading(schema),
      schema.stress == null ? "Stress —" : `Stress ${schema.stress.toFixed(3)}`,
      schema.edges
        .slice(0, 5)
        .map((link) => `${link.a}–${link.b} (${link.affinity})`)
        .join(", "),
    ].filter((line) => line.length > 0),
    tech: {
      preset,
      weekday,
      drawCount: schema.drawCount,
      newest: schema.newest,
      oldest: schema.oldest,
      stress: schema.stress,
      edges: schema.edges.slice(0, 12).map((link) => ({
        a: link.a,
        b: link.b,
        count: link.count,
        affinity: link.affinity,
        ago: link.ago,
      })),
    },
    archive: {
      n: schema.drawCount,
      from: schema.oldest,
      to: schema.newest,
      source,
    },
  }))

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
  }

  function selectWeekday(next: WeekdayScope) {
    setWeekday(next)
    setSelected(null)
    setPinned(null)
  }

  function selectLink(link: CoupleLink) {
    setSelected(link.a)
    setPinned(`${link.a}-${link.b}`)
  }

  return (
    <div className="flex flex-col gap-4" data-next-lab>
      <PillTabs idPrefix="next" label="Next" value={tab} onValueChange={setTab} items={TABS} />
      <PillTabPanel idPrefix="next" tab={tab} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <WeekdayScopeControl value={weekday} onChange={selectWeekday} />
            <LabelHelp
              label="Espace"
              help={{
                title: "Espace temporel",
                body: "20, 50, 100 ou 200 derniers tirages, l’année civile du dernier tirage chargé, ou l’année civile précédente. La lecture commence par le tirage le plus récent.",
              }}
            >
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
          <p className="text-sm text-foreground">
            {formatCoupleReading(schema)} · {WINDOW_PRESET_LABELS[preset]} ·{" "}
            {source === "neon" ? "Neon" : "JSON local"}
          </p>
          <p className="inline-flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {schema.drawCount
              ? `Le plus récent pèse ${schema.drawCount}, le plus ancien pèse 1.`
              : "Le plus récent pèse n, le plus ancien pèse 1."}{" "}
            Le poids d’un couple est la somme de ces poids sur les tirages où les deux boules sortent ensemble.
            <HelpTip
              title="Lecture à l’envers"
              body="Rang 0 : tirage le plus récent de la fenêtre. « Il y a k tirages » compte les tirages plus récents que la dernière co-sortie. Les boules absentes de la fenêtre ne sont pas dessinées."
            />
          </p>
          {absent.length ? (
            <p className="text-xs text-muted-foreground">
              Absentes ({absent.length}) : {absent.join(", ")}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end">
          <CoupleStress stress={schema.stress} />
        </div>
        <CoupleVolume schema={schema} active={active} onSelect={selectBall} />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
          <section className="min-w-0 rounded-xl border border-border bg-card/40 p-3" aria-label="Couples">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium">Couples</h2>
              <p className="text-xs tabular-nums text-muted-foreground" data-couple-count={schema.links.length}>
                {schema.links.length} observé{schema.links.length > 1 ? "s" : ""}
              </p>
            </div>
            {schema.links.length === 0 ? (
              <p className="py-8 text-sm text-muted-foreground">Aucune co-sortie dans cette fenêtre.</p>
            ) : (
              <div className="max-h-[32rem] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-xs text-muted-foreground">
                      <th className="py-1 pr-3 font-medium" scope="col">
                        Couple
                      </th>
                      <th className="py-1 pr-3 font-medium" scope="col">
                        Compte
                      </th>
                      <th className="py-1 pr-3 font-medium" scope="col">
                        Poids
                      </th>
                      <th className="py-1 font-medium" scope="col">
                        Dernière co-sortie
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {schema.links.map((link) => {
                      const key = `${link.a}-${link.b}`
                      const on = pinned === key || (selected != null && (link.a === selected || link.b === selected))
                      return (
                        <tr key={key} className={cn("border-t border-border", on && "bg-primary/15")}>
                          <td className="py-1 pr-3">
                            <button
                              type="button"
                              className="tabular-nums underline-offset-2 hover:underline"
                              aria-pressed={pinned === key}
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
            {selected == null || !selectedPoint ? (
              <p className="text-sm text-muted-foreground">
                Choisissez une boule sur le schéma, ou un couple dans la liste. Les dates de co-sortie se lisent de la plus récente à la plus ancienne.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-medium">Boule {selected}</h2>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {selectedPoint.appearances} sortie{selectedPoint.appearances > 1 ? "s" : ""} dans la fenêtre
                    </p>
                  </div>
                  <Button type="button" size="xs" variant="outline" onClick={() => selectBall(null)}>
                    Effacer
                  </Button>
                </div>
                {touched.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune co-sortie dans la fenêtre.</p>
                ) : (
                  <ul className="flex max-h-[28rem] flex-col gap-2 overflow-auto">
                    {touched.map((link) => {
                      const other = partnerOf(link, selected)
                      const key = `${link.a}-${link.b}`
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            className={cn(
                              "w-full rounded-lg border border-transparent px-2 py-1.5 text-left text-sm hover:bg-muted/60",
                              pinned === key && "border-border bg-primary/15"
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
      </PillTabPanel>
    </div>
  )
}
