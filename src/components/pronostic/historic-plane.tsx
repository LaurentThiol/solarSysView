"use client"

import { useMemo, useState } from "react"
import {
  CartesianGrid,
  ComposedChart,
  Label,
  ReferenceArea,
  ReferenceLine,
  Scatter,
  XAxis,
  YAxis,
} from "recharts"

import { TitleHelp, type HelpCopy } from "@/components/help"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { formatDrawDate, formatShortDate } from "@/lib/draws"
import { formatCount } from "@/lib/jeux"
import {
  RESIDUAL_MUTED,
  defaultResidualPair,
  enabledResidualAxes,
  formatRequired,
  residualCloud,
  residualDomain,
  residualFill,
  residualGrid,
  residualTicks,
  swapResidualAxes,
  type ErrorAxisId,
  type HistoricGameRow,
  type MarginStep,
  type ParameterRank,
  type ResidualPair,
  type ResidualPoint,
} from "@/lib/pronostic"
import { cn } from "@/lib/utils"

const HELP = {
  plane: {
    title: "Plan des résidus",
    wide: true,
    body: "Chaque point est un tirage noté. L’abscisse et l’ordonnée sont deux résidus z = (réel − moyenne des tirages d’avant) / σ. La couleur dit si le tirage, toutes couches allumées, tombe dans la marge en cours. Le carré en pointillés est ± cette marge, en σ.\n\nLa bande réellement jouée est entière : plancher et plafond. Un point peut donc sortir du carré et rester dans la marge, ou l’inverse quand une autre couche décide.",
    items: [
      {
        label: "Défaut",
        text: "Les deux axes les plus souvent décisifs. Les puces en choisissent d’autres parmi les couches allumées.",
      },
      {
        label: "σ = 0",
        text: "Si l’écart type des tirages d’avant est nul et que la valeur diffère, il n’y a pas de z. Ce tirage n’est pas placé.",
      },
      {
        label: "Anneau",
        text: "Le dernier tirage noté, quand il a un z sur les deux axes.",
      },
    ],
  },
  grid: {
    title: "Grille des résidus",
    wide: true,
    body: "Une ligne est un tirage noté, la plus récente en haut. Une colonne est un axe allumé, dans l’ordre somme, pairs, n1–n5, étoiles. La couleur est le z signé : bleu en dessous de la moyenne passée, ambre au-dessus. La pastille reprend dans la marge ou hors marge.",
    items: [
      {
        label: "σ = 0",
        text: "Case sans teinte. Aucune marge finie ne couvre cet axe.",
      },
    ],
  },
} satisfies Record<string, HelpCopy>

const planeConfig = {
  hit: { label: "Dans la marge", color: "var(--chart-2)" },
  miss: { label: "Hors marge", color: "var(--chart-5)" },
}

function formatZ(value: number) {
  const text = Math.abs(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 })
  if (value > 0) return `+${text}`
  if (value < 0) return `−${text}`
  return "0"
}

function formatActual(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
}

function formatTick(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
}

function rowKey(row: { date: string; numbers: number[]; stars: number[] }) {
  return `${row.date}|${row.numbers.join(",")}|${row.stars.join(",")}`
}

function ResidualDot({
  cx,
  cy,
  payload,
}: {
  cx?: number
  cy?: number
  payload?: ResidualPoint & { last?: boolean }
}) {
  const x = Number(cx)
  const y = Number(cy)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !payload) return null
  const fill = payload.hit ? "var(--chart-2)" : "var(--chart-5)"
  return (
    <g>
      <circle cx={x} cy={y} r={3.5} fill={fill} />
      {payload.last ? (
        <circle cx={x} cy={y} r={7} fill="none" stroke="var(--foreground)" strokeWidth={1.5} />
      ) : null}
    </g>
  )
}

