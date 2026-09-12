"use client"

import { useMemo, useState } from "react"

import { LabelHelp, TitleHelp } from "@/components/help"
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

type BallRow = { n: number; count: number; rate: number; p: number; flagged?: boolean }

type Report = {
  figure_count?: number
  curve_count?: number
  targets?: {
    horizon?: number
    figures?: TargetRow[]
    verdict?: { measured?: number; beat_null?: string[]; any_edge?: boolean; note?: string }
  }
  base_rates?: {
    trials?: number
    length?: number
    windows_with_any_figure?: number
    figures?: BaseRateRow[]
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
}: {
  curve: Curve | null
  hits: ScanHit[]
  era: "current" | "all"
}) {
  const [report, setReport] = useState<Report | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [maxCurves, setMaxCurves] = useState(12)

  // Sans backend, on peut déjà répondre à la première question sur la courbe
  // affichée : le comptage des objectifs atteints ne demande aucun modèle.
  const local = useMemo(() => outcomeStats(hits), [hits])

  async function run() {
    setRunning(true)
    setError(null)
    setReport(null)
    try {
      const params = new URLSearchParams({
        era,
        max_curves: String(maxCurves),
        min_confidence: "0.6",
      })
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

        <div className="flex flex-wrap items-end gap-3">
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
          <Button size="sm" onClick={() => void run()} disabled={running}>
            {running ? "Mesure en cours…" : "Lancer le rétro-test"}
          </Button>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

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
                    <TableCell>{labelOf(row.figure)}</TableCell>
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
                    <TableCell>{row.label}</TableCell>
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
              Taux de base sur marches aléatoires ·{" "}
              {pct(report.base_rates.windows_with_any_figure)} des marches portent au
              moins une figure
            </p>
            <div className="flex flex-wrap gap-1.5">
              {report.base_rates.figures.slice(0, 12).map((row) => (
                <Badge key={row.figure} variant={row.base_rate > 0.2 ? "destructive" : "outline"}>
                  {row.label} {pct(row.base_rate)}
                </Badge>
              ))}
            </div>
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
