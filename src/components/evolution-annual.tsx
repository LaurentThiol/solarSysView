"use client"

import { useEffect, useMemo, useState } from "react"

import { HelpTip, TitleHelp, type HelpCopy } from "@/components/help"
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
  formatSenseGap,
  formatSenseMoment,
  formatSenseTrack,
  sameSenseRate,
  sameSenseSegmentKey,
  sameSenseTrack,
  THEORETICAL_NUMBER_SUM,
  type SenseReading,
  type SenseTrack,
  type SenseTrackStep,
  type SameSenseRate,
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

Mardi (cyan) et vendredi (rose) se sélectionnent ici. Sur Tous, les deux pastilles sont éteintes : un clic les affiche. Le bandeau Mardi ou Vendredi allume ce soir ; l’autre reste éteint et se rallume d’un clic. Les deux soirs restent chargés. Synthèse trace un trait continu qui passe par la somme de chaque tirage, mardi et vendredi, de janvier à décembre. Chaque point est un jour de tirage. Un segment de ce trait passe au vert sur n et sur n−1 quand la somme monte, ou baisse, dans le même sens que le segment de l’autre année, au même soir, à trois jours près. Le chiffre à droite du mois reste la moyenne de ces tirages, même si une soirée est masquée.

Similitude, au-dessus du graphique, est la part des segments appariés qui vont dans ce même sens. n/n−1 compare n à n−1. n−1/n−2 compare n−1 à n−2. Un écart nul compte comme un sens différent. Un soir sans vis-à-vis ne compte pas. Le vert ne marque que n/n−1. Synthèse allumée, les deux taux suivent le trait continu, même si une soirée est masquée. Aucun soir allumé, ils lisent mardi et vendredi. Un soir seul, ils ne lisent que ce soir.

Suivi, sous Similitude, est le schéma de cette attente. L’écart courant compte les segments appariés depuis le dernier même sens. Il retombe à zéro sur un même sens. Le trait pointillé est l’écart moyen entre deux mêmes sens. Au-dessus, le même sens est en retard. En dessous, il est en avance. Deux mêmes sens au moins fixent la moyenne. Avant cela, le schéma montre l’écart, sans dire retard ni avance. n/n−1 et n−1/n−2 ont chacun leur ligne. Le suivi lit la même série que Similitude.

« en cours » : l’année n n’a pas encore de tirage en décembre. Δ, à droite, compare les moyennes de mois affichées (n moins n−1, puis n−1 moins n−2), pas des totaux. Un mois avec peu de tirages bouge davantage. La fenêtre 20 / 50 / année ne coupe pas ces trois années.

Décalage compare des suites de 3 à 10 tirages, 8 au départ. Une suite est une chaîne de sens consécutifs, par exemple 2 monte + 3 baisse + 3 monte. Un pas monte s’il dépasse l’écart-type de l’année, baisse s’il le dépasse vers le bas, stable sinon. La corrélation croisée cherche un écart de −21 à +21 jours, n contre n−1, puis n−1 contre n−2, au tirage le plus proche à trois jours près. On le retient si la chaîne est la même, si |r| dépasse l’alignement sans décalage, et s’il dépasse le 95e centile du nul qui réordonne l’autre année. La zone porte alors cette phrase. Sinon la lecture est « pas de décalage retenu ». Les mois absents d’un côté ne sont pas comparés. Synthèse allumée, Décalage suit le trait continu : mardi et vendredi, même si une soirée est masquée. Mardi et vendredi ensemble, l’écart entre les soirs est de trois ou quatre jours.

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

const SIMILARITY_PAIRS = [
  { id: "n/n-1", label: "n/n−1" },
  { id: "n-1/n-2", label: "n−1/n−2" },
] as const

const EMPTY_KEYS = new Set<string>()
const EMPTY_RATE: SameSenseRate = { compared: 0, same: 0, rate: null, keys: EMPTY_KEYS }

