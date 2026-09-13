"use client"

import { Stat } from "@/components/analysis/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatShare, formatStat, type HarmoReport } from "@/lib/harmo"

import { ApiState, HarmoNotes, PeakTable, SpectrumChart } from "@/components/harmo/shared"

export function AcousticPanel({
  data,
  loading,
}: {
  data: HarmoReport | null
  loading: boolean
}) {
  const error = data && data.ok === false ? data.error : null
  if (loading || error || !data?.ok) {
    return <ApiState loading={loading} error={error || data?.error} />
  }
  return (
    <div className="flex flex-col gap-4">
      <HarmoNotes notes={data.notes} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="HPSS harmonique" value={formatShare(data.hpss?.harmonic_fraction)} />
        <Stat label="HPSS percussif" value={formatShare(data.hpss?.percussive_fraction)} />
        <Stat
          label="Librosa"
          value={data.hpss?.librosa?.available ? "extra actif" : "médianes scipy"}
        />
      </div>
      <SpectrumChart
        points={data.welch?.points}
        title="Welch (DSP lissée, dB)"
        help={{
          title: "Welch",
          body: "Moyenne de periodogrammes à recouvrement. Le lissage fait ressortir des bosses larges (résonances analogiques) face au bruit aléatoire.",
        }}
        yLabel="Densité spectrale lissée, dB, cycles/tirage."
      />
      <SpectrumChart
        points={data.multitaper?.points}
        title="Multitaper DPSS (dB)"
        help={{
          title: "Multitaper",
          body: "Plusieurs tapers DPSS : moins de variance qu’une FFT unique sur une série courte (N ≈ 10²–10³ tirages).",
        }}
        yLabel="PSD multitaper, dB."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Bosses Welch</CardTitle>
        </CardHeader>
        <CardContent>
          <PeakTable peaks={data.welch?.peaks} />
        </CardContent>
      </Card>
    </div>
  )
}
