"use client"

import { Pencil, Trash2, Undo2, X } from "lucide-react"

import { HelpTip, LabelHelp } from "@/components/help"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { catalog, FIGURE_LABELS, type FigureId } from "@/lib/chartisme/catalog"
import { FREE_FIGURE, remapSketch, type ChartSketch } from "@/lib/chart-draw"
import { cn } from "@/lib/utils"

const DRAW_HELP = {
  title: "Dessin libre",
  wide: true,
  body: `Pose une figure de la table (ou un segment libre) sur la courbe d’évolution.

1. Choisis la figure et la série visée.
2. Clique un départ : près de la courbe, l’aimant accroche le tirage le plus proche, et un pivot de swing s’il est tout près.
3. Clique l’arrivée, même règle.
4. Le gabarit est étiré sur cette fenêtre. Les coordonnées vivent dans l’espace des données : un changement de période les recale par date.

La fenêtre flottante affiche date, indice, valeur et aimant. Capture : le tracé est dans le visuel, les ancres partent dans le JSON pour l’IA. Ce n’est pas un signal de jeu.`,
}

export function SketchToolbar({
  drawing,
  figure,
  seriesKey,
  seriesOptions,
  sketches,
  dates,
  canUndo,
  onToggle,
  onFigure,
  onSeries,
  onCancel,
  onClear,
  onRemove,
}: {
  drawing: boolean
  figure: string
  seriesKey: string
  seriesOptions: { value: string; label: string }[]
  sketches: ChartSketch[]
  dates: string[]
  canUndo: boolean
  onToggle: () => void
  onFigure: (figure: string) => void
  onSeries: (key: string) => void
  onCancel: () => void
  onClear: () => void
  onRemove: (id: string) => void
}) {
  const figureLabel =
    figure === FREE_FIGURE ? "Segment libre" : FIGURE_LABELS[figure as FigureId] ?? figure
  const visible = sketches.filter((sketch) => remapSketch(sketch, dates))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="inline-flex items-center gap-1">
          <button
            type="button"
            aria-pressed={drawing}
            onClick={onToggle}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
              drawing
                ? "border-sky-400/50 bg-sky-400/15 text-sky-100"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <Pencil className="size-3.5" />
            Dessin libre
          </button>
          <HelpTip {...DRAW_HELP} />
        </span>
        {drawing ? (
          <>
            <LabelHelp
              label="Figure"
              help={{
                title: "Figure chartiste",
                body: "Les 17 formes de la table, ou un segment libre qui souligne simplement la courbe entre les deux ancres.",
              }}
            >
              <Select value={figure} onValueChange={(value) => value && onFigure(value)}>
                <SelectTrigger className="h-7 w-44 px-2 text-xs" aria-label="Figure chartiste">
                  <span className="flex flex-1 text-left">{figureLabel}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FREE_FIGURE}>Segment libre</SelectItem>
                  {catalog().map((item) => (
                    <SelectItem key={item.figure} value={item.figure}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>
            {seriesOptions.length > 1 ? (
              <LabelHelp
                label="Courbe"
                help={{
                  title: "Courbe visée",
                  body: "L’aimant accroche cette série. Prévu pour poser la même annotation plus tard sur forme, pair/impair, analyse.",
                }}
              >
                <Select value={seriesKey} onValueChange={(value) => value && onSeries(value)}>
                  <SelectTrigger className="h-7 w-40 px-2 text-xs" aria-label="Courbe visée">
                    <span className="flex flex-1 text-left">
                      {seriesOptions.find((item) => item.value === seriesKey)?.label ?? seriesKey}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {seriesOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </LabelHelp>
            ) : null}
            <Button type="button" size="xs" variant="ghost" onClick={onCancel} disabled={!canUndo}>
              <Undo2 />
              Annuler
            </Button>
          </>
        ) : null}
        {sketches.length > 0 ? (
          <Button type="button" size="xs" variant="ghost" onClick={onClear}>
            <Trash2 />
            Effacer
          </Button>
        ) : null}
      </div>
      {visible.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {visible.map((sketch) => (
            <li key={sketch.id}>
              <Badge variant="outline" className="gap-1 pr-1">
                {sketch.figure === FREE_FIGURE
                  ? "Libre"
                  : FIGURE_LABELS[sketch.figure as FigureId] ?? sketch.figure}
                <span className="text-muted-foreground">· {sketch.seriesLabel}</span>
                <button
                  type="button"
                  className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="Retirer l’annotation"
                  onClick={() => onRemove(sketch.id)}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
