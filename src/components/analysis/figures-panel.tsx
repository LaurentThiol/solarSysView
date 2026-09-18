"use client"

import { useMemo } from "react"

import { Disclaimer, Stat } from "@/components/analysis/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { isChannelFigure, slopeBiasLabel } from "@/lib/chartisme/catalog"
import { detectFigures } from "@/lib/chartisme/figures"
import { activityConfirms, techPack } from "@/lib/ta"

type Tech = ReturnType<typeof techPack>

export function FiguresPanel({
  tech,
  values,
  dates,
  activity,
}: {
  tech: Tech
  values: number[]
  dates: string[]
  activity?: number[]
}) {
  const candles = tech.candlestickPatterns
  const hits = useMemo(
    () => (values.length ? detectFigures(values, dates, activity ?? tech.activity) : []),
    [values, dates, activity, tech.activity]
  )

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2">
        <Stat label="Chandeliers détectés" value={String(candles.length)} />
        <Stat label="Figures chartistes" value={String(hits.length)} />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Chandeliers japonais</CardTitle>
        </CardHeader>
        <CardContent>
          {candles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune figure sur les bougies unitaires.</p>
          ) : (
            <ul className="grid gap-1 sm:grid-cols-2">
              {candles.slice(-24).reverse().map((row) => (
                <li key={`${row.index}-${row.name}`} className="flex justify-between text-sm">
                  <span>{row.name}</span>
                  <span className="text-muted-foreground tabular-nums">{row.from}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Figures chartistes (rails + pivots)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {hits.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Pas de rectangle, canal, triangle ou autre figure nette. Le rectangle est un canal plat,
              pas un zigzag de range.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {hits.map((hit) => {
                const idx = hit.breakout?.index ?? hit.to_index
                const ok = activityConfirms(tech.activity, idx)
                const name = slopeBiasLabel(hit.figure, hit.slopeBias)
                return (
                  <li key={`${hit.figure}-${hit.from_index}-${hit.to_index}`}>
                    <strong>{name}</strong> ({hit.kind}) · {hit.from} → {hit.to}
                    {isChannelFigure(hit.figure) && hit.slopeBias
                      ? ` · pente ${
                          hit.slopeBias === "up"
                            ? "haussière"
                            : hit.slopeBias === "down"
                              ? "baissière"
                              : "plate"
                        }`
                      : ""}
                    {hit.target != null ? ` · objectif ${hit.target.value.toFixed(1)}` : ""}
                    {ok ? " · activité > SMA locale" : " · sans confirmation d’activité"}
                  </li>
                )
              })}
            </ul>
          )}
          <Disclaimer>
            Même détecteur que le labo Chartisme : deux rails par contacts, pas une moyenne des
            derniers pivots. Confirmation « volume &gt; SMA20 » transposée en activité (true range ×
            count). Une cassure sans ça reste une fausse cassure possible — et un tirage n’a pas de
            volume de marché. Les tirages sont indépendants.
          </Disclaimer>
        </CardContent>
      </Card>
    </div>
  )
}