function ResidualTooltip({
  payload,
  xLabel,
  yLabel,
}: {
  payload?: ReadonlyArray<{ payload?: ResidualPoint }>
  xLabel: string
  yLabel: string
}) {
  const point = payload?.find((item) => item.payload)?.payload
  if (!point) return null
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1.5 text-xs">
      <div className="font-medium">{formatDrawDate(point.date)}</div>
      <div className="tabular-nums text-muted-foreground">
        {point.numbers.join(" · ")} + {point.stars.join(" · ")}
      </div>
      <div className="mt-1 tabular-nums">
        {xLabel} {formatZ(point.x)} · {yLabel} {formatZ(point.y)}
      </div>
      <div className="text-muted-foreground">
        {point.hit ? "dans la marge" : "hors marge"} · décisif {point.bindingLabel}
      </div>
      <div className="tabular-nums text-muted-foreground">
        erreur {formatRequired(point.requiredMargin)} · {formatCount(point.grids)} grilles
      </div>
    </div>
  )
}

function AxisChips({
  label,
  side,
  axes,
  pair,
  onPick,
}: {
  label: string
  side: "x" | "y"
  axes: Array<{ id: ErrorAxisId; label: string }>
  pair: ResidualPair
  onPick: (side: "x" | "y", id: ErrorAxisId) => void
}) {
  const current = side === "x" ? pair.x : pair.y
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {axes.map((axis) => (
        <Button
          key={`${side}-${axis.id}`}
          type="button"
          size="sm"
          variant={current === axis.id ? "default" : "outline"}
          aria-pressed={current === axis.id}
          onClick={() => onPick(side, axis.id)}
        >
          {axis.label}
        </Button>
      ))}
    </div>
  )
}

