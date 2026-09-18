"use client"

import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Disclaimer,
} from "@/components/analysis/shared"
import { HelpTip, type HelpCopy } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { type HarmoNote, type HarmoPeak, formatFreq, formatStat } from "@/lib/harmo"

export const spectrumConfig = {
  y: { label: "Amplitude", color: "var(--chart-1)" },
} as const

export function HarmoNotes({ notes }: { notes?: HarmoNote[] }) {
  if (!notes?.length) return null
  return (
    <ul className="flex flex-col gap-2">
      {notes.map((note) => (
        <li
          key={note.id}
          className={`rounded-lg border px-3 py-2 text-xs leading-5 ${
            note.level === "warn"
              ? "border-warn/40 bg-warn/10 text-warn"
              : "border-border bg-muted/40 text-muted-foreground"
          }`}
        >
          {note.text}
        </li>
      ))}
    </ul>
  )
}

export function PeakTable({ peaks, order }: { peaks?: HarmoPeak[]; order?: boolean }) {
  if (!peaks?.length) {
    return <p className="text-sm text-muted-foreground">Aucun pic retenu.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-medium">{order ? "Ordre" : "Fréquence"}</th>
            <th className="py-1 pr-3 font-medium">Amplitude</th>
            <th className="py-1 font-medium">Q / pente</th>
          </tr>
        </thead>
        <tbody>
          {peaks.map((peak, i) => (
            <tr key={i} className="border-t border-border/60">
              <td className="py-1 pr-3 tabular-nums">
                {order
                  ? formatStat(peak.order ?? peak.cycles_per_draw, 2)
                  : formatFreq(peak)}
                {peak.kind ? (
                  <span className="ml-2 text-muted-foreground">{peak.kind}</span>
                ) : null}
              </td>
              <td className="py-1 pr-3 tabular-nums">{formatStat(peak.amp)}</td>
              <td className="py-1 tabular-nums">
                {peak.q != null ? `Q ${formatStat(peak.q, 1)}` : null}
                {peak.slope != null ? ` pente ${formatStat(peak.slope, 5)}` : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SpectrumChart({
  points,
  title,
  help,
  yLabel,
}: {
  points?: { x: number; y: number }[]
  title: string
  help: HelpCopy
  yLabel: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          {title}
          <HelpTip {...help} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {points?.length ? (
          <ChartContainer config={spectrumConfig} className="aspect-[16/7] w-full">
            <LineChart data={points}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={36} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="y" stroke="var(--color-y)" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ChartContainer>
        ) : (
          <p className="text-sm text-muted-foreground">Pas de spectre.</p>
        )}
        <Disclaimer>{yLabel}</Disclaimer>
      </CardContent>
    </Card>
  )
}

export function EnvelopeChart({
  points,
  title,
}: {
  points?: { x: number; y: number }[]
  title: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {points?.length ? (
          <ChartContainer config={spectrumConfig} className="aspect-[16/7] w-full">
            <AreaChart data={points}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={36} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="y" stroke="var(--color-y)" fill="var(--color-y)" fillOpacity={0.2} />
            </AreaChart>
          </ChartContainer>
        ) : (
          <p className="text-sm text-muted-foreground">Pas de série.</p>
        )}
      </CardContent>
    </Card>
  )
}

export function ApiState({
  loading,
  error,
  empty,
}: {
  loading?: boolean
  error?: string | null
  empty?: boolean
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Calcul scipy…</p>
  }
  if (error) {
    return (
      <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
        {error}. Harmo tourne sur l’API Python (scipy). Vérifiez que l’API locale
        répond, ou élargissez la fenêtre (≥ 16 tirages).
      </p>
    )
  }
  if (empty) {
    return <p className="text-sm text-muted-foreground">Rien à afficher.</p>
  }
  return null
}
