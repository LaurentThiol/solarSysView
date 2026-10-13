"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatHits, maeInterval, versusText } from "@/lib/nextdata/uncertainty"
import {
  anchorVerdict,
  covariateCaption,
  loadLabel,
  maeCell,
  sortSweepRows,
  SWEEP_READINGS,
  sweepBanner,
  yearLabel,
  type SweepPayload,
  type SweepRow,
} from "@/lib/nextdata/sweep"
import { cn } from "@/lib/utils"

export function TrainingSweep({
  report,
  onApply,
}: {
  report: SweepPayload
  onApply: (row: SweepRow) => void
}) {
  const rows = sortSweepRows(report.rows ?? [])
  const banner = sweepBanner(report)
  const complete = report.progress?.complete === true
  const showPersist = rows.some((row) => row.summary?.corpus_persist)
  return (
    <Card data-sweep>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Synthèse Méga</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {banner ? (
          <p className="text-sm leading-6" data-sweep-banner>
            {banner}
          </p>
        ) : null}
        {report.note ? <p className="text-xs leading-5 text-muted-foreground">{report.note}</p> : null}
        {report.load ? <p className="text-xs tabular-nums text-muted-foreground">{loadLabel(report.load)}</p> : null}
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[64rem] border-collapse text-left text-xs" data-sweep-table>
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-2 py-2 font-medium" scope="col">
                  Réglage
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Focus
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Années
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Covariables
                </th>
                {SWEEP_READINGS.map((reading) => (
                  <th key={reading.id} className="px-2 py-2 font-medium" scope="col" title={reading.label}>
                    {reading.short}
                  </th>
                ))}
                <th className="px-2 py-2 font-medium" scope="col">
                  vs affiché
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  vs persistance
                </th>
                {showPersist ? (
                  <th className="px-2 py-2 font-medium" scope="col" title="Jumelle Persist de Corpus">
                    Persist
                  </th>
                ) : null}
                <th className="px-2 py-2 font-medium" scope="col">
                  Communs
                </th>
                <th className="px-2 py-2 font-medium" scope="col">
                  Décalages
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const aside = row.status === "short" || row.status === "misaligned"
                const corpus = row.summary?.corpus
                const interval = maeInterval(corpus?.mae_sum_ci)
                return (
                  <tr
                    key={row.id}
                    className={cn("border-b border-border/70", complete && row.holm?.retained && "bg-primary/5")}
                    data-sweep-row={row.id}
                    data-retained={complete && row.holm?.retained ? "true" : undefined}
                  >
                    <td className="px-2 py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-auto px-1 py-0.5"
                        disabled={!complete || aside}
                        onClick={() => onApply(row)}
                      >
                        {row.label}
                      </Button>
                      {complete && row.holm?.retained ? <span className="ml-1 text-chart-2">retenu</span> : null}
                      {row.detail ? <span className="mt-1 block text-muted-foreground">{row.detail}</span> : null}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{row.focus}</td>
                    <td className="px-2 py-2">{yearLabel(row.years)}</td>
                    <td className="px-2 py-2">{covariateCaption(row)}</td>
                    {SWEEP_READINGS.map((reading) => (
                      <td
                        key={reading.id}
                        className="px-2 py-2 tabular-nums"
                        title={reading.id === "corpus" && interval ? interval : reading.label}
                      >
                        {aside ? "—" : maeCell(row.summary, reading.id)}
                      </td>
                    ))}
                    <td className="px-2 py-2">{aside || !complete ? "—" : anchorVerdict(row)}</td>
                    <td className="px-2 py-2">{aside || !complete ? "—" : versusText(corpus?.versus?.persistence)}</td>
                    {showPersist ? (
                      <td className="px-2 py-2 tabular-nums">
                        {aside ? "—" : maeCell(row.summary, "corpus_persist")}
                      </td>
                    ) : null}
                    <td className="px-2 py-2 tabular-nums">{aside ? "—" : formatHits(corpus?.hits_numbers)}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {aside || !row.shifts_total ? "—" : `${row.shifts_ready}/${row.shifts_total}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