export function HistoricPlane({
  rows,
  ranks,
  margin,
}: {
  rows: HistoricGameRow[]
  ranks: ParameterRank[]
  margin: MarginStep
}) {
  const axes = useMemo(() => enabledResidualAxes(rows), [rows])
  const suggested = useMemo(() => defaultResidualPair(ranks), [ranks])
  const [choice, setChoice] = useState<ResidualPair | null>(null)
  const pair = useMemo(() => {
    const ids = new Set(axes.map((axis) => axis.id))
    if (choice && ids.has(choice.x) && ids.has(choice.y) && choice.x !== choice.y) return choice
    if (suggested && ids.has(suggested.x) && ids.has(suggested.y)) return suggested
    if (axes.length >= 2) return { x: axes[0].id, y: axes[1].id }
    return null
  }, [axes, choice, suggested])
  const cloud = useMemo(
    () => (pair ? residualCloud(rows, pair.x, pair.y) : null),
    [pair, rows]
  )
  const grid = useMemo(() => residualGrid(rows), [rows])
  const lastKey = rows.length > 0 ? rowKey(rows[rows.length - 1]) : null
  const plotted = useMemo(() => {
    if (!cloud) return []
    return cloud.points.map((point) => ({
      ...point,
      last: rowKey(point) === lastKey,
    }))
  }, [cloud, lastKey])
  const scale = useMemo(() => {
    const values = plotted.flatMap((point) => [point.x, point.y])
    const domain = residualDomain(values, margin)
    return { domain, ticks: residualTicks(domain[1], margin) }
  }, [margin, plotted])

  function pick(side: "x" | "y", id: ErrorAxisId) {
    if (!pair) return
    setChoice(swapResidualAxes(pair, side, id))
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle>
          <TitleHelp help={HELP.plane}>Plan des résidus</TitleHelp>
        </CardTitle>
        {axes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Toutes les couches sont éteintes.</p>
        ) : axes.length < 2 ? (
          <p className="text-sm text-muted-foreground">Le nuage demande deux axes allumés.</p>
        ) : pair && cloud ? (
          <>
            <p className="text-sm text-muted-foreground">
              Abscisse : {cloud.xLabel}. Ordonnée : {cloud.yLabel}. Le carré en pointillés est ± la marge en cours.
            </p>
            <AxisChips label="Abscisse" side="x" axes={axes} pair={pair} onPick={pick} />
            <AxisChips label="Ordonnée" side="y" axes={axes} pair={pair} onPick={pick} />
          </>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {cloud && plotted.length > 0 ? (
          <>
            <ChartContainer config={planeConfig} className="mx-auto aspect-square w-full max-w-[32rem]">
              <ComposedChart margin={{ top: 8, right: 12, bottom: 28, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name={cloud.xLabel}
                  domain={scale.domain}
                  ticks={scale.ticks}
                  tickFormatter={formatTick}
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                >
                  <Label value={cloud.xLabel} position="insideBottom" offset={-18} />
                </XAxis>
                <YAxis
                  type="number"
                  dataKey="y"
                  name={cloud.yLabel}
                  domain={scale.domain}
                  ticks={scale.ticks}
                  tickFormatter={formatTick}
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                >
                  <Label value={cloud.yLabel} angle={-90} position="insideLeft" offset={14} style={{ fontSize: 12 }} />
                </YAxis>
                <ReferenceLine x={0} stroke="var(--border)" />
                <ReferenceLine y={0} stroke="var(--border)" />
                <ReferenceArea
                  x1={-margin}
                  x2={margin}
                  y1={-margin}
                  y2={margin}
                  stroke="var(--foreground)"
                  strokeDasharray="4 4"
                  fill="var(--foreground)"
                  fillOpacity={0.06}
                  ifOverflow="visible"
                />
                <ChartTooltip
                  content={({ payload }) => (
                    <ResidualTooltip
                      payload={payload as ReadonlyArray<{ payload?: ResidualPoint }> | undefined}
                      xLabel={cloud.xLabel}
                      yLabel={cloud.yLabel}
                    />
                  )}
                />
                <Scatter
                  name="Tirages notés"
                  data={plotted}
                  isAnimationActive={false}
                  shape={(props) => <ResidualDot {...props} />}
                />
              </ComposedChart>
            </ChartContainer>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-full bg-chart-2" />
                Dans la marge
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-full bg-chart-5" />
                Hors marge
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-3 w-3 rounded-full border border-foreground" />
                Dernier tirage
              </span>
            </div>
          </>
        ) : null}
        {cloud && cloud.dropped > 0 ? (
          <p className="text-xs text-muted-foreground">
            {cloud.dropped === 1
              ? "1 tirage sans z sur l’un des deux axes (σ = 0) n’est pas placé."
              : `${cloud.dropped.toLocaleString("fr-FR")} tirages sans z sur l’un des deux axes (σ = 0) ne sont pas placés.`}
          </p>
        ) : null}

        {axes.length === 0 ? null : (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              <TitleHelp help={HELP.grid}>Grille des résidus</TitleHelp>
            </p>
            <p className="text-xs text-muted-foreground">
              Le plus récent en haut. Bleu : sous la moyenne des tirages d’avant. Ambre : au-dessus. Case unie : σ = 0.
            </p>
            <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
              <table className="min-w-max border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr>
                    <th className="sticky left-0 z-20 bg-card px-2 py-1 text-left font-medium">Date</th>
                    {grid.axes.map((axis) => (
                      <th
                        key={axis.id}
                        className="px-1 py-1 text-center font-medium whitespace-nowrap text-muted-foreground"
                      >
                        {axis.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map((row) => (
                    <tr key={rowKey(row)}>
                      <th className="sticky left-0 bg-card px-2 py-1 text-left font-normal">
                        <span className="inline-flex items-center gap-1.5 tabular-nums">
                          <span
                            aria-hidden
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              row.hit ? "bg-chart-2" : "bg-chart-5"
                            )}
                          />
                          <span className="sr-only">{row.hit ? "dans la marge" : "hors marge"}</span>
                          {formatShortDate(row.date)}
                        </span>
                      </th>
                      {row.cells.map((cell) => {
                        const title =
                          cell.z == null
                            ? `${formatDrawDate(row.date)} · ${cell.label} · σ = 0 · réel ${formatActual(cell.actual)}`
                            : `${formatDrawDate(row.date)} · ${cell.label} · z ${formatZ(cell.z)} · réel ${formatActual(cell.actual)}`
                        return (
                          <td key={`${row.date}-${cell.axisId}`} className="p-0">
                            <div
                              role="img"
                              aria-label={title}
                              title={title}
                              style={{
                                background: cell.z == null ? RESIDUAL_MUTED : residualFill(cell.z),
                              }}
                              className="flex h-6 w-7 items-center justify-center text-[10px] text-muted-foreground"
                            >
                              {cell.z == null ? "·" : null}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
