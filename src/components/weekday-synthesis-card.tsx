"use client"

import { useMemo } from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"

import { HelpTip } from "@/components/help"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCompactCount, formatCompactEuro, formatShortDate, type Draw } from "@/lib/draws"
import {
  NUMBER_SUM_SD,
  RUNNING_SUM_STD_FROM,
  weekdayDivergence,
  type DivergenceAxis,
  type RunningSumStdPoint,
} from "@/lib/weekday-divergence"
import { WEEKDAY_LINE_COLOR, weekdayLineDash } from "@/lib/weekday-scope"
import { synthesizeWeekdays, type WeekdaySynthesisSide } from "@/lib/weekday-synthesis"

const divergenceConfig = {
  mardi: { label: "Mardi", color: WEEKDAY_LINE_COLOR.mardi },
  vendredi: { label: "Vendredi", color: WEEKDAY_LINE_COLOR.vendredi },
} satisfies ChartConfig

function formatMean(value: number | null, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toLocaleString("fr-FR", { maximumFractionDigits: digits })
}

function formatNum(value: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—"
  const text = Math.abs(value).toLocaleString("fr-FR", { maximumFractionDigits: digits })
  return value < 0 ? `−${text}` : text
}

function formatSigned(value: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—"
  const text = formatNum(Math.abs(value), digits)
  if (value > 0) return `+${text}`
  if (value < 0) return `−${text}`
  return text
}

function formatP(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—"
  if (value < 0.001) return "< 0,001"
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

function formatInterval(low: number | null, high: number | null) {
  if (low == null || high == null || !Number.isFinite(low) || !Number.isFinite(high)) return "—"
  return `${formatNum(low)} – ${formatNum(high)}`
}

function SideCard({ side }: { side: WeekdaySynthesisSide }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{side.label}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {side.count} tirage{side.count > 1 ? "s" : ""}
          {side.fromDate && side.toDate
            ? ` · ${formatShortDate(side.fromDate)} → ${formatShortDate(side.toDate)}`
            : ""}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p>
          Somme moy. <span className="tabular-nums">{formatMean(side.meanSum)}</span>
          {" · "}
          étendue <span className="tabular-nums">{formatMean(side.meanSpread)}</span>
        </p>
        <p>
          Jackpot moy.{" "}
          <span className="tabular-nums">{formatCompactEuro(side.meanJackpot)}</span>
          {" · "}
          gagnants EU{" "}
          <span className="tabular-nums">{formatCompactCount(side.meanWinnersEu)}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Boules{" "}
          {side.topNumbers.length
            ? side.topNumbers.map((item) => `${item.value}×${item.count}`).join(" · ")
            : "—"}
        </p>
        <p className="text-xs text-muted-foreground">
          Étoiles{" "}
          {side.topStars.length
            ? side.topStars.map((item) => `${item.value}×${item.count}`).join(" · ")
            : "—"}
        </p>
      </CardContent>
    </Card>
  )
}

function AxisRow({ axis }: { axis: DivergenceAxis }) {
  return (
    <tr className="border-t border-border">
      <th scope="row" className="py-1 pr-3 text-left font-medium">
        {axis.label}
      </th>
      <td className="py-1 pr-3 tabular-nums">{formatNum(axis.mardi.mean)}</td>
      <td className="py-1 pr-3 tabular-nums">{formatNum(axis.mardi.std)}</td>
      <td className="py-1 pr-3 tabular-nums">{formatNum(axis.mardi.cv, 3)}</td>
      <td className="py-1 pr-3 tabular-nums">{formatNum(axis.vendredi.mean)}</td>
      <td className="py-1 pr-3 tabular-nums">{formatNum(axis.vendredi.std)}</td>
      <td className="py-1 pr-3 tabular-nums">{formatNum(axis.vendredi.cv, 3)}</td>
      <td className="py-1 pr-3 tabular-nums">{formatSigned(axis.delta)}</td>
      <td className="py-1 pr-3 tabular-nums">{formatSigned(axis.cohenD)}</td>
      <td className="py-1 pr-3 tabular-nums">{formatInterval(axis.ciLow, axis.ciHigh)}</td>
      <td className="py-1 pr-3 tabular-nums">{formatP(axis.welchP)}</td>
      <td className="py-1 pr-3 tabular-nums">{formatNum(axis.varianceRatio, 2)}</td>
      <td className="py-1 tabular-nums">{formatP(axis.brownForsytheP)}</td>
    </tr>
  )
}

