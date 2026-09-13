"use client"

import { useCallback, useRef, useState } from "react"

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
import type { AnalysisDraw } from "@/lib/analysis"
import {
  MAX_THRESHOLD,
  baseRateAbove,
  sampleBaseRate,
  thresholdForBaseRate,
} from "@/lib/chartisme/base-rate"
import { buildCurve, curveId, curveLabel, type CurveSpec } from "@/lib/chartisme/curves"
import { scanCurve } from "@/lib/chartisme/scan"
import { liveInWindow } from "@/lib/chartisme/window"

/**
 * Carte des courbes : où le chartisme a une chance, où il n'en a aucune.
 *
 * Le sélecteur de courbe propose 142 entrées sans rien en dire, et l'onglet
 * n'avertissait qu'après coup, une fois la courbe choisie et le tracé affiché.
 * Or le taux de base répond à la question avant : sur « paires consécutives »,
 * presque toutes les fenêtres de bruit portent une figure, donc aucun seuil
 * atteignable n'y sépare l'observation du hasard — la courbe est illisible, pas
 * seulement bavarde. Autant le mesurer une fois et le dire.
 *
 * La carte n'écarte rien : elle classe. C'est un choix — une courbe hors
 * d'atteinte peut se regarder pour autre chose que ses figures, et l'onglet n'a
 * pas à décider ce qu'on cherche.
 */

/** Assez pour trancher « bruité » de « lisible », pas pour classer deux voisines. */
const TRIALS = 60

const TARGETS = [0.05, 0.1, 0.2, 0.3, 0.5]

/** Seuil de référence de la colonne « bruit » : celui que l'onglet posait avant. */
const REFERENCE_BAR = 0.6

type Row = {
  id: string
  label: string
  /** Seuil qu'il faudrait, même quand il dépasse ce qu'un seuil peut faire. */
  required: number
  /** Le même, ou `null` quand la rareté visée est hors d'atteinte. */
  threshold: number | null
  /** Ce que ce seuil obtient vraiment : le pas de 0.01 ne tombe jamais pile. */
  achieved: number
  /**
   * Part des fenêtres de bruit porteuses au seuil qui servait de réglage par
   * défaut. C'est la colonne qui montre le problème plutôt que de l'énoncer : à
   * 0.60, presque toutes les fenêtres de bruit portent une figure sur certaines
   * courbes et un peu plus de la moitié sur d'autres — le même nombre, deux
   * degrés de rareté.
   */
  noise: number
  /** Figures réelles qui survivent à ce seuil dans la fenêtre étudiée. */
  figures: number | null
}