const SIMILARITY_HELP: HelpCopy = {
  title: "Similitude",
  wide: true,
  body: `Part des segments appariés qui montent, ou baissent, dans le même sens.

n/n−1 compare l’année n à n−1. n−1/n−2 compare n−1 à n−2. Un segment relie deux tirages qui se suivent dans la série affichée. Il trouve le même soir de l’autre année, au jour le plus proche, à trois jours au plus. Ces deux soirs doivent aussi se suivre de l’autre côté.

Le taux est le nombre de segments de même sens, divisé par le nombre de segments qui ont trouvé ce vis-à-vis. Un écart nul compte comme un sens différent. Un soir sans vis-à-vis ne compte pas. Le vert du trait Synthèse marque les segments de n/n−1. Le second taux suit la même règle, sans couleur.

Synthèse allumée, la série est le trait continu : mardi et vendredi, même si une soirée est masquée. Aucun soir allumé, le taux lit quand même mardi et vendredi. Un soir seul, il ne lit que ce soir. Lecture d’archive. Ce n’est pas une probabilité du prochain tirage.`,
}

const TRACK_HELP: HelpCopy = {
  title: "Suivi du même sens",
  wide: true,
  body: `Schéma du retard ou de l’avance du même sens, sur les mêmes segments que Similitude.

L’écart courant compte les segments appariés depuis le dernier même sens. Il retombe à zéro quand le segment va dans le même sens. Le trait pointillé est l’écart moyen entre deux mêmes sens. Au-dessus, le même sens est en retard. En dessous, il est en avance. Le point vert marque un même sens.

Deux mêmes sens au moins fixent cette moyenne. Avant cela, le schéma montre l’écart, sans dire retard ni avance. Un écart nul compte comme un sens différent : il allonge l’attente. Un soir sans vis-à-vis ne compte pas.

n/n−1 et n−1/n−2 ont chacun leur ligne. Synthèse allumée, ou aucun soir allumé, le suivi lit mardi et vendredi. Un soir seul, il ne lit que ce soir. Lecture d’archive. Ce n’est pas une probabilité du prochain tirage.`,
}

const VB_W = 980
const SENSE_LABEL_W = 78
const SENSE_PAD_R = 8
const SENSE_ROW_H = 48
const SENSE_AXIS_H = 18
const SENSE_PAD_T = 2
const SENSE_PLOT_X = SENSE_LABEL_W
const SENSE_PLOT_W = VB_W - SENSE_LABEL_W - SENSE_PAD_R
const SENSE_VB_H = SENSE_PAD_T + 2 * SENSE_ROW_H + SENSE_AXIS_H
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

type SenseTip = {
  pair: number
  index: number
}

