"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { HarmoReport } from "@/lib/harmo"
import { formatStat } from "@/lib/harmo"

import { Spectrogram } from "@/components/harmo/spectrogram"
import { ApiState, HarmoNotes } from "@/components/harmo/shared"

export function TfPanel({
  data,
  loading,
  showSst,
}: {
  data: HarmoReport | null
  loading: boolean
  showSst: boolean
}) {
  const error = data && data.ok === false ? data.error : null
  if (loading || error || !data?.ok) {
    return <ApiState loading={loading} error={error || data?.error} />
  }
  const map = showSst && data.sst ? data.sst : data.stft
  return (
    <div className="flex flex-col gap-4">
      <HarmoNotes notes={data.notes} />
      <p className="text-xs text-muted-foreground">
        Fenêtre STFT {data.nperseg} tirages, hop {data.hop}. Les composantes réseau
        forment des droites horizontales ; la mécanique dessine des trajectoires
        montantes ou descendantes.
      </p>
      <div className="flex flex-wrap gap-2">
        {data.cwt ? <Badge variant="secondary">CWT PyWavelets</Badge> : <Badge variant="outline">CWT extra absent</Badge>}
        {data.ssq ? (
          <Badge variant="secondary">ssqueezepy</Badge>
        ) : (
          <Badge variant="outline">ssqueezepy extra absent</Badge>
        )}
      </div>
      <Spectrogram heatmap={map} ridges={data.ridges} />
      {showSst && data.sst ? (
        <p className="text-xs text-muted-foreground">
          Synchrosqueezing STFT maison : l’énergie est réassignée sur les crêtes
          d’oscillation.
        </p>
      ) : null}
      {data.ssq ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">ssqueezepy (extra)</CardTitle>
          </CardHeader>
          <CardContent>
            <Spectrogram heatmap={data.ssq} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Crêtes suivies</CardTitle>
        </CardHeader>
        <CardContent>
          {data.ridges?.length ? (
            <ul className="text-xs leading-6">
              {data.ridges.map((ridge, i) => (
                <li key={i} className="tabular-nums">
                  {ridge.kind} · {formatStat(ridge.mean_freq, 4)} c/tirage · pente{" "}
                  {formatStat(ridge.slope, 5)} · énergie {formatStat(ridge.energy, 3)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Pas de crête extraite.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
