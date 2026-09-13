"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, Stat } from "@/components/analysis/shared"
import { TitleHelp } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatShare, formatStat, type HarmoReport } from "@/lib/harmo"

import { ApiState, HarmoNotes, PeakTable } from "@/components/harmo/shared"

const mixConfig = {
  share: { label: "Part", color: "var(--chart-1)" },
}

export function MixPanel({
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
  const rows = (data.components || []).map((row) => ({
    name: row.label,
    share: Math.round(row.share * 1000) / 10,
  }))
  return (
    <div className="flex flex-col gap-4">
      <HarmoNotes notes={data.notes} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Réseau" value={formatShare(data.shares?.grid)} />
        <Stat label="Mécanique" value={formatShare(data.shares?.mechanical)} />
        <Stat label="Acoustique" value={formatShare(data.shares?.acoustic)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            <TitleHelp
              help={{
                title: "Mélange",
                body: "Énergie relative dans trois dictionnaires : raies fixes (réseau), crêtes à fréquence instantanée variable (mécanique), continuum / percussif (acoustique). Ce n’est pas une attribution causale.",
              }}
            >
              Parts d’énergie
            </TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={mixConfig} className="aspect-[16/6] w-full">
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis unit="%" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="share" fill="var(--color-share)" radius={6} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Smearing (crêtes obliques)" value={formatShare(data.smear)} />
        <Stat
          label="THD du peigne détecté"
          value={formatStat(data.thd?.thd ?? null)}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Raies et crêtes classées</CardTitle>
        </CardHeader>
        <CardContent>
          <PeakTable peaks={data.peaks} />
        </CardContent>
      </Card>
    </div>
  )
}
