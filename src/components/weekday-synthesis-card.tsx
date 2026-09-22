"use client"

import { useMemo } from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"

import { HelpTip, TitleHelp, type HelpCopy } from "@/components/help"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCompactCount, formatCompactEuro, formatShortDate, type Draw } from "@/lib/draws"
import {
  NUMBER_SUM_SD,
  RUNNING_SUM_STD_FROM,
  weekdayDivergence,
  type DivergenceAxis,
  type DivergenceAxisId,
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

const COLUMN_HELP = {
  axis: {
    title: "Axe",
    body: "Grandeur lue sur chaque tirage, puis résumée soir par soir. Les numéros sont des statistiques d’ordre : n1 est le plus petit, n5 le plus grand, jamais l’ordre de sortie.",
  },
  mean: {
    title: "Moyenne μ",
    body: "Moyenne des tirages de ce soir dans la fenêtre. μ mardi et μ vendredi se lisent chacun sur leur propre série.",
  },
  std: {
    title: "Écart type σ",
    body: "Écart type d’échantillon, diviseur n − 1. Il mesure l’éparpillement des tirages de ce soir autour de leur moyenne. Deux tirages au moins ; sinon la case reste vide.",
  },
  cv: {
    title: "Coefficient de variation",
    body: "Écart type divisé par la valeur absolue de la moyenne. Il rend comparables une somme et un comptage, qui n’ont pas la même échelle. Si la moyenne est nulle, le coefficient n’est pas affiché.",
  },
  delta: {
    title: "Écart des moyennes Δ",
    body: "Moyenne du mardi moins moyenne du vendredi. Un signe plus : le mardi est au-dessus du vendredi.",
  },
  cohen: {
    title: "d de Cohen",
    body: "Δ divisé par l’écart type commun aux deux soirs. Repères usuels : 0,2 petit, 0,5 moyen, 0,8 grand. Un d petit sur une fenêtre courte est la lecture attendue lorsque les deux soirs suivent la même loi.",
  },
  interval: {
    title: "Intervalle de Welch",
    body: "Intervalle à 95 % pour Δ. La formule de Welch laisse chaque soir garder sa variance. S’il contient 0, l’écart de moyennes reste compatible avec le hasard d’échantillonnage.",
  },
  welchP: {
    title: "p de Welch",
    body: "Probabilité, si les deux soirs avaient la même moyenne, d’observer un écart au moins aussi grand que Δ. Le seuil usuel est 0,05. p qualifie la fenêtre affichée.",
  },
  variance: {
    title: "Rapport des variances",
    body: "Variance du mardi divisée par celle du vendredi. 1 : même dispersion. Au-dessus de 1 : le mardi s’étale davantage.",
  },
  brown: {
    title: "Brown–Forsythe",
    body: "p-value qui compare les dispersions. Chaque tirage est remplacé par sa distance à la médiane de son soir, puis un test de Fisher compare ces distances. La case affiche la p-value, pas la statistique F.",
  },
} as const satisfies Record<string, HelpCopy>

const AXIS_HELP: Record<DivergenceAxisId, HelpCopy> = {
  sum: {
    title: "Somme",
    body: "Somme des cinq numéros, entre 15 et 240. Sous un tirage uniforme, la moyenne vaut 127,5 et l’écart type 30,92.",
  },
  spread: {
    title: "Étendue",
    body: "Plus grand numéro moins le plus petit, entre 4 et 49. Elle dit comment la grille occupe la plage 1–50.",
  },
  parity: {
    title: "Pairs",
    body: "Nombre de numéros pairs dans la grille, de 0 à 5.",
  },
  consecutive: {
    title: "Consécutifs",
    body: "Nombre de paires de numéros qui se suivent. 12 et 13 comptent pour une paire.",
  },
  n1: {
    title: "Plus petit",
    body: "n1, le plus petit des cinq numéros. Il vit près du plancher 1.",
  },
  n5: {
    title: "Plus grand",
    body: "n5, le plus grand des cinq numéros. Il vit près du plafond 50.",
  },
  star_sum: {
    title: "Somme étoiles",
    body: "Somme des deux étoiles. La ligne n’est calculée que si la fenêtre n’a qu’une formule d’étoiles.",
  },
  star_spread: {
    title: "Écart étoiles",
    body: "Plus grande étoile moins la plus petite. Même réserve de formule que la somme des étoiles.",
  },
}

const CONVERGENCE_HELP: HelpCopy = {
  title: "Convergence de l’écart type",
  body: "Écart type cumulé de la somme, recalculé après chaque tirage du soir à partir du 8e. L’abscisse est la date du tirage : chaque soir avance sur son calendrier, l’autre conserve sa dernière valeur. Le trait horizontal est 30,92, l’écart type théorique de la somme de 5 numéros distincts parmi 1–50. « Écart à la loi » est la distance du dernier point à ce trait.",
}

const BALLS_HELP: HelpCopy = {
  title: "Fréquences des boules",
  body: "Variation totale : moitié de la somme des écarts de fréquence des boules 1 à 50. 0, les deux soirs ont les mêmes proportions.\n\nχ² d’homogénéité : on le compare à son espérance, le nombre de degrés de liberté (boules vues au moins une fois, moins une). En dessous de cette espérance, les fréquences sont plus proches que le bruit typique.\n\n« Effectif trop faible » : l’attendu par boule est sous 5. Le χ² n’est alors qu’un indice.",
}

const STAR_POOL_HELP: HelpCopy = {
  title: "Formules d’étoiles",
  body: "Le pool d’étoiles a changé (9, puis 11, puis 12). Deux valeurs de star_pool dans la même fenêtre retirent Somme étoiles et Écart étoiles : les moyennes ne décriraient plus la même loi.",
}

const DIVERGENCE_HELP: HelpCopy = {
  title: "Divergence",
  wide: true,
  body: "Contraste des deux soirs sur la fenêtre déjà choisie. Chaque tirage est indépendant : ces champs décrivent l’archive.",
  items: [
    ...Object.values(COLUMN_HELP).map((help) => ({ label: help.title, text: help.body })),
    ...Object.values(AXIS_HELP).map((help) => ({ label: help.title, text: help.body })),
    { label: CONVERGENCE_HELP.title, text: CONVERGENCE_HELP.body },
    { label: BALLS_HELP.title, text: BALLS_HELP.body },
    { label: STAR_POOL_HELP.title, text: STAR_POOL_HELP.body },
  ],
}

function FieldLabel({ label, help }: { label: string; help: HelpCopy }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <HelpTip {...help} />
    </span>
  )
}