export function CurveMap({
  draws,
  specs,
  scales,
  contextCount,
  target,
  onTarget,
  curveId: current,
  onPick,
  stateKey,
}: {
  draws: AnalysisDraw[]
  specs: CurveSpec[]
  /** Échelles balayées par l'onglet : la carte mesure à la plus longue. */
  scales: number[]
  contextCount: number
  target: number
  onTarget: (value: number) => void
  curveId: string
  onPick: (id: string) => void
  /** Réglages dont dépend la mesure : elle devient périmée quand il change. */
  stateKey: string
}) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [measuredKey, setMeasuredKey] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [onlyCarrying, setOnlyCarrying] = useState(false)
  const cancelled = useRef(false)

  const length = scales.length ? Math.max(...scales) : 0

  const measure = useCallback(async () => {
    if (!draws.length || !length) return
    cancelled.current = false
    setProgress(0)
    const found: Row[] = []
    for (const [index, spec] of specs.entries()) {
      if (cancelled.current) break
      const sample = sampleBaseRate(draws, spec.variable, spec.n, length, { trials: TRIALS })
      const inverted = thresholdForBaseRate(sample, target)
      // Le nombre de figures réelles décide de la lecture autant que le seuil :
      // une courbe qui atteint la rareté visée mais ne porte plus rien à ce
      // seuil-là est lisible en principe et muette en fait.
      let figures: number | null = null
      if (inverted.threshold !== null) {
        const curve = buildCurve(draws, spec.variable, spec.n)
        figures = scanCurve(curve, {
          scales: [length],
          minConfidence: inverted.threshold,
        }).filter((hit) => liveInWindow(hit, contextCount)).length
      }
      found.push({
        id: curveId(spec.variable, spec.n),
        label: curveLabel(spec.variable, spec.n),
        required: inverted.required,
        threshold: inverted.threshold,
        achieved: inverted.achieved,
        noise: baseRateAbove(sample, REFERENCE_BAR).carrying,
        figures,
      })
      // Une pause par courbe : sans elle le navigateur ne repeint pas et la
      // progression n'existe que dans le code.
      setProgress(index + 1)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    if (cancelled.current) {
      setProgress(null)
      return
    }
    // Le seuil requis le plus bas d'abord : c'est la courbe où une figure coûte
    // le moins cher à rendre significative. Les hors d'atteinte ferment la liste.
    found.sort((a, b) => a.required - b.required || (b.figures ?? -1) - (a.figures ?? -1))
    setRows(found)
    setMeasuredKey(stateKey)
    setProgress(null)
  }, [contextCount, draws, length, specs, stateKey, target])

  const stale = rows !== null && measuredKey !== stateKey
  const reachable = rows?.filter((row) => row.threshold !== null) ?? []
  const carrying = reachable.filter((row) => (row.figures ?? 0) > 0)
  const shown = onlyCarrying ? carrying : rows ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          <TitleHelp
            help={{
              title: "Carte des courbes",
              body: `Le taux de base répond avant le tracé : sur une courbe où presque toutes les fenêtres de bruit portent une figure, aucun seuil atteignable ne sépare l'observation du hasard. La carte mesure les ${specs.length} courbes une fois et les classe par le seuil qu'il leur faudrait pour tenir la rareté visée. Le bruit est fait des mêmes tirages remis dans un ordre quelconque, ${TRIALS} fois par courbe, à l'échelle la plus longue balayée — la moins flatteuse, puisqu'une fenêtre longue offre plus de pivots donc plus d'occasions qu'une figure s'ajuste. « Hors d'atteinte » signifie qu'il faudrait dépasser ${MAX_THRESHOLD.toFixed(
                2
              )}, où un seuil rejette le bruit et la figure ensemble. Rien n'est écarté : une courbe illisible pour ses figures peut se regarder pour autre chose.`,
            }}
          >
            Carte des courbes — où une figure veut dire quelque chose
          </TitleHelp>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <LabelHelp
            label="Rareté visée"
            help={{
              title: "Rareté visée",
              body: "La part des fenêtres de bruit qu'on accepte de voir porter une figure. Le même réglage que le curseur de l'onglet : le changer ici le change là-bas, et la carte comme le tracé s'y rapportent.",
            }}
          >
            <Select
              value={String(target)}
              onValueChange={(v) => onTarget(Number(v ?? target))}
            >
              <SelectTrigger className="w-40" aria-label="Rareté visée">
                <span className="flex flex-1 text-left">{Math.round(target * 100)} %</span>
              </SelectTrigger>
              <SelectContent>
                {TARGETS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {Math.round(value * 100)} %
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabelHelp>

          {progress === null ? (
            <Button size="sm" variant="outline" onClick={() => void measure()} disabled={!length}>
              {rows ? "Remesurer" : `Mesurer les ${specs.length} courbes`}
            </Button>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">
                {progress} / {specs.length} courbes mesurées…
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  cancelled.current = true
                }}
              >
                Arrêter
              </Button>
            </>
          )}
          {rows ? (
            <Button
              size="sm"
              variant={onlyCarrying ? "default" : "outline"}
              onClick={() => setOnlyCarrying((v) => !v)}
            >
              {onlyCarrying ? "Toutes" : "Seulement celles qui portent"}
            </Button>
          ) : null}
        </div>

        {!length ? (
          <p className="text-sm text-muted-foreground">
            Aucune échelle balayée : rien à mesurer. Élargis la fenêtre d’étude.
          </p>
        ) : null}

        {rows ? (
          <>
            <p className="text-sm text-muted-foreground">
              {reachable.length} courbe{reachable.length > 1 ? "s" : ""} sur {rows.length}{" "}
              atteignent {Math.round(target * 100)} % à l’échelle {length}, dont{" "}
              {carrying.length} porte{carrying.length > 1 ? "nt" : ""} au moins une figure dans
              cette fenêtre. Les {rows.length - reachable.length} autres sont trop bruitées pour
              qu’un seuil lisible y sépare une figure du hasard.
              {stale
                ? " Mesure faite sur d’autres réglages — la fenêtre, l’échelle ou la rareté ont changé depuis."
                : ""}
            </p>
            <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr>
                    <th className="px-3 py-2 font-medium">Courbe</th>
                    <th className="px-3 py-2 font-medium">Bruit à {REFERENCE_BAR.toFixed(2)}</th>
                    <th className="px-3 py-2 font-medium">Seuil requis</th>
                    <th className="px-3 py-2 font-medium">Obtenu</th>
                    <th className="px-3 py-2 font-medium">Figures</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr
                      key={row.id}
                      className={`cursor-pointer border-t border-border hover:bg-muted/50 ${
                        row.id === current ? "bg-muted" : ""
                      } ${row.threshold === null ? "text-muted-foreground" : ""}`}
                      onClick={() => onPick(row.id)}
                    >
                      <td className="px-3 py-1.5">{row.label}</td>
                      <td className="px-3 py-1.5">{Math.round(row.noise * 100)} %</td>
                      <td className="px-3 py-1.5">
                        {row.threshold === null ? (
                          <Badge variant="outline">hors d’atteinte</Badge>
                        ) : (
                          row.threshold.toFixed(2)
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {row.threshold === null ? "—" : `${Math.round(row.achieved * 100)} %`}
                      </td>
                      <td className="px-3 py-1.5">
                        {row.figures === null ? "—" : row.figures}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : progress === null ? (
          <p className="text-sm text-muted-foreground">
            Non mesurée. Le calcul tient dans le navigateur — {specs.length} courbes ×{" "}
            {TRIALS} remaniements — et dure quelques dizaines de secondes.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
