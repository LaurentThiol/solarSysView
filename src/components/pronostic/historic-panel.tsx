"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"

import { Disclaimer, OverlayToggle } from "@/components/analysis/shared"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { DrawBalls } from "@/components/draw-balls"
import { HelpWrap, LabelHelp, TitleHelp, type HelpCopy } from "@/components/help"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { formatCompactCount } from "@/lib/gains"
import { formatCount } from "@/lib/jeux"
import {
  ENVELOPE_METHODS,
  ENVELOPE_METHOD_LABELS,
  HISTORIC_HORIZON,
  HISTORIC_LOOKBACKS,
  DEFAULT_HISTORIC_LAYERS,
  formatWidth,
  historicSweep,
  proposalSummary,
  referenceWidthIndex,
  stacksForSettings,
  type EnvelopeMethod,
  type HistoricLayers,
  type HistoricReport,
  type HistoricRow,
  type LearnConfig,
  type StackState,
} from "@/lib/pronostic"
import { weekdayScopeLabel, type WeekdayScope } from "@/lib/weekday-scope"

const HELP = {
  replay: {
    title: "Rejeu",
    body: "Pour chaque tirage des 100 derniers, les bandes sont calées sur les tirages d’avant seulement. Un tirage est retenu si ses numéros et ses étoiles tombent dans ces bandes. Le décompte est le produit des combinaisons restantes.",
  },
  width: {
    title: "Largeur des bandes",
    body: "k · σ élargit l’enveloppe autour du min/max ou de la moyenne. Un percentile plus haut la resserre (P5–P95 est plus étroit que min–max). Le curseur parcourt ces largeurs pour montrer comment la couverture et le nombre de combinaisons bougent ensemble.",
  },
  layers: {
    title: "Couches",
    body: "Somme, parité et espaces sont les mêmes couches que l’atelier. Éteignez-en une pour voir ce qu’elle retire comme tirages retenus et comme combinaisons.",
  },
  portrait: {
    title: "Réglages proposés",
    body: "Enveloppe lue sur les tirages eux-mêmes, à la largeur choisie. Elle décrit l’archive. Le rejeu, à côté, dit combien de ces tirages seraient tombés dans des bandes calculées sans eux. Appliquer recopie cette enveloppe dans l’atelier.",
  },
  curve: {
    title: "Courbes",
    body: "Sous la loi officielle, un tirage indépendant tombe dans les bandes à peu près aussi souvent que la part de l’univers qu’elles gardent. Si les deux courbes se suivent, élargir la bande achète des combinaisons. L’écart décrit l’archive passée : il ne change pas P(grille).",
  },
} satisfies Record<string, HelpCopy>

const coverageConfig = {
  rate: { label: "Tirages retenus", color: "var(--chart-1)" },
  volume: { label: "Part de l’univers", color: "var(--chart-4)" },
}

const gridConfig = {
  replay: { label: "Moyenne du rejeu", color: "var(--chart-1)" },
  portrait: { label: "Enveloppe des tirages", color: "var(--chart-2)" },
}

function formatPct(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return "—"
  return value.toLocaleString("fr-FR", {
    style: "percent",
    maximumFractionDigits: digits,
  })
}

function formatPoints(value: number) {
  const pts = value * 100
  const abs = Math.abs(pts).toLocaleString("fr-FR", { maximumFractionDigits: 1 })
  if (pts > 0) return `+${abs} pts`
  if (pts < 0) return `−${abs} pts`
  return "0 pt"
}

function formatLift(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—"
  return `× ${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}`
}

function formatDrawDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function missLabel(row: HistoricRow) {
  if (row.hit) return "retenu"
  const parts: string[] = []
  if (row.numberReasons.length > 0) parts.push(row.numberReasons.join(", "))
  if (row.starReasons.length > 0) parts.push(`★ ${row.starReasons.join(", ")}`)
  return parts.join(" · ") || "hors bande"
}

