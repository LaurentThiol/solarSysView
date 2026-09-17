"use client"

import { useMemo, useState } from "react"

import { FigureName } from "@/components/chartisme/figure-thumb"
import { HelpTip, LabelHelp, TitleHelp } from "@/components/help"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { labelOf } from "@/lib/chartisme/catalog"
import type { Curve } from "@/lib/chartisme/curves"
import { outcomeStats, type ScanHit } from "@/lib/chartisme/scan"

type TargetRow = {
  figure: string
  label: string
  reached: number
  invalidated: number
  open: number
  settled: number
  hit_rate: number | null
  wilson: [number, number] | null
  null_rate: number | null
  edge: number | null
  beats_null: boolean | null
}

type BaseRateRow = { figure: string; label: string; count: number; base_rate: number }

type BaseRateVariable = {
  variable: string
  label: string
  trials: number
  windows_with_any_figure: number
  interval?: number[]
}

type BallRow = { n: number; count: number; rate: number; p: number; flagged?: boolean }

type ReportWindow = {
  from?: string | null
  to?: string | null
  draw_count?: number
  context?: number
  scales?: number[]
  bounded?: boolean
}

type Report = {
  figure_count?: number
  curve_count?: number
  window?: ReportWindow
  targets?: {
    horizon?: number
    figures?: TargetRow[]
    verdict?: { measured?: number; beat_null?: string[]; any_edge?: boolean; note?: string }
  }
  base_rates?: {
    trials?: number
    length?: number
    variables?: number
    windows?: number
    windows_with_any_figure?: number
    interval?: number[]
    figures?: BaseRateRow[]
    by_variable?: BaseRateVariable[]
    note?: string
  }
  numbers?: { chi2?: number; chi2_p?: number; balls?: BallRow[]; flagged?: number[]; verdict?: string }
  stars?: { chi2?: number; chi2_p?: number; balls?: BallRow[]; flagged?: number[]; verdict?: string }
  disclaimer?: string
}

function pct(value: number | null | undefined) {
  return value == null ? "—" : `${(value * 100).toFixed(1)} %`
}

