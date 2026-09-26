"use client"

import { TitleHelp } from "@/components/help"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { sparklinePoints } from "@/lib/chartisme/sketch-shapes"
import {
  MIN_SENSE_LENGTH,
  senseSentence,
  senseShiftSentence,
  type CurveSense,
  type SenseName,
} from "@/lib/chartisme/sense"

/**
 * Le sens nommé au PR #167, développé.
 *
 * La phrase sous le tracé dit le symbole. Ici on voit la droite qui le produit,
 * le nuage qui décide `stable`, et le rapport à l'écart-type habituel de la
 * courbe. La comparaison porte sur les deux fenêtres de travail, jamais sur
 * une sélection : la précédente n'a pas de trait tiré à la main.
 */

const SKETCH_W = 480
const SKETCH_H = 112
const SKETCH_PAD = 10

const SENSE_BADGE: Record<SenseName, string> = {
  monte: "border-emerald-400/50 bg-emerald-400/15 text-emerald-100",
  baisse: "border-rose-400/50 bg-rose-400/15 text-rose-100",
  stable: "border-sky-400/50 bg-sky-400/15 text-sky-100",
}

export type SenseScope = "Fenêtre étudiée" | "Sélection"

function formatMeasure(value: number): string {
  if (!Number.isFinite(value)) return "∞"
  const abs = Math.abs(value)
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  return value.toFixed(digits)
}

function signedMeasure(value: number): string {
  if (value > 0) return `+${formatMeasure(value)}`
  return formatMeasure(value)
}

function coords(spec: string): Array<[number, number]> {
  if (!spec) return []
  return spec.split(" ").flatMap((pair) => {
    const [rawX, rawY] = pair.split(",")
    const x = Number(rawX)
    const y = Number(rawY)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return []
    return [[x, y] as [number, number]]
  })
}

function SenseSketch({
  values,
  sigma,
  label,
}: {
  values: number[]
  sigma: number | null
  label: string
}) {
  if (values.length < 2) return null
  const count = values.length
  const slope = (values[count - 1] - values[0]) / (count - 1)
  const line = values.map((_, index) => values[0] + slope * index)
  const band = sigma != null && sigma > 0
  const upper = line.map((value) => value + (sigma ?? 0))
  const lower = line.map((value) => value - (sigma ?? 0))
  const cloud = band ? [...values, ...upper, ...lower] : values
  const bounds = { min: Math.min(...cloud), max: Math.max(...cloud) }
  const curve = sparklinePoints(values, SKETCH_W, SKETCH_H, SKETCH_PAD, bounds)
  const chord = sparklinePoints(line, SKETCH_W, SKETCH_H, SKETCH_PAD, bounds)
  const above = coords(sparklinePoints(upper, SKETCH_W, SKETCH_H, SKETCH_PAD, bounds))
  const below = coords(sparklinePoints(lower, SKETCH_W, SKETCH_H, SKETCH_PAD, bounds))
  const polygon = [...above, ...below.reverse()].map(([x, y]) => `${x},${y}`).join(" ")
  const ends = coords(curve)
  const first = ends[0]
  const last = ends[ends.length - 1]

  return (
    <figure className="min-w-0 space-y-1">
      <svg
        viewBox={`0 0 ${SKETCH_W} ${SKETCH_H}`}
        className="h-28 w-full"
        role="img"
        aria-label={label}
        data-capture-visual=""
      >
        <g className="text-sky-300">
          {band && polygon ? (
            <polygon points={polygon} fill="currentColor" fillOpacity={0.18} stroke="none" />
          ) : null}
          <polyline
            points={chord}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>
        <g className="text-amber-300">
          <polyline
            points={curve}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {first ? <circle cx={first[0]} cy={first[1]} r={3.2} fill="currentColor" /> : null}
          {last ? <circle cx={last[0]} cy={last[1]} r={3.2} fill="currentColor" /> : null}
        </g>
      </svg>
      <figcaption className="text-[11px] text-muted-foreground">
        <span className="text-amber-300">Trait</span>
        {" : la courbe · "}
        <span className="text-sky-300">droite</span>
        {" : les deux bouts"}
        {band ? " · bande : ± le nuage" : ""}
      </figcaption>
    </figure>
  )
}