function picksFor(scope: WeekdayScope): DayPicks {
  if (scope === "mardi") return { mardi: true, vendredi: false, synthese: false }
  if (scope === "vendredi") return { mardi: false, vendredi: true, synthese: false }
  if (scope === "synthese") return { mardi: true, vendredi: true, synthese: true }
  return { mardi: false, vendredi: false, synthese: false }
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
  const [senseTip, setSenseTip] = useState<SenseTip | null>(null)
  const [lagOn, setLagOn] = useState(false)
  const [suiteLength, setSuiteLength] = useState(DEFAULT_SUITE_LENGTH)
  const [seededWeekday, setSeededWeekday] = useState(weekday)
  if (seededWeekday !== weekday) {
    setSeededWeekday(weekday)
    setPicks(picksFor(weekday))
    setTip(null)
    setSenseTip(null)
  }
  const readouts = useMemo(
    () => model.lanes.map((lane) => monthReadout(lane, picks)),
    [model.lanes, picks]
  )
  const lines = useMemo(
    () => model.lanes.map((lane) => (picks.synthese ? synthesePoints(lane) : [])),
    [model.lanes, picks.synthese]
  )
  const similaritySeries = useMemo(
    () =>
      model.lanes.map((lane) => similarityPoints(lane, picks)),
    [model.lanes, picks]
  )
  const similarity = useMemo(
    () => [
      sameSenseRate(similaritySeries[0] ?? [], similaritySeries[1] ?? []),
      sameSenseRate(similaritySeries[1] ?? [], similaritySeries[2] ?? []),
    ],
    [similaritySeries]
  )
  const sameSense = picks.synthese ? (similarity[0]?.keys ?? EMPTY_KEYS) : EMPTY_KEYS
  const senseTracks = useMemo(
    () => [
      sameSenseTrack(similaritySeries[0] ?? [], similaritySeries[1] ?? []),
      sameSenseTrack(similaritySeries[1] ?? [], similaritySeries[2] ?? []),
    ],
    [similaritySeries]
  )
  const senseHover = senseTip ? senseStepAt(senseTracks, senseTip) : null
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
    setSenseTip(null)
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
          Barres horizontales. n, n−1 et n−2 sont en tête. Mardi et vendredi se choisissent, éteints
          sur Tous.
          Synthèse relie chaque tirage par un trait continu. Un segment vert : n et n−1 vont dans
          le même sens. Similitude donne cette part en n/n−1 et en n−1/n−2. Suivi trace le
          retard ou l’avance de ce même sens. Décalage lit un écart zonal sur des suites de 3 à
          10 tirages. Trait horizontal en fin de mois, trait vertical à 128.
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
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-6 rounded-full"
              style={{ background: "var(--chart-3)" }}
            />
            Même sens
          </span>
          {archive.loading ? <span>Chargement des trois années…</span> : null}
        </div>

        <div
          data-annual-similarity
          className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm tabular-nums"
        >
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            Similitude
            <HelpTip {...SIMILARITY_HELP} />
          </span>
          {SIMILARITY_PAIRS.map((pair, index) => {
            const rate = similarity[index] ?? EMPTY_RATE
            const text = formatSimilarity(rate)
            return (
              <span
                key={pair.id}
                data-annual-similarity-pair={pair.id}
                data-same={rate.same}
                data-compared={rate.compared}
                title={similarityTitle(pair.label, rate)}
                className="inline-flex items-baseline gap-2"
              >
                <span className="text-xs text-muted-foreground">{pair.label}</span>
                <span className="font-medium text-foreground">{text.percent}</span>
                {text.count ? (
                  <span className="text-xs text-muted-foreground">{text.count}</span>
                ) : null}
              </span>
            )
          })}
        </div>

        <div data-annual-sense-track className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              Suivi
              <HelpTip {...TRACK_HELP} />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-px w-6 border-t border-dashed border-muted-foreground" />
              Écart moyen
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-[1px]" style={{ background: "var(--chart-3)" }} />
              Avance
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-[1px]" style={{ background: "var(--chart-4)" }} />
              Retard
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--chart-3)" }} />
              Même sens
            </span>
          </div>
          <SenseTrackSchema
            tracks={senseTracks}
            hover={senseTip}
            onHover={(next) => setSenseTip((current) => (sameSenseTip(current, next) ? current : next))}
          />
          <p data-annual-sense-detail aria-live="polite" className="min-h-5 text-xs leading-5 tabular-nums">
            {senseHover ? (
              <SenseTrackDetail
                label={SIMILARITY_PAIRS[senseHover.pair]?.label ?? ""}
                step={senseHover.step}
                meanGap={senseHover.meanGap}
              />
            ) : (
              <span className="text-muted-foreground">Survolez le suivi pour lire l’écart à une date.</span>
            )}
          </p>
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
                sameSense={sameSense}
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
          allumée. Positif, la moyenne la plus récente est plus haute. Similitude est la part des
          segments appariés de même sens, n/n−1 puis n−1/n−2. Aucun soir allumé, elle lit
          mardi et vendredi. Un soir seul, elle ne lit que ce soir. Suivi compare l’écart
          courant à l’écart moyen : au-dessus, retard, en dessous, avance. Décalage,
          s’il est allumé, pose le décalage retenu sur la colonne la plus récente de la paire.
          Synthèse allumée, il suit le trait continu. r décrit l’archive, pas le prochain tirage.{" "}
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
  sameSense,
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
  sameSense: ReadonlySet<string>
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
          {points.length > 1
            ? points.slice(0, -1).map((bar, pointIndex) => {
                const next = points[pointIndex + 1]
                if (!next) return null
                const same = sameSense.has(sameSenseSegmentKey(bar.date, next.date))
                return (
                  <line
                    key={`${bar.date}>${next.date}`}
                    x1={sumX(index, bar.sum, yMin, yMax)}
                    y1={yTime(bar.x)}
                    x2={sumX(index, next.sum, yMin, yMax)}
                    y2={yTime(next.x)}
                    stroke={same ? "var(--chart-3)" : "var(--foreground)"}
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    data-annual-same-sense={same ? `${bar.date}>${next.date}` : undefined}
                  />
                )
              })
            : null}
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

