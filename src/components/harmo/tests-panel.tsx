"use client"

import { Disclaimer, Stat } from "@/components/analysis/shared"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatShare, formatStat, type HarmoReport } from "@/lib/harmo"

import { ApiState, HarmoNotes, PeakTable } from "@/components/harmo/shared"

export function TestsPanel({
  data,
  loading,
  onRun,
}: {
  data: HarmoReport | null
  loading: boolean
  onRun: () => void
}) {
  const error = data && data.ok === false ? data.error : null
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onRun} disabled={loading} size="sm">
          {loading ? "Tirages uniformes…" : "Calculer le modèle nul"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Même dates, grilles 5/50 + 2/12 tirées uniformément. Un pic n’est lu
          que contre ce hasard-là, pas contre du bruit blanc.
        </p>
      </div>
      {loading || error ? <ApiState loading={loading} error={error || data?.error} /> : null}
      {data?.ok ? (
        <>
          <HarmoNotes notes={data.notes} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Pic observé" value={formatStat(data.observed_peak)} />
            <Stat label="P(pic nul ≥ obs.)" value={formatShare(data.peak?.p_ge_observed)} />
            <Stat label="THD observé" value={formatStat(data.observed_thd ?? null)} />
            <Stat label="P(THD nul ≥ obs.)" value={formatShare(data.thd?.p_ge_observed ?? undefined)} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Pics FFT sur la série réelle</CardTitle>
            </CardHeader>
            <CardContent>
              <PeakTable peaks={data.fft_peaks} />
            </CardContent>
          </Card>
          <Disclaimer>{data.null}</Disclaimer>
          <Disclaimer>
            {data.sampling?.week_near_nyquist
              ? "Deux tirages par semaine : le cycle hebdomadaire est au voisinage de Nyquist."
              : null}{" "}
            {data.sampling?.delta_days?.length
              ? `Espacements observés : ${data.sampling.delta_days.join(" / ")} jours.`
              : null}
          </Disclaimer>
        </>
      ) : null}
    </div>
  )
}
