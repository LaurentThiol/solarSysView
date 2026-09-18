"use client"

import { Sparkles } from "lucide-react"

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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}
