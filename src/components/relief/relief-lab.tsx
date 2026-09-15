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
  MARKER_LABELS,
  MARKER_STYLES,
  OFFSET_LABELS,
  OFFSET_MODES,
  RANK_LABELS,
  RANK_RGB,
  RELIEF_SAMPLES,
  STYLE_LABELS,
  VIEW_STYLES,
  buildProfiles,
  homeCamera,
  layoutDraws,
  layoutNote,
  profileBounds,
  recommendedMarker,
  recommendedOffset,
  rgbCssOf,
  type Camera,
  type MarkerStyle,
  type OffsetMode,
  type ReliefSample,
  type ViewStyle,
} from "@/lib/relief"
import { useDraws } from "@/lib/use-draws"

export function ReliefLab() {
  const { draws: archive, source, loading } = useDraws("current")
  const [sample, setSample] = useState<ReliefSample>(20)
  const [offset, setOffset] = useState<OffsetMode>("temps")
  const [style, setStyle] = useState<ViewStyle>("scene")
  const [marker, setMarker] = useState<MarkerStyle>("boule")
  const [fusion, setFusion] = useState(0.42)
  const [yScale, setYScale] = useState(1.15)
  const [stars, setStars] = useState(false)
  const [labels, setLabels] = useState(true)
  const [rankTime, setRankTime] = useState(false)
  const [stems, setStems] = useState(true)
  const [autoRotate, setAutoRotate] = useState(false)
  const [camera, setCamera] = useState<Camera>(() => homeCamera("scene", 20))
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
        height: "valeur",
        fusion,
        stars,
      }),
    [chronological, fusion, offset, stars]
  )
  const map = useMemo(() => buildProfiles(layout), [layout])
  const bounds = useMemo(() => profileBounds(map, stars), [map, stars])

  const hover = hoverOwner == null ? null : (map.profiles[hoverOwner] ?? null)
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
      height: "valeur 1–50 (n1→n5)",
      fusion,
      yScale,
      stars,
      rankTime,
      stems,
      marker,
      maxH: bounds.maxY * yScale,
      recommended: OFFSET_LABELS[recommended],
    })
  )

  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="h-[min(68vh,600px)] min-h-[380px]">
            {chronological.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Aucun tirage à tracer.</p>
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
                stars={stars}
                rankTime={rankTime}
                stems={stems}
                marker={marker}
                home={homeCamera(style, chronological.length || sample)}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <p className="px-1 text-sm leading-6 text-muted-foreground">
        <span className="text-foreground">Un trait = un tirage.</span> Les cinq
        points sont les statistiques d’ordre <span className="text-foreground">n1→n5</span>{" "}
        (plus petite boule → plus grande), pas l’ordre de sortie. La hauteur est
        la valeur 1–50. Un calque optionnel relie les mêmes rangs dans le temps
        (comme Évolution). Le glyphe 5×10 reste l’onglet Morpho.
      </p>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <LabelHelp
            label="Échantillon"
            help={{
              title: "Échantillon",
              body: "20 lignes se lisent une par une. 50 donne le faisceau. 100 et 200 cadrent les tirages récents de plus près (molette pour zoomer, Maj+glisser pour déplacer). Sans Neon, l’archive JSON de l’année peut être plus courte.",
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
                    setCamera(homeCamera(style, next.length || n))
                    setLabels(n <= 20)
                    setMarker(recommendedMarker(n))
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
              body: "Temps (recommandé) : chaque profil n1→n5 est une tranche, le temps va vers l’arrière. Superposé : tous les profils sur le même axe. Hexagone / angle d’or / Hilbert : un peigne de cinq points par tirage, sans grille Morpho.",
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
              title: "Profils 3D ou plan",
              body: "Profils 3D : vue oblique, la hauteur des points est la valeur. Plan : regard plus vertical, mêmes lignes. Glisser fait tourner ; Maj+glisser déplace ; molette zoom vers le curseur.",
            }}
          >
            <Select
              value={style}
              onValueChange={(v) => {
                const next = v as ViewStyle
                setStyle(next)
                setCamera(homeCamera(next, chronological.length || sample))
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
            label="Marqueur"
            help={{
              title: "Boule ou point",
              body: "Boule : disque lisible à 20–50 tirages. Point : un pixel coloré, pour que 100 et 200 ne se bouchent pas. Le choix 100/200 bascule tout seul sur point, on peut revenir à la boule.",
            }}
          >
            <div className="flex flex-wrap gap-1">
              {MARKER_STYLES.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={marker === item ? "default" : "outline"}
                  aria-pressed={marker === item}
                  onClick={() => setMarker(item)}
                >
                  {MARKER_LABELS[item]}
                </Button>
              ))}
            </div>
          </LabelHelp>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              Écarter les tirages
              <HelpTip
                title="Écarter"
                body="Espace entre les lignes. Bas : les profils se serrent. Haut : chaque tirage se détache. Ils ne fusionnent plus en collines."
              />
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={fusion}
              onChange={(event) => setFusion(Number(event.target.value))}
              aria-label="Écarter les tirages"
              className="accent-primary"
            />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              Hauteur (1–50)
              <HelpTip
                title="Hauteur"
                body="Exagère l’axe des valeurs. Une 50 reste au sommet, une 1 au sol. Ça n’est pas une prédiction, c’est l’échelle de lecture."
              />
            </span>
            <input
              type="range"
              min={0.4}
              max={2.4}
              step={0.05}
              value={yScale}
              onChange={(event) => setYScale(Number(event.target.value))}
              aria-label="Hauteur des valeurs"
              className="accent-primary"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <OverlayToggle
              label="Numéros"
              on={labels}
              onClick={() => setLabels((v) => !v)}
              help={{
                title: "Numéros",
                body: "Écrit la valeur sur chaque point. À 20 tirages c’est le mode de lecture. À 200, mieux vaut les masquer et survoler une ligne.",
              }}
            />
            <OverlayToggle
              label="Rangs dans le temps"
              on={rankTime}
              onClick={() => setRankTime((v) => !v)}
              help={{
                title: "Rangs dans le temps",
                body: "Calque optionnel : relie n1 d’un tirage à n1 du suivant, et ainsi de suite jusqu’à n5. C’est le tracé d’Évolution, posé sur la carte. Ce n’est pas une prédiction.",
              }}
            />
            <OverlayToggle
              label="Tiges"
              on={stems}
              onClick={() => setStems((v) => !v)}
              help={{
                title: "Tiges",
                body: "Lignes de rappel verticales, du sol jusqu’à chaque point, pour lire la hauteur 1–50. On peut les masquer.",
              }}
            />
            <OverlayToggle
              label="Étoiles"
              on={stars}
              onClick={() => setStars((v) => !v)}
              help={{
                title: "Étoiles",
                body: "Ajoute e1 et e2 à droite du peigne, sur la même échelle 1–50 (donc près du sol). Secondaire : la lecture, c’est n1→n5.",
              }}
            />
            <OverlayToggle
              label="Rotation"
              on={autoRotate}
              onClick={() => setAutoRotate((v) => !v)}
              help={{
                title: "Rotation",
                body: "Fait tourner la carte. On peut aussi glisser, Maj+glisser pour déplacer, utiliser les flèches, ou le bouton 90°.",
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
                  body: "Une carte lisible, ce n’est pas fondre les glyphes : c’est poser chaque tirage comme une ligne n1→n5, et que le voisinage (temps, hexagone…) ait un sens.",
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
                  {hover.weekday} · ligne {hover.drawIndex + 1} / {map.profiles.length}
                  {hover.latest ? " · dernier tirage" : ""}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {hover.ranks.map((n, i) => (
                    <Badge
                      key={`n-${RANK_LABELS[i]}`}
                      variant="default"
                      style={{ background: rgbCssOf(RANK_RGB[i]) }}
                    >
                      {RANK_LABELS[i]} {n}
                    </Badge>
                  ))}
                  {hover.stars.map((s) => (
                    <Badge key={`s-${s}`} variant="secondary">
                      ★ {s}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Glyphe Morpho (secondaire) — la lecture ici, c’est la ligne de
                  points.
                </p>
                <GlyphBoard
                  numbers={hover.numbers}
                  stars={hover.stars}
                  labels
                  className="max-w-xs"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Survolez une ligne. Le dernier tirage a le halo or.
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground tabular-nums">
              {map.profiles.length} ligne{map.profiles.length > 1 ? "s" : ""} n1→n5
              {map.connected ? " · axe rang × temps" : " · peignes décalés"}
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