function chartDomain(points: RunningSumStdPoint[]): [number, number] {
  const values = [NUMBER_SUM_SD]
  for (const point of points) {
    if (point.mardi != null) values.push(point.mardi)
    if (point.vendredi != null) values.push(point.vendredi)
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = Math.max(0.5, (max - min) * 0.08)
  return [Math.max(0, min - pad), max + pad]
}

function latestDistance(points: RunningSumStdPoint[]) {
  let mardi: number | null = null
  let vendredi: number | null = null
  for (const point of points) {
    if (point.distanceMardi != null) mardi = point.distanceMardi
    if (point.distanceVendredi != null) vendredi = point.distanceVendredi
  }
  return { mardi, vendredi }
}

function DivergenceBlock({ draws }: { draws: Draw[] }) {
  const report = useMemo(() => weekdayDivergence(draws), [draws])
  const law = formatNum(NUMBER_SUM_SD)
  const distance = latestDistance(report.runningSumStd)
  const domain = chartDomain(report.runningSumStd)

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Divergence</CardTitle>
        <p className="text-xs text-muted-foreground">
          Δ = moyenne du mardi − moyenne du vendredi. L’intervalle est celui de Welch à 95 %. σ² est
          le rapport des variances. BF est la p-value de Brown–Forsythe, sur les écarts à la médiane.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Axe</th>
                <th className="py-1 pr-3 font-medium">μ mardi</th>
                <th className="py-1 pr-3 font-medium">σ mardi</th>
                <th className="py-1 pr-3 font-medium">CV mardi</th>
                <th className="py-1 pr-3 font-medium">μ vendredi</th>
                <th className="py-1 pr-3 font-medium">σ vendredi</th>
                <th className="py-1 pr-3 font-medium">CV vendredi</th>
                <th className="py-1 pr-3 font-medium">Δ</th>
                <th className="py-1 pr-3 font-medium">d</th>
                <th className="py-1 pr-3 font-medium">IC 95 %</th>
                <th className="py-1 pr-3 font-medium">p</th>
                <th className="py-1 pr-3 font-medium" title="Rapport des variances, mardi / vendredi">
                  σ²
                </th>
                <th className="py-1 font-medium" title="Brown–Forsythe, centré sur la médiane">
                  BF
                </th>
              </tr>
            </thead>
            <tbody>
              {report.axes.map((axis) => (
                <AxisRow key={axis.id} axis={axis} />
              ))}
            </tbody>
          </table>
        </div>
        {report.starPoolBreak ? (
          <p className="text-xs text-muted-foreground">
            Étoiles non comparées : la fenêtre mélange plusieurs formules.
          </p>
        ) : null}
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            Écart type cumulé de la somme, à partir du {RUNNING_SUM_STD_FROM}e tirage de chaque soir.
            Trait horizontal : {law}, loi des 5 numéros.
            {distance.mardi != null || distance.vendredi != null
              ? ` Écart à la loi : mardi ${formatNum(distance.mardi)} · vendredi ${formatNum(distance.vendredi)}.`
              : ""}
          </p>
          {report.runningSumStd.length ? (
            <ChartContainer config={divergenceConfig} className="aspect-auto h-40 w-full">
              <LineChart data={report.runningSumStd} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="k"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                />
                <YAxis
                  domain={domain}
                  width={40}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => formatNum(value, 0)}
                />
                <ReferenceLine
                  y={NUMBER_SUM_SD}
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.45}
                  strokeDasharray="4 4"
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => `${value} tirages`}
                    />
                  }
                />
                <Line
                  dataKey="mardi"
                  type="linear"
                  stroke="var(--color-mardi)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="vendredi"
                  type="linear"
                  stroke="var(--color-vendredi)"
                  strokeWidth={2}
                  strokeDasharray={weekdayLineDash("vendredi")}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          ) : (
            <p className="text-xs text-muted-foreground">
              Huit tirages d’un soir sont nécessaires pour suivre la convergence de l’écart type.
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Boules : variation totale{" "}
          <span className="tabular-nums">{formatNum(report.balls.totalVariation, 3)}</span>
          {" · χ² "}
          <span className="tabular-nums">{formatNum(report.balls.chiSquare, 1)}</span>
          {report.balls.df != null ? ` (${report.balls.df} ddl)` : ""}
          {report.balls.lowCount ? " · effectif trop faible" : ""}
        </p>
      </CardContent>
    </Card>
  )
}

export function WeekdaySynthesisCard({ draws }: { draws: Draw[] }) {
  const report = synthesizeWeekdays(draws)
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Synthèse mardi et vendredi">
      <p className="inline-flex items-center gap-1 text-sm text-foreground">
        Synthèse mardi + vendredi
        <HelpTip
          wide
          title="Synthèse"
          body="Même fenêtre mixte que Tous, lue trois fois : les mardis, les vendredis, puis les deux. Les totaux du combiné sont la somme des deux jours. L’écart type et le coefficient de variation décrivent la dispersion de cette fenêtre. Δ est la moyenne du mardi moins celle du vendredi, avec l’intervalle de Welch à 95 %. Un d de Cohen petit sur une fenêtre courte est la lecture attendue lorsque les deux soirs suivent la même loi. Chaque tirage est indépendant : ces écarts décrivent l’archive, ils ne pronostiquent pas le tirage suivant."
        />
      </p>
      <div className="grid gap-3 lg:grid-cols-3">
        <SideCard side={report.mardi} />
        <SideCard side={report.vendredi} />
        <SideCard side={report.combined} />
      </div>
      <DivergenceBlock draws={draws} />
    </section>
  )
}
