"use client"

import { useEffect, useMemo, useState } from "react"

import { TitleHelp, type HelpCopy } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  annualLagZones,
  DEFAULT_SUITE_LENGTH,
  formatLagDays,
  lagNullPhrase,
  SUITE_LENGTHS,
  type LagPoint,
  type LagZone,
} from "@/lib/annual-lag"
import {
  ANNUAL_MONTHS,
  annualMonthMean,
  annualPants,
  THEORETICAL_NUMBER_SUM,
  type AnnualBar,
  type AnnualLane,
  type AnnualRole,
} from "@/lib/annual-sum"
import { newestCalendarYear } from "@/lib/analysis-window"
import { DRAWS, formatDrawDate, type Draw } from "@/lib/draws"
import { cn } from "@/lib/utils"
import { WEEKDAY_LINE_COLOR, type WeekdayScope } from "@/lib/weekday-scope"

const TITLE_HELP: HelpCopy = {
  title: "Annuel",
  wide: true,
  body: `Graphique horizontal. Les années n, n−1 et n−2 sont en tête, côte à côte. Chaque barre part vers la droite : c’est la somme des 5 numéros d’un tirage.

Les mois descendent, de janvier à décembre, et ont la même hauteur. Le jour place la barre dans le mois, donc une fin de mois tombe au même endroit sur les trois années — février bissextile compris. Le trait horizontal ferme le mois. Le chiffre à droite de la colonne est la moyenne des sommes de ce mois, pour les soirs laissés allumés.

Le trait vertical est la moyenne théorique, 128. L’échelle est commune et resserrée sur les sommes observées : elle ne part pas de 0, pour que l’écart se voie. Elle ne bouge pas quand un soir s’éteint.

Mardi (cyan) et vendredi (rose) se sélectionnent ici. Le bandeau ne fait que poser le premier choix : les deux soirs restent chargés, l’autre jour se rallume d’un clic. Synthèse trace un trait continu qui passe par la somme de chaque tirage, mardi et vendredi, de janvier à décembre. Chaque point est un jour de tirage. Le chiffre à droite du mois reste la moyenne de ces tirages, même si une soirée est masquée.

« en cours » : l’année n n’a pas encore de tirage en décembre. Δ, à droite, compare les moyennes de mois affichées (n moins n−1, puis n−1 moins n−2), pas des totaux. Un mois avec peu de tirages bouge davantage. La fenêtre 20 / 50 / année ne coupe pas ces trois années.

Décalage compare des suites de 6 à 10 tirages, 8 au départ. Une suite est une chaîne de sens consécutifs, par exemple 2 monte + 3 baisse + 3 monte. Un pas monte s’il dépasse l’écart-type de l’année, baisse s’il le dépasse vers le bas, stable sinon. La corrélation croisée cherche un écart de −21 à +21 jours, n contre n−1, puis n−1 contre n−2, au tirage le plus proche à trois jours près. On le retient si la chaîne est la même, si |r| dépasse l’alignement sans décalage, et s’il dépasse le 95e centile du nul qui réordonne l’autre année. La zone porte alors cette phrase. Sinon la lecture est « pas de décalage retenu ». Les mois absents d’un côté ne sont pas comparés. Synthèse allumée, Décalage suit le trait continu : mardi et vendredi, même si une soirée est masquée. Mardi et vendredi ensemble, l’écart entre les soirs est de trois ou quatre jours.

Lecture d’archive. Les tirages restent indépendants. r n’est pas une probabilité du prochain tirage.`,
}

const ROLE_LABEL: Record<AnnualRole, string> = {
  n: "n",
  "n-1": "n−1",
  "n-2": "n−2",
}

const DELTA_TITLE = [
  "Moyenne du mois : n moins n−1",
  "Moyenne du mois : n−1 moins n−2",
] as const

const VB_W = 980
const LABEL_W = 46
const DELTA_W = 46
const PAD_R = 8
const HEADER_H = 50
const MONTH_H = 56
const PLOT_H = ANNUAL_MONTHS.length * MONTH_H
const VB_H = HEADER_H + PLOT_H + 8
const COL_GAP = 18
const MEAN_GUTTER = 32
const COLS_W = VB_W - LABEL_W - DELTA_W - PAD_R
const COL_W = (COLS_W - 2 * COL_GAP) / 3

