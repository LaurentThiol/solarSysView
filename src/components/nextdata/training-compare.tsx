import { Fragment } from "react"

import {
  compareGrids,
  formatDecimal,
  formatSigned,
  meanOf,
  SHAPE_KEYS,
  type ComparedGrid,
  type ShapeKey,
} from "@/lib/nextdata/compare"
import { persistKey, swappedValues, type PersistSwap } from "@/lib/nextdata/persist"
import type { GridShape } from "@/lib/nextdata/shape"
import { chanceOdds, chanceRange, chanceText, formatHits, type HitsChance } from "@/lib/nextdata/uncertainty"
import { cn } from "@/lib/utils"

const NUMBER_RANKS = ["n1", "n2", "n3", "n4", "n5"] as const
const STAR_RANKS = ["e1", "e2"] as const

const SHAPE_LABELS: Record<ShapeKey, string> = {
  spread: "Étendue",
  consecutive: "Consécutifs",
  starSpread: "Étendue ★",
  starConsecutive: "Consécutifs ★",
}

export type TrainingCompareShift = {
  x: number
  label: string
  date: string
  actual: ComparedGrid
  readings: Record<string, (ComparedGrid & { swaps?: PersistSwap[] }) | undefined>
}

function deltaTone(value: number) {
  if (value > 0) return "text-destructive"
  if (value < 0) return "text-chart-2"
  return "text-muted-foreground"
}

function BallLine({
  values,
  hits,
  kind,
  swapped,
}: {
  values: number[]
  hits: Set<number>
  kind: "number" | "star"
  swapped?: Set<number>
}) {
  if (values.length === 0) return <span className="text-muted-foreground">—</span>
  const ranks = kind === "number" ? NUMBER_RANKS : STAR_RANKS
  return (
    <div
      className={cn(
        "grid",
        kind === "number"
          ? "w-[calc(5*1.75rem+4*0.375rem)] grid-cols-5 gap-1.5 sm:w-[calc(5*2rem+4*0.5rem)] sm:gap-2"
          : "w-[calc(2*1.75rem+0.375rem)] grid-cols-2 gap-1.5 sm:w-[calc(2*2rem+0.5rem)] sm:gap-2"
      )}
    >
      {values.map((value, index) => {
        const hit = hits.has(value)
        const moved = swapped?.has(value) ?? false
        const rank = ranks[index] ?? ""
        const label = `${rank} ${value}${hit ? ", commun" : ""}${moved ? ", reprise de n−1 ou n−2" : ""}`
        return (
          <span
            key={`${kind}-${index}`}
            title={label}
            aria-label={label}
            data-hit={hit ? "true" : undefined}
            data-swapped={moved ? "true" : undefined}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums sm:size-8 sm:text-xs",
              kind === "number" ? "bg-primary text-primary-foreground" : "bg-star text-primary-foreground",
              hit && "z-10 shadow-[0_0_0_2px_var(--foreground)]",
              moved && "outline-2 outline-offset-2 outline-dashed outline-foreground"
            )}
          >
            {value}
          </span>
        )
      })}
    </div>
  )
}

function Score({ numbers, stars, ready }: { numbers: number; stars: number; ready: boolean }) {
  if (!ready) return <span className="text-muted-foreground">—</span>
  const numberWord = numbers === 1 ? "numéro commun" : "numéros communs"
  const starWord = stars === 1 ? "étoile commune" : "étoiles communes"
  return (
    <div
      className="flex flex-col items-center leading-tight"
      aria-label={`${numbers} ${numberWord} sur 5, ${stars} ${starWord} sur 2`}
    >
      <span className={cn("text-sm font-semibold", numbers > 0 ? "text-foreground" : "text-muted-foreground")}>
        {numbers}
        <span className="text-[10px] font-medium text-muted-foreground">/5</span>
      </span>
      <span className={cn("text-[11px]", stars > 0 ? "text-foreground" : "text-muted-foreground")}>★ {stars}/2</span>
    </div>
  )
}

function ShapeValue({ value, delta }: { value: number | null; delta: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-baseline justify-center gap-1">
      <span className="min-w-5 text-right">{value}</span>
      <span className="w-7 text-left text-[10px]" title={delta != null && delta !== 0 ? "prévu moins sorti" : undefined}>
        {delta == null || delta === 0 ? "" : <span className={deltaTone(delta)}>{formatSigned(delta)}</span>}
      </span>
    </span>
  )
}

function shapeOf(shape: GridShape | null, key: ShapeKey) {
  return shape ? shape[key] : null
}

