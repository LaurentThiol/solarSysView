"use client"

import { HelpTip } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCompactCount, formatCompactEuro, formatShortDate, type Draw } from "@/lib/draws"
import { synthesizeWeekdays, type WeekdaySynthesisSide } from "@/lib/weekday-synthesis"

function formatMean(value: number | null, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toLocaleString("fr-FR", { maximumFractionDigits: digits })
}

function SideCard({ side }: { side: WeekdaySynthesisSide }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{side.label}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {side.count} tirage{side.count > 1 ? "s" : ""}
          {side.fromDate && side.toDate
            ? ` · ${formatShortDate(side.fromDate)} → ${formatShortDate(side.toDate)}`
            : ""}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p>
          Somme moy. <span className="tabular-nums">{formatMean(side.meanSum)}</span>
          {" · "}
          étendue <span className="tabular-nums">{formatMean(side.meanSpread)}</span>
        </p>
        <p>
          Jackpot moy.{" "}
          <span className="tabular-nums">{formatCompactEuro(side.meanJackpot)}</span>
          {" · "}
          gagnants EU{" "}
          <span className="tabular-nums">{formatCompactCount(side.meanWinnersEu)}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Boules{" "}
          {side.topNumbers.length
            ? side.topNumbers.map((item) => `${item.value}×${item.count}`).join(" · ")
            : "—"}
        </p>
        <p className="text-xs text-muted-foreground">
          Étoiles{" "}
          {side.topStars.length
            ? side.topStars.map((item) => `${item.value}×${item.count}`).join(" · ")
            : "—"}
        </p>
      </CardContent>
    </Card>
  )
}

export function WeekdaySynthesisCard({ draws }: { draws: Draw[] }) {
  const report = synthesizeWeekdays(draws)
  return (
    <section className="flex flex-col gap-2" aria-label="Synthèse mardi et vendredi">
      <p className="inline-flex items-center gap-1 text-sm text-foreground">
        Synthèse mardi + vendredi
        <HelpTip
          title="Synthèse"
          body="Même fenêtre mixte que Tous, lue trois fois : les mardis, les vendredis, puis les deux. Les totaux du combiné sont la somme des deux jours."
        />
      </p>
      <div className="grid gap-3 lg:grid-cols-3">
        <SideCard side={report.mardi} />
        <SideCard side={report.vendredi} />
        <SideCard side={report.combined} />
      </div>
    </section>
  )
}