export function SensePanel({
  values,
  named,
  scope,
  fromDate,
  toDate,
  shortSelection,
  windowSense,
  previousSense,
  hasPrevious,
}: {
  values: number[]
  named: CurveSense | null
  scope: SenseScope
  fromDate: string | null
  toDate: string | null
  shortSelection: number | null
  windowSense: CurveSense | null
  previousSense: CurveSense | null
  hasPrevious: boolean
}) {
  const sentence = senseSentence(named)
  const shift = senseShiftSentence(windowSense, previousSense, hasPrevious)
  const span =
    values.length > 0
      ? `${values.length} tirage${values.length > 1 ? "s" : ""}`
      : null
  const dates = fromDate && toDate ? `du ${fromDate} au ${toDate}` : null
  const where = [scope, span, dates].filter(Boolean).join(" · ")
  const inside = named != null && Math.abs(named.delta) <= named.sigma

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <TitleHelp
            help={{
              title: "Sens de la courbe",
              body: "La droite joint le premier et le dernier tirage de la fenêtre étudiée. Une sélection d'au moins 16 points la remplace. Le sens est stable quand le déplacement net ne dépasse pas l'écart-type des résidus autour de cette droite ; sinon la fenêtre monte ou baisse. Le registre rapporte cet écart-type à celui de toute la courbe chargée : 05 jusqu'à 0,5, 1 jusqu'à 1, sup au-delà. La fenêtre précédente, de même longueur, est nommée sur le même écart-type.",
            }}
          >
            Sens de la courbe
          </TitleHelp>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <SenseSketch values={values} sigma={named?.sigma ?? null} label={sentence} />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {named ? (
              <Badge variant="outline" className={SENSE_BADGE[named.sense]}>
                {named.symbol}
              </Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">{where}</span>
          </div>
          <p className="text-sm">{sentence}</p>
          {shortSelection != null ? (
            <p className="text-xs text-muted-foreground">
              La sélection compte {shortSelection} tirage{shortSelection > 1 ? "s" : ""}. En
              dessous de {MIN_SENSE_LENGTH}, le nom reste celui de la fenêtre étudiée.
            </p>
          ) : null}
        </div>

        {named ? (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt
                className="text-[11px] text-muted-foreground"
                title="Dernier tirage moins le premier. Stable tant que cette valeur ne dépasse pas le nuage."
              >
                Déplacement net
              </dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {signedMeasure(named.delta)}
                <span className="font-normal text-muted-foreground">
                  {inside ? " · dans le nuage" : " · hors du nuage"}
                </span>
              </dd>
            </div>
            <div>
              <dt
                className="text-[11px] text-muted-foreground"
                title="Écart-type des résidus autour de la droite qui joint les deux bouts."
              >
                Nuage
              </dt>
              <dd className="mt-0.5 font-medium tabular-nums">{formatMeasure(named.sigma)}</dd>
            </div>
            <div>
              <dt
                className="text-[11px] text-muted-foreground"
                title="Écart-type de toute la courbe chargée. Le registre s'y rapporte, pas à la fenêtre seule."
              >
                Écart-type habituel
              </dt>
              <dd className="mt-0.5 font-medium tabular-nums">{formatMeasure(named.reference)}</dd>
            </div>
            <div>
              <dt
                className="text-[11px] text-muted-foreground"
                title="Nuage divisé par l'habitude. 05 jusqu'à 0,5, 1 jusqu'à 1, sup au-delà."
              >
                Rapport
              </dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {named.ratio == null ? "∞" : formatMeasure(named.ratio)}
                <span className="font-normal text-muted-foreground"> · {named.register}</span>
              </dd>
            </div>
          </dl>
        ) : null}

        <div className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{"D'une fenêtre à l'autre"}</p>
          <p className="text-foreground">{shift}</p>
          {scope === "Sélection" ? (
            <p>Fenêtre étudiée · {senseSentence(windowSense)}</p>
          ) : null}
          {hasPrevious ? <p>Précédente · {senseSentence(previousSense)}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}
