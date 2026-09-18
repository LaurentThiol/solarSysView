"use client"

import { HeatClock, HeatClockLegend } from "@/components/heat-clock"
import { TitleHelp } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { type FrequencyItem } from "@/lib/draws"

function HeatGrid({
  items,
  className,
  expected,
  star,
}: {
  items: FrequencyItem[]
  className: string
  expected?: number
  star?: boolean
}) {
  const maxCount = Math.max(0, ...items.map((item) => item.count))
  return (
    <div className={className}>
      {items.map((item) => (
        <div
          key={`${star ? "s" : "n"}-${item.value}`}
          title={`${star ? "Étoile" : "Numéro"} ${item.value} : ${item.count}× · retard ${item.delayDraws}`}
          className="min-w-0"
        >
          <HeatClock
            value={item.count}
            peak={maxCount}
            even={item.value % 2 === 0}
            expected={expected}
            className="w-full text-[10px] sm:text-xs"
          >
            {item.value}
          </HeatClock>
        </div>
      ))}
    </div>
  )
}

export function EvolutionHeat({
  numbers,
  stars,
  empty,
  expectedNumbers,
  expectedStars,
}: {
  numbers: FrequencyItem[]
  stars: FrequencyItem[]
  empty: boolean
  expectedNumbers?: number
  expectedStars?: number
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            <TitleHelp
              help={{
                title: "Grille 1–50",
                body: "Chaque boule est une horloge (comme l’installation d’une app) : elle se remplit depuis midi selon le nombre de sorties, plein = plus sorti de la fenêtre. L’anneau or = pair, bleu = impair. Le trait marque l’attendu (≈ 2× sur 20 tirages). Beaucoup d’horloges restent peu remplies : c’est normal.",
              }}
            >
              Grille 1–50
            </TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {empty ? (
            <p className="text-sm text-muted-foreground">Aucun tirage à colorer.</p>
          ) : (
            <>
              <HeatGrid
                items={numbers}
                className="euromillions-ball-grid"
                expected={expectedNumbers}
              />
              <HeatClockLegend showExpected={expectedNumbers != null} />
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            <TitleHelp
              help={{
                title: "Étoiles 1–12",
                body: "Même horloge que la grille 1–50, sur le pool actuel de 12 étoiles. Attendu ≈ 3,3× sur 20 tirages, ≈ 8,3× sur 50.",
              }}
            >
              Étoiles 1–12
            </TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {empty ? (
            <p className="text-sm text-muted-foreground">Aucun tirage à colorer.</p>
          ) : (
            <>
              <HeatGrid
                items={stars}
                className="grid grid-cols-6 gap-1 sm:grid-cols-12"
                expected={expectedStars}
                star
              />
              <HeatClockLegend showExpected={expectedStars != null} />
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
