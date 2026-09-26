"use client"

import Link from "next/link"

import { TitleHelp } from "@/components/help"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { sparklinePoints } from "@/lib/chartisme/sketch-shapes"
import {
  MIN_SENSE_LENGTH,
  formatSlope,
  segmentsSentence,
  senseSentence,
  senseShiftSentence,
  type CurveSense,
  type SenseName,
  type SenseSegment,
} from "@/lib/chartisme/sense"
import { ficheHref } from "@/lib/lexicon/fiche"

/**
 * Le sens nommé au PR #167, développé.
 *
 * La phrase sous le tracé dit le symbole de la corde, le résumé. Les droites
 * du croquis sont les tronçons : chacun a son coefficient directeur, comparé
 * au précédent et à l'habitude des pentes. La comparaison des fenêtres porte
 * sur les deux fenêtres de travail, jamais sur une sélection.
 */

const SKETCH_W = 480
const SKETCH_H = 112
const SKETCH_PAD = 10

const SENSE_BADGE: Record<SenseName, string> = {
  monte: "border-emerald-400/50 bg-emerald-400/15 text-emerald-100",
  baisse: "border-rose-400/50 bg-rose-400/15 text-rose-100",
  stable: "border-sky-400/50 bg-sky-400/15 text-sky-100",
}

const SEGMENT_STROKE: Record<SenseName, string> = {
  monte: "text-emerald-300",
  baisse: "text-rose-300",
  stable: "text-sky-300",
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

function windowPoint(
  index: number,
  value: number,
  count: number,
  bounds: { min: number; max: number }
): [number, number] {
  const span = bounds.max - bounds.min || 1
  const innerW = SKETCH_W - 2 * SKETCH_PAD
  const innerH = SKETCH_H - 2 * SKETCH_PAD
  const x = SKETCH_PAD + (count <= 1 ? innerW / 2 : (index / (count - 1)) * innerW)
  const y = SKETCH_PAD + (1 - (value - bounds.min) / span) * innerH
  return [x, y]
}

function SenseSketch({
  values,
  sigma,
  label,
  segments,
}: {
  values: number[]
  sigma: number | null
  label: string
  segments: SenseSegment[] | null
}) {
  if (values.length < 2) return null
  const count = values.length
  const chained = Boolean(segments?.length)
  const slope = (values[count - 1] - values[0]) / (count - 1)
  const line = values.map((_, index) => values[0] + slope * index)
  const band = !chained && sigma != null && sigma > 0
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
        {chained ? null : (
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
        )}
        <g className="text-amber-300">
          <polyline
            points={curve}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {chained ? null : first ? <circle cx={first[0]} cy={first[1]} r={3.2} fill="currentColor" /> : null}
          {chained ? null : last ? <circle cx={last[0]} cy={last[1]} r={3.2} fill="currentColor" /> : null}
        </g>
        {chained
          ? segments?.map((segment) => {
              const from = values[segment.fromIndex]
              const to = values[segment.toIndex]
              if (from == null || to == null || segment.toIndex <= segment.fromIndex) return null
              const [x0, y0] = windowPoint(segment.fromIndex, from, count, bounds)
              const [x1, y1] = windowPoint(segment.toIndex, to, count, bounds)
              return (
                <g key={`${segment.fromIndex}-${segment.toIndex}`} className={SEGMENT_STROKE[segment.sense]}>
                  <line
                    x1={x0}
                    y1={y0}
                    x2={x1}
                    y2={y1}
                    stroke="currentColor"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                  />
                  <circle cx={x0} cy={y0} r={2.8} fill="currentColor" />
                  <circle cx={x1} cy={y1} r={2.8} fill="currentColor" />
                </g>
              )
            })
          : null}
      </svg>
      <figcaption className="text-[11px] text-muted-foreground">
        <span className="text-amber-300">Trait</span>
        {chained ? (
          <>
            {" : la courbe · "}
            <span className="text-emerald-300">monte</span>
            {" · "}
            <span className="text-rose-300">baisse</span>
            {" · "}
            <span className="text-sky-300">stable</span>
            {" : un tronçon chacune"}
          </>
        ) : (
          <>
            {" : la courbe · "}
            <span className="text-sky-300">droite</span>
            {" : les deux bouts"}
            {band ? " · bande : ± le nuage" : ""}
          </>
        )}
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
  segments,
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
  segments: SenseSegment[] | null
}) {
  const sentence = senseSentence(named)
  const chain = segmentsSentence(segments)
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
              body: "La corde joint le premier et le dernier tirage : c'est le résumé. Le découpage cherche les tronçons d'au moins trois tirages dont le déplacement dépasse l'écart-type habituel de la courbe et dont le nuage tient dans cet écart-type. Chaque droite a son coefficient directeur, comparé au tronçon précédent (tourne, accélère, fatigue, tient) et à l'habitude des pentes (vive, ordinaire). Une sélection d'au moins 16 points remplace la corde et les tronçons. La fenêtre précédente est nommée sur les mêmes écarts-types.",
            }}
          >
            Sens de la courbe
          </TitleHelp>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <SenseSketch values={values} sigma={named?.sigma ?? null} label={chain} segments={segments} />

        {segments ? (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">Tronçons</p>
            <p className="text-sm">{chain}</p>
            <ul className="space-y-1">
              {segments.map((segment) => (
                <li
                  key={`${segment.fromIndex}-${segment.toIndex}`}
                  className="flex flex-wrap items-center gap-2 text-xs"
                >
                  <Badge variant="outline" className={SENSE_BADGE[segment.sense]}>
                    {segment.symbol}
                  </Badge>
                  <span className="tabular-nums text-muted-foreground">
                    pente {formatSlope(segment.slope)}
                    {segment.slopeShift ? ` · ${segment.slopeShift}` : ""}
                    {segment.slopeHabit ? ` · ${segment.slopeHabit}` : ""}
                    {` · tirages ${segment.fromIndex + 1}–${segment.toIndex + 1}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">Corde</p>
          <div className="flex flex-wrap items-center gap-2">
            {named ? (
              ficheHref(named.symbol) ? (
                <Link href={ficheHref(named.symbol)!} className="inline-flex" title="Ouvrir la fiche">
                  <Badge variant="outline" className={SENSE_BADGE[named.sense]}>
                    {named.symbol}
                  </Badge>
                </Link>
              ) : (
                <Badge variant="outline" className={SENSE_BADGE[named.sense]}>
                  {named.symbol}
                </Badge>
              )
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
