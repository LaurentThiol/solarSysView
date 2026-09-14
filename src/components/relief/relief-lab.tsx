"use client"

import { useCallback, useMemo, useState } from "react"

import { OverlayToggle } from "@/components/analysis/shared"
import { useRegisterCapture } from "@/components/capture"
import { HelpTip, LabelHelp, TitleHelp } from "@/components/help"
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
  crestStrips,
  DEFAULT_CAMERA,
  HEIGHT_LABELS,
  HEIGHT_MODES,
  OFFSET_LABELS,
  OFFSET_MODES,
  RELIEF_SAMPLES,
  STYLE_LABELS,
  VIEW_STYLES,
  layoutDraws,
  layoutNote,
  rasterizePeaks,
  recommendedOffset,
  type Camera,
  type HeightMode,
  type OffsetMode,
  type ReliefSample,
  type ViewStyle,
} from "@/lib/relief"
import { useDraws } from "@/lib/use-draws"

export function ReliefLab() {
  const { draws: archive, source, loading } = useDraws("current")
  const [sample, setSample] = useState<ReliefSample>(50)
  const [offset, setOffset] = useState<OffsetMode>("or")
  const [height, setHeight] = useState<HeightMode>("mixte")
  const [style, setStyle] = useState<ViewStyle>("relief")
  const [fusion, setFusion] = useState(0.58)
  const [yScale, setYScale] = useState(1.15)
  const [stars, setStars] = useState(false)
  const [contours, setContours] = useState(true)
  const [wire, setWire] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA)
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
  const field = useMemo(() => {
    if (style !== "relief") return null
    return rasterizePeaks(layout.peaks, layout.anchors, fusion, offset === "superpose")
  }, [fusion, layout, offset, style])
  const quads = useMemo(() => {
    if (style !== "cretes") return []
    const connected =
      layout.anchors.length >= 2 &&
      (offset === "temps" || offset === "hilbert" || offset === "superpose")
    return crestStrips(layout.anchors, height, yScale, connected)
  }, [height, layout.anchors, offset, style, yScale])

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
      maxH: field?.maxH ?? 0,
      recommended: OFFSET_LABELS[recommended],
    })
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <LabelHelp
            label="Échantillon"
            help={{
              title: "Échantillon",
              body: "Les 20, 50, 100 ou 200 derniers tirages de la formule actuelle. 50 tient sur un coup d’œil ; 200 commence à faire continent. Sans Neon, l’archive JSON de l’année peut être plus courte.",
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
                  onClick={() => setSample(n)}
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
              body: "Sans décalage, tous les glyphes 5×10 s’empilent au même endroit (histogramme). Un décalage pose chaque tirage à côté des autres pour former une carte. L’angle d’or est le plus homogène ; Hilbert garde le voisinage temporel ; l’hexagone est le plus lisible à 20 tirages.",
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
              title: "Relief ou crêtes",
              body: "Relief : chaque boule est une colline lissée, les îlots fusionnent. Crêtes : le profil n1→n5 de chaque tirage, en ruban (ou en nappe temps × rang si le décalage est temporel / Hilbert).",
            }}
          >
            <Select value={style} onValueChange={(v) => setStyle(v as ViewStyle)}>
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
            label="Hauteur"
            help={{
              title: "Hauteur",
              body: "Présence : chaque boule vaut 1. Récence : les tirages récents sont plus hauts. Valeur : une 50 est un pic, une 1 une butte. Mixte (défaut) : présence pondérée par la récence et la valeur — le présent forme les sommets sans effacer le passé.",
            }}
          >
            <Select value={height} onValueChange={(v) => setHeight(v as HeightMode)}>
              <SelectTrigger className="w-56" aria-label="Hauteur">
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
              Fusion des îlots
              <HelpTip
                title="Fusion"
                body="Écart entre origines vs taille du glyphe 5×10, plus le lissage gaussien. Bas : archipel. Haut : une seule carte continue. Vers 0,55–0,65 les voisins se touchent sans se noyer."
              />
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={fusion}
              onChange={(event) => setFusion(Number(event.target.value))}
              aria-label="Fusion des îlots"
              className="accent-primary"
            />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted-foreground">
            <span>Exagération du relief</span>
            <input
              type="range"
              min={0.4}
              max={2.4}
              step={0.05}
              value={yScale}
              onChange={(event) => setYScale(Number(event.target.value))}
              aria-label="Exagération du relief"
              className="accent-primary"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <OverlayToggle
              label="Isohypses"
              on={contours}
              onClick={() => setContours((v) => !v)}
              help={{
                title: "Isohypses",
                body: "Courbes de niveau, comme sur une carte d’état-major. Elles se lisent surtout en relief, pas sur les crêtes.",
              }}
            />
            <OverlayToggle
              label="Fil de fer"
              on={wire}
              onClick={() => setWire((v) => !v)}
              help={{
                title: "Fil de fer",
                body: "Trace les facettes. Utile pour juger le lissage, moins joli en carte.",
              }}
            />
            <OverlayToggle
              label="Étoiles"
              on={stars}
              onClick={() => setStars((v) => !v)}
              help={{
                title: "Étoiles",
                body: "Ajoute les 2 étoiles en petites collines sous le glyphe 5×10. Elles pèsent moins que les numéros.",
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
          {loading ? "Chargement des tirages…" : null}
          {!loading && short
            ? `Archive disponible : ${chronological.length} tirages (échantillon ${sample} incomplet sans Neon).`
            : null}
          {!loading && !short
            ? `${chronological.length} tirages · ${from ? formatShortDate(from) : "?"} → ${to ? formatShortDate(to) : "?"} · source ${source}`
            : null}
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="text-base font-medium">
            <TitleHelp
              help={{
                title: "Carte 3D",
                body: "Chaque tirage est le glyphe Morpho 5×10. La couleur suit la hauteur (teinte hypsométrique). Le point or marque le tirage le plus récent. Survoler un point affiche la grille.",
              }}
            >
              Carte 3D
            </TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[min(72vh,640px)] min-h-[420px]">
            {chronological.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Aucun tirage à cartographier.</p>
            ) : (
              <ReliefCanvas
                field={style === "relief" ? field : null}
                quads={quads}
                anchors={layout.anchors}
                camera={camera}
                onCamera={onCamera}
                autoRotate={autoRotate}
                contours={style === "relief" && contours}
                wire={wire}
                yScale={yScale}
                hoverOwner={hoverOwner}
                onHover={setHoverOwner}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              <TitleHelp
                help={{
                  title: "Pourquoi ce décalage",
                  body: "Une carte cohérente, ce n’est pas empiler plus haut : c’est placer les tirages pour que le voisinage visuel ait un sens (densité uniforme, temps, ou morphologie).",
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
              <div className="flex flex-col gap-2 text-sm">
                <p className="text-xs text-muted-foreground">
                  {hover.weekday} · n° {hover.drawIndex + 1} / {layout.anchors.length}
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
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Survolez un point or ou blanc sur la carte. Le plus récent est toujours en or.
              </p>
            )}
            {field ? (
              <p className="mt-3 text-xs text-muted-foreground tabular-nums">
                Sommet {field.maxH.toFixed(2)} · fusion {fusion.toFixed(2)} · maille {field.cols}×
                {field.rows}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
