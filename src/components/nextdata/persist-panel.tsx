import type { ReactNode } from "react"

import { HelpTip, TitleHelp, type HelpCopy } from "@/components/help"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  edgeFor,
  formatCount,
  formatDelta,
  formatPoints,
  formatPValue,
  formatRate,
  lagLabel,
  PERSIST_LIMITS,
  PERSIST_RADII,
  radiusLabel,
  swapLabel,
  type PairedPersist,
  type PersistBase,
  type PersistHeld,
  type PersistSetting,
  type PersistSwap,
  type RateCell,
  type RecentDraw,
  type SwapTally,
} from "@/lib/nextdata/persist"
import { cn } from "@/lib/utils"

export function PersistControl({
  value,
  onChange,
  help,
}: {
  value: PersistSetting | null
  onChange: (next: PersistSetting | null) => void
  help: HelpCopy
}) {
  const limit = value?.limit ?? 1
  return (
    <div className="flex flex-wrap items-center gap-2" data-persist-control>
      <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Persist
        <HelpTip {...help} />
      </span>
      <Button type="button" size="sm" variant={value ? "ghost" : "secondary"} aria-pressed={!value} onClick={() => onChange(null)}>
        Sans
      </Button>
      {PERSIST_RADII.map((radius) => (
        <Button
          key={radius}
          type="button"
          size="sm"
          variant={value?.radius === radius ? "secondary" : "ghost"}
          aria-pressed={value?.radius === radius}
          onClick={() => onChange({ radius, limit })}
        >
          {radiusLabel(radius)}
        </Button>
      ))}
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      {PERSIST_LIMITS.map((count) => (
        <Button
          key={count}
          type="button"
          size="sm"
          variant={value?.limit === count ? "secondary" : "ghost"}
          aria-pressed={value?.limit === count}
          disabled={!value}
          onClick={() => value && onChange({ ...value, limit: count })}
        >
          {count === 1 ? "1 numéro" : "2 numéros"}
        </Button>
      ))}
    </div>
  )
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

function quietReason(kind: "number" | "star", held: number, target: number, radius: number) {
  const label = kind === "number" ? "numéros" : "étoiles"
  if (held >= target) return `${label} : déjà ${held} de n−1 ou n−2`
  return `${label} : rien à ${radiusLabel(radius)} de n−1 ou n−2`
}

/** Échanges d’une grille Persist, ou la raison pour laquelle elle n’a pas bougé. */
export function SwapNote({
  swaps,
  held,
  radius,
  limit,
}: {
  swaps: PersistSwap[]
  held?: PersistHeld | null
  radius: number
  limit: number
}) {
  const numbers = swaps.filter((swap) => swap.kind === "number")
  const stars = swaps.filter((swap) => swap.kind === "star")
  const quiet = [
    numbers.length ? null : quietReason("number", held?.numbers ?? 0, limit, radius),
    stars.length ? null : quietReason("star", held?.stars ?? 0, 1, radius),
  ].filter(Boolean)
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs tabular-nums text-muted-foreground" data-swaps={swaps.length}>
      {swaps.map((swap) => (
        <span
          key={`${swap.kind}-${swap.from}-${swap.to}`}
          className={cn(
            "rounded-full border border-dashed px-2 py-0.5",
            swap.outcome === "gain" && "border-chart-2 text-foreground",
            swap.outcome === "loss" && "border-destructive text-foreground"
          )}
        >
          {swapLabel(swap)}
        </span>
      ))}
      {quiet.length ? <span>{quiet.join(" · ")}</span> : null}
    </div>
  )
}

export function RecentNote({ recent }: { recent: RecentDraw[] }) {
  return (
    <p className="text-xs tabular-nums text-muted-foreground">
      {recent
        .map((draw) => `${lagLabel(draw.lag)} ${draw.date} : ${draw.numbers.join(" ")} + ${draw.stars.join(" ")}`)
        .join(" · ")}
    </p>
  )
}