type DayPicks = {
  mardi: boolean
  vendredi: boolean
  synthese: boolean
}

type MonthReadout = {
  mean: number | null
  count: number
}

type Tip =
  | { kind: "bar"; bar: AnnualBar; year: number }
  | { kind: "synthese"; bar: AnnualBar; year: number }

function picksFor(scope: WeekdayScope): DayPicks {
  if (scope === "mardi") return { mardi: true, vendredi: false, synthese: false }
  if (scope === "vendredi") return { mardi: false, vendredi: true, synthese: false }
  if (scope === "synthese") return { mardi: true, vendredi: true, synthese: true }
  return { mardi: true, vendredi: true, synthese: false }
}

export function EvolutionAnnual({ weekday }: { weekday: WeekdayScope }) {
  const archive = useAnnualArchive()
  const model = useMemo(
    () =>
      annualPants(
        archive.draws.map((draw) => ({
          date: draw.date,
          weekday: draw.weekday,
          numbers: draw.numbers,
        })),
        archive.anchor
      ),
    [archive.draws, archive.anchor]
  )
  const [picks, setPicks] = useState<DayPicks>(() => picksFor(weekday))
  const [tip, setTip] = useState<Tip | null>(null)
  const [lagOn, setLagOn] = useState(false)
  const [suiteLength, setSuiteLength] = useState(DEFAULT_SUITE_LENGTH)
  const [seededWeekday, setSeededWeekday] = useState(weekday)
  if (seededWeekday !== weekday) {
    setSeededWeekday(weekday)
    setPicks(picksFor(weekday))
    setTip(null)
  }
  const readouts = useMemo(
    () => model.lanes.map((lane) => monthReadout(lane, picks)),
    [model.lanes, picks]
  )
  const lines = useMemo(
    () => model.lanes.map((lane) => (picks.synthese ? synthesePoints(lane) : [])),
    [model.lanes, picks.synthese]
  )
  const lagSeries = useMemo(
    () => model.lanes.map((lane) => lagPoints(lane, picks)),
    [model.lanes, picks]
  )
  const lagZones = useMemo(() => {
    if (!lagOn) return [[], [], []] as LagZone[][]
    return [
      annualLagZones(lagSeries[0] ?? [], lagSeries[1] ?? [], { length: suiteLength }),
      annualLagZones(lagSeries[1] ?? [], lagSeries[2] ?? [], { length: suiteLength }),
      [],
    ]
  }, [lagOn, lagSeries, suiteLength])
  const hoverZone =
    lagOn && tip
      ? zoneUnder(lagZones[model.lanes.findIndex((lane) => lane.year === tip.year)] ?? [], tip.bar.x)
      : null
  const localGap =
    archive.source === "json" && model.lanes.slice(1).every((lane) => lane.bars.length === 0)
  const nothingOn = !picks.mardi && !picks.vendredi && !picks.synthese
  function togglePick(key: keyof DayPicks) {
    setPicks((current) => ({ ...current, [key]: !current[key] }))
    setTip(null)
  }
  const summary = model.lanes
    .map((lane) => {
      const mean = lane.mean == null ? "sans tirage" : `moyenne ${formatInt(lane.mean)}`
      return `${ROLE_LABEL[lane.role]} ${lane.year}, ${lane.bars.length} tirages, ${mean}`
    })
    .join(". ")

  return (
    <Card
      data-annual-pants
      data-annual-source={archive.source}
      data-annual-lag={lagOn ? "on" : "off"}
      data-annual-lag-series={lagSeriesMode(picks, lagOn)}
      data-suite-length={suiteLength}
    >
      <CardHeader>
        <CardTitle className="text-sm">
          <TitleHelp help={TITLE_HELP}>Somme des numéros</TitleHelp>
        </CardTitle>
        <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
          Barres horizontales. n, n−1 et n−2 sont en tête. Mardi et vendredi se choisissent.
          Synthèse relie chaque tirage par un trait continu. Décalage lit un écart zonal sur des
          suites de 6 à 10 tirages. Trait horizontal en fin de mois, trait vertical à 128.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Jours du graphique annuel">
            <DayToggle
              pressed={picks.mardi}
              label="Mardi"
              onClick={() => togglePick("mardi")}
              swatch={<BarSwatch color={WEEKDAY_LINE_COLOR.mardi} muted={!picks.mardi} />}
            />
            <DayToggle
              pressed={picks.vendredi}
              label="Vendredi"
              onClick={() => togglePick("vendredi")}
              swatch={<BarSwatch color={WEEKDAY_LINE_COLOR.vendredi} muted={!picks.vendredi} />}
            />
            <DayToggle
              pressed={picks.synthese}
              label="Synthèse"
              onClick={() => togglePick("synthese")}
              swatch={<SyntheseSwatch muted={!picks.synthese} />}
            />
            <DayToggle
              pressed={lagOn}
              label="Décalage"
              onClick={() => {
                setLagOn((current) => !current)
                setTip(null)
              }}
              swatch={<LagSwatch muted={!lagOn} />}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Suites de tirages">
            <span>Suites</span>
            {SUITE_LENGTHS.map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={suiteLength === size}
                data-suite-length={size}
                onClick={() => {
                  setSuiteLength(size)
                  setTip(null)
                }}
                className={cn(
                  "inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-xs tabular-nums",
                  suiteLength === size
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {size}
              </button>
            ))}
          </div>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-px border-l border-dashed border-muted-foreground" />
            Moyenne 128
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-px w-6 bg-foreground/30" />
            Fin de mois
          </span>
          {archive.loading ? <span>Chargement des trois années…</span> : null}
        </div>

        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            data-annual-orientation="horizontal"
            className="h-auto w-full min-w-[760px]"
            role="img"
            aria-label={`Somme des 5 numéros, trois années en tête. ${summary}`}
            style={{ fontFamily: "inherit" }}
            onPointerLeave={() => setTip(null)}
          >
            {model.lanes.map((lane, index) => (
              <YearHead key={lane.role} lane={lane} index={index} yMin={model.yMin} yMax={model.yMax} />
            ))}
            <text x={LABEL_W + COLS_W + 4} y={16} fill="var(--muted-foreground)" fontSize="10">
              <title>{DELTA_TITLE[0]}</title>
              Δ n
            </text>
            <text x={LABEL_W + COLS_W + 4} y={30} fill="var(--muted-foreground)" fontSize="10">
              <title>{DELTA_TITLE[1]}</title>
              Δ n−1
            </text>

            {ANNUAL_MONTHS.map((month) =>
              month.month % 2 === 0 ? (
                <rect
                  key={month.month}
                  x={LABEL_W}
                  y={yTime((month.month - 1) / 12)}
                  width={COLS_W}
                  height={MONTH_H}
                  fill="var(--muted)"
                  opacity={0.4}
                />
              ) : null
            )}

            {model.lanes.map((lane, index) => (
              <YearColumn
                key={lane.role}
                lane={lane}
                index={index}
                yMin={model.yMin}
                yMax={model.yMax}
                bars={visibleBars(lane, picks)}
                readout={readouts[index] ?? []}
                points={lines[index] ?? []}
                zones={lagOn ? (lagZones[index] ?? []) : []}
                loading={archive.loading && lane.bars.length === 0}
                activeDate={tip && tip.year === lane.year ? tip.bar.date : null}
                onHover={(next) =>
                  setTip((current) => (sameTip(current, next) ? current : next))
                }
              />
            ))}

            {ANNUAL_MONTHS.map((month) => (
              <g key={month.month}>
                <text
                  x={4}
                  y={yTime((month.month - 0.5) / 12) + 4}
                  fill="var(--muted-foreground)"
                  fontSize="11"
                >
                  {month.label}
                </text>
                <line
                  data-month-end={month.month}
                  x1={LABEL_W}
                  x2={LABEL_W + COLS_W}
                  y1={yTime(month.month / 12)}
                  y2={yTime(month.month / 12)}
                  stroke="var(--foreground)"
                  strokeOpacity={0.28}
                />
              </g>
            ))}

            {readouts[0] && readouts[1] && readouts[2]
              ? ANNUAL_MONTHS.map((month, index) => {
                  const newer = pairDelta(readouts[0][index], readouts[1][index])
                  const older = pairDelta(readouts[1][index], readouts[2][index])
                  return (
                    <g key={`delta-${month.month}`} data-annual-delta={month.month}>
                      <text
                        x={LABEL_W + COLS_W + 4}
                        y={yTime((month.month - 0.5) / 12) - 1}
                        fill={deltaFill(newer)}
                        fontSize="10"
                      >
                        <title>
                          {DELTA_TITLE[0]} · {month.label} · {readouts[0][index]?.count ?? 0} tirages
                          contre {readouts[1][index]?.count ?? 0}
                        </title>
                        {formatDelta(newer)}
                      </text>
                      <text
                        x={LABEL_W + COLS_W + 4}
                        y={yTime((month.month - 0.5) / 12) + 12}
                        fill={deltaFill(older)}
                        fontSize="10"
                      >
                        <title>
                          {DELTA_TITLE[1]} · {month.label} · {readouts[1][index]?.count ?? 0} tirages
                          contre {readouts[2][index]?.count ?? 0}
                        </title>
                        {formatDelta(older)}
                      </text>
                    </g>
                  )
                })
              : null}

            {tip ? (
              <line
                x1={LABEL_W}
                x2={LABEL_W + COLS_W}
                y1={yTime(tip.bar.x)}
                y2={yTime(tip.bar.x)}
                stroke="var(--foreground)"
                strokeOpacity={0.35}
                pointerEvents="none"
              />
            ) : null}
          </svg>
        </div>

        <p data-annual-detail aria-live="polite" className="min-h-10 text-sm leading-5 tabular-nums">
          {nothingOn ? (
            <span className="text-muted-foreground">Aucun soir sélectionné.</span>
          ) : tip?.kind === "bar" ? (
            <Detail bar={tip.bar} year={tip.year} />
          ) : tip?.kind === "synthese" ? (
            <SyntheseDetail tip={tip} />
          ) : (
            <span className="text-muted-foreground">
              {picks.synthese
                ? "Survolez une barre ou le trait continu pour lire la date, les numéros et l’écart à 128."
                : "Survolez une barre pour lire la date, les numéros et l’écart à 128."}
            </span>
          )}
        </p>
        {hoverZone ? (
          <p data-annual-lag-detail className="text-sm leading-5 tabular-nums">
            <LagDetail zone={hoverZone} />
          </p>
        ) : null}
        <p className="text-xs leading-5 text-muted-foreground">
          Δ suit les moyennes affichées : les soirs allumés, ou mardi + vendredi si Synthèse est
          allumée. Positif, la moyenne la plus récente est plus haute. Décalage, s’il est allumé,
          pose le décalage retenu sur la colonne la plus récente de la paire. Synthèse allumée, il
          suit le trait continu. r décrit l’archive, pas le prochain tirage.{" "}
          {archive.source === "neon" ? "Source Neon." : "Source fichier local."}
          {localGap
            ? " n−1 et n−2 restent vides tant que l’archive distante ne répond pas."
            : ""}
        </p>
      </CardContent>
    </Card>
  )
}

