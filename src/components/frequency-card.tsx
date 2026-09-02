import { Sparkles } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function FrequencyCard({
  title,
  items,
  empty,
  star = false,
}: {
  title: string
  items: [number, number][]
  empty: boolean
  star?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          {star ? <Sparkles className="size-4 text-[oklch(0.82_0.12_85)]" /> : null}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-sm text-muted-foreground">
            Aucune statistique : affinez le filtre.
          </p>
        ) : (
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map(([n, count]) => (
              <li
                key={`${star ? "s" : "n"}-${n}`}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium tabular-nums">{n}</span>
                <span className="text-muted-foreground">{count}×</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
