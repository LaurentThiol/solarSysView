"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Label,
  ReferenceLine,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"

import { TitleHelp, WithHelp } from "@/components/help"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Disclaimer,
  formatStat,
} from "@/components/analysis/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  bayesBalls,
  chiSquareUniform,
  hotBacktest,
  pairLift,
  rankProbabilities,
} from "@/lib/analysis"
import { type Draw, formatDrawDate, formatShortDate } from "@/lib/draws"
import {
  NUMBER_SPREAD_AXIS,
  NUMBER_SUM_AXIS,
  domainContains,
  recencyFill,
  sumSpreadCloud,
  sumSpreadDomains,
  sumSpreadEnvelope,
  weekdayHue,
  type SumSpreadCell,
  type SumSpreadScale,
} from "@/lib/sum-spread"

function formatOfficialPct(value: number) {
  return `${(value * 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} %`
}

export function ProbaPanel() {
  const ranks = rankProbabilities(12)
  const pWin = ranks.filter((row) => row.rank != null).reduce((sum, row) => sum + row.p, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Probabilités exactes (5/50 + 2/12)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="sticky top-0 z-10 -mx-1 mb-1 rounded-md bg-card/95 px-1 py-1 text-sm font-medium text-foreground">
          139 838 160 grilles · P(au moins un rang) {formatOfficialPct(pWin)}
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          Référence officielle, pas une lecture de la fenêtre : loi hypergéométrique,
          identique pour toute grille 5+2, et la même H0 que Combinaisons et le journal
          Jeux. Les périodes d’indicateurs sont dans{" "}
          <Link href="?glossaire=memo" scroll={false} className="underline underline-offset-2">
            Mémo
          </Link>
          .
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">Rang</th>
                <th className="py-1 pr-3">Gain</th>
                <th className="py-1 pr-3">P</th>
                <th className="py-1">1 sur</th>
              </tr>
            </thead>
            <tbody>
              {ranks.map((row) => (
                <tr key={row.label} className="border-t border-border">
                  <td className="py-1 pr-3 tabular-nums">{row.rank ?? "—"}</td>
                  <td className="py-1 pr-3">{row.label}</td>
                  <td className="py-1 pr-3 tabular-nums">{row.p.toExponential(3)}</td>
                  <td className="py-1 tabular-nums">{row.oneIn?.toLocaleString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

export function InferencePanel({
  draws,
  mc,
  mcError,
  onMc,
}: {
  draws: Draw[]
  mc: {
    max_frequency?: { observed: number; p_ge_observed: number; mean: number }
    max_delay_draws?: { observed: number; p_ge_observed: number; mean: number }
    n_sim?: number
  } | null
  mcError: string | null
  onMc: () => void
}) {
  const chi = chiSquareUniform(draws)
  const bayes = bayesBalls(draws)
  const forest = bayes.slice().sort((a, b) => b.count - a.count)
  const n = draws.length
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>χ² d’adéquation (fréquences 1–50)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Statistique {formatStat(chi.stat)} pour {n} tirages de la fenêtre (espérance{" "}
          {formatStat(chi.expected)} par boule). Modèle approximatif : p = 5/50.
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>IC Wilson vs p0 = 0,1</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1 sm:grid-cols-2">
            {forest.slice(0, 20).map((row) => (
              <li key={row.value} className="flex items-center justify-between text-xs">
                <span className="tabular-nums">{row.value}</span>
                <span className="text-muted-foreground tabular-nums">
                  {row.count}× · [{formatStat(row.lo)}, {formatStat(row.hi)}]
                  {row.lo <= 0.1 && 0.1 <= row.hi ? "" : " · hors p0"}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <TitleHelp
              help={{
                title: "Monte-Carlo des records",
                body: "Simule 400 historiques synthétiques sous tirages indépendants, puis compare vos records (fréquence max, retard max) à cette loi nulle.",
              }}
            >
              Monte-Carlo des records (fenêtre)
            </TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <WithHelp
            help={{
              title: "Lancer 400 historiques synthétiques",
              body: "Appelle l’API Python /analysis/montecarlo (400 simulations, seed 0) sur la fenêtre courante. Si l’API est absente, le reste du labo continue sur les tirages chargés.",
            }}
          >
            <button
              type="button"
              onClick={onMc}
              className="w-fit rounded-md border border-border px-3 py-1 text-xs"
            >
              Lancer 400 historiques synthétiques (API Python)
            </button>
          </WithHelp>
          {mcError ? <p className="text-muted-foreground">{mcError}</p> : null}
          {mc?.max_frequency ? (
            <p>
              Fréquence max observée {mc.max_frequency.observed} (moy. H0 {formatStat(mc.max_frequency.mean)})
              · P(≥ obs) = {formatStat(mc.max_frequency.p_ge_observed)}
              {mc.max_delay_draws
                ? ` · retard max ${mc.max_delay_draws.observed} tirages, P(≥ obs) = ${formatStat(mc.max_delay_draws.p_ge_observed)}`
                : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export function BayesPanel({ draws }: { draws: Draw[] }) {
  const balls = bayesBalls(draws)
  const n = draws.length
  const data = balls.map((b) => ({ value: b.value, predictive: b.predictive }))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Beta-Binomial · prédictive P(boule au prochain tirage)</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Prior uniforme, {n} tirages de la fenêtre. Les barres se resserrent vers 0,1.
        </p>
        <ChartContainer
          config={{ predictive: { label: "Prédictive", color: "var(--chart-4)" } }}
          className="h-[240px] w-full"
        >
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="value" tickLine={false} axisLine={false} interval={4} />
            <YAxis domain={[0, 0.2]} width={36} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="predictive" fill="var(--color-predictive)" radius={2} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

function ScaleChip({
  label,
  pressed,
  onClick,
}: {
  label: string
  pressed: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-xs ${
        pressed
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  )
}

function SumSpreadTooltip({ payload }: { payload?: ReadonlyArray<{ payload?: SumSpreadCell }> }) {
  const row = payload?.find((item) => item.payload?.dates)?.payload
  if (!row?.dates) return null
  const shown = row.dates.slice(-4)
  const extra = row.dates.length - shown.length
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1.5 text-xs">
      <div className="font-medium tabular-nums">
        somme {row.sum} · étendue {row.spread}
      </div>
      <div className="text-muted-foreground">
        {row.count} tirage{row.count > 1 ? "s" : ""}
        {row.weekday ? ` · ${row.weekday}` : ""}
        {row.recency < 0.25 ? " · ancien" : row.recency > 0.75 ? " · récent" : ""}
      </div>
      <ul className="mt-1 flex flex-col gap-0.5">
        {shown.map((date) => (
          <li key={date}>
            <Link href={`/analyse?tab=jumeaux&query=${date}`} className="underline">
              {formatDrawDate(date)}
            </Link>
          </li>
        ))}
      </ul>
      {extra > 0 ? <div className="text-muted-foreground">+{extra} plus ancien{extra > 1 ? "s" : ""}</div> : null}
    </div>
  )
}

function SumSpreadDot({
  cx,
  cy,
  size,
  payload,
}: {
  cx?: number
  cy?: number
  size?: number
  payload?: SumSpreadCell
}) {
  if (cx == null || cy == null || !payload) return null
  const area = Number(size)
  const r = Number.isFinite(area) && area > 0 ? Math.sqrt(area / Math.PI) : 4
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={recencyFill(payload.recency, payload.weekday)}
      stroke={weekdayHue(payload.weekday)}
      strokeWidth={1}
      strokeOpacity={0.85}
    />
  )
}

function SumSpreadCloudCard({ draws }: { draws: Draw[] }) {
  const [scale, setScale] = useState<SumSpreadScale>("universe")
  const cloud = useMemo(() => sumSpreadCloud(draws), [draws])
  const domains = useMemo(() => sumSpreadDomains(cloud.cells, scale), [cloud.cells, scale])
  const envelope = useMemo(() => sumSpreadEnvelope(domains.x), [domains.x])
  const painted = useMemo(
    () => cloud.cells.slice().sort((a, b) => a.recency - b.recency),
    [cloud.cells]
  )
  const showMean = domainContains(domains.x, NUMBER_SUM_AXIS.mean)
  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle>
          <TitleHelp
            help={{
              title: "Nuage somme × étendue",
              body: "Abscisse (X) : somme des 5 numéros, 15 (1+2+3+4+5) à 240 (46+…+50), moyenne théorique 128. Ordonnée (Y) : étendue n5 − n1, 4 à 49. À somme S, l’étendue max vaut min(49, S−11, 244−S) : le trapèze grisé est cette enveloppe. La teinte va du délavé (ancien) au saturé (récent) ; le trait reste mardi / vendredi. Un même couple empile les tirages (taille = compte). Lecture d’archive, pas un pronostic.",
              items: [
                {
                  label: "Univers",
                  text: "Cadre fixe 15–240 × 4–49 : la fenêtre et l’enveloppe se placent dans l’espace possible.",
                },
                {
                  label: "Fenêtre",
                  text: "Zoom sur les valeurs observées, toujours borné par ces extrema théoriques.",
                },
                {
                  label: "Ancienneté",
                  text: "Couleur mixée vers muted pour les cellules dont le dernier tirage est tôt dans la fenêtre. Le plus récent a un anneau.",
                },
              ],
            }}
          >
            Nuage somme × étendue
          </TitleHelp>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Abscisse : somme des 5 numéros ({NUMBER_SUM_AXIS.min}–{NUMBER_SUM_AXIS.max}, moyenne{" "}
          {NUMBER_SUM_AXIS.mean}). Ordonnée : étendue n5 − n1 ({NUMBER_SPREAD_AXIS.min}–
          {NUMBER_SPREAD_AXIS.max}). Enveloppe : étendue ≤ min(49, S−11, 244−S). Teinte : ancien →
          récent.
        </p>
        <div className="flex flex-wrap gap-1">
          <ScaleChip
            label="Univers 15–240"
            pressed={scale === "universe"}
            onClick={() => setScale("universe")}
          />
          <ScaleChip
            label="Cadrer la fenêtre"
            pressed={scale === "window"}
            onClick={() => setScale("window")}
          />
        </div>
      </CardHeader>
      <CardContent>
        {cloud.drawCount === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun tirage dans la fenêtre.</p>
        ) : (
          <>
            <ChartContainer
              config={{
                envelope: { label: "Enveloppe", color: "var(--chart-5)" },
                last: { label: "Dernier", color: "var(--chart-1)" },
              }}
              className="h-[280px] w-full"
            >
              <ComposedChart margin={{ top: 8, right: 12, bottom: 28, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="sum"
                  name="Somme"
                  domain={domains.x}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                >
                  <Label value="Somme" position="insideBottom" offset={-18} />
                </XAxis>
                <YAxis
                  type="number"
                  dataKey="spread"
                  name="Étendue"
                  domain={domains.y}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                >
                  <Label value="Étendue" angle={-90} position="insideLeft" />
                </YAxis>
                <ZAxis type="number" dataKey="count" range={[36, 160]} />
                <Area
                  name="Enveloppe"
                  data={envelope}
                  dataKey="spreadMax"
                  type="linear"
                  baseValue={NUMBER_SPREAD_AXIS.min}
                  stroke="var(--color-envelope)"
                  strokeOpacity={0.55}
                  fill="var(--color-envelope)"
                  fillOpacity={0.12}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  legendType="none"
                />
                {showMean ? (
                  <ReferenceLine
                    x={NUMBER_SUM_AXIS.mean}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 4"
                  />
                ) : null}
                <ChartTooltip
                  content={({ payload }) => (
                    <SumSpreadTooltip
                      payload={payload as ReadonlyArray<{ payload?: SumSpreadCell }> | undefined}
                    />
                  )}
                />
                <Scatter
                  name="Tirages"
                  data={painted}
                  isAnimationActive={false}
                  shape={(props) => <SumSpreadDot {...props} />}
                />
                {cloud.last ? (
                  <Scatter
                    name="Dernier"
                    data={[cloud.last]}
                    fill="none"
                    legendType="none"
                    isAnimationActive={false}
                    shape={(props) => {
                      const cx = Number(props.cx)
                      const cy = Number(props.cy)
                      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={7}
                          fill="none"
                          stroke="var(--color-last)"
                          strokeWidth={2}
                        />
                      )
                    }}
                  />
                ) : null}
              </ComposedChart>
            </ChartContainer>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2 w-16 rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, color-mix(in oklab, var(--chart-2) 16%, var(--muted)), var(--chart-2))",
                  }}
                />
                Ancien → récent
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full" style={{ background: "var(--chart-2)" }} />
                Mardi
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full" style={{ background: "var(--chart-4)" }} />
                Vendredi
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-px w-4" style={{ background: "var(--chart-5)" }} />
                Enveloppe
              </span>
            </div>
            <p className="mt-2 text-xs tabular-nums text-muted-foreground">
              {cloud.drawCount} tirage{cloud.drawCount > 1 ? "s" : ""} · {cloud.cells.length} cellule
              {cloud.cells.length > 1 ? "s" : ""}
              {cloud.meanSum != null && cloud.meanSpread != null
                ? ` · moyenne fenêtre Σ ${formatStat(cloud.meanSum, 1)} · étendue ${formatStat(cloud.meanSpread, 1)}`
                : ""}
              {cloud.last
                ? ` · dernier ${formatShortDate(cloud.last.lastDate)} : Σ ${cloud.last.sum} · étendue ${cloud.last.spread}`
                : ""}
            </p>
            <Disclaimer>
              Graduations numériques : X = somme, Y = étendue. Le trapèze est l’enveloppe
              combinatoire (étendue ≤ min(49, S−11, 244−S)). La teinte suit l’ancienneté dans la
              fenêtre ; le contour reste mardi / vendredi. H0 = indépendance uniforme.
            </Disclaimer>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function DependencePanel({ draws, windowSize }: { draws: Draw[]; windowSize: number }) {
  const pairs = pairLift(draws)
  const backtest = hotBacktest(draws, windowSize)
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Paires à plus fort lift (fenêtre)</CardTitle>
        </CardHeader>
        <CardContent>
          {pairs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune paire dans la fenêtre.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full max-w-md text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-6 font-medium">Paire</th>
                    <th className="py-1 pr-6 font-medium">Fois</th>
                    <th className="py-1 text-right font-medium">Lift</th>
                  </tr>
                </thead>
                <tbody>
                  {pairs.map((row) => (
                    <tr key={`${row.a}-${row.b}`} className="border-t border-border">
                      <td className="py-1.5 pr-6 tabular-nums whitespace-nowrap">
                        {row.a} · {row.b}
                      </td>
                      <td className="py-1.5 pr-6 tabular-nums whitespace-nowrap">
                        {row.count}×
                      </td>
                      <td className="py-1.5 text-right tabular-nums whitespace-nowrap">
                        {formatStat(row.lift)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Backtest « 5 plus chauds » vs hasard</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Sur {backtest.n} tirages de la fenêtre, {formatStat(backtest.mean)} numéro(s) en commun en
          moyenne (attendu sous uniforme : {formatStat(backtest.expected)}).
        </CardContent>
      </Card>
      <SumSpreadCloudCard draws={draws} />
    </div>
  )
}