function YearHead({
  lane,
  index,
  yMin,
  yMax,
}: {
  lane: AnnualLane
  index: number
  yMin: number
  yMax: number
}) {
  const left = colLeft(index)
  const ticks =
    index === 0
      ? [yMin, THEORETICAL_NUMBER_SUM, yMax].filter(
          (value, tickIndex, all) => all.indexOf(value) === tickIndex
        )
      : []
  return (
    <g data-annual-head={lane.role}>
      <text
        x={left + COL_W / 2}
        y={16}
        textAnchor="middle"
        fill="var(--foreground)"
        fontSize="13"
        fontWeight={600}
      >
        {ROLE_LABEL[lane.role]} {lane.year}
        {lane.partial ? " · en cours" : ""}
      </text>
      {ticks.map((value) => {
        const atMin = value === yMin
        const atMax = value === yMax
        return (
          <text
            key={value}
            x={atMin ? left + 4 : atMax ? left + COL_W - MEAN_GUTTER : sumX(index, value, yMin, yMax)}
            y={36}
            textAnchor={atMin ? "start" : atMax ? "end" : "middle"}
            fill="var(--muted-foreground)"
            fontSize="10"
          >
            {formatInt(value)}
          </text>
        )
      })}
    </g>
  )
}

function YearColumn({
  lane,
  index,
  yMin,
  yMax,
  bars,
  readout,
  points,
  zones,
  loading,
  activeDate,
  onHover,
}: {
  lane: AnnualLane
  index: number
  yMin: number
  yMax: number
  bars: readonly AnnualBar[]
  readout: readonly MonthReadout[]
  points: readonly AnnualBar[]
  zones: readonly LagZone[]
  loading: boolean
  activeDate: string | null
  onHover: (tip: Tip) => void
}) {
  const left = colLeft(index)
  const origin = left + 4
  const thick = Math.max(3.2, (MONTH_H / 31) * 0.85)
  const meanX = sumX(index, THEORETICAL_NUMBER_SUM, yMin, yMax)

  return (
    <g
      data-annual-year={lane.year}
      data-annual-role={lane.role}
      data-annual-partial={lane.partial ? "true" : "false"}
    >
      <line
        x1={meanX}
        x2={meanX}
        y1={HEADER_H}
        y2={HEADER_H + PLOT_H}
        stroke="var(--muted-foreground)"
        strokeDasharray="4 3"
        strokeOpacity={0.8}
      />
      {bars.map((bar) => {
        const y = yTime(bar.x)
        const end = sumX(index, bar.sum, yMin, yMax)
        const highlighted = activeDate === bar.date
        return (
          <rect
            key={bar.date}
            x={origin}
            y={y - thick / 2}
            width={Math.max(1, end - origin)}
            height={thick}
            rx={0.6}
            fill={barFill(bar.weekday)}
            stroke={highlighted ? "var(--foreground)" : "none"}
            strokeWidth={highlighted ? 1 : 0}
            data-annual-bar={bar.date}
            data-annual-weekday={bar.weekday}
          >
            <title>
              {formatDrawDate(bar.date)} · somme {formatInt(bar.sum)}
            </title>
          </rect>
        )
      })}
      {lagMarks(zones).map((mark) => (
        <g
          key={`${mark.zone.fromDate}-${mark.zone.toDate}-${mark.zone.tau}-${mark.zone.chainLabel}`}
          data-annual-lag-zone={mark.zone.fromDate}
          data-annual-lag-tau={mark.zone.tau}
          data-annual-lag-chain={mark.zone.chainLabel}
          pointerEvents="none"
        >
          <title>
            {mark.zone.chainLabel} · {formatLagDays(mark.zone.tau ?? 0)} · {lagNullPhrase(mark.zone)}
          </title>
          <line
            x1={left + 2}
            x2={left + 2}
            y1={mark.y1}
            y2={mark.y2}
            stroke="var(--foreground)"
            strokeWidth={2}
          />
          <line x1={left + 2} x2={left + 8} y1={mark.y1} y2={mark.y1} stroke="var(--foreground)" strokeWidth={1.4} />
          <line x1={left + 2} x2={left + 8} y1={mark.y2} y2={mark.y2} stroke="var(--foreground)" strokeWidth={1.4} />
          <rect
            x={left + 10}
            y={mark.labelY - 9}
            width={Math.min(COL_W - 46, Math.max(36, mark.zone.chainLabel.length * 4.2))}
            height={22}
            fill="var(--background)"
            opacity={0.92}
          />
          <text x={left + 12} y={mark.labelY} fill="var(--foreground)" fontSize="9">
            {formatLagDays(mark.zone.tau ?? 0)}
          </text>
          <text x={left + 12} y={mark.labelY + 10} fill="var(--muted-foreground)" fontSize="8">
            {mark.zone.chainLabel}
          </text>
        </g>
      ))}
      {points.length > 0 ? (
        <g data-annual-synthese="continu" pointerEvents="none">
          {points.length > 1 ? (
            <polyline
              points={points
                .map((bar) => `${sumX(index, bar.sum, yMin, yMax)},${yTime(bar.x)}`)
                .join(" ")}
              fill="none"
              stroke="var(--foreground)"
              strokeWidth={1.7}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {points.map((bar) => {
            const highlighted = activeDate === bar.date
            return (
              <circle
                key={bar.date}
                data-annual-synthese-point={bar.date}
                cx={sumX(index, bar.sum, yMin, yMax)}
                cy={yTime(bar.x)}
                r={highlighted ? 3.6 : 2.2}
                fill="var(--foreground)"
              >
                <title>
                  Synthèse · {formatDrawDate(bar.date)} · somme {formatInt(bar.sum)} · mardi + vendredi
                </title>
              </circle>
            )
          })}
        </g>
      ) : null}
      {lane.months.map((month, monthIndex) => {
        const mean = readout[monthIndex]?.mean ?? null
        return (
          <text
            key={month.month}
            x={left + COL_W - 6}
            y={yTime(month.month / 12) - 5}
            textAnchor="end"
            fill="var(--muted-foreground)"
            fontSize="10"
          >
            {mean == null ? "—" : formatInt(mean)}
          </text>
        )
      })}
      <rect
        x={left}
        y={HEADER_H}
        width={COL_W}
        height={PLOT_H}
        fill="transparent"
        style={{ cursor: "crosshair" }}
        onPointerMove={(event) => {
          const next = nearestTip(event, lane, bars, points)
          if (next) onHover(next)
        }}
      />
      {lane.bars.length === 0 ? (
        <text
          x={left + COL_W / 2}
          y={HEADER_H + PLOT_H / 2}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize="12"
        >
          {loading ? "chargement…" : "aucun tirage"}
        </text>
      ) : null}
    </g>
  )
}

function Detail({ bar, year }: { bar: AnnualBar; year: number }) {
  const numbers = [...bar.numbers].sort((a, b) => a - b).join(" ")
  return (
    <>
      <span className="text-foreground">{formatDrawDate(bar.date)}</span>
      <span className="text-muted-foreground"> · {year} · </span>
      <span className="text-foreground">{numbers}</span>
      <span className="text-muted-foreground"> · somme </span>
      <span className="text-foreground">{formatInt(bar.sum)}</span>
      <span className="text-muted-foreground"> · écart {signedGap(bar.sum)} à 128</span>
    </>
  )
}

function LagDetail({ zone }: { zone: LagZone }) {
  const phrase = lagNullPhrase(zone)
  return (
    <>
      <span className="text-foreground">{zone.chainLabel}</span>
      <span className="text-muted-foreground">
        {" "}
        · {formatDrawDate(zone.fromDate)} – {formatDrawDate(zone.toDate)} · r(0){" "}
      </span>
      <span className="text-foreground">{zone.r0 == null ? "—" : formatR(zone.r0)}</span>
      {zone.kept && zone.tau != null && zone.rTau != null ? (
        <>
          <span className="text-muted-foreground"> · r({formatLagDays(zone.tau)}) </span>
          <span className="text-foreground">{formatR(zone.rTau)}</span>
        </>
      ) : null}
      <span className="text-muted-foreground"> · {phrase}</span>
    </>
  )
}

function SyntheseDetail({ tip }: { tip: Extract<Tip, { kind: "synthese" }> }) {
  const numbers = [...tip.bar.numbers].sort((a, b) => a - b).join(" ")
  return (
    <>
      <span className="text-foreground">Synthèse</span>
      <span className="text-muted-foreground"> · {formatDrawDate(tip.bar.date)} · {tip.year} · </span>
      <span className="text-foreground">{numbers}</span>
      <span className="text-muted-foreground"> · somme </span>
      <span className="text-foreground">{formatInt(tip.bar.sum)}</span>
      <span className="text-muted-foreground">
        {" "}
        · écart {signedGap(tip.bar.sum)} à 128 · mardi + vendredi
      </span>
    </>
  )
}

function DayToggle({
  pressed,
  label,
  onClick,
  swatch,
}: {
  pressed: boolean
  label: string
  onClick: () => void
  swatch: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        pressed
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {swatch}
      {label}
    </button>
  )
}

function BarSwatch({ color, muted }: { color: string; muted: boolean }) {
  return (
    <span
      className="inline-block h-3 w-1.5 rounded-[1px]"
      style={{ background: color, opacity: muted ? 0.35 : 1 }}
    />
  )
}

function LagSwatch({ muted }: { muted: boolean }) {
  return (
    <span
      className="inline-block h-3 w-px bg-foreground"
      style={{ opacity: muted ? 0.35 : 1 }}
    />
  )
}

function SyntheseSwatch({ muted }: { muted: boolean }) {
  return (
    <span
      className="inline-block h-0.5 w-4 rounded-full bg-foreground"
      style={{ opacity: muted ? 0.35 : 1 }}
    />
  )
}

function useAnnualArchive() {
  const anchorSeed = newestCalendarYear(DRAWS) ?? new Date().getUTCFullYear()
  const [draws, setDraws] = useState<Draw[]>(() => DRAWS)
  const [anchor, setAnchor] = useState(anchorSeed)
  const [source, setSource] = useState<"json" | "neon">("json")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const head = await fetchDrawYear(null)
        if (cancelled) return
        const year = head.year ?? anchorSeed
        const [prev, older] = await Promise.all([
          fetchDrawYear(year - 1),
          fetchDrawYear(year - 2),
        ])
        if (cancelled) return
        const items = [...head.items, ...prev.items, ...older.items]
        if (items.length === 0) {
          setDraws(DRAWS)
          setAnchor(anchorSeed)
          setSource("json")
          return
        }
        setDraws(items)
        setAnchor(year)
        setSource("neon")
      } catch {
        if (!cancelled) {
          setDraws(DRAWS)
          setAnchor(anchorSeed)
          setSource("json")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [anchorSeed])

  return { draws, anchor, source, loading }
}

async function fetchDrawYear(year: number | null): Promise<{ year: number | null; items: Draw[] }> {
  const params = new URLSearchParams()
  if (year != null) params.set("year", String(year))
  const query = params.toString()
  const response = await fetch(`/api/draws${query ? `?${query}` : ""}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) return { year, items: [] }
  const payload = (await response.json()) as {
    ok?: boolean
    items?: Draw[]
    year?: number | null
  }
  const items = payload.ok && payload.items?.length ? payload.items : []
  return {
    year: typeof payload.year === "number" ? payload.year : year,
    items,
  }
}

function colLeft(index: number) {
  return LABEL_W + index * (COL_W + COL_GAP)
}

function yTime(unit: number) {
  return HEADER_H + unit * PLOT_H
}

function sumX(index: number, sum: number, yMin: number, yMax: number) {
  const span = yMax - yMin || 1
  const t = Math.min(1, Math.max(0, (sum - yMin) / span))
  return colLeft(index) + 4 + t * (COL_W - 8 - MEAN_GUTTER)
}

function nearestTip(
  event: React.PointerEvent<SVGRectElement>,
  lane: AnnualLane,
  bars: readonly AnnualBar[],
  points: readonly AnnualBar[]
): Tip | null {
  const svg = event.currentTarget.ownerSVGElement
  const matrix = svg?.getScreenCTM()
  if (!svg || !matrix) return null
  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const local = point.matrixTransform(matrix.inverse())
  const unit = (local.y - HEADER_H) / PLOT_H
  let bestBar: AnnualBar | null = null
  let bestBarDist = 0.02
  for (const bar of bars) {
    const dist = Math.abs(bar.x - unit)
    if (dist < bestBarDist) {
      bestBar = bar
      bestBarDist = dist
    }
  }
  let bestPoint: AnnualBar | null = null
  let bestPointDist = 0.02
  for (const bar of points) {
    const dist = Math.abs(bar.x - unit)
    if (dist < bestPointDist) {
      bestPoint = bar
      bestPointDist = dist
    }
  }
  if (bestBar && (!bestPoint || bestBarDist <= bestPointDist)) {
    return { kind: "bar", bar: bestBar, year: lane.year }
  }
  if (bestPoint) return { kind: "synthese", bar: bestPoint, year: lane.year }
  return null
}

function barFill(weekday: string) {
  if (weekday === "mardi") return WEEKDAY_LINE_COLOR.mardi
  if (weekday === "vendredi") return WEEKDAY_LINE_COLOR.vendredi
  return "var(--chart-1)"
}

function readoutDays(picks: DayPicks): readonly string[] | undefined {
  if (picks.synthese) return ["mardi", "vendredi"]
  if (picks.mardi && picks.vendredi) return undefined
  if (picks.mardi) return ["mardi"]
  if (picks.vendredi) return ["vendredi"]
  return []
}

function monthReadout(lane: AnnualLane, picks: DayPicks): MonthReadout[] {
  const days = readoutDays(picks)
  return ANNUAL_MONTHS.map((item) => annualMonthMean(lane.bars, item.month, days))
}

function lagMarks(zones: readonly LagZone[]) {
  const kept = zones
    .filter((zone) => zone.kept && zone.tau != null)
    .slice()
    .sort((a, b) => a.fromX - b.fromX || a.toX - b.toX)
  let nextLabel = HEADER_H + 12
  return kept.map((zone) => {
    const y1 = yTime(zone.fromX)
    const y2 = yTime(zone.toX)
    const preferred = (y1 + y2) / 2
    const labelY = Math.min(HEADER_H + PLOT_H - 14, Math.max(preferred, nextLabel))
    nextLabel = labelY + 24
    return { zone, y1, y2, labelY }
  })
}

function lagSeriesMode(picks: DayPicks, lagOn: boolean): "off" | "synthese" | "soirs" | "vide" {
  if (!lagOn) return "off"
  if (picks.synthese) return "synthese"
  if (picks.mardi || picks.vendredi) return "soirs"
  return "vide"
}

function lagPoints(lane: AnnualLane, picks: DayPicks): LagPoint[] {
  const bars = picks.synthese ? synthesePoints(lane) : visibleBars(lane, picks)
  return bars.map((bar) => ({
    date: bar.date,
    sum: bar.sum,
    month: bar.month,
    day: bar.day,
  }))
}

function zoneUnder(zones: readonly LagZone[], x: number): LagZone | null {
  let best: LagZone | null = null
  let bestSpan = Infinity
  let bestKept = false
  for (const zone of zones) {
    if (x < zone.fromX || x > zone.toX) continue
    const span = zone.toX - zone.fromX
    const kept = zone.kept
    if (!best || (kept && !bestKept) || (kept === bestKept && span < bestSpan)) {
      best = zone
      bestSpan = span
      bestKept = kept
    }
  }
  return best
}

function synthesePoints(lane: AnnualLane): AnnualBar[] {
  return lane.bars.filter((bar) => bar.weekday === "mardi" || bar.weekday === "vendredi")
}

function visibleBars(lane: AnnualLane, picks: DayPicks): AnnualBar[] {
  return lane.bars.filter((bar) => {
    if (bar.weekday === "mardi") return picks.mardi
    if (bar.weekday === "vendredi") return picks.vendredi
    return false
  })
}

function pairDelta(newer: MonthReadout | undefined, older: MonthReadout | undefined): number | null {
  if (newer?.mean == null || older?.mean == null) return null
  return newer.mean - older.mean
}

function sameTip(current: Tip | null, next: Tip): boolean {
  if (!current || current.year !== next.year || current.kind !== next.kind) return false
  if (current.kind === "bar" && next.kind === "bar") return current.bar.date === next.bar.date
  if (current.kind === "synthese" && next.kind === "synthese") return current.bar.date === next.bar.date
  return false
}

function formatInt(value: number) {
  return Math.round(value).toLocaleString("fr-FR")
}

function formatR(value: number) {
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDelta(value: number | null) {
  if (value == null) return "—"
  const rounded = Math.round(value)
  if (rounded > 0) return `+${rounded.toLocaleString("fr-FR")}`
  if (rounded < 0) return `−${Math.abs(rounded).toLocaleString("fr-FR")}`
  return "0"
}

function deltaFill(value: number | null) {
  if (value == null || Math.round(value) === 0) return "var(--muted-foreground)"
  return value > 0 ? "var(--chart-4)" : "var(--chart-2)"
}

function signedGap(sum: number) {
  const gap = Math.round(sum - THEORETICAL_NUMBER_SUM)
  if (gap > 0) return `+${gap.toLocaleString("fr-FR")}`
  if (gap < 0) return `−${Math.abs(gap).toLocaleString("fr-FR")}`
  return "0"
}