export function BacktestPanel({
  curve,
  hits,
  era,
  scales = [],
  bar,
  studyWindow,
  contextCount = 0,
}: {
  curve: Curve | null
  hits: ScanHit[]
  era: "current" | "all"
  /** Échelles balayées au-dessus : le taux de base se mesure à leur longueur. */
  scales?: number[]
  /**
   * Le seuil de l'onglet, tel quel.
   *
   * Le rétro-test mesurait à 0.60 quoi qu'affiche le tracé, ce qui en faisait le
   * rétro-test d'une autre lecture. En rareté visée le seuil diffère d'une
   * échelle à l'autre, d'où la table plutôt qu'un nombre.
   */
  bar?: { minConfidence: number; byScale: Readonly<Record<number, number | null>> | null }
  /** Fenêtre d'étude — le rétro-test s'y borne par défaut. */
  studyWindow?: { fromDate: string | null; toDate: string | null; drawCount: number }
  /** Tirages de contexte réclamés devant elle par les échelles. */
  contextCount?: number
}) {
  const [report, setReport] = useState<Report | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [maxCurves, setMaxCurves] = useState(12)
  // Borné par défaut. Mesurer sur toute l'archive suppose que le premier tirage
  // enregistré ouvre un cycle et que rien n'a changé depuis : c'est une
  // hypothèse, pas une neutralité, et elle ne se choisit pas par omission.
  const [bounded, setBounded] = useState(true)

  // Sans backend, on peut déjà répondre à la première question sur la courbe
  // affichée : le comptage des objectifs atteints ne demande aucun modèle.
  const local = useMemo(() => outcomeStats(hits), [hits])

  // Le tracé lu en rareté visée peut n'avoir gardé aucune échelle. Mesurer
  // quand même reviendrait à retomber sur les échelles et le seuil par défaut,
  // c'est-à-dire à rétro-tester une lecture que personne n'a faite.
  const nothingToRead = Boolean(bar?.byScale) && scales.length === 0

  async function run() {
    setRunning(true)
    setError(null)
    setReport(null)
    try {
      const params = new URLSearchParams({
        era,
        max_curves: String(maxCurves),
        min_confidence: String(bar?.minConfidence ?? 0.6),
      })
      // La plus longue échelle balayée : le taux de base croît avec la longueur
      // (plus de pivots, donc plus d'occasions qu'une figure s'ajuste quelque
      // part), et c'est la comparaison la moins flatteuse qu'on veut afficher.
      if (scales.length) {
        params.set("base_length", String(Math.max(...scales)))
        params.set("scales", scales.join(","))
        if (bar?.byScale) {
          params.set(
            "thresholds",
            scales.map((scale) => bar.byScale?.[scale] ?? bar.minConfidence).join(",")
          )
        }
      }
      if (bounded && studyWindow?.fromDate && studyWindow.toDate) {
        params.set("start", studyWindow.fromDate)
        params.set("end", studyWindow.toDate)
        params.set("context", String(contextCount))
      }
      if (curve) params.set("curve", curve.id)
      const response = await fetch(`/api/chartisme/backtest?${params}`, { cache: "no-store" })
      if (!response.ok) {
        setError(
          "Le rétro-test complet demande le backend Python (modèle nul, Wilson, χ² sur les boules). Le comptage local ci-dessous reste disponible."
        )
        return
      }
      setReport((await response.json()) as Report)
    } catch {
      setError(
        "Backend Python injoignable. Le comptage local des objectifs atteints reste disponible."
      )
    } finally {
      setRunning(false)
    }
  }

  const localRows = useMemo(
    () =>
      Object.entries(local)
        .map(([figure, row]) => ({ figure, ...row }))
        .sort((a, b) => b.settled - a.settled),
    [local]
  )

  // L'effectif réglé et la largeur d'intervalle disent la puissance qui reste
  // une fois la fenêtre bornée. Les afficher évite de lire une absence d'écart
  // comme une absence d'effet.
  const rows = report?.targets?.figures ?? []
  const settled = rows.length
    ? rows.reduce((total, row) => total + (row.settled || 0), 0)
    : null
  const widest = rows.reduce<number | null>((worst, row) => {
    if (!row.wilson) return worst
    const width = row.wilson[1] - row.wilson[0]
    return worst == null || width > worst ? width : worst
  }, null)
  const found = report?.figure_count ?? 0
  const curves = report?.curve_count ?? 0
  const figures = `${found} figure${found > 1 ? "s" : ""} sur ${curves} courbe${curves > 1 ? "s" : ""}`

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <TitleHelp
            help={{
              title: "Rétro-test",
              body: "Deux questions, posées contre un modèle nul. « L'objectif projeté est-il atteint plus souvent que par hasard ? » — la même mesure est refaite à des points de départ aléatoires sur la même courbe. « Les numéros suivants portent-ils un signal ? » — χ² et intervalles de Wilson par boule, avec correction de Benjamini-Hochberg.",
            }}
          >
            Rétro-test contre le hasard
          </TitleHelp>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">
          Les tirages sont indépendants. Ce rapport mesure l’écart entre une
          figure et le hasard ; il ne le comble pas. Le résultat attendu sur des
          courbes de tirages est qu’aucune figure ne dépasse son modèle nul — et
          le voir écrit vaut mieux que l’ignorer.
        </p>
        <p className="text-xs text-muted-foreground">
          La mesure se borne par défaut à la fenêtre d’étude, aux mêmes échelles
          que le tracé. Elle y perd de la puissance : moins de cassures réglées,
          donc un intervalle de Wilson plus large, et le rapport l’affiche au
          lieu de l’acheter en élargissant la fenêtre. Toute l’archive répond à
          une autre question — celle où l’on suppose que le premier tirage
          enregistré ouvre un cycle et que rien n’a changé depuis.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 pb-1 text-sm">
            <input
              type="checkbox"
              checked={bounded}
              onChange={(event) => setBounded(event.target.checked)}
              disabled={!studyWindow?.fromDate}
            />
            Borner à la fenêtre d’étude
          </label>
          <HelpTip
            title="Borner à la fenêtre"
            body="Coché, le rétro-test ne balaie que les tirages de la fenêtre, avec le contexte qu'exigent les échelles, et ne retient que les figures qui s'y achèvent. Décoché, il parcourt toute l'archive de l'ère choisie : plus de cassures réglées, mais la mesure suppose alors que les vingt dernières années forment un seul régime."
          />
          <LabelHelp
            label={`Courbes balayées · ${maxCurves}`}
            help={{
              title: "Étendue du balayage",
              body: "Chaque courbe demande un balayage multi-échelle complet plus plusieurs centaines de tirages du modèle nul. Douze courbes suffisent à voir la tendance ; les 124 prennent plusieurs minutes.",
            }}
          >
            <Input
              type="range"
              min={1}
              max={60}
              step={1}
              value={maxCurves}
              onChange={(event) => setMaxCurves(Number(event.target.value))}
            />
          </LabelHelp>
          <Button size="sm" onClick={() => void run()} disabled={running || nothingToRead}>
            {running ? "Mesure en cours…" : "Lancer le rétro-test"}
          </Button>
        </div>

        {nothingToRead ? (
          <p className="text-xs text-muted-foreground">
            Aucune échelle n’atteint la rareté visée sur cette courbe : le tracé ne montre rien,
            et le rétro-test ne mesurerait donc pas ce qu’on a sous les yeux. Vise plus large, ou
            change de courbe.
          </p>
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        {report?.window ? (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
            {report.window.bounded
              ? `Mesuré du ${report.window.from} au ${report.window.to} · ${report.window.draw_count} tirages, ${report.window.context} en contexte · échelles ${(report.window.scales ?? []).join(" · ")} · ${figures}.`
              : `Mesuré sur toute l’archive · ${figures}. Cette étendue suppose un régime unique sur toute la période.`}
            {settled != null
              ? ` ${settled} cassure${settled > 1 ? "s" : ""} réglée${settled > 1 ? "s" : ""} portent le verdict${
                  widest == null
                    ? ""
                    : `, le plus large intervalle de Wilson couvrant ${(widest * 100).toFixed(0)} points`
                }.`
              : " Aucune cassure réglée : rien n’est mesurable ici, et l’absence de verdict n’en est pas un."}
          </p>
        ) : null}

        {localRows.length ? (
          <div className="space-y-2">
            <p className="text-xs font-medium">
              Comptage local · courbe affichée ({hits.length} figures)
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Figure</TableHead>
                  <TableHead className="text-right">atteints</TableHead>
                  <TableHead className="text-right">invalidées</TableHead>
                  <TableHead className="text-right">en cours</TableHead>
                  <TableHead className="text-right">taux</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {localRows.map((row) => (
                  <TableRow key={row.figure}>
                    <TableCell>
                      <FigureName figure={row.figure} label={labelOf(row.figure)} />
                    </TableCell>
                    <TableCell className="text-right">{row.reached}</TableCell>
                    <TableCell className="text-right">{row.invalidated}</TableCell>
                    <TableCell className="text-right">{row.open}</TableCell>
                    <TableCell className="text-right">{pct(row.hit_rate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">
              Ce taux n’a pas de modèle nul en face : un objectif proche est
              atteint souvent, y compris sur du bruit. Lance le rétro-test
              complet pour la comparaison.
            </p>
          </div>
        ) : null}

        {report?.targets?.figures?.length ? (
          <div className="space-y-2">
            <p className="text-xs font-medium">
              Objectif atteint contre modèle nul · horizon {report.targets.horizon} tirages
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Figure</TableHead>
                  <TableHead className="text-right">réglées</TableHead>
                  <TableHead className="text-right">taux</TableHead>
                  <TableHead className="text-right">Wilson 95 %</TableHead>
                  <TableHead className="text-right">nul</TableHead>
                  <TableHead className="text-right">écart</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.targets.figures.map((row) => (
                  <TableRow key={row.figure}>
                    <TableCell>
                      <FigureName figure={row.figure} label={row.label} />
                    </TableCell>
                    <TableCell className="text-right">{row.settled}</TableCell>
                    <TableCell className="text-right">{pct(row.hit_rate)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {row.wilson ? `${pct(row.wilson[0])} – ${pct(row.wilson[1])}` : "—"}
                    </TableCell>
                    <TableCell className="text-right">{pct(row.null_rate)}</TableCell>
                    <TableCell className="text-right">
                      {row.beats_null === null ? (
                        "—"
                      ) : (
                        <Badge variant={row.beats_null ? "default" : "outline"}>
                          {row.edge == null ? "—" : `${(row.edge * 100).toFixed(1)} pts`}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {report.targets.verdict?.note ? (
              <p className="text-xs text-muted-foreground">{report.targets.verdict.note}</p>
            ) : null}
          </div>
        ) : null}

        {report?.base_rates?.figures?.length ? (
          <div className="space-y-2">
            <p className="text-xs font-medium">
              Taux de base sur {report.base_rates.windows} fenêtres de bruit de{" "}
              {report.base_rates.length} tirages — l’échelle la plus longue balayée,{" "}
              {report.base_rates.variables} variable
              {(report.base_rates.variables ?? 0) > 1 ? "s" : ""} ·{" "}
              {pct(report.base_rates.windows_with_any_figure)} portent au moins une
              figure
              {report.base_rates.interval?.length === 2
                ? ` (${pct(report.base_rates.interval[0])} – ${pct(
                    report.base_rates.interval[1]
                  )})`
                : ""}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {report.base_rates.figures.slice(0, 12).map((row) => (
                <Badge key={row.figure} variant={row.base_rate > 0.2 ? "destructive" : "outline"} className="gap-1">
                  <FigureName figure={row.figure} label={`${row.label} ${pct(row.base_rate)}`} />
                </Badge>
              ))}
            </div>
            {report.base_rates.by_variable?.length ? (
              <div className="space-y-1">
                {/* La moyenne masque l'essentiel : une courbe bornée par paliers
                    porte une figure sur presque toutes les fenêtres de bruit, une
                    courbe étalée bien moins. C'est par courbe qu'un seuil se lit. */}
                <p className="text-xs font-medium">Par courbe, du plus bruité au moins</p>
                <div className="flex flex-wrap gap-1.5">
                  {report.base_rates.by_variable.map((row) => (
                    <Badge
                      key={row.variable}
                      variant={row.windows_with_any_figure > 0.5 ? "destructive" : "outline"}
                    >
                      {row.label} {pct(row.windows_with_any_figure)}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {report.base_rates.note ? (
              <p className="text-xs text-muted-foreground">{report.base_rates.note}</p>
            ) : null}
          </div>
        ) : null}

        {report?.numbers ? (
          <div className="space-y-2">
            <p className="text-xs font-medium">
              Signal sur les numéros suivants · χ² = {report.numbers.chi2?.toFixed(2)} (p ={" "}
              {report.numbers.chi2_p?.toFixed(4)})
            </p>
            <p className="text-xs text-muted-foreground">{report.numbers.verdict}</p>
            {report.stars?.verdict ? (
              <p className="text-xs text-muted-foreground">
                Étoiles : {report.stars.verdict}
              </p>
            ) : null}
          </div>
        ) : null}

        {report?.disclaimer ? (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {report.disclaimer}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
