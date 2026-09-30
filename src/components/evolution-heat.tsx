"use client"

import { FrequencyTable } from "@/components/frequency-table"
import { TitleHelp } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { type FrequencyItem } from "@/lib/draws"

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
                body: "Tableau triable : Numéro, P/I, Sorties, Δ, Retard, Attendu. La barre est le total de sorties, le trait est l’attendu (N × 5/50), le × est le rapport. Or = pair, bleu = impair. Rouge = plus de 2× l’attendu. Beaucoup de barres s’arrêtent avant le trait : c’est normal.",
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
            <FrequencyTable
              items={numbers}
              expected={expectedNumbers}
              caption="Fréquences des numéros 1 à 50"
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            <TitleHelp
              help={{
                title: "Étoiles 1–12",
                body: "Même tableau que la grille 1–50, sur le pool actuel de 12 étoiles. Attendu ≈ 3,3× sur 20 tirages, ≈ 8,3× sur 50. Le trait marque cette loi.",
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
            <FrequencyTable
              items={stars}
              expected={expectedStars}
              noun="Étoile"
              shortNoun="★"
              caption="Fréquences des étoiles 1 à 12"
              scroll={false}
            />
          )}
        </CardContent>
      </Card>
    </section>
  )
}
