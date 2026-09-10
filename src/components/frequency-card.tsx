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

function delayLabel(delay: number) {
  if (delay <= 0) return "dernier tirage"
  if (delay === 1) return "retard 1"
  return `retard ${delay}`
}

export function FrequencyCard({
  title,
  items,
  empty,
  star = false,
  expected,
  showDelay = false,
  help,
}: {
  title: string
  items: FrequencyItem[]
  empty: boolean
  star?: boolean
  expected?: number
  showDelay?: boolean
  help: HelpCopy
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          {star ? <Sparkles className="size-4 text-[oklch(0.82_0.12_85)]" /> : null}
          <TitleHelp help={help}>{title}</TitleHelp>
        </CardTitle>
        {expected != null && !empty ? (
          <CardDescription>
            Attendu {formatExpected(expected)}× / {star ? "étoile" : "boule"}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-sm text-muted-foreground">
            Aucune statistique : affinez le filtre.
          </p>
        ) : (
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map((item) => (
              <li
                key={`${star ? "s" : "n"}-${item.value}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium tabular-nums">{item.value}</span>
                <span className="text-right text-xs text-muted-foreground tabular-nums">
                  {item.count}×
                  {showDelay ? (
                    <>
                      <br />
                      {delayLabel(item.delayDraws)}
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