function MeanScore({ numbers, stars, label }: { numbers: number | null; stars: number | null; label: string }) {
  if (numbers == null || stars == null) return <span className="text-muted-foreground">—</span>
  return (
    <div
      className="flex flex-col items-center leading-tight"
      aria-label={`${label} ${formatHits(numbers)} numéros communs sur 5, ${formatHits(stars)} étoiles communes sur 2`}
    >
      <span className="font-semibold text-foreground">
        {formatHits(numbers)}
        <span className="text-[10px] font-medium text-muted-foreground">/5</span>
      </span>
      <span className="text-[11px] text-muted-foreground">★ {formatHits(stars)}/2</span>
    </div>
  )
}

function ChanceNote({ chance }: { chance: HitsChance | null | undefined }) {
  if (!chance?.numbers) return null
  const title = [chanceText(chance.numbers), chance.stars ? `★ ${chanceText(chance.stars)}` : ""].filter(Boolean).join(" · ")
  return (
    <span className="mt-0.5 block text-[10px] font-normal" title={title} data-chance>
      hasard {chanceRange(chance.numbers)}
      {chance.stars ? ` · ★ ${chanceRange(chance.stars)}` : ""}
    </span>
  )
}

function oddsSentence(label: string, chance: HitsChance | null | undefined) {
  const odds = chanceOdds(chance?.numbers)
  return odds ? ` ${label} : ${odds}.` : ""
}

