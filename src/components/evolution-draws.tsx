"use client"

import { DrawBalls } from "@/components/draw-balls"
import { TitleHelp } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { type Draw, formatShortDate } from "@/lib/draws"

export function EvolutionDraws({ draws }: { draws: Draw[] }) {
  const ordered = [...draws].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">
          <TitleHelp
            help={{
              title: "Tirages de la fenêtre",
              body: "Les grilles qui alimentent la courbe et les fréquences, du plus récent au plus ancien. Utile pour relire 20 ou 50 tirages sans quitter l’onglet.",
            }}
          >
            Tirages de la fenêtre
          </TitleHelp>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {ordered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun tirage dans la fenêtre.</p>
        ) : (
          <ol className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {ordered.map((draw) => (
              <li
                key={`${draw.date}-${draw.id}`}
                className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-xs text-muted-foreground capitalize">
                  {draw.weekday} {formatShortDate(draw.date)}
                </p>
                <DrawBalls numbers={draw.numbers} stars={draw.stars} />
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
