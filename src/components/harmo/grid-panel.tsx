"use client"

import { Stat } from "@/components/analysis/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatFreq, formatStat, type HarmoReport } from "@/lib/harmo"

import { ApiState, HarmoNotes, PeakTable, SpectrumChart } from "@/components/harmo/shared"

export function GridPanel({
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
        <Stat label="Peigne f0" value={formatFreq(data.comb)} />
        <Stat label="THD" value={formatStat(data.thd?.thd ?? null)} />
        <Stat label="HNR" value={formatStat(data.thd?.hnr ?? null)} />
      </div>
      <SpectrumChart
        points={data.fft?.points}
        title={`FFT ${data.fft_window || "Blackman-Harris"} (dB)`}
        help={{
          title: "FFT fenêtrée",
          body: "Fenêtre à forte dynamique (Blackman-Harris / Flattop) pour limiter le leakage. Axe en cycles/tirage. Les raies réseau sont fines ; la mécanique variable s’étale.",
        }}
        yLabel="Puissance en dB, fréquence en cycles/tirage."
      />
      <SpectrumChart
        points={data.lombscargle?.points}
        title="Lomb-Scargle (cycles/an)"
        help={{
          title: "Lomb-Scargle",
          body: "Periodogramme sur les dates réelles. L’alternance 3+4 jours n’est plus un échantillonnage uniforme : c’est l’horloge « réseau » calendaire.",
        }}
        yLabel="Puissance normalisée, fréquence en cycles/an (1 = annuelle)."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pics FFT</CardTitle>
          </CardHeader>
          <CardContent>
            <PeakTable peaks={data.fft?.peaks} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Peigne calendaire (1, 2, 4 c/an)</CardTitle>
          </CardHeader>
          <CardContent>
            <PeakTable peaks={data.calendar?.fundamentals} />
            <p className="mt-2 text-xs text-muted-foreground">
              Fraction d’énergie du peigne : {formatStat(data.calendar?.fraction ?? null, 3)}
            </p>
          </CardContent>
        </Card>
      </div>
      <SpectrumChart
        points={data.cepstrum?.points}
        title="Cepstre (quefrency en tirages)"
        help={{
          title: "Cepstre",
          body: "Les pics de quefrency estiment une période (donc une fondamentale) en tirages.",
        }}
        yLabel="Quefrency = période en tirages."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">F-test de Thomson (multitaper)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.multitaper?.f_test?.length ? (
            <ul className="text-xs leading-6">
              {data.multitaper.f_test.map((row, i) => (
                <li key={i} className="tabular-nums">
                  {row.freq.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} c/tirage · F ={" "}
                  {row.f_stat.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Pas de raie retenue par le F-test.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