function TallyLine({ label, tally }: { label: string; tally: SwapTally }) {
  if (tally.swaps === 0) {
    return (
      <li>
        <span className="font-medium">{label}</span> : aucun échange
      </li>
    )
  }
  return (
    <li>
      <span className="font-medium">{label}</span> : {plural(tally.swaps, "échange", "échanges")} ·{" "}
      {plural(tally.gains, "gagné", "gagnés")}, {plural(tally.losses, "perdu", "perdus")},{" "}
      {plural(tally.neutral, "neutre", "neutres")} · net {tally.net > 0 ? `+${tally.net}` : tally.net} ·{" "}
      {tally.p == null ? null : <>p = {formatPValue(tally.p)} · </>}
      <span className="text-muted-foreground">
        au hasard ±{tally.noise.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
      </span>
    </li>
  )
}

function deltaTone(value: number | null, higherIsBetter: boolean) {
  if (value == null || Math.abs(value) < 0.005) return "text-muted-foreground"
  const better = higherIsBetter ? value > 0 : value < 0
  return better ? "text-chart-2" : "text-destructive"
}

function decimal(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** La même grille du modèle, notée avec et sans Persist. */
export function PersistPairCard({
  summary,
  title,
  help,
}: {
  summary: PairedPersist
  title: ReactNode
  help: HelpCopy
}) {
  const hitRows = [
    { key: "numbers", label: "numéros communs", raw: summary.hits.raw.numbers, persist: summary.hits.persist.numbers },
    { key: "stars", label: "étoiles communes", raw: summary.hits.raw.stars, persist: summary.hits.persist.stars },
  ]
  return (
    <Card data-persist-pair>
      <CardHeader>
        <CardTitle className="text-base">
          <TitleHelp help={help}>{title}</TitleHelp>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {plural(summary.draws, "tirage noté", "tirages notés")} · {plural(summary.moved, "grille changée", "grilles changées")}
        </p>
        <ul className="flex flex-col gap-1 text-sm tabular-nums">
          <TallyLine label="Numéros" tally={summary.numbers} />
          <TallyLine label="Étoiles" tally={summary.stars} />
        </ul>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] border-separate border-spacing-x-2 border-spacing-y-0.5 text-right text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left font-medium">Moyenne par tirage</th>
                <th className="font-medium">sans Persist</th>
                <th className="font-medium">avec Persist</th>
                <th className="font-medium">écart</th>
              </tr>
            </thead>
            <tbody>
              {hitRows.map((row) => {
                const delta = row.persist - row.raw
                return (
                  <tr key={row.key}>
                    <th className="text-left font-medium">{row.label}</th>
                    <td>{decimal(row.raw)}</td>
                    <td>{decimal(row.persist)}</td>
                    <td className={deltaTone(delta, true)}>{formatDelta(delta)}</td>
                  </tr>
                )
              })}
              {summary.fields.map((field) => (
                <tr key={field.key}>
                  <th className="text-left font-normal text-muted-foreground">erreur {field.label}</th>
                  <td>{decimal(field.raw)}</td>
                  <td>{decimal(field.persist)}</td>
                  <td className={deltaTone(field.delta, false)}>{formatDelta(field.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function distanceLabel(distance: number, far: boolean) {
  if (distance === 0) return "dans n−1 ou n−2"
  if (far) return `à ${distance} ou plus`
  return `à ${distance}`
}

function RateCells({ cell }: { cell: RateCell | undefined }) {
  if (!cell || !cell.seen) {
    return (
      <>
        <td>—</td>
        <td>—</td>
      </>
    )
  }
  return (
    <>
      <td title={`${formatCount(cell.drawn)} sorties sur ${formatCount(cell.seen)} boules`}>{formatRate(cell.rate)}</td>
      <td className="text-muted-foreground">
        {formatRate(cell.lo)} – {formatRate(cell.hi)}
      </td>
    </>
  )
}

function EdgeText({ label, edge }: { label: string; edge: ReturnType<typeof edgeFor> }) {
  if (!edge || edge.value == null) return <>{label} : —</>
  return (
    <>
      {label} : <span className="font-medium">{formatPoints(edge.value)}</span>{" "}
      <span className="text-muted-foreground">
        [{formatPoints(edge.lo)} ; {formatPoints(edge.hi)}]
      </span>
    </>
  )
}

/** Sortie d’une boule selon sa distance à n−1 ∪ n−2, sur toute l’archive reçue. */
export function PersistArchive({ base, radius, help }: { base: PersistBase; radius: number; help: HelpCopy }) {
  const rows = base.numbers.by_distance.map((cell, index) => ({ cell, star: base.stars.by_distance[index] }))
  return (
    <Card data-persist-archive>
      <CardHeader>
        <CardTitle className="text-base">
          <TitleHelp help={help}>Persist sur l’archive</TitleHelp>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm leading-6 text-muted-foreground">
          {formatCount(base.draws)} tirages, du {base.first} au {base.last}. Au moins un numéro ou une étoile de
          n−1 ou n−2 : <span className="font-medium text-foreground">{formatRate(base.any.observed)}</span> des
          tirages, le hasard en donne {formatRate(base.any.chance)}. Numéros : {formatRate(base.numbers.at_least_one.observed)}{" "}
          ({formatRate(base.numbers.at_least_one.chance)}). Étoiles : {formatRate(base.stars.at_least_one.observed)} (
          {formatRate(base.stars.at_least_one.chance)}).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] border-separate border-spacing-x-2 border-spacing-y-0.5 text-right text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left font-medium">Boule</th>
                <th className="font-medium">numéro sorti</th>
                <th className="font-medium">IC 95 %</th>
                <th className="font-medium">étoile sortie</th>
                <th className="font-medium">IC 95 %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ cell, star }) => {
                const near = cell.distance >= 1 && cell.distance <= radius
                return (
                  <tr
                    key={cell.distance}
                    data-near={near ? "true" : undefined}
                    className={cn(cell.distance === 0 && "font-medium text-foreground", near && "bg-primary/5")}
                  >
                    <th className="rounded-l-md text-left font-normal">{distanceLabel(cell.distance, cell.far)}</th>
                    <RateCells cell={cell} />
                    <RateCells cell={star} />
                  </tr>
                )
              })}
              <tr className="text-muted-foreground">
                <th className="text-left font-normal">hasard</th>
                <td>{formatRate(base.numbers.chance)}</td>
                <td />
                <td>{formatRate(base.stars.chance)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm tabular-nums">
          Échange à {radiusLabel(radius)}, sortie de la boule reprise moins celle de sa voisine :{" "}
          <EdgeText label="numéro" edge={edgeFor(base.numbers, radius)} /> ·{" "}
          <EdgeText label="étoile" edge={edgeFor(base.stars, radius)} />. Le hasard donne 0.
        </p>
        <p className="text-xs text-muted-foreground">
          Pour qu’un gain d’un point par boule reprise sorte du bruit, il faudrait environ{" "}
          {formatCount(base.numbers.swaps_for_one_point)} échanges de numéros, {formatCount(base.stars.swaps_for_one_point)}{" "}
          d’étoiles.
        </p>
      </CardContent>
    </Card>
  )
}