function AxisRow({ axis }: { axis: DivergenceAxis }) {
  return (
    <tr className="border-t border-border">
      <th scope="row" className="py-1 pr-3 text-left font-medium">
        <FieldLabel label={axis.label} help={AXIS_HELP[axis.id]} />
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
        <CardTitle className="text-base">
          <TitleHelp help={DIVERGENCE_HELP}>Divergence</TitleHelp>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Δ = moyenne du mardi − moyenne du vendredi. Les pastilles détaillent chaque champ.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3 font-medium">
                  <FieldLabel label="Axe" help={COLUMN_HELP.axis} />
                </th>
                <th className="py-1 pr-3 font-medium">
                  <FieldLabel label="μ mardi" help={COLUMN_HELP.mean} />
                </th>
                <th className="py-1 pr-3 font-medium">
                  <FieldLabel label="σ mardi" help={COLUMN_HELP.std} />
                </th>
                <th className="py-1 pr-3 font-medium">
                  <FieldLabel label="CV mardi" help={COLUMN_HELP.cv} />
                </th>
                <th className="py-1 pr-3 font-medium">
                  <FieldLabel label="μ vendredi" help={COLUMN_HELP.mean} />
                </th>
                <th className="py-1 pr-3 font-medium">
                  <FieldLabel label="σ vendredi" help={COLUMN_HELP.std} />
                </th>
                <th className="py-1 pr-3 font-medium">
                  <FieldLabel label="CV vendredi" help={COLUMN_HELP.cv} />
                </th>
                <th className="py-1 pr-3 font-medium">
                  <FieldLabel label="Δ" help={COLUMN_HELP.delta} />
                </th>
                <th className="py-1 pr-3 font-medium">
                  <FieldLabel label="d" help={COLUMN_HELP.cohen} />
                </th>
                <th className="py-1 pr-3 font-medium">
                  <FieldLabel label="IC 95 %" help={COLUMN_HELP.interval} />
                </th>
                <th className="py-1 pr-3 font-medium">
                  <FieldLabel label="p" help={COLUMN_HELP.welchP} />
                </th>
                <th className="py-1 pr-3 font-medium">
                  <FieldLabel label="σ²" help={COLUMN_HELP.variance} />
                </th>
                <th className="py-1 font-medium">
                  <FieldLabel label="BF" help={COLUMN_HELP.brown} />
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
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            Étoiles non comparées : la fenêtre mélange plusieurs formules.
            <HelpTip {...STAR_POOL_HELP} />
          </p>
        ) : null}
        <div className="flex flex-col gap-1">
          <p className="inline-flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span>
              Écart type cumulé de la somme, à partir du {RUNNING_SUM_STD_FROM}e tirage de chaque soir.
              Trait horizontal : {law}, loi des 5 numéros.
              {distance.mardi != null || distance.vendredi != null
                ? ` Écart à la loi : mardi ${formatNum(distance.mardi)} · vendredi ${formatNum(distance.vendredi)}.`
                : ""}
            </span>
            <HelpTip {...CONVERGENCE_HELP} />
          </p>
          {report.runningSumStd.length ? (
            <ChartContainer config={divergenceConfig} className="aspect-auto h-40 w-full">
              <LineChart data={report.runningSumStd} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  tickFormatter={formatShortDate}
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
                      labelFormatter={(_, payload) => {
                        const point = payload?.[0]?.payload as RunningSumStdPoint | undefined
                        if (!point?.date) return ""
                        const rank = point.soir === "mardi" ? point.kMardi : point.kVendredi
                        return rank != null
                          ? `${formatShortDate(point.date)} · ${rank}e ${point.soir}`
                          : formatShortDate(point.date)
                      }}
                    />
                  }
                />
                <Line
                  dataKey="mardi"
                  type="linear"
                  stroke="var(--color-mardi)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  dataKey="vendredi"
                  type="linear"
                  stroke="var(--color-vendredi)"
                  strokeWidth={2}
                  strokeDasharray={weekdayLineDash("vendredi")}
                  dot={false}
                  connectNulls
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
        <p className="inline-flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span>
            Boules : variation totale{" "}
            <span className="tabular-nums">{formatNum(report.balls.totalVariation, 3)}</span>
            {" · χ² "}
            <span className="tabular-nums">{formatNum(report.balls.chiSquare, 1)}</span>
            {report.balls.df != null ? ` (${report.balls.df} ddl)` : ""}
            {report.balls.lowCount ? " · effectif trop faible" : ""}
          </span>
          <HelpTip {...BALLS_HELP} />
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