function SenseTrackSchema({
  tracks,
  hover,
  onHover,
}: {
  tracks: readonly SenseTrack[]
  hover: SenseTip | null
  onHover: (tip: SenseTip | null) => void
}) {
  const summary = SIMILARITY_PAIRS.map((pair, index) => {
    const track = tracks[index]
    return `${pair.label} ${track ? formatSenseTrack(track) : "—"}`
  }).join(". ")
  return (
    <>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
        {SIMILARITY_PAIRS.map((pair, index) => {
          const track = tracks[index] ?? EMPTY_TRACK
          const gap = track.gap == null ? "—" : formatSenseGap(track.gap)
          const mean = track.meanGap == null ? "—" : formatSenseGap(track.meanGap)
          return (
            <span
              key={pair.id}
              data-annual-sense-headline={pair.id}
              title={`${pair.label} · écart ${gap} · moyenne ${mean}`}
              className="inline-flex items-baseline gap-2"
            >
              <span className="text-xs text-muted-foreground">{pair.label}</span>
              <span className="font-medium" style={{ color: senseReadingFill(track.reading) }}>
                {formatSenseTrack(track)}
              </span>
            </span>
          )
        })}
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${VB_W} ${SENSE_VB_H}`}
          data-annual-sense-schema
          className="h-auto w-full min-w-[760px]"
          role="img"
          aria-label={`Suivi du retard ou de l’avance du même sens. ${summary}`}
          style={{ fontFamily: "inherit" }}
        >
          {SIMILARITY_PAIRS.map((pair, index) => (
            <SenseTrackRow
              key={pair.id}
              pairId={pair.id}
              label={pair.label}
              index={index}
              track={tracks[index] ?? EMPTY_TRACK}
              hoverIndex={hover?.pair === index ? hover.index : null}
              onHover={onHover}
            />
          ))}
          {ANNUAL_MONTHS.map((month) => (
            <text
              key={month.month}
              x={senseX((month.month - 0.5) / 12)}
              y={SENSE_PAD_T + 2 * SENSE_ROW_H + 12}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              fontSize="8"
            >
              {month.label}
            </text>
          ))}
        </svg>
      </div>
    </>
  )
}

function SenseTrackRow({
  pairId,
  label,
  index,
  track,
  hoverIndex,
  onHover,
}: {
  pairId: string
  label: string
  index: number
  track: SenseTrack
  hoverIndex: number | null
  onHover: (tip: SenseTip | null) => void
}) {
  const rowTop = SENSE_PAD_T + index * SENSE_ROW_H
  const innerTop = rowTop + 6
  const innerBot = rowTop + SENSE_ROW_H - 6
  const innerH = innerBot - innerTop
  const maxGap = Math.max(0, track.meanGap ?? 0, ...track.steps.map((step) => step.gap))
  const maxY = Math.max(1, maxGap * 1.12)
  const yOf = (gap: number) => innerBot - (gap / maxY) * innerH
  const xs = track.steps.map((step) => senseX(step.x))
  const tail = xs.length === 0 ? senseX(0) : Math.min(senseX(1), xs[xs.length - 1] + 10)
  const hovered = hoverIndex == null ? null : (track.steps[hoverIndex] ?? null)
  const meanGap = track.meanGap
  return (
    <g
      data-annual-sense-row={pairId}
      data-sense-reading={track.reading ?? "none"}
      data-sense-gap={track.gap ?? ""}
      data-sense-mean={track.meanGap ?? ""}
    >
      {ANNUAL_MONTHS.map((month) =>
        month.month % 2 === 0 ? (
          <rect
            key={month.month}
            x={senseX((month.month - 1) / 12)}
            y={innerTop}
            width={SENSE_PLOT_W / 12}
            height={innerH}
            fill="var(--muted)"
            opacity={0.4}
          />
        ) : null
      )}
      <line
        x1={SENSE_PLOT_X}
        x2={SENSE_PLOT_X + SENSE_PLOT_W}
        y1={yOf(0)}
        y2={yOf(0)}
        stroke="var(--foreground)"
        strokeOpacity={0.15}
      />
      {meanGap != null
        ? track.steps.map((step, stepIndex) => {
            const x1 = xs[stepIndex] ?? senseX(step.x)
            const x2 = stepIndex + 1 < xs.length ? xs[stepIndex + 1] : tail
            if (x2 <= x1 || Math.abs(step.gap - meanGap) < 0.05) return null
            const above = step.gap > meanGap
            const yHigh = yOf(Math.max(step.gap, meanGap))
            const yLow = yOf(Math.min(step.gap, meanGap))
            return (
              <rect
                key={`${step.date}-${stepIndex}`}
                x={x1}
                y={yHigh}
                width={x2 - x1}
                height={Math.max(0, yLow - yHigh)}
                fill={above ? "var(--chart-4)" : "var(--chart-3)"}
                fillOpacity={above ? 0.28 : 0.22}
                data-annual-sense-band={above ? "retard" : "avance"}
              />
            )
          })
        : null}
      {meanGap != null ? (
        <g data-annual-sense-mean={pairId}>
          <line
            x1={SENSE_PLOT_X}
            x2={SENSE_PLOT_X + SENSE_PLOT_W}
            y1={yOf(meanGap)}
            y2={yOf(meanGap)}
            stroke="var(--muted-foreground)"
            strokeWidth={1.15}
            strokeDasharray="3 3"
          />
          <text
            x={SENSE_PLOT_X + SENSE_PLOT_W - 2}
            y={Math.max(innerTop + 8, yOf(meanGap) - 3)}
            textAnchor="end"
            fill="var(--muted-foreground)"
            fontSize="8"
          >
            {formatSenseGap(meanGap)}
          </text>
        </g>
      ) : null}
      {xs.length > 0 ? (
        <path
          d={senseStepPath(xs, track.steps, yOf, tail)}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth={1.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : (
        <text
          x={SENSE_PLOT_X + SENSE_PLOT_W / 2}
          y={rowTop + SENSE_ROW_H / 2 + 3}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize="10"
        >
          aucun segment apparié
        </text>
      )}
      {track.steps.map((step, stepIndex) =>
        step.same ? (
          <circle
            key={`${step.date}-${stepIndex}`}
            data-annual-sense-hit={step.date}
            cx={xs[stepIndex]}
            cy={yOf(0)}
            r={hoverIndex === stepIndex ? 3.2 : 2.1}
            fill="var(--chart-3)"
          />
        ) : null
      )}
      {hovered ? (
        <line
          x1={senseX(hovered.x)}
          x2={senseX(hovered.x)}
          y1={innerTop}
          y2={innerBot}
          stroke="var(--foreground)"
          strokeOpacity={0.35}
          pointerEvents="none"
        />
      ) : null}
      <text x={4} y={rowTop + SENSE_ROW_H / 2 + 3} fill="var(--muted-foreground)" fontSize="11">
        {label}
      </text>
      <rect
        x={SENSE_PLOT_X}
        y={rowTop}
        width={SENSE_PLOT_W}
        height={SENSE_ROW_H}
        fill="transparent"
        style={{ cursor: "crosshair" }}
        onPointerMove={(event) => onHover(nearestSenseTip(event, index, track))}
        onPointerLeave={() => onHover(null)}
      />
    </g>
  )
}

function SenseTrackDetail({
  label,
  step,
  meanGap,
}: {
  label: string
  step: SenseTrackStep
  meanGap: number | null
}) {
  const moment = formatSenseMoment(step.gap, meanGap)
  return (
    <>
      <span className="text-foreground">{label}</span>
      <span className="text-muted-foreground"> · {formatDrawDate(step.date)} · </span>
      <span className="text-foreground">{step.same ? "même sens" : "sens différent"}</span>
      <span className="text-muted-foreground"> · écart {formatSenseGap(step.gap)}</span>
      {meanGap == null ? (
        <span className="text-muted-foreground"> · moyenne pas encore fixée · {moment}</span>
      ) : (
        <>
          <span className="text-muted-foreground"> · moyenne {formatSenseGap(meanGap)} · </span>
          <span className="text-foreground">{moment}</span>
        </>
      )}
    </>
  )
}

const EMPTY_TRACK: SenseTrack = {
  steps: [],
  meanGap: null,
  gap: null,
  reading: null,
  delta: null,
}

function senseX(unit: number) {
  return SENSE_PLOT_X + Math.min(1, Math.max(0, unit)) * SENSE_PLOT_W
}

function senseStepPath(
  xs: readonly number[],
  steps: readonly SenseTrackStep[],
  yOf: (gap: number) => number,
  tail: number
) {
  const first = steps[0]
  if (!first || xs.length === 0) return ""
  let path = `M ${xs[0]} ${yOf(first.gap)}`
  for (let index = 1; index < steps.length; index += 1) {
    path += ` H ${xs[index]} V ${yOf(steps[index].gap)}`
  }
  return `${path} H ${tail}`
}

function senseReadingFill(reading: SenseReading | null) {
  if (reading === "avance") return "var(--chart-3)"
  if (reading === "retard") return "var(--chart-4)"
  return "var(--muted-foreground)"
}

function nearestSenseTip(
  event: React.PointerEvent<SVGRectElement>,
  pair: number,
  track: SenseTrack
): SenseTip | null {
  const svg = event.currentTarget.ownerSVGElement
  const matrix = svg?.getScreenCTM()
  if (!svg || !matrix || track.steps.length === 0) return null
  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const local = point.matrixTransform(matrix.inverse())
  const unit = (local.x - SENSE_PLOT_X) / SENSE_PLOT_W
  let best = -1
  let bestDist = 0.03
  for (let index = 0; index < track.steps.length; index += 1) {
    const dist = Math.abs(track.steps[index].x - unit)
    if (dist < bestDist) {
      best = index
      bestDist = dist
    }
  }
  if (best < 0) return null
  return { pair, index: best }
}

function sameSenseTip(current: SenseTip | null, next: SenseTip | null) {
  if (current == null || next == null) return current === next
  return current.pair === next.pair && current.index === next.index
}

function senseStepAt(tracks: readonly SenseTrack[], tip: SenseTip) {
  const track = tracks[tip.pair]
  const step = track?.steps[tip.index]
  if (!track || !step) return null
  return { pair: tip.pair, step, meanGap: track.meanGap }
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

function similarityPoints(lane: AnnualLane, picks: DayPicks): AnnualBar[] {
  if (picks.synthese || (!picks.mardi && !picks.vendredi)) return synthesePoints(lane)
  return visibleBars(lane, picks)
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

function formatSimilarity(rate: SameSenseRate): { percent: string; count: string } {
  if (rate.rate == null) return { percent: "—", count: "" }
  return {
    percent: `${Math.round(rate.rate * 100).toLocaleString("fr-FR")} %`,
    count: `${rate.same.toLocaleString("fr-FR")}/${rate.compared.toLocaleString("fr-FR")}`,
  }
}

function similarityTitle(label: string, rate: SameSenseRate) {
  if (rate.rate == null) return `${label} · aucun segment apparié`
  const sameWord = rate.same > 1 ? "segments" : "segment"
  const comparedWord = rate.compared > 1 ? "appariés" : "apparié"
  return `${label} · ${rate.same.toLocaleString("fr-FR")} ${sameWord} de même sens sur ${rate.compared.toLocaleString("fr-FR")} ${comparedWord}`
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
