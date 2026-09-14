"use client"

import { useCallback, useMemo, useState } from "react"

import { OverlayToggle } from "@/components/analysis/shared"
import { useRegisterCapture } from "@/components/capture"
import { HelpTip, LabelHelp, TitleHelp } from "@/components/help"
import { GlyphBoard } from "@/components/morpho/glyph-board"
import { ReliefCanvas } from "@/components/relief/relief-canvas"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { packRelief } from "@/lib/capture/pack"
import { INDEPENDENCE_DISCLAIMER } from "@/lib/capture/snapshot"
import { formatDrawDate, formatShortDate, takeLastDraws } from "@/lib/draws"
import {
  DEFAULT_CAMERA,
  HEIGHT_LABELS,
  HEIGHT_MODES,
  OFFSET_LABELS,
  OFFSET_MODES,
  PLAN_CAMERA,
  RELIEF_SAMPLES,
  STYLE_LABELS,
  VIEW_STYLES,
  buildStampMap,
  layoutDraws,
  layoutNote,
  recommendedOffset,
  type Camera,
  type HeightMode,
  type OffsetMode,
  type ReliefSample,
  type ViewStyle,
} from "@/lib/relief"
import { useDraws } from "@/lib/use-draws"

function homeCamera(style: ViewStyle): Camera {
  return style === "plan" ? PLAN_CAMERA : DEFAULT_CAMERA
}