export function TrainingCompare({
  shifts,
  reading,
  chance,
  twinChance,
  meanHits,
  twinMeanHits,
}: {
  shifts: TrainingCompareShift[]
  reading: string
  chance?: HitsChance | null
  twinChance?: HitsChance | null
  meanHits?: { numbers: number | null; stars: number | null } | null
  twinMeanHits?: { numbers: number | null; stars: number | null } | null
}) {
  const rows = shifts.map((shift) => {
    const side = shift.readings[reading]
    const forecast = side && side.numbers.length > 0 ? side : null
    const twinSide = shift.readings[persistKey(reading)]
    const twin = twinSide && twinSide.numbers.length > 0 ? twinSide : null
    return {
      shift,
      forecast,
      compared: compareGrids(shift.actual, forecast),
      twin,
      twinCompared: twin ? compareGrids(shift.actual, twin) : null,
    }
  })
  const ready = rows.filter((row) => row.forecast)
  const gapMean = (key: ShapeKey) => meanOf(ready.flatMap((row) => (row.compared.gap ? [row.compared.gap[key]] : [])))
  const twins = rows.flatMap((row) => (row.twinCompared ? [row.twinCompared] : []))
  const twinGapMean = (key: ShapeKey) => meanOf(twins.flatMap((item) => (item.gap ? [item.gap[key]] : [])))

  return (
    <div>
      <div className="overflow-x-auto">
        <table
          className="w-full min-w-[52rem] border-separate border-spacing-0 text-left text-xs tabular-nums"
          data-reading={reading}
        >
          <caption className="sr-only">
            Prévu et sorti. Deux lignes par décalage : le tirage FDJ, puis la grille de la lecture choisie.
          </caption>
          <thead>
            <tr className="text-[11px] font-medium tracking-wide text-muted-foreground">
              <th scope="col" className="px-2 pb-2 font-medium">
                Décalage
              </th>
              <th scope="col" className="px-2 pb-2 font-medium">
                <span className="sr-only">Grille</span>
              </th>
              <th scope="col" className="px-2 pb-2 font-medium">
                Numéros
              </th>
              <th scope="col" className="px-2 pb-2 font-medium">
                Étoiles
              </th>
              <th scope="col" className="px-2 pb-2 text-center font-medium">
                Communs
              </th>
              {SHAPE_KEYS.map((key) => (
                <th key={key} scope="col" className="px-2 pb-2 text-center font-medium whitespace-nowrap">
                  {SHAPE_LABELS[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ shift, forecast, compared, twin, twinCompared }, index) => {
              const numberHits = new Set(compared.numberHits)
              const starHits = new Set(compared.starHits)
              const band = index % 2 === 0 ? "bg-card" : "bg-background"
              const open = cn("border-t border-border/70", band)
              return (
                <Fragment key={shift.x}>
                  <tr>
                    <th
                      scope="row"
                      rowSpan={twin ? 3 : 2}
                      className={cn(open, "px-2 py-1.5 align-middle font-medium whitespace-nowrap")}
                    >
                      <span className="block">{shift.label}</span>
                      <span className="mt-0.5 block font-normal text-muted-foreground">{shift.date}</span>
                    </th>
                    <th scope="row" className={cn(open, "px-2 py-1.5 align-middle font-medium text-muted-foreground")}>
                      Sorti
                    </th>
                    <td className={cn(open, "px-2 py-1.5 align-middle")}>
                      <BallLine values={shift.actual.numbers} hits={numberHits} kind="number" />
                    </td>
                    <td className={cn(open, "px-2 py-1.5 align-middle")}>
                      <BallLine values={shift.actual.stars} hits={starHits} kind="star" />
                    </td>
                    <td rowSpan={2} className={cn(open, "px-2 py-1.5 text-center align-middle")}>
                      <Score
                        numbers={compared.numberHits.length}
                        stars={compared.starHits.length}
                        ready={forecast != null}
                      />
                    </td>
                    {SHAPE_KEYS.map((key) => (
                      <td key={key} className={cn(open, "px-2 py-1.5 text-center align-middle")}>
                        <ShapeValue value={shapeOf(compared.actual, key)} delta={null} />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row" className={cn(band, "px-2 py-1.5 align-middle font-medium text-muted-foreground")}>
                      Prévu
                    </th>
                    <td className={cn(band, "px-2 py-1.5 align-middle")}>
                      <BallLine values={forecast?.numbers ?? []} hits={numberHits} kind="number" />
                    </td>
                    <td className={cn(band, "px-2 py-1.5 align-middle")}>
                      <BallLine values={forecast?.stars ?? []} hits={starHits} kind="star" />
                    </td>
                    {SHAPE_KEYS.map((key) => (
                      <td key={key} className={cn(band, "px-2 py-1.5 text-center align-middle")}>
                        <ShapeValue value={shapeOf(compared.forecast, key)} delta={shapeOf(compared.gap, key)} />
                      </td>
                    ))}
                  </tr>
                  {twin && twinCompared ? (
                    <tr data-persist-row>
                      <th scope="row" className={cn(band, "px-2 py-1.5 align-middle font-medium text-muted-foreground")}>
                        Persist
                      </th>
                      <td className={cn(band, "px-2 py-1.5 align-middle")}>
                        <BallLine
                          values={twin.numbers}
                          hits={new Set(twinCompared.numberHits)}
                          kind="number"
                          swapped={swappedValues(twin.swaps, "number")}
                        />
                      </td>
                      <td className={cn(band, "px-2 py-1.5 align-middle")}>
                        <BallLine
                          values={twin.stars}
                          hits={new Set(twinCompared.starHits)}
                          kind="star"
                          swapped={swappedValues(twin.swaps, "star")}
                        />
                      </td>
                      <td className={cn(band, "px-2 py-1.5 text-center align-middle")}>
                        <Score numbers={twinCompared.numberHits.length} stars={twinCompared.starHits.length} ready />
                      </td>
                      {SHAPE_KEYS.map((key) => (
                        <td key={key} className={cn(band, "px-2 py-1.5 text-center align-middle")}>
                          <ShapeValue value={shapeOf(twinCompared.forecast, key)} delta={shapeOf(twinCompared.gap, key)} />
                        </td>
                      ))}
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={4} className="border-t border-border px-2 pt-3 text-left font-medium text-muted-foreground">
                Moyenne
                <ChanceNote chance={chance} />
              </th>
              <td className="border-t border-border px-2 pt-3 text-center">
                <MeanScore numbers={meanHits?.numbers ?? null} stars={meanHits?.stars ?? null} label="Moyenne" />
              </td>
              {SHAPE_KEYS.map((key) => {
                const value = gapMean(key)
                return (
                  <td
                    key={key}
                    className={cn(
                      "border-t border-border px-2 pt-3 text-center text-[11px] font-medium",
                      value == null ? "text-muted-foreground" : deltaTone(value)
                    )}
                  >
                    {value == null ? "—" : formatDecimal(value, true)}
                  </td>
                )
              })}
            </tr>
            {twins.length > 0 ? (
              <tr data-persist-mean>
                <th scope="row" colSpan={4} className="px-2 pt-2 text-left font-medium text-muted-foreground">
                  Moyenne Persist
                </th>
                <td className="px-2 pt-2 text-center">
                  <MeanScore numbers={twinMeanHits?.numbers ?? null} stars={twinMeanHits?.stars ?? null} label="Moyenne Persist" />
                </td>
                {SHAPE_KEYS.map((key) => {
                  const value = twinGapMean(key)
                  return (
                    <td
                      key={key}
                      className={cn(
                        "px-2 pt-2 text-center text-[11px] font-medium",
                        value == null ? "text-muted-foreground" : deltaTone(value)
                      )}
                    >
                      {value == null ? "—" : formatDecimal(value, true)}
                    </td>
                  )
                })}
              </tr>
            ) : null}
          </tfoot>
        </table>
      </div>
      <p className="mt-3 max-w-3xl text-xs leading-5 text-muted-foreground">
        Une boule cerclée est dans les deux grilles. L’écart, prévu moins sorti, n’est écrit que s’il n’est pas nul : rouge si la lecture était trop haute, bleu si elle était trop basse. Au hasard, une grille partage en moyenne 0,5 numéro et 0,33 étoile avec le tirage. Sur autant de tirages, sa moyenne tombe 95 fois sur 100 dans la plage écrite sous Moyenne.
        {oddsSentence("Numéros de cette lecture", chance)}
        {twins.length > 0 ? oddsSentence("Avec Persist", twinChance) : ""}
      </p>
    </div>
  )
}
