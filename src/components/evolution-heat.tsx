"use client"

import { TitleHelp } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { type FrequencyItem } from "@/lib/draws"

function heatStyle(count: number, max: number, even: boolean) {
  const t = max > 0 ? count / max : 0
  const color = even ? "var(--chart-1)" : "var(--chart-2)"
  return {
    backgroundColor: `color-mix(in oklch, ${color} ${Math.round(14 + t * 62)}%, transparent)`,
  }
}

function HeatGrid({
  items,
  className,
  star,
}: {
  items: FrequencyItem[]
  className: string
  star?: boolean
}) {
  const maxCount = Math.max(0, ...items.map((item) => item.count))
  return (
    <div className={className}>
      {items.map((item) => (
        <div
          key={`${star ? "s" : "n"}-${item.value}`}
          title={`${star ? "Étoile" : "Numéro"} ${item.value} : ${item.count}× · retard ${item.delayDraws}`}
          style={heatStyle(item.count, maxCount, item.value % 2 === 0)}
          className="flex aspect-square min-w-0 items-center justify-center rounded-md text-[10px] font-semibold tabular-nums sm:text-xs"
        >
          {item.value}
        </div>
      ))}
    </div>
  )
}

export function EvolutionHeat({
  numbers,
  stars,
  empty,
}: {
  numbers: FrequencyItem[]
  stars: FrequencyItem[]
  empty: boolean
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            <TitleHelp
              help={{
                title: "Grille 1–50",
                body: "Intensité = nombre de sorties dans la fenêtre. Or = pair, bleu = impair. Sur 20 tirages beaucoup de boules restent pâles : c’est normal (attendu ≈ 2×).",
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
              <HeatGrid items={numbers} className="euromillions-ball-grid" />
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm" style={{ background: "var(--chart-1)" }} />
                  Pair
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm" style={{ background: "var(--chart-2)" }} />
                  Impair
                </span>
                <span>moins sorti → plus sorti</span>
              </div>
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
                body: "Même lecture que la grille 1–50, sur le pool actuel de 12 étoiles. Attendu ≈ 3,3× sur 20 tirages, ≈ 8,3× sur 50.",
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
            <HeatGrid
              items={stars}
              className="grid grid-cols-6 gap-1 sm:grid-cols-12"
              star
            />
          )}
        </CardContent>
      </Card>
    </section>
  )
}