export function ReliefLab() {
  const { draws: archive, source, loading } = useDraws("current")
  const [sample, setSample] = useState<ReliefSample>(20)
  const [offset, setOffset] = useState<OffsetMode>("hex")
  const [height, setHeight] = useState<HeightMode>("mixte")
  const [style, setStyle] = useState<ViewStyle>("plan")
  const [fusion, setFusion] = useState(0.4)
  const [yScale, setYScale] = useState(1.15)
  const [stars, setStars] = useState(false)
  const [labels, setLabels] = useState(true)
  const [autoRotate, setAutoRotate] = useState(false)
  const [camera, setCamera] = useState<Camera>(PLAN_CAMERA)
  const [hoverOwner, setHoverOwner] = useState<number | null>(null)

  const onCamera = useCallback((next: Camera | ((prev: Camera) => Camera)) => {
    setCamera((prev) => (typeof next === "function" ? next(prev) : next))
  }, [])

  const draws = useMemo(() => takeLastDraws(archive, sample), [archive, sample])
  const chronological = useMemo(
    () => [...draws].sort((a, b) => a.date.localeCompare(b.date)),
    [draws]
  )
  const recommended = recommendedOffset(chronological.length)
  const layout = useMemo(
    () =>
      layoutDraws(chronological, {
        mode: offset,
        height,
        fusion,
        stars,
      }),
    [chronological, fusion, height, offset, stars]
  )
  const map = useMemo(() => buildStampMap(layout), [layout])

  const hover = hoverOwner == null ? null : layout.anchors[hoverOwner] ?? null
  const from = chronological[0]?.date ?? null
  const to = chronological[chronological.length - 1]?.date ?? null
  const short = chronological.length < sample

  useRegisterCapture(() =>
    packRelief({
      source,
      sample,
      drawn: chronological.length,
      from,
      to,
      style,
      offset,
      height,
      fusion,
      yScale,
      stars,
      maxH: map.maxH,
      recommended: OFFSET_LABELS[recommended],
    })
  )

  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="h-[min(68vh,600px)] min-h-[380px]">
            {chronological.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Aucun tirage à cartographier.</p>
            ) : (
              <ReliefCanvas
                map={map}
                style={style}
                camera={camera}
                onCamera={onCamera}
                autoRotate={autoRotate}
                yScale={yScale}
                hoverOwner={hoverOwner}
                onHover={setHoverOwner}
                labels={labels}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <p className="px-1 text-sm leading-6 text-muted-foreground">
        <span className="text-foreground">Une plaque 5×10 = un tirage.</span> Les cinq
        cases colorées sont les cinq boules, à leur place Morpho (1 en haut à
        gauche, 50 en bas à droite). La couleur va de l’ancien au récent. Le
        cadre or est le dernier tirage.
      </p>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <LabelHelp
            label="Échantillon"
            help={{
              title: "Échantillon",
              body: "20 plaques se lisent une par une (numéros visibles). 50 donne la carte. 100 et 200 gardent la silhouette de chaque glyphe, plus compacte. Sans Neon, l’archive JSON de l’année peut être plus courte.",
            }}
          >
            <div className="flex flex-wrap gap-1">
              {RELIEF_SAMPLES.map((n) => (
                <Button
                  key={n}
                  type="button"
                  size="sm"
                  variant={sample === n ? "default" : "outline"}
                  aria-pressed={sample === n}
                  onClick={() => {
                    setSample(n)
                    const next = takeLastDraws(archive, n)
                    setOffset(recommendedOffset(next.length))
                    setCamera(homeCamera(style))
                    setLabels(n <= 50)
                  }}
                >
                  {n}
                </Button>
              ))}
            </div>
          </LabelHelp>
          <LabelHelp
            label="Décalage"
            help={{
              title: "Décalage entre tirages",
              body: "Sans décalage, toutes les plaques s’empilent (histogramme 1–50). Un décalage pose chaque glyphe à côté des autres. L’hexagone est le plus lisible à 20 ; l’angle d’or range 50+ sans trou.",
              wide: true,
            }}
          >
            <Select value={offset} onValueChange={(v) => setOffset(v as OffsetMode)}>
              <SelectTrigger className="w-full sm:w-64" aria-label="Décalage">
                <span className="flex flex-1 text-left">
                  {OFFSET_LABELS[offset]}
                  {offset === recommended ? " · recommandé" : ""}
                </span>
              </SelectTrigger>
              <SelectContent>
                {OFFSET_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {OFFSET_LABELS[mode]}
                    {mode === recommended ? " · recommandé" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabelHelp>
          <LabelHelp
            label="Lecture"
            help={{
              title: "Plan ou timbres 3D",
              body: "Plan : vue de dessus, chaque case est un carré numéroté — c’est la lecture. Timbres 3D : les cases sorties se soulèvent ; la couleur reste la même. Glisser fait tourner les deux.",
            }}
          >
            <Select
              value={style}
              onValueChange={(v) => {
                const next = v as ViewStyle
                setStyle(next)
                setCamera(homeCamera(next))
              }}
            >
              <SelectTrigger className="w-44" aria-label="Lecture">
                <span className="flex flex-1 text-left">{STYLE_LABELS[style]}</span>
              </SelectTrigger>
              <SelectContent>
                {VIEW_STYLES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {STYLE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabelHelp>
          <LabelHelp
            label="Couleur"
            help={{
              title: "Couleur",
              body: "Récence : les plaques récentes tirent vers l’or, les anciennes vers le bleu. Mixte (défaut) : surtout la récence. Valeur : une 50 est plus claire qu’une 1. Présence : toutes les cases sorties se valent.",
            }}
          >
            <Select value={height} onValueChange={(v) => setHeight(v as HeightMode)}>
              <SelectTrigger className="w-56" aria-label="Couleur">
                <span className="flex flex-1 text-left">{HEIGHT_LABELS[height]}</span>
              </SelectTrigger>
              <SelectContent>
                {HEIGHT_MODES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {HEIGHT_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabelHelp>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              Serrer les plaques
              <HelpTip
                title="Serrer"
                body="Écart entre les glyphes. Bas : chaque tirage est isolé. Haut : la carte se compacte, les plaques restent séparées (elles ne fusionnent plus en collines)."
              />
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={fusion}
              onChange={(event) => setFusion(Number(event.target.value))}
              aria-label="Serrer les plaques"
              className="accent-primary"
            />
          </label>
          {style === "timbres" ? (
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted-foreground">
              <span>Hauteur des cases</span>
              <input
                type="range"
                min={0.4}
                max={2.4}
                step={0.05}
                value={yScale}
                onChange={(event) => setYScale(Number(event.target.value))}
                aria-label="Hauteur des cases"
                className="accent-primary"
              />
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <OverlayToggle
              label="Numéros"
              on={labels}
              onClick={() => setLabels((v) => !v)}
              help={{
                title: "Numéros",
                body: "Écrit 1–50 dans les cases assez grandes. À 20 tirages c’est le mode de lecture. À 200, mieux vaut les masquer et survoler une plaque.",
              }}
            />
            <OverlayToggle
              label="Étoiles"
              on={stars}
              onClick={() => setStars((v) => !v)}
              help={{
                title: "Étoiles",
                body: "Ajoute les 2 étoiles sous la plaque 5×10. Elles restent secondaires : la lecture, c’est les cinq numéros.",
              }}
            />
            <OverlayToggle
              label="Rotation"
              on={autoRotate}
              onClick={() => setAutoRotate((v) => !v)}
              help={{
                title: "Rotation",
                body: "Fait tourner la carte. On peut aussi glisser, utiliser les flèches, ou le bouton 90°.",
              }}
            />
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {chronological.length
            ? `${chronological.length} tirages · ${from ? formatShortDate(from) : "?"} → ${to ? formatShortDate(to) : "?"} · source ${source}${loading ? " · Neon…" : ""}`
            : loading
              ? "Chargement des tirages…"
              : "Aucun tirage."}
          {!loading && short
            ? ` Échantillon ${sample} incomplet (archive ${chronological.length}).`
            : ""}
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              <TitleHelp
                help={{
                  title: "Pourquoi ce décalage",
                  body: "Une carte lisible, ce n’est pas fondre les glyphes : c’est les poser pour que chaque 5×10 reste un tirage, et que le voisinage ait un sens.",
                }}
              >
                Pourquoi ce décalage
              </TitleHelp>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm leading-6 text-muted-foreground">
            <p>{layoutNote(offset)}</p>
            {offset !== recommended ? (
              <p>
                Pour {chronological.length} tirages, le décalage le plus calme reste{" "}
                <button
                  type="button"
                  className="text-foreground underline underline-offset-2"
                  onClick={() => setOffset(recommended)}
                >
                  {OFFSET_LABELS[recommended]}
                </button>
                .
              </p>
            ) : (
              <p className="text-foreground">
                C’est le décalage recommandé pour cet échantillon.
              </p>
            )}
            <p className="text-xs">{INDEPENDENCE_DISCLAIMER}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              {hover ? formatDrawDate(hover.date) : "Tirage sous le curseur"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hover ? (
              <div className="flex flex-col gap-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {hover.weekday} · plaque {hover.drawIndex + 1} / {layout.anchors.length}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {hover.numbers.map((n) => (
                    <Badge key={`n-${n}`} variant="default">
                      {n}
                    </Badge>
                  ))}
                  {hover.stars.map((s) => (
                    <Badge key={`s-${s}`} variant="secondary">
                      ★ {s}
                    </Badge>
                  ))}
                </div>
                <GlyphBoard
                  numbers={hover.numbers}
                  stars={hover.stars}
                  labels
                  className="max-w-xs"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Survolez une plaque. Le dernier tirage a le cadre or.
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground tabular-nums">
              {map.stamps.length} plaque{map.stamps.length > 1 ? "s" : ""} · maille{" "}
              {map.cell.toFixed(2)}
              {map.aggregated ? " · histogramme 5×10" : ""}
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
