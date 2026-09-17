"use client"

import { useMemo, useRef, useState } from "react"

import { LabelHelp, TitleHelp } from "@/components/help"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { FIGURE_IDS, labelOf } from "@/lib/chartisme/catalog"
import type { Curve } from "@/lib/chartisme/curves"
import { bestFigure } from "@/lib/chartisme/figures"
import { buildIndex, search, sketchToValues, type Match } from "@/lib/chartisme/retrieval"
import { MIN_WINDOW, windowsOf } from "@/lib/chartisme/scan"
import { synthCurve } from "@/lib/chartisme/sketch-shapes"

const WIDTH = 560
const HEIGHT = 180

type Point = [number, number]

export function Sketchpad({
  curve,
  era,
}: {
  curve: Curve | null
  era: "current" | "all"
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [points, setPoints] = useState<Point[]>([])
  const [drawing, setDrawing] = useState(false)
  const [scope, setScope] = useState<"curve" | "all">("curve")
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [source, setSource] = useState<string | null>(null)

  const values = useMemo(() => sketchToValues(points), [points])

  // Ce que les détecteurs lisent dans le croquis : utile pour vérifier qu'on
  // dessine bien la figure qu'on croit dessiner.
  const reading = useMemo(() => {
    if (values.length < 8) return null
    return bestFigure(values)
  }, [values])

  function at(event: React.PointerEvent<SVGSVGElement>): Point {
    const svg = svgRef.current
    if (!svg) return [0, 0]
    const box = svg.getBoundingClientRect()
    return [
      ((event.clientX - box.left) / box.width) * WIDTH,
      ((event.clientY - box.top) / box.height) * HEIGHT,
    ]
  }

  async function runSearch() {
    if (values.length < 8) return
    setSearching(true)
    setMatches(null)
    // Le backend balaie tout le bundle ; sans lui on cherche dans la courbe
    // affichée, ce qui reste le cas d'usage le plus fréquent.
    try {
      const response = await fetch("/api/chartisme/similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values,
          era,
          curve: scope === "curve" ? curve?.id ?? null : null,
          top: 12,
        }),
      })
      if (response.ok) {
        const payload = (await response.json()) as { matches?: Match[]; searched?: number }
        setMatches(payload.matches ?? [])
        setSource(`backend · ${payload.searched ?? 0} fenêtres`)
        setSearching(false)
        return
      }
    } catch {
      // on retombe sur la recherche locale
    }
    // Fenêtres de 60 tirages, ou la courbe entière si la fenêtre d'étude est
    // plus courte : sinon l'index sort vide et la recherche semble muette.
    const size = curve ? Math.min(60, curve.values.length) : 0
    if (curve && size >= MIN_WINDOW) {
      const windows = windowsOf([curve], {
        size,
        stride: Math.max(2, Math.trunc(size / 6)),
        limit: 1200,
      })
      const index = buildIndex(windows)
      setMatches(search(values, index, { top: 12 }))
      setSource(`navigateur · ${index.length} fenêtres`)
    } else {
      setMatches([])
      setSource(null)
    }
    setSearching(false)
  }

  function loadShape(figure: string) {
    const series = synthCurve(figure)
    if (!series.length) return
    const low = Math.min(...series)
    const high = Math.max(...series)
    const span = high - low || 1
    setPoints(
      series.map((value, index) => [
        (index / (series.length - 1)) * WIDTH,
        HEIGHT - ((value - low) / span) * (HEIGHT - 20) - 10,
      ])
    )
    setMatches(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <TitleHelp
            help={{
              title: "Bloc-croquis",
              body: "Dessine la forme que tu cherches, l'outil remonte les fenêtres de l'archive qui lui ressemblent. L'appariement temporel élastique compare des formes, pas des niveaux ni des durées : il fonctionne dès le premier croquis, sans aucun poids appris.",
            }}
          >
            Bloc-croquis · recherche par ressemblance
          </TitleHelp>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="min-w-0">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label="Zone de croquis"
            className="h-auto w-full max-w-full touch-none rounded-lg border border-border bg-muted/20"
            onPointerDown={(event) => {
              setDrawing(true)
              setPoints([at(event)])
              setMatches(null)
            }}
            onPointerMove={(event) => {
              if (!drawing) return
              setPoints((current) => [...current, at(event)])
            }}
            onPointerUp={() => setDrawing(false)}
            onPointerLeave={() => setDrawing(false)}
          >
            {points.length > 1 ? (
              <polyline
                points={points.map(([x, y]) => `${x},${y}`).join(" ")}
                fill="none"
                stroke="var(--chart-1)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : (
              <text
                x={WIDTH / 2}
                y={HEIGHT / 2}
                textAnchor="middle"
                className="fill-muted-foreground text-xs"
              >
                dessine une forme à la souris
              </text>
            )}
          </svg>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <LabelHelp
            label="Charger une figure de la table"
            help={{
              title: "Gabarit",
              body: "Plutôt que de dessiner, pose le gabarit théorique d'une des 17 figures puis lance la recherche : tu vois immédiatement à quoi la forme ressemble dans l'archive réelle.",
            }}
          >
            <Select value="" onValueChange={(v) => v && loadShape(v)}>
              <SelectTrigger className="w-full" aria-label="Charger une figure de la table">
                <span className="flex flex-1 text-left text-muted-foreground">
                  choisir une figure…
                </span>
              </SelectTrigger>
              <SelectContent>
                {FIGURE_IDS.filter((id) => id !== "none").map((id) => (
                  <SelectItem key={id} value={id}>
                    {labelOf(id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabelHelp>

          <LabelHelp
            label="Périmètre"
            help={{
              title: "Périmètre de recherche",
              body: "La courbe affichée seule, ou toutes les courbes exportées. Le second cas demande le backend Python : l'appariement élastique est quadratique et l'index complet dépasse ce que le navigateur tient en une seconde.",
            }}
          >
            <Select value={scope} onValueChange={(value) => setScope(value as "curve" | "all")}>
              <SelectTrigger className="w-full" aria-label="Périmètre de recherche">
                <span className="flex flex-1 text-left">
                  {scope === "curve" ? "Courbe affichée" : "Toutes les courbes"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="curve">Courbe affichée</SelectItem>
                <SelectItem value="all">Toutes les courbes</SelectItem>
              </SelectContent>
            </Select>
          </LabelHelp>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void runSearch()} disabled={values.length < 8}>
            {searching ? "Recherche…" : "Chercher les formes semblables"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPoints([])}>
            Effacer
          </Button>
          {reading ? (
            <Badge variant="secondary">
              lecture du croquis : {reading.label} ({reading.confidence.toFixed(2)})
            </Badge>
          ) : null}
          {source ? <span className="text-xs text-muted-foreground">{source}</span> : null}
        </div>

        {matches ? (
          matches.length ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium">
                {matches.length} fenêtres les plus proches
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {matches.map((match, index) => (
                  <li key={`${match.curve_id}-${match.from_index}-${index}`}>
                    <span className="font-mono">{match.similarity.toFixed(3)}</span> ·{" "}
                    {String(match.label ?? match.curve_id ?? "?")} · {String(match.from ?? "")} →{" "}
                    {String(match.to ?? "")}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                La similarité est une lecture commode de la distance, pas une
                probabilité. Deux fenêtres très proches sur une marche aléatoire
                ne disent rien de plus que le hasard.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Aucune fenêtre comparable — le croquis est peut-être trop court.
            </p>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}
