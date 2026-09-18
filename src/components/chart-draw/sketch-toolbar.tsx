"use client"

import { Pencil, Trash2, Undo2, X } from "lucide-react"

import { FigureName, FigureThumb } from "@/components/chartisme/figure-thumb"
import { CurveName } from "@/components/chartisme/curve-thumb"
import { HelpTip, LabelHelp } from "@/components/help"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { catalog, isRailFigure, labelOf } from "@/lib/chartisme/catalog"
import { FREE_FIGURE, channelLabel, remapSketch, type ChartSketch } from "@/lib/chart-draw"
import { cn } from "@/lib/utils"

const DRAW_HELP = {
  title: "Dessin libre",
  wide: true,
  body: `Pose une figure de la table (ou un segment libre) sur la courbe d’évolution.

1. Choisis la figure et la série visée.
2. Figures à rails (rectangle, canal, triangles, biseaux, broadening) : trois clics. Les deux premiers ferment la première borne ; le troisième pose le contact opposé — parallèle pour le canal / rectangle, contrainte de figure pour les triangles. L’aimant privilégie les pivots de touche (H pour la borne haute, L pour la basse).
3. Les autres figures : deux clics. Près de la courbe, l’aimant accroche le tirage le plus proche. Un pivot de swing est seulement étiqueté (aimant · pivot) : il n’avale plus le voisin.
4. Alt (⌥ Option) lâche l’aimant à l’arrivée : l’abscisse reste un tirage, l’ordonnée suit le curseur. Le gabarit d’école reste pour ETE, tasse, diamant ; sur les rails on dessine deux droites, la hauteur et l’objectif, pas le zigzag. Case Médiane : parallèle à mi-distance. Canal haussier / baissier = pente des bornes, pas une seconde classe.
5. Un trait déjà posé : clique ou glisse un rond (départ, second point de borne, ou arrivée) pour le reprendre, puis reclique pour le reposer. Même aimant ; Alt sur l’arrivée seulement. Échap ou Annuler rend le point à sa place.

Le bandeau Coordonnées, sous cette barre, affiche date, indice, valeur et aimant — pas par-dessus la courbe. Tu peux le détacher et le glisser hors du graphique. Capture : rails, hauteur, objectif et touches partent dans le JSON. Ce n’est pas un signal de jeu.`,
}

export function SketchToolbar({
  drawing,
  figure,
  seriesKey,
  seriesOptions,
  sketches,
  dates,
  canUndo,
  showMedian = true,
  onShowMedian,
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
  showMedian?: boolean
  onShowMedian?: (value: boolean) => void
  onToggle: () => void
  onFigure: (figure: string) => void
  onSeries: (key: string) => void
  onCancel: () => void
  onClear: () => void
  onRemove: (id: string) => void
}) {
  const figureLabel =
    figure === FREE_FIGURE ? "Segment libre" : labelOf(figure)
  const rails = isRailFigure(figure)
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
                body: "Les 18 formes de la table, ou un segment libre. Rectangle, canal, triangles et biseaux se posent en trois clics (une borne, puis le contact opposé). Alt (⌥) démagnétise l’arrivée pour poser hors courbe. Après pose, un clic ou un glisser sur un rond reprend ce point. Le canal n’est pas une courbe : deux rails autour de la série. Haussier / baissier = pente des bornes, une seule classe.",
              }}
            >
              <Select value={figure} onValueChange={(value) => value && onFigure(value)}>
                <SelectTrigger className="h-7 w-56 px-2 text-xs" aria-label="Figure chartiste">
                  <span className="flex flex-1 text-left">
                    <FigureName figure={figure} label={figureLabel} />
                  </span>
                </SelectTrigger>
                <SelectContent className="min-w-56">
                  <SelectItem value={FREE_FIGURE}>
                    <FigureName figure={FREE_FIGURE} label="Segment libre" />
                  </SelectItem>
                  {catalog().map((item) => (
                    <SelectItem key={item.figure} value={item.figure}>
                      <FigureName figure={item.figure} label={item.label} />
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
                  <SelectTrigger className="h-7 w-48 px-2 text-xs" aria-label="Courbe visée">
                    <span className="flex flex-1 text-left">
                      <CurveName
                        kind={seriesKey}
                        label={
                          seriesOptions.find((item) => item.value === seriesKey)?.label ?? seriesKey
                        }
                      />
                    </span>
                  </SelectTrigger>
                  <SelectContent className="min-w-52">
                    {seriesOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        <CurveName kind={item.value} label={item.label} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </LabelHelp>
            ) : null}
            {rails && onShowMedian ? (
              <button
                type="button"
                aria-pressed={showMedian}
                onClick={() => onShowMedian(!showMedian)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  showMedian
                    ? "border-sky-400/50 bg-sky-400/15 text-sky-100"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                Médiane
              </button>
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
                <FigureThumb figure={sketch.figure} />
                {sketch.figure === FREE_FIGURE
                  ? "Libre"
                  : channelLabel(sketch.figure, sketch.band)}
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