function reasonTally(rows: HistoricRow[]) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    for (const reason of row.numberReasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1)
    }
    for (const reason of row.starReasons) {
      counts.set(`★ ${reason}`, (counts.get(`★ ${reason}`) ?? 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
}

export function HistoricPanel({
  draws,
  source,
  weekday,
  onApply,
}: {
  draws: Array<{ date: string; numbers: number[]; stars: number[] }>
  source: string
  weekday: WeekdayScope
  onApply: (next: {
    numbers: StackState
    stars: StackState
    learn: LearnConfig
    lookback: (typeof HISTORIC_LOOKBACKS)[number]
  }) => void
}) {
  const [method, setMethod] = useState<EnvelopeMethod>("mean_std")
  const [lookback, setLookback] = useState<(typeof HISTORIC_LOOKBACKS)[number]>(50)
  const [layers, setLayers] = useState<HistoricLayers>(DEFAULT_HISTORIC_LAYERS)
  const [pick, setPick] = useState<{ key: string; index: number } | null>(null)
  const [filter, setFilter] = useState<"all" | "hit" | "miss">("all")
  const layerKey = `${method}|${lookback}|${layers.sum ? 1 : 0}${layers.parity ? 1 : 0}${layers.slots ? 1 : 0}`
  const picked = pick?.key === layerKey ? pick.index : null

  const sweep = useMemo(
    () =>
      historicSweep(draws, {
        horizon: HISTORIC_HORIZON,
        lookback,
        method,
        layers,
      }),
    [draws, lookback, method, layers]
  )

  const index = useMemo(() => {
    if (sweep.reports.length === 0) return 0
    const raw = picked ?? (sweep.separated ? sweep.recommendedIndex : referenceWidthIndex(method))
    return Math.min(sweep.reports.length - 1, Math.max(0, raw))
  }, [method, picked, sweep])

  const report: HistoricReport | null = sweep && sweep.reports.length > 0 ? sweep.reports[index] : null
  const label = report ? formatWidth(method, report.width) : ""
  const rows = useMemo(() => {
    const list = report?.rows ?? []
    const visible =
      filter === "hit" ? list.filter((row) => row.hit) : filter === "miss" ? list.filter((row) => !row.hit) : list
    return [...visible].reverse()
  }, [filter, report])
  const tally = useMemo(() => reasonTally(report?.rows ?? []), [report])
  const dayLabel = weekday === "mardi" || weekday === "vendredi" ? weekdayScopeLabel(weekday) : null

  function apply() {
    if (!report?.portrait) return
    if (!HISTORIC_LOOKBACKS.includes(lookback)) return
    const stacks = stacksForSettings(report.portrait, layers)
    onApply({ ...stacks, learn: report.config, lookback })
  }

  const coverageData =
    sweep?.points.map((point) => ({
      label: formatWidth(method, point.width),
      rate: Math.round(point.rate * 1000) / 10,
      volume: Math.round((point.meanVolume ?? 0) * 1000) / 10,
    })) ?? []
  const gridData =
    sweep?.points.map((point) => ({
      label: formatWidth(method, point.width),
      replay: Math.max(1, point.meanGrids ?? 1),
      portrait: Math.max(1, point.portraitGrids ?? 1),
    })) ?? []
  const gridSpan = gridData.reduce(
    (span, row) => ({
      min: Math.min(span.min, row.replay, row.portrait),
      max: Math.max(span.max, row.replay, row.portrait),
    }),
    { min: Number.POSITIVE_INFINITY, max: 1 }
  )
  const logGrids = Number.isFinite(gridSpan.min) && gridSpan.max / gridSpan.min >= 8

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        <TitleHelp help={HELP.replay}>Les {HISTORIC_HORIZON} derniers tirages</TitleHelp>
        , numéros et étoiles. La largeur fait varier deux choses à la fois : la part des
        tirages qui tombent dans les bandes, et le nombre de combinaisons 5+2 qui restent.
        {dayLabel ? ` Filtre du bandeau : ${dayLabel}.` : ""}
      </p>

      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <LabelHelp label="Formule" help={HELP.width}>
            <Select value={method} onValueChange={(value) => setMethod(value as EnvelopeMethod)}>
              <SelectTrigger className="w-full" aria-label="Formule d’enveloppe">
                <span className="flex flex-1 text-left">{ENVELOPE_METHOD_LABELS[method]}</span>
              </SelectTrigger>
              <SelectContent>
                {ENVELOPE_METHODS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {ENVELOPE_METHOD_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabelHelp>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <LabelHelp label={`Largeur · ${label || "…"}`} help={HELP.width}>
              <input
                type="range"
                min={0}
                max={Math.max(0, (sweep?.points.length ?? 1) - 1)}
                step={1}
                value={index}
                disabled={!sweep || sweep.points.length === 0}
                onChange={(event) => setPick({ key: layerKey, index: Number(event.target.value) })}
                className="jeux-range w-full"
                aria-label="Largeur des bandes"
                aria-valuetext={label}
              />
            </LabelHelp>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Tirages d’avant</span>
              {HISTORIC_LOOKBACKS.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={lookback === item ? "default" : "outline"}
                  onClick={() => setLookback(item)}
                >
                  {item}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <OverlayToggle
            label="Somme"
            on={layers.sum}
            onClick={() => setLayers((prev) => ({ ...prev, sum: !prev.sum }))}
            help={HELP.layers}
          />
          <OverlayToggle
            label="Parité"
            on={layers.parity}
            onClick={() => setLayers((prev) => ({ ...prev, parity: !prev.parity }))}
            help={HELP.layers}
          />
          <OverlayToggle
            label="Espaces"
            on={layers.slots}
            onClick={() => setLayers((prev) => ({ ...prev, slots: !prev.slots }))}
            help={HELP.layers}
          />
        </div>
      </div>

      {!report || report.n === 0 ? (
        <p className="text-sm text-muted-foreground">
          Pas assez d’historique : il faut au moins 5 tirages avant celui qu’on rejoue.
          {sweep.available > 0 ? ` Archive utilisable : ${sweep.available} tirages complets.` : ""}
        </p>
      ) : (
        <>
          <p className="sr-only" aria-live="polite">
            {label} : {report.hits} tirages retenus sur {report.n},{" "}
            {report.meanGrids == null ? "combinaisons inconnues" : `${formatCount(report.meanGrids)} combinaisons en moyenne`}.
          </p>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">Tirages retenus</p>
                <CardTitle className="text-lg tabular-nums">
                  {report.hits}/{report.n}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{formatPct(report.rate)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Numéros {report.numberHits} · étoiles {report.starHits}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">Combinaisons</p>
                <CardTitle className="text-lg tabular-nums">
                  {formatCount(report.meanGrids ?? 0)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground tabular-nums">
                Moyenne du rejeu · médiane {formatCount(report.medianGrids ?? 0)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">Écart au volume</p>
                <CardTitle className="text-lg tabular-nums">
                  {formatPoints(report.rate - (report.meanVolume ?? 0))}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground tabular-nums">
                Univers gardé {formatPct(report.meanVolume, 3)} · lift {formatLift(report.lift)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">
                  <TitleHelp help={HELP.portrait}>Portrait</TitleHelp>
                </p>
                <CardTitle className="text-lg tabular-nums">
                  {formatCompactCount(report.portrait?.grids ?? null)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {report.portrait
                  ? `Contient ${report.portrait.covered}/${report.portrait.n} des tirages qui l’ont calé`
                  : "Pas de portrait"}
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>
                <TitleHelp help={HELP.curve}>Couverture et combinaisons</TitleHelp>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-xs leading-5 text-muted-foreground">
                En haut, en % : tirages retenus et part de l’univers gardée. En bas, échelle
                logarithmique : combinaisons moyennes du rejeu, et combinaisons de l’enveloppe
                calée sur les {sweep.studied} tirages eux-mêmes.
              </p>
              <ChartContainer config={coverageConfig} className="aspect-[16/6] w-full">
                <LineChart data={coverageData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} minTickGap={8} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    width={36}
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}`}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ReferenceLine x={label} stroke="var(--foreground)" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="rate" stroke="var(--color-rate)" dot={false} strokeWidth={1.5} />
                  <Line type="monotone" dataKey="volume" stroke="var(--color-volume)" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ChartContainer>
              <ChartContainer config={gridConfig} className="aspect-[16/6] w-full">
                <LineChart data={gridData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} minTickGap={8} />
                  <YAxis
                    scale={logGrids ? "log" : "linear"}
                    domain={logGrids ? ["auto", "auto"] : [0, "auto"]}
                    tick={{ fontSize: 10 }}
                    width={48}
                    tickFormatter={(value) => formatCompactCount(Number(value))}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ReferenceLine x={label} stroke="var(--foreground)" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="replay" stroke="var(--color-replay)" dot={false} strokeWidth={1.5} />
                  <Line type="monotone" dataKey="portrait" stroke="var(--color-portrait)" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ChartContainer>
              <Disclaimer>
                {sweep.studied < HISTORIC_HORIZON
                  ? `L’archive filtrée a ${sweep.available} tirages complets, pas ${HISTORIC_HORIZON}. `
                  : `${sweep.studied} tirages dans le portrait. `}
                Rejeu sur {report.n} tirages, bandes calées sur {sweep.lookback} tirages d’avant.
                {report.n < 30 ? " Peu de rejeux : l’écart se lit, il ne se conclut pas." : ""}
                {sweep.separated
                  ? ` Largeur suggérée ${formatWidth(method, sweep.points[sweep.recommendedIndex]?.width ?? report.width)} : l’écart y reste proche du maximum, avec moins de combinaisons.`
                  : " Aucune largeur ne s’écarte nettement de la part d’univers gardée, ou l’écart ne repose pas sur assez de tirages retenus. Le curseur sert à lire le compromis."}
              </Disclaimer>
              {sweep.separated ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => setPick({ key: layerKey, index: sweep.recommendedIndex })}
                >
                  Prendre la largeur suggérée
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <TitleHelp help={HELP.portrait}>Réglages à cette largeur</TitleHelp>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {report.portrait ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Numéros · {proposalSummary("numbers", report.portrait.numbers)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Étoiles · {proposalSummary("stars", report.portrait.stars)}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatCount(report.portrait.numberCount)} comb. n° × {formatCount(report.portrait.starCount)} comb. ★
                    {" · "}
                    {formatCount(report.portrait.grids)} grilles. Cette enveloppe contient les tirages qui l’ont définie
                    ({formatPct(report.portrait.rate)}) : ce n’est pas le taux du rejeu ({formatPct(report.rate)}).
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Aucun tirage complet à décrire.</p>
              )}
              <HelpWrap help={HELP.portrait}>
                <Button type="button" disabled={!report.portrait} onClick={apply}>
                  Appliquer ces réglages
                </Button>
              </HelpWrap>
              {tally.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Hors bande au rejeu :{" "}
                  {tally
                    .slice(0, 6)
                    .map(([reason, count]) => `${reason} ${count}`)
                    .join(" · ")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Aucun tirage hors bande à cette largeur.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>Tirages rejoués</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
                  Tous
                </Button>
                <Button type="button" size="sm" variant={filter === "hit" ? "default" : "outline"} onClick={() => setFilter("hit")}>
                  Retenus
                </Button>
                <Button type="button" size="sm" variant={filter === "miss" ? "default" : "outline"} onClick={() => setFilter("miss")}>
                  Hors bande
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun tirage dans ce filtre.</p>
              ) : (
                <ul className="flex max-h-[28rem] flex-col gap-2 overflow-auto">
                  {rows.map((row) => (
                    <li
                      key={`${row.date}-${row.numbers.join("-")}-${row.stars.join("-")}`}
                      className={`flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${
                        row.hit ? "border-border" : "border-destructive/30"
                      }`}
                    >
                      <div className="flex min-w-0 flex-col gap-2">
                        <p className="text-xs text-muted-foreground tabular-nums">{formatDrawDate(row.date)}</p>
                        <DrawBalls numbers={row.numbers} stars={row.stars} />
                      </div>
                      <p className="text-xs text-muted-foreground tabular-nums sm:text-right">
                        {missLabel(row)}
                        <br />
                        {formatCount(row.grids)} comb.
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <Disclaimer>
                Source {source}. Hypothèse de lecture : le tirage officiel reste uniforme sur 139 838 160 grilles.
              </Disclaimer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
