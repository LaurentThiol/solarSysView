"use client"

import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Disclaimer,
  OverlayToggle,
  HELP,
  Stat,
  formatStat,
  lineConfig,
} from "@/components/analysis/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { sliceSeries } from "@/lib/analysis-window"
import { techPack } from "@/lib/ta"

type Tech = ReturnType<typeof techPack>

export function FlowPanel({
  dates,
  warmupCount,
  tech,
}: {
  dates: string[]
  warmupCount: number
  tech: Tech
}) {
  const [showObv, setShowObv] = useState(true)
  const [showAdl, setShowAdl] = useState(false)
  const [showMfi, setShowMfi] = useState(true)
  const [showVwap, setShowVwap] = useState(true)

  const data = useMemo(
    () =>
      dates.map((date, i) => ({
        date,
        activity: sliceSeries(tech.activity, warmupCount)[i],
        obv: sliceSeries(tech.obv, warmupCount)[i],
        adl: sliceSeries(tech.adl, warmupCount)[i],
        mfi: sliceSeries(tech.mfi, warmupCount)[i],
        vwap: tech.vwap[i],
      })),
    [dates, warmupCount, tech]
  )

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="MFI" value={formatStat(tech.last.mfi)} />
        <Stat label="VWAP fenêtre" value={formatStat(tech.last.vwap)} />
        <Stat label="OBV" value={formatStat(tech.obv.at(-1) ?? null, 1)} />
      </section>
      <Disclaimer>
        Pas de volume de marché : l’activité = true range × nombre de tirages dans la bougie. Le VWAP
        est recalé au début de la fenêtre, pas sur tout l’historique.
      </Disclaimer>
      <div className="flex flex-wrap gap-2">
        <OverlayToggle label="OBV" on={showObv} onClick={() => setShowObv(!showObv)} help={HELP.obv} />
        <OverlayToggle label="ADL" on={showAdl} onClick={() => setShowAdl(!showAdl)} help={HELP.adl} />
        <OverlayToggle label="MFI" on={showMfi} onClick={() => setShowMfi(!showMfi)} help={HELP.mfi} />
        <OverlayToggle label="VWAP" on={showVwap} onClick={() => setShowVwap(!showVwap)} help={HELP.vwap} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Activité et flux</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={lineConfig} className="aspect-auto h-[220px] w-full">
            <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis width={44} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="activity" stroke="var(--color-activity)" dot={false} />
              {showObv ? <Line type="monotone" dataKey="obv" stroke="var(--color-obv)" dot={false} /> : null}
              {showAdl ? <Line type="monotone" dataKey="adl" stroke="var(--color-adl)" dot={false} /> : null}
              {showVwap ? <Line type="monotone" dataKey="vwap" stroke="var(--color-vwap)" dot={false} /> : null}
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
      {showMfi ? (
        <Card>
          <CardHeader>
            <CardTitle>MFI (14)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={lineConfig} className="aspect-auto h-[140px] w-full">
              <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis domain={[0, 100]} width={32} tickLine={false} axisLine={false} />
                <ReferenceLine y={80} strokeDasharray="3 3" />
                <ReferenceLine y={20} strokeDasharray="3 3" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="mfi" stroke="var(--color-mfi)" dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
