"use client"

import { Sparkles } from "lucide-react"

import { ExpectedMeter } from "@/components/expected-meter"
import { TitleHelp, type HelpCopy } from "@/components/help"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { type FrequencyItem } from "@/lib/draws"

function formatExpected(value: number) {
  return value.toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })
}

export function FrequencyCard({
  title,
  items,
  empty,
  star = false,
  expected,
  expectedHint,
  showDelay = false,
  noneLabel,
  help,
  meterExpected,
  meterOf = "count",
  meterLabel = "Attendu",
}: {
  title: string
  items: FrequencyItem[]
  empty: boolean
  star?: boolean
  expected?: number
  expectedHint?: string
  showDelay?: boolean
  noneLabel?: string
  help: HelpCopy
  meterExpected?: number
  meterOf?: "count" | "delay"
  meterLabel?: string
}) {
  const label = star ? "Étoile" : "Numéro"
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          {star ? <Sparkles className="size-4 text-[oklch(0.82_0.12_85)]" /> : null}
          <TitleHelp help={help}>{title}</TitleHelp>
        </CardTitle>
        {!empty && (expectedHint || expected != null) ? (
          <CardDescription>
            {expectedHint ??
              `Attendu ${formatExpected(expected!)}× / ${star ? "étoile" : "boule"}`}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-sm text-muted-foreground">
            Aucune statistique : affinez le filtre.
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {noneLabel ?? "Aucun élément au-dessus du seuil."}
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              {title}, rangé par ordre décroissant
            </caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="w-6 py-1 pr-2 font-normal">#</th>
                <th className="py-1 pr-2 font-normal">{label}</th>
                {showDelay ? (
                  <th className="py-1 pr-2 text-right font-normal">Retard</th>
                ) : null}
                <th className="py-1 text-right font-normal">Sorties</th>
                {meterExpected != null ? (
                  <th className="py-1 pl-3 font-normal">{meterLabel}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr
                  key={`${star ? "s" : "n"}-${item.value}`}
                  className="border-t border-border"
                >
                  <td className="py-1.5 pr-2 text-xs text-muted-foreground tabular-nums">
                    {index + 1}
                  </td>
                  <td className="py-1.5 pr-2 font-medium tabular-nums">
                    {item.value}
                  </td>
                  {showDelay ? (
                    <td className="py-1.5 pr-2 text-right text-muted-foreground tabular-nums">
                      {item.delayDraws}
                    </td>
                  ) : null}
                  <td className="py-1.5 text-right text-muted-foreground tabular-nums">
                    {item.count}×
                  </td>
                  {meterExpected != null ? (
                    <td className="py-1.5 pl-3">
                      <ExpectedMeter
                        value={meterOf === "delay" ? item.delayDraws : item.count}
                        expected={meterExpected}
                        even={item.value % 2 === 0}
                        label={`${label} ${item.value}`}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
