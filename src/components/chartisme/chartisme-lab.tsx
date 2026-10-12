"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { BacktestPanel } from "@/components/chartisme/backtest-panel"
import { CurveCanvas, type CurveSelection } from "@/components/chartisme/curve-canvas"
import { CurveMap } from "@/components/chartisme/curve-map"
import { FigureName, FigureThumb } from "@/components/chartisme/figure-thumb"
import { CurveName } from "@/components/chartisme/curve-thumb"
import { LabelAtelier } from "@/components/chartisme/label-atelier"
import { useRegisterCapture } from "@/components/capture"
import { RulesPanel } from "@/components/chartisme/rules-panel"
import { SensePanel } from "@/components/chartisme/sense-panel"
import { Sketchpad } from "@/components/chartisme/sketchpad"
import { WindowCompare } from "@/components/chartisme/window-compare"
import { LabelHelp, TitleHelp } from "@/components/help"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select"
import {
  MAX_THRESHOLD,
  baseRateAbove,
  baseRateNote,
  figureThresholds,
  figureVerdict,
  hitIsRare,
  rarityNote,
  sampleBaseRate,
  thresholdForBaseRate,
  verdictSentence,
  type BaseRateThreshold,
} from "@/lib/chartisme/base-rate"
import {
  buildCurve,
  curveFamilies,
  curveId as specId,
  curveLabel,
  curveSpecs,
  parseCurveId,
  type Curve,
} from "@/lib/chartisme/curves"
import { catalog, isChannelFigure, labelOf, slopeBiasLabel } from "@/lib/chartisme/catalog"
import { rankKey } from "@/lib/chartisme/figures"
import { interpretDetectResponse, opinionSentence, type DetectModels } from "@/lib/chartisme/opinions"
import { nearestOnCurve } from "@/lib/chartisme/retrieval"
import {
  GEOMETRIC_FLOOR,
  collapseZones,
  hitListCaption,
  outcomePhrase,
  scanCurve,
  visibleHitIndices,
  type ScanHit,
} from "@/lib/chartisme/scan"
import { cycleHitIndex, hitIndicesForLabel } from "@/lib/chartisme/banner"
import { pulseSentence, readingPulse } from "@/lib/chartisme/pulse"
import {
  MIN_SENSE_LENGTH,
  SENSE_TITLE,
  nameSense,
  senseSegments,
  senseSentence,
  seriesSigma,
  seriesSlopeSigma,
} from "@/lib/chartisme/sense"
import { ficheHref } from "@/lib/lexicon/fiche"
import {
  alongsideIndex,
  evaluateRules,
  stateFromHit,
  type AlongsideFigure,
  type ChartismeRule,
} from "@/lib/chartisme/rules"
import { loadRules, recordFirings } from "@/lib/chartisme/store"
import { packChartisme } from "@/lib/capture/pack"
import {
  DEFAULT_STUDY_PRESET,
  MAX_CYCLE,
  MIN_STUDY_DRAWS,
  STUDY_PRESETS,
  STUDY_PRESET_LABELS,
  liveInWindow,
  resolveStudyWindow,
  scaleFitNote,
  shortScaleCaveat,
  shortWindowNote,
  startsInContext,
  studyBanner,
  type StudyPreset,
} from "@/lib/chartisme/window"
import { asStudyPreset, readLabSearch } from "@/lib/lab-search"
import { useDraws } from "@/lib/use-draws"
import { useWeekdayScope } from "@/lib/use-weekday-scope"
import { weekdayApiValue, weekdayFilterDay } from "@/lib/weekday-scope"
import { WeekdayScopeControl } from "@/components/weekday-scope-control"
import { WeekdaySynthesisCard } from "@/components/weekday-synthesis-card"

type ModuleStatus = {
  ok?: boolean
  auto_export?: boolean
  last_cycle?: { at?: string; reason?: string; curves?: number; figures?: number } | null
  error?: string | null
  pending_labels?: number | null
  models?: { available?: string[]; torch?: boolean; pyg?: boolean; install_cmd?: string }
}

const SCALE_CHOICES = [
  { value: "auto", label: "Auto — déduites de la fenêtre" },
  { value: "20", label: "Très courte (20 tirages)" },
  { value: "30", label: "Courte (30 tirages)" },
  { value: "60", label: "Moyenne (60 tirages)" },
  { value: "120", label: `Longue (${MAX_CYCLE} tirages)` },
]

const ERA_LABELS = {
  current: "Ère courante (12 ★)",
  all: "Toute l’archive",
}

/** Un seuil de confiance posé, ou la rareté visée qui va le chercher. */
type BarMode = "confidence" | "rarity"
/** Toutes les lectures géométriques, ou seulement celles que le hasard produit peu. */
type ViewMode = "all" | "rare"

const BAR_MODES: Array<{ value: BarMode; label: string }> = [
  { value: "rarity", label: "Rareté visée — le seuil est cherché" },
  { value: "confidence", label: "Confiance — le seuil est posé" },
]

const VIEW_MODES: Array<{ value: ViewMode; label: string }> = [
  { value: "all", label: "Toutes les figures — le badge dit la rareté" },
  { value: "rare", label: "Seulement les rares — l’ancien filtre" },
]

type LabHit = ScanHit & { rare: boolean }

function compareLab(a: LabHit, b: LabHit) {
  // Une lecture rare passe devant une commune, même moins spécifique : sinon
  // un rectangle confirmé avalait un double creux distinctif en alternative.
  if (a.rare !== b.rare) return a.rare ? -1 : 1
  const left = rankKey(a)
  const right = rankKey(b)
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i]
  }
  return 0
}

function outcomeLabel(hit: ScanHit) {
  const status = hit.outcome?.status ?? "no_breakout"
  if (status === "reached") return "objectif atteint"
  if (status === "invalidated") return "invalidée"
  if (status === "open") return "en cours"
  return "pas de cassure"
}

function outcomeVariant(hit: ScanHit) {
  const status = hit.outcome?.status ?? "no_breakout"
  if (status === "reached") return "default" as const
  if (status === "invalidated") return "destructive" as const
  return "outline" as const
}

export function ChartismeLab() {
  const [era, setEra] = useState<"current" | "all">("current")
  const [weekday, setWeekday] = useWeekdayScope()
  const { draws, source, loading } = useDraws(era, weekday)

  const [curveId, setCurveId] = useState("sum")
  const [scaleChoice, setScaleChoice] = useState("auto")
  const [preset, setPreset] = useState<StudyPreset>(DEFAULT_STUDY_PRESET)
  const [lastN, setLastN] = useState("")
  const [barMode, setBarMode] = useState<BarMode>("rarity")
  const [viewMode, setViewMode] = useState<ViewMode>("all")
  const [minConfidence, setMinConfidence] = useState(0.6)
  const [targetRate, setTargetRate] = useState(0.2)
  const [selected, setSelected] = useState(0)
  const [selection, setSelection] = useState<CurveSelection | null>(null)
  const [status, setStatus] = useState<ModuleStatus | null>(null)
  const [firedCount, setFiredCount] = useState<number | null>(null)
  const [showMedian, setShowMedian] = useState(true)

  useEffect(() => {
    const params = readLabSearch()
    const curve = params.get("curve")
    if (curve) setCurveId(curve)
    const nextPreset = asStudyPreset(params.get("preset"))
    if (nextPreset) setPreset(nextPreset)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/chartisme/status", { cache: "no-store" })
        if (response.ok) setStatus((await response.json()) as ModuleStatus)
      } catch {
        setStatus(null)
      }
    })()
  }, [])

  const specs = useMemo(() => curveSpecs(), [])

  // La fenêtre de travail découpe la zone lue ; le contexte qui la précède reste
  // calculé pour que `delay`, l'activité et la MM20 ne repartent pas de zéro au
  // premier tirage découpé.
  const study = useMemo(() => {
    const parsed = Number.parseInt(lastN, 10)
    return resolveStudyWindow(draws, {
      preset,
      // Une frappe intermédiaire ne décide pas de la fenêtre : saisir « 35 »
      // passe par « 3 », et trois tirages ne portent aucune figure. Le preset
      // tient jusqu'à ce que le nombre saisi soit étudiable.
      lastN:
        Number.isFinite(parsed) && parsed >= MIN_STUDY_DRAWS ? parsed : undefined,
      scale: scaleChoice === "auto" ? "auto" : Number(scaleChoice),
      weekday: weekdayFilterDay(weekday),
    })
  }, [draws, preset, lastN, scaleChoice, weekday])

  // Les courbes se reconstruisent dans le navigateur : sur Netlify aucun
  // backend Python ne répond, et l'onglet doit rester entier.
  const curve = useMemo<Curve | null>(() => {
    if (!study.window.withWarmup.length) return null
    const spec = specs.find((s) => (s.n === null ? s.variable : `${s.variable}:${s.n}`) === curveId)
    if (!spec) return null
    return buildCurve(study.window.withWarmup, spec.variable, spec.n)
  }, [study, specs, curveId])

  // σ habituel : toute la courbe chargée. Le registre rapporte le nuage de
  // la fenêtre à cet écart-type. σ des pentes : même courbe, coefficients
  // directeurs à trois tirages.
  const habitSigma = useMemo(() => {
    const spec = specs.find((s) => (s.n === null ? s.variable : `${s.variable}:${s.n}`) === curveId)
    if (!spec || !draws.length) return 0
    return seriesSigma(buildCurve(draws, spec.variable, spec.n).values)
  }, [draws, specs, curveId])
  const habitSlope = useMemo(() => {
    const spec = specs.find((s) => (s.n === null ? s.variable : `${s.variable}:${s.n}`) === curveId)
    if (!spec || !draws.length) return 0
    return seriesSlopeSigma(buildCurve(draws, spec.variable, spec.n).values)
  }, [draws, specs, curveId])

  // Le taux de base est échantillonné une fois par échelle, sans seuil : bouger
  // le curseur relit alors l'échantillon au lieu de le refaire.
  //
  // Il dépend de la courbe et pas seulement de l'échelle, parce que le bruit est
  // tiré de cette courbe-ci : `n1` tassé contre 1 et la parité par paliers de 0
  // à 5 ne portent pas les mêmes figures par hasard que la somme.
  const samples = useMemo(
    () =>
      curve
        ? study.scales.map((scale) =>
            sampleBaseRate(study.window.withWarmup, curve.variable, curve.n, scale)
          )
        : [],
    [curve, study]
  )

  // Le seuil du balayage, dans les deux sens de lecture.
  //
  // En « confiance », il est posé : un nombre, le même pour toutes les échelles
  // et toutes les courbes — sauf qu'il n'y désigne pas le même degré de rareté.
  // En « rareté », il est cherché : on donne la part de fenêtres de bruit qu'on
  // accepte, et chaque échelle reçoit le seuil qui l'obtient sur cette courbe.
  // C'est le seul réglage de l'onglet qui se compare d'une courbe à l'autre.
  const thresholds = useMemo(
    () => (barMode === "rarity" ? samples.map((sample) => thresholdForBaseRate(sample, targetRate)) : []),
    [barMode, samples, targetRate]
  )
  const bars = useMemo(() => {
    if (barMode === "confidence") {
      return { minConfidence, byScale: null, scales: study.scales }
    }
    const byScale: Record<number, number | null> = {}
    for (const entry of thresholds) byScale[entry.length] = entry.threshold
    // Seuil d'ensemble, pour le rétro-test et le chiffrage sous le tracé. Le
    // balayage géométrique, lui, n'en dépend plus : il lit toutes les échelles,
    // et la rareté badge ensuite, figure par figure.
    const scales = thresholds.filter((entry) => entry.threshold !== null).map((entry) => entry.length)
    const kept = thresholds
      .map((entry) => entry.threshold)
      .filter((value): value is number => value !== null)
    return { minConfidence: kept.length ? Math.min(...kept) : MAX_THRESHOLD, byScale, scales }
  }, [barMode, minConfidence, study.scales, thresholds])

  // Seuil de rareté *par figure* : un double creux que le hasard produit à
  // peine ne doit pas disparaître derrière le seuil des triangles, plus
  // bavards. `null` = le mode confiance pose un nombre unique.
  const figureBars = useMemo<Record<
    number,
    Record<string, BaseRateThreshold>
  > | null>(() => {
    if (barMode !== "rarity") return null
    const out: Record<number, Record<string, BaseRateThreshold>> = {}
    for (const sample of samples) out[sample.length] = figureThresholds(sample, targetRate)
    return out
  }, [barMode, samples, targetRate])

  // Balayage géométrique d'abord, rareté ensuite. Scanner au seuil inversé
  // (souvent 0.65, même à 50 % d'acceptation) vidait le tracé : les détecteurs
  // avaient déjà vu la forme, le filtre la rejetait.
  const geometricHits = useMemo<ScanHit[]>(() => {
    if (!curve) return []
    return scanCurve(curve, {
      scales: study.scales,
      minConfidence: GEOMETRIC_FLOOR,
    }).filter((hit) => liveInWindow(hit, study.contextCount))
  }, [curve, study])

  const annotatedHits = useMemo<LabHit[]>(
    () =>
      geometricHits.map((hit) => ({
        ...hit,
        rare: hitIsRare(hit, figureBars, minConfidence),
      })),
    [geometricHits, figureBars, minConfidence]
  )

  const hits = useMemo<LabHit[]>(() => {
    const pool = viewMode === "rare" ? annotatedHits.filter((hit) => hit.rare) : annotatedHits
    return collapseZones(pool, { compare: compareLab }) as LabHit[]
  }, [annotatedHits, viewMode])

  const rareCount = annotatedHits.filter((hit) => hit.rare).length

  // La fenêtre précédente est lue exactement comme celle qu'on étudie : mêmes
  // échelles, même seuil, même longueur. Sans quoi la comparaison mesurerait
  // l'écart entre deux réglages plutôt qu'entre deux périodes.
  //
  // En rareté visée, ce sont les seuils de la fenêtre étudiée qui s'appliquent,
  // pas ceux qu'on chercherait sur les tirages précédents : la comparaison isole
  // la période en tenant la lecture fixe.
  const previousCurve = useMemo<Curve | null>(() => {
    const rows = study.previous?.withWarmup
    if (!rows?.length) return null
    const spec = specs.find((s) => (s.n === null ? s.variable : `${s.variable}:${s.n}`) === curveId)
    if (!spec) return null
    return buildCurve(rows, spec.variable, spec.n)
  }, [study, specs, curveId])

  const previousHits = useMemo<LabHit[]>(() => {
    if (!previousCurve || !study.previous) return []
    const found = scanCurve(previousCurve, {
      scales: study.scales,
      minConfidence: GEOMETRIC_FLOOR,
    })
      .filter((hit) => liveInWindow(hit, study.previous!.warmupCount))
      .map((hit) => ({ ...hit, rare: hitIsRare(hit, figureBars, minConfidence) }))
    const pool = viewMode === "rare" ? found.filter((hit) => hit.rare) : found
    return collapseZones(pool, { compare: compareLab }) as LabHit[]
  }, [previousCurve, study, figureBars, minConfidence, viewMode])

  const pulse = useMemo(
    () => readingPulse(hits, previousCurve ? previousHits : null),
    [hits, previousCurve, previousHits]
  )

  const windowSense = useMemo(() => {
    if (!curve) return null
    return nameSense(curve.values.slice(study.contextCount), habitSigma)
  }, [curve, habitSigma, study.contextCount])

  const windowSegments = useMemo(() => {
    if (!curve) return null
    return senseSegments(curve.values.slice(study.contextCount), habitSigma, habitSlope)
  }, [curve, habitSigma, habitSlope, study.contextCount])

  // La sélection nomme le trait qu'on a tiré, dès qu'elle est assez longue.
  // Sinon le nom porte sur la fenêtre étudiée, contexte exclu. Les tronçons
  // suivent la même série que le nom.
  const senseRead = useMemo(() => {
    const span = selection ? selection.toIndex - selection.fromIndex + 1 : 0
    if (curve && selection && span >= MIN_SENSE_LENGTH) {
      const from = selection.fromIndex
      const to = selection.toIndex
      const dates = curve.dates.slice(from, to + 1)
      const values = curve.values.slice(from, to + 1)
      return {
        named: nameSense(values, habitSigma),
        segments: senseSegments(values, habitSigma, habitSlope),
        values,
        scope: "Sélection" as const,
        fromDate: dates[0] ?? null,
        toDate: dates[dates.length - 1] ?? null,
        shortSelection: null as number | null,
      }
    }
    const from = study.contextCount
    const values = curve ? curve.values.slice(from) : []
    const dates = curve ? curve.dates.slice(from) : []
    return {
      named: windowSense,
      segments: windowSegments,
      values,
      scope: "Fenêtre étudiée" as const,
      fromDate: dates[0] ?? null,
      toDate: dates[dates.length - 1] ?? null,
      shortSelection: selection && span > 0 && span < MIN_SENSE_LENGTH ? span : null,
    }
  }, [curve, selection, habitSigma, habitSlope, windowSense, windowSegments, study.contextCount])

  const previousSense = useMemo(() => {
    if (!previousCurve || !study.previous) return null
    return nameSense(previousCurve.values.slice(study.previous.warmupCount), habitSigma)
  }, [previousCurve, study.previous, habitSigma])

  const previousSegments = useMemo(() => {
    if (!previousCurve || !study.previous) return null
    return senseSegments(
      previousCurve.values.slice(study.previous.warmupCount),
      habitSigma,
      habitSlope
    )
  }, [previousCurve, study.previous, habitSigma, habitSlope])
  const pulseLine = pulseSentence(pulse, Boolean(curve))

  const baseRates = useMemo(
    () =>
      samples.map((sample) =>
        baseRateAbove(sample, bars.byScale?.[sample.length] ?? bars.minConfidence)
      ),
    [samples, bars]
  )

  // Trois mises en garde, de la plus dirimante à la plus nuancée : rien n'a été
  // balayé, puis rien ne peut tenir dans la fenêtre, puis la règle d'or n'a plus
  // ses vingt points. Une seule s'affiche, la première.
  const fitNote = curve ? scaleFitNote(study.scales, curve.values.length) : null
  const caveat = curve
    ? fitNote ?? shortWindowNote(study.drawCount) ?? shortScaleCaveat(study.scales)
    : null
  // Le chiffrage, lui, s'affiche toujours : c'est le seul point de comparaison
  // de la confiance lue à côté. En rareté visée il dit l'inverse — non plus ce
  // que le seuil obtient, mais le seuil qu'il a fallu pour obtenir la cible.
  const measuredCore = !curve || fitNote
    ? null
    : barMode === "rarity"
      ? rarityNote(thresholds, targetRate)
      : baseRateNote(baseRates, minConfidence)
  // Le paragraphe sous le tracé reste le seuil d'ensemble. Le jugement
  // figure par figure vit sur la fiche de la lecture sélectionnée.
  const ensembleInterval =
    barMode === "rarity"
      ? baseRates
          .filter((rate) => rate.trials > 0)
          .map(
            (rate) =>
              `échelle ${rate.length} : ${Math.round(rate.interval[0] * 100)} % – ${Math.round(
                rate.interval[1] * 100
              )} %`
          )
          .join(" · ")
      : ""
  const measured =
    !curve || fitNote
      ? null
      : [
          measuredCore,
          ensembleInterval ? `Intervalle de Wilson du taux d'ensemble : ${ensembleInterval}.` : null,
        ]
          .filter(Boolean)
          .join(" ") || null

  useRegisterCapture(() =>
    packChartisme({
      curveId,
      curveLabel: curve?.label ?? curveId,
      era,
      source,
      preset,
      presetLabel: STUDY_PRESET_LABELS[preset],
      scaleChoice,
      scales: study.scales,
      banner: studyBanner(study),
      caveat,
      measured,
      minConfidence,
      drawCount: study.drawCount,
      contextCount: study.contextCount,
      from: study.window.fromDate,
      to: study.window.toDate,
      dates: curve?.dates ?? [],
      values: curve?.values ?? [],
      hits,
      baseRates,
    })
  )

  // Même règle que la barre de fenêtre d'Analyse : un nombre de tirages
  // n'affine que les fenêtres comptées en tirages. Sur « 3 mois » ou
  // « Année civile », il ne les affinerait pas, il les remplacerait.
  const showLastN = preset.startsWith("last_") || lastN !== ""

  // Changer de courbe, de fenêtre ou de seuil renumérote les figures : la
  // sélection précédente désignerait autre chose. Ajusté au rendu plutôt que
  // dans un effet, qui provoquerait un rendu en cascade avec l'ancien index
  // affiché.
  const scanKey = `${era}|${curveId}|${scaleChoice}|${preset}|${lastN}|${barMode}|${viewMode}|${minConfidence}|${targetRate}`
  const [lastScanKey, setLastScanKey] = useState(scanKey)
  if (scanKey !== lastScanKey) {
    setLastScanKey(scanKey)
    setSelected(0)
    setSelection(null)
  }

  const hit = hits[selected] ?? null

  const neighbours = useMemo(() => {
    if (!curve || !hit) return []
    return nearestOnCurve(curve.values, hit.from_index, hit.to_index, { top: 3 })
  }, [curve, hit])

  const verdict = hit ? figureVerdict(hit, figureBars, minConfidence) : null

  const [modelRead, setModelRead] = useState<
    | { status: "loading" | "short" }
    | { status: "absent" | "ready"; models: DetectModels }
    | null
  >(null)

  const modelKey = hit && curve ? `${curve.id}|${hit.scale}|${hit.from_index}|${hit.to_index}|${hit.figure}` : ""

  useEffect(() => {
    if (!hit || !curve) {
      setModelRead(null)
      return
    }
    const values = curve.values.slice(hit.from_index, hit.to_index + 1)
    if (values.length < 8) {
      setModelRead({ status: "short" })
      return
    }
    const controller = new AbortController()
    setModelRead({ status: "loading" })
    const dates = curve.dates.slice(hit.from_index, hit.to_index + 1)
    const activity = curve.activity.slice(hit.from_index, hit.to_index + 1)
    void (async () => {
      try {
        const response = await fetch("/api/chartisme/detect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({ values, dates, activity, min_confidence: 0, models: true }),
        })
        const payload = (await response.json().catch(() => null)) as unknown
        if (controller.signal.aborted) return
        const models = interpretDetectResponse(response.ok ? payload : { ok: false })
        setModelRead({ status: models.status, models })
      } catch {
        if (controller.signal.aborted) return
        setModelRead({ status: "absent", models: interpretDetectResponse(null) })
      }
    })()
    return () => controller.abort()
  }, [modelKey, curve, hit])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return
        if (target.closest("[data-slot='select-content'], [role='listbox'], [role='option']")) return
      }
      if (!hits.length) return
      event.preventDefault()
      const step = event.key === "ArrowRight" ? 1 : -1
      setSelected((current) => (current + step + hits.length) % hits.length)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [hits.length])

  const byFigure = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const found of hits) counts[found.figure] = (counts[found.figure] ?? 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [hits])

  /**
   * Les courbes citées par une condition de simultanéité, balayées comme celle
   * affichée : mêmes échelles, même fenêtre, même seuil.
   *
   * Sans ce balayage la condition n'aurait rien à interroger, et une règle qui
   * exige une voisine ne tirerait jamais — ce qui ressemble à un résultat.
   *
   * Seules les courbes nommées sont balayées, celle affichée exclue. L'onglet ne
   * peut pas balayer les 142 à chaque évaluation, aussi l'éditeur exige-t-il une
   * courbe : une condition qui ne nommerait personne resterait sans réponse.
   *
   * `undefined` quand aucune règle ne demande de voisine, ce qui n'est pas la
   * même chose qu'une liste vide — le moteur refuse de trancher sur un silence.
   */
  const alongsideFor = useCallback(
    (rules: ChartismeRule[]): AlongsideFigure[] | undefined => {
      const wanted = new Set<string>()
      for (const rule of rules) {
        const target = rule.condition.alongside_curve
        if (rule.condition.alongside !== "any" && target && target !== curveId) wanted.add(target)
      }
      if (!wanted.size || !study.window.withWarmup.length) return undefined
      const found: AlongsideFigure[] = []
      for (const id of wanted) {
        const spec = specs.find((s) => (s.n === null ? s.variable : `${s.variable}:${s.n}`) === id)
        if (!spec) continue
        const other = buildCurve(study.window.withWarmup, spec.variable, spec.n)
        found.push(
          ...alongsideIndex(
            scanCurve(other, {
              scales: study.scales,
              minConfidence: GEOMETRIC_FLOOR,
            }).filter((entry) => liveInWindow(entry, study.contextCount))
          ).map((entry) => ({ ...entry, curve_id: id }))
        )
      }
      return found
    },
    [curveId, study, specs]
  )

  function runRules() {
    const rules = loadRules()
    if (!rules.length) {
      setFiredCount(0)
      return
    }
    const alongside = alongsideFor(rules)
    const firings = hits.flatMap((found) =>
      evaluateRules(rules, stateFromHit(found, { curve, alongside }))
    )
    recordFirings(firings)
    setFiredCount(firings.length)
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {weekday === "synthese" ? <WeekdaySynthesisCard draws={study.window.work} /> : null}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            <TitleHelp
              help={{
                title: "État du module",
                body: "Le chartisme lit les courbes exportées du logiciel. En local le backend Python fait le balayage multi-échelle et l'entraînement ; sur Netlify tout se recalcule dans le navigateur à partir des tirages, avec les mêmes détecteurs.",
              }}
            >
              État du module
            </TitleHelp>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={source === "neon" ? "default" : "outline"}>
              {source === "neon" ? "Neon" : "JSON local"}
            </Badge>
            {status?.auto_export ? (
              <Badge variant="default">export automatique actif</Badge>
            ) : (
              <Badge variant="outline">export automatique en veille</Badge>
            )}
            {status?.models?.available?.length ? (
              <Badge variant="secondary">
                modèles : {status.models.available.join(" · ")}
              </Badge>
            ) : (
              <Badge variant="outline">réseaux non chargés</Badge>
            )}
            <Badge variant={curve ? "default" : "outline"}>
              {curve ? "chartisme fonctionnel" : loading ? "chargement des tirages" : "en attente des tirages"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>
            {draws.length} tirages chargés · {specs.length} courbes disponibles
            {status?.last_cycle?.at
              ? ` · dernier cycle ${status.last_cycle.at} (${status.last_cycle.figures ?? 0} figures)`
              : ""}
          </p>
          <p className="text-foreground">{pulseLine}</p>
          {status?.models?.install_cmd && !status.models.available?.length ? (
            <p>
              Réseaux non installés. Pour les activer :{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                {status.models.install_cmd}
              </code>
              . Les 18 détecteurs géométriques fonctionnent sans eux.
            </p>
          ) : null}
          {status?.error ? <p className="text-destructive">{status.error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <TitleHelp
              help={{
                title: "Figures sur une courbe",
                body: "Le balayage déplace une fenêtre sur la zone étudiée, aux échelles qui y tiennent. Chaque figure repérée est dessinée avec ses pivots nommés, sa ligne de cou ou ses bornes, sa cassure et son objectif projeté selon la table de référence. Une figure entièrement contenue dans le contexte grisé n'est pas listée : elle appartient au passé calculé pour alimenter les indicateurs, pas à la fenêtre. Le bandeau de marques au-dessus du tracé reprend chaque lecture : un clic la sélectionne — et un second clic au même endroit passe à la lecture qui se superpose. Les pastilles de figures au-dessus du graphe font de même, figure par figure.",
              }}
            >
              Courbe et figures
            </TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1">
            {catalog().map((item) => (
              <span
                key={item.figure}
                className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                title={`${item.label} · ${item.signal}`}
              >
                <FigureThumb figure={item.figure} />
                {item.label}
              </span>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <LabelHelp
              label="Courbe"
              help={{
                title: "Courbe",
                body: `Une courbe = une variable d'analyse déroulée sur les tirages : ${specs.length} en tout. Somme, étendue, parité, centre de masse, le retard et la présence de chaque boule et de chaque étoile — et les cinq numéros du tirage suivis séparément, n1 à n5, plus les deux étoiles e1 et e2. Ce sont des statistiques d'ordre : n1 est le plus petit numéro du tirage, jamais la première boule sortie, l'ordre de sortie n'étant pas publié.`,
              }}
            >
              <Select value={curveId} onValueChange={(v) => setCurveId(v ?? curveId)}>
                <SelectTrigger className="w-full" aria-label="Courbe">
                  <span className="flex flex-1 text-left">
                    <CurveName
                      kind={curve?.variable ?? parseCurveId(curveId).variable}
                      label={`${curveId} · ${curve?.label ?? curveLabel(parseCurveId(curveId).variable, parseCurveId(curveId).n)}`}
                    />
                  </span>
                </SelectTrigger>
                <SelectContent className="min-w-64">
                  {curveFamilies().map((family) => (
                    <SelectGroup key={family.id}>
                      <SelectLabel>{family.label}</SelectLabel>
                      {family.specs.map((spec) => {
                        const id = specId(spec.variable, spec.n)
                        return (
                          <SelectItem key={id} value={id}>
                            {/* L'identifiant d'abord : c'est lui qu'une règle vise et
                                que le journal consigne. Le libellé suit pour qu'on
                                sache ce qu'on choisit dans une liste de {specs.length}. */}
                            <CurveName kind={spec.variable} label={`${id} · ${curveLabel(spec.variable, spec.n)}`} />
                          </SelectItem>
                        )
                      })}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>

            <LabelHelp
              label="Fenêtre de travail"
              help={{
                title: "Fenêtre de travail",
                body: "La zone de tirages qu'on regarde — les 20, 50, 100 derniers, une durée, l'année civile, l'année n-1, l'année n-2, tout. Les tirages qui précèdent restent calculés en contexte (le retard d'une boule et la MM20 de la règle d'or ne repartent pas de zéro au premier tirage découpé), mais aucune figure entièrement contenue dans ce contexte n'est listée.",
              }}
            >
              <Select
                value={preset}
                onValueChange={(value) => {
                  // Un preset choisi doit s'appliquer : sinon un N libre resté
                  // dans le champ continuerait de décider, et la liste
                  // afficherait une fenêtre qui n'est pas celle du tracé.
                  setPreset((value as StudyPreset) ?? preset)
                  setLastN("")
                }}
              >
                <SelectTrigger className="w-full" aria-label="Fenêtre de travail">
                  <span className="flex flex-1 text-left">
                    {STUDY_PRESET_LABELS[preset]}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {STUDY_PRESETS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {STUDY_PRESET_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>
            <WeekdayScopeControl value={weekday} onChange={setWeekday} />

            {showLastN ? (
              <LabelHelp
                label="Derniers N"
                help={{
                  title: "Derniers N tirages",
                  body: `Affine le preset pour une longueur qu'il ne propose pas (35, 75…). Vide : le preset décide. Le champ ne s'affiche que sur les fenêtres « N derniers tirages », les seules qu'un nombre de tirages sait affiner : forcer 35 sur « 3 mois » ne durerait pas trois mois. En dessous de ${MIN_STUDY_DRAWS} tirages le preset continue de s'appliquer — aucune figure ne tient dans une fenêtre plus courte.`,
                }}
              >
                <Input
                  type="number"
                  min={MIN_STUDY_DRAWS}
                  max={2000}
                  value={lastN}
                  placeholder="auto"
                  onChange={(event) => setLastN(event.target.value)}
                  aria-label="Derniers N tirages"
                />
              </LabelHelp>
            ) : null}

            <LabelHelp
              label="Échelle"
              help={{
                title: "Échelle de la fenêtre",
                body: `Longueur des figures cherchées, distincte de la fenêtre de travail. Une tête-épaules sur 30 tirages et un range sur 120 ne se lisent pas à la même échelle. « Auto » déduit trois échelles de la fenêtre — sa longueur, sa moitié, son quart — bornées en bas par ${MIN_STUDY_DRAWS} tirages, la plus courte figure détectable, et en haut par ${MAX_CYCLE}, au-delà desquels une figure ne décrit plus un cycle mais la longueur d'archive dont on dispose. Une seule détection est gardée par zone, les autres passent en alternatives. Forcer une échelle plus longue que la fenêtre répond à une autre question : quelle figure longue s'achève ici.`,
              }}
            >
              <Select
                value={scaleChoice}
                onValueChange={(v) => setScaleChoice(v ?? "auto")}
              >
                <SelectTrigger className="w-full" aria-label="Échelle">
                  <span className="flex flex-1 text-left">
                    {SCALE_CHOICES.find((choice) => choice.value === scaleChoice)?.label}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {SCALE_CHOICES.map((choice) => (
                    <SelectItem key={choice.value} value={choice.value}>
                      {choice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>

            <LabelHelp
              label="Seuil de sélection"
              help={{
                title: "Seuil de sélection",
                body: `Deux façons de dire quelle figure est distinctive. « Confiance » pose un nombre : la qualité de l'ajustement géométrique. « Rareté visée » le cherche : on donne la part de fenêtres de bruit qu'on accepte, et chaque figure reçoit le seuil qui l'obtient sur cette courbe — un double creux rare n'est plus jugé au même nombre que les triangles, plus bavards. Ce seuil badge les figures, il ne les efface plus : l'affichage « Toutes les figures » montre ce que les détecteurs voient, « Seulement les rares » retrouve l'ancien filtre. Quand aucun seuil lisible n'atteint la cible — au-delà de ${MAX_THRESHOLD.toFixed(
                  2
                )} — la figure n'est jamais rare, mais elle reste visible en lecture complète.`,
              }}
            >
              <Select value={barMode} onValueChange={(v) => setBarMode((v as BarMode) ?? "rarity")}>
                <SelectTrigger className="w-full" aria-label="Seuil de sélection">
                  <span className="flex flex-1 text-left">
                    {BAR_MODES.find((mode) => mode.value === barMode)?.label}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {BAR_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>

            {barMode === "rarity" ? (
              <LabelHelp
                label={`Taux de base visé · ${Math.round(targetRate * 100)} %`}
                help={{
                  title: "Taux de base visé",
                  body: "La part des fenêtres de bruit qu'on accepte, figure par figure. À 20 %, une figure « rare » est de celles que le hasard ne produit que dans une fenêtre sur cinq — pour ce motif, sur cette courbe, à cette échelle. Le bruit est fait des mêmes tirages remis dans un ordre quelconque. Ce curseur ne vide plus le tracé : il change le badge. Pour ne garder que les rares, passez l'affichage sur « Seulement les rares ».",
                }}
              >
                <Input
                  type="range"
                  min={0.02}
                  max={0.8}
                  step={0.02}
                  value={targetRate}
                  onChange={(event) => setTargetRate(Number(event.target.value))}
                />
              </LabelHelp>
            ) : (
              <LabelHelp
                label={`Confiance minimale · ${minConfidence.toFixed(2)}`}
                help={{
                  title: "Confiance minimale",
                  body: "La confiance mesure la qualité de l'ajustement géométrique, pénalisée quand une borne repose sur moins de trois points. Elle ne dit pas si la figure est rare : c'est le taux de base mesuré sous le tracé qui le dit, et il dépend de la courbe autant que de l'échelle. À l'échelle 60 et à 0.60, toutes les fenêtres de bruit de « paires consécutives » portent déjà une figure ; sur la somme, les deux tiers. Une figure fréquente sur du bruit n'apprend rien — c'est ce que le mode « rareté visée » évite d'avoir à vérifier après coup.",
                }}
              >
                <Input
                  type="range"
                  min={0.3}
                  max={0.95}
                  step={0.05}
                  value={minConfidence}
                  onChange={(event) => setMinConfidence(Number(event.target.value))}
                />
              </LabelHelp>
            )}

            <LabelHelp
              label="Affichage"
              help={{
                title: "Affichage des figures",
                body: "Les détecteurs voient souvent des formes que le hasard produit aussi. « Toutes les figures » les montre, le badge dit lesquelles sont distinctives à la rareté visée — c’est ce qui empêche le tracé de rester vide quand on monte le taux d'acceptation. « Seulement les rares » est l'ancien filtre, qui ne gardait que les détections au-dessus du seuil et laissait croire que rien n'avait été vu.",
              }}
            >
              <Select
                value={viewMode}
                onValueChange={(value) => setViewMode((value as ViewMode) ?? "all")}
              >
                <SelectTrigger className="w-full" aria-label="Affichage des figures">
                  <span className="flex flex-1 text-left">
                    {VIEW_MODES.find((mode) => mode.value === viewMode)?.label}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {VIEW_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>

            <LabelHelp
              label="Archive"
              help={{
                title: "Archive",
                body: "Le jeu de tirages dans lequel la fenêtre est découpée. « Ère courante » se limite au format à 5 étoiles sur 12 ; « toute l'archive » remonte à 2004, au prix d'une rupture de règles en son milieu.",
              }}
            >
              <Select
                value={era}
                onValueChange={(value) => setEra(value as "current" | "all")}
              >
                <SelectTrigger className="w-full" aria-label="Archive">
                  <span className="flex flex-1 text-left">{ERA_LABELS[era]}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">{ERA_LABELS.current}</SelectItem>
                  <SelectItem value="all">{ERA_LABELS.all}</SelectItem>
                </SelectContent>
              </Select>
            </LabelHelp>
          </div>

          <p className="text-sm text-foreground">{studyBanner(study)}</p>
          {caveat ? (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {caveat}
            </p>
          ) : null}
          {measured ? (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {measured}
            </p>
          ) : null}

          {loading && !curve ? (
            <p className="text-sm text-muted-foreground">Chargement des tirages…</p>
          ) : null}
          {!loading && !curve ? (
            <p className="text-sm text-muted-foreground">
              Aucun tirage dans cette fenêtre — élargissez la fenêtre de travail ou
              changez d’archive.
            </p>
          ) : null}

          {curve ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{curve.label}</span>
                <span>· {study.drawCount} tirages étudiés</span>
                {study.contextCount ? (
                  <span>· {study.contextCount} en contexte</span>
                ) : null}
                <span>
                  · {hits.length} figure{hits.length > 1 ? "s" : ""}
                  {viewMode === "rare" ? " rare" : ""}
                  {hits.length > 1 && viewMode === "rare" ? "s" : ""}
                </span>
                {annotatedHits.length ? (
                  <span>
                    · {rareCount} rare{rareCount > 1 ? "s" : ""} parmi{" "}
                    {annotatedHits.length} forme{annotatedHits.length > 1 ? "s" : ""}
                  </span>
                ) : null}
                {pulse.agreed > 0 ? (
                  <Badge variant="secondary">
                    {pulse.agreed} confirmée{pulse.agreed > 1 ? "s" : ""} par le graphe
                  </Badge>
                ) : (
                  <Badge variant="outline">graphe lu</Badge>
                )}
                {pulse.shared != null ? (
                  <Badge variant={pulse.shared > 0 ? "default" : "outline"}>
                    {pulse.shared} revien{pulse.shared > 1 ? "nent" : "t"} d&apos;une fenêtre à l&apos;autre
                    {pulse.appeared ? ` · ${pulse.appeared} nouvelle${pulse.appeared > 1 ? "s" : ""}` : ""}
                    {pulse.gone ? ` · ${pulse.gone} en moins` : ""}
                  </Badge>
                ) : null}
                {byFigure.slice(0, 6).map(([figure, count]) => {
                  const label = labelOf(figure)
                  const on = hit?.figure === figure
                  return (
                    <Badge
                      key={figure}
                      variant={on ? "default" : "outline"}
                      role="button"
                      tabIndex={0}
                      aria-pressed={on}
                      className="cursor-pointer gap-1 hover:bg-muted"
                      title={
                        count > 1
                          ? `${count} figures ${label} — clic pour parcourir`
                          : `Sélectionner ${label}`
                      }
                      onClick={() => {
                        const next = cycleHitIndex(hitIndicesForLabel(hits, label), selected)
                        if (next != null) setSelected(next)
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return
                        event.preventDefault()
                        const next = cycleHitIndex(hitIndicesForLabel(hits, label), selected)
                        if (next != null) setSelected(next)
                      }}
                    >
                      <FigureThumb figure={figure} className={on ? "text-primary-foreground" : undefined} />
                      {label} × {count}
                    </Badge>
                  )
                })}
              </div>

              <p className="text-xs text-muted-foreground" title={SENSE_TITLE}>
                {senseRead.scope} · {senseSentence(senseRead.named)}
                {ficheHref(senseRead.named?.symbol) ? (
                  <>
                    {" · "}
                    <Link
                      href={ficheHref(senseRead.named?.symbol)!}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Fiche
                    </Link>
                  </>
                ) : null}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={showMedian}
                  onClick={() => setShowMedian((current) => !current)}
                  className={
                    showMedian
                      ? "rounded-full border border-sky-400/50 bg-sky-400/15 px-2.5 py-1 text-xs text-sky-100"
                      : "rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                  }
                >
                  Médiane
                </button>
                <span className="text-[11px] text-muted-foreground">
                  Parallèle à mi-distance des deux bornes, pas une fourchette d’Andrews.
                </span>
              </div>
              <CurveCanvas
                values={curve.values}
                dates={curve.dates}
                activity={curve.activity}
                hit={hit}
                hits={hits}
                selection={selection}
                onSelect={setSelection}
                onHitSelect={setSelected}
                contextCount={study.contextCount}
                label={
                  senseRead.named ? `${curve.label} · ${senseRead.named.symbol}` : curve.label
                }
                showMedian={showMedian}
              />

              {/* Hauteur fixe, pas minimale. Vider la liste raccourcissait la
                  page de la hauteur du panneau et le navigateur ramenait le
                  défilement vers le haut : le tracé qu'on lisait s'en allait
                  sous les yeux. Une hauteur minimale ne suffirait pas — le
                  panneau garni mesure le double, et sa taille dépend de la
                  figure affichée. Un budget fixe avec défilement interne rend la
                  page insensible au nombre de figures trouvées. */}
              <div className="sm:h-[19rem] sm:overflow-y-auto">
                {hits.length ? (
                <div className="space-y-2">
                  {hitListCaption(hits.length) ? (
                    <p className="text-xs text-muted-foreground">
                      {hitListCaption(hits.length)}. Les flèches parcourent les {hits.length} lectures.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Flèches gauche et droite : lecture précédente et suivante.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {visibleHitIndices(hits.length, selected).map((index) => {
                      const found = hits[index]
                      return (
                      <Button
                        key={`${found.figure}-${found.from_index}-${index}`}
                        size="xs"
                        variant={index === selected ? "default" : "outline"}
                        onClick={() => setSelected(index)}
                        className="gap-1"
                      >
                        <FigureThumb
                          figure={found.figure}
                          className={index === selected ? "text-primary-foreground" : undefined}
                        />
                        {slopeBiasLabel(found.figure, found.slopeBias)} · {found.confidence.toFixed(2)}
                        {found.rare ? "" : " · bruit"}
                        {startsInContext(found, study.contextCount)
                          ? " · à cheval"
                          : ""}
                      </Button>
                      )
                    })}
                  </div>
                  {hit ? (
                    <div className="rounded-lg border border-border p-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          <FigureName
                            figure={hit.figure}
                            label={slopeBiasLabel(hit.figure, hit.slopeBias)}
                          />
                        </span>
                        <Badge variant="secondary">{hit.kind}</Badge>
                        {isChannelFigure(hit.figure) && hit.slopeBias && hit.slopeBias !== "flat" ? (
                          <Badge variant="outline">
                            {hit.slopeBias === "up" ? "pente haussière" : "pente baissière"}
                          </Badge>
                        ) : isChannelFigure(hit.figure) ? (
                          <Badge variant="outline">pente plate</Badge>
                        ) : null}
                        <Badge variant={hit.rare ? "default" : "outline"}>
                          {hit.rare ? "rare à ce taux" : "commune au bruit"}
                        </Badge>
                        <Badge variant={outcomeVariant(hit)}>{outcomeLabel(hit)}</Badge>
                        {hit.breakout ? (
                          <Badge variant={hit.breakout.confirmed ? "default" : "destructive"}>
                            {hit.breakout.confirmed ? "cassure confirmée" : "fausse cassure"}
                            {` · activité ${hit.breakout.activity_ratio.toFixed(2)}× MM20`}
                          </Badge>
                        ) : (
                          <Badge variant="outline">en formation</Badge>
                        )}
                        {startsInContext(hit, study.contextCount) ? (
                          <Badge variant="outline">commence dans le contexte</Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 text-muted-foreground">
                        Signal : {hit.signal}.{" "}
                        {hit.target
                          ? `Objectif ${hit.target.value.toFixed(1)} — ${hit.target.basis}.`
                          : "Objectif non projetable sans cassure."}{" "}
                        {outcomePhrase(hit.outcome)}.
                      </p>
                      {verdict ? (
                        <p className="mt-1 text-muted-foreground">{verdictSentence(verdict)}</p>
                      ) : null}
                      <p className="mt-1 text-muted-foreground">
                        {hit.from} → {hit.to} · échelle {hit.scale} · détecteur{" "}
                        {hit.detector}
                      </p>
                      <div className="mt-2 space-y-1 border-t border-border pt-2 text-muted-foreground">
                        <p className="font-medium text-foreground">Autres lectures de cette fenêtre</p>
                        {neighbours.length ? (
                          <ul className="space-y-0.5">
                            {neighbours.map((neighbour) => (
                              <li key={`${neighbour.from_index}-${neighbour.to_index}`}>
                                DTW · {curve?.dates[neighbour.from_index] ?? neighbour.from_index} →{" "}
                                {curve?.dates[neighbour.to_index] ?? neighbour.to_index} · similarité{" "}
                                {neighbour.similarity.toFixed(2)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>DTW : aucune autre fenêtre de cette courbe ne s’en détache.</p>
                        )}
                        {modelRead?.status === "loading" ? <p>Réseaux en lecture…</p> : null}
                        {modelRead?.status === "short" ? (
                          <p>Fenêtre trop courte pour les réseaux (8 tirages minimum).</p>
                        ) : null}
                        {modelRead?.status === "absent" ? (
                          <p>
                            Backend Python injoignable ou réseaux absents. La géométrie et le DTW
                            restent lus dans le navigateur.
                          </p>
                        ) : null}
                        {modelRead?.status === "ready"
                          ? modelRead.models.opinions.map((opinion) => (
                              <p key={opinion.detector}>{opinionSentence(opinion, hit.figure)}</p>
                            ))
                          : null}
                      </div>
                      {hit.alternatives?.length ? (
                        <p className="mt-1 text-muted-foreground">
                          Autres figures de la zone :{" "}
                          {hit.alternatives
                            .map((alt) => `${alt.label} (${alt.confidence.toFixed(2)})`)
                            .join(", ")}
                          .
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                ) : fitNote ? null : annotatedHits.length && viewMode === "rare" ? (
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      {annotatedHits.length} figure
                      {annotatedHits.length > 1 ? "s" : ""} géométrique
                      {annotatedHits.length > 1 ? "s" : ""}, aucune assez rare à{" "}
                      {barMode === "rarity"
                        ? `${Math.round(targetRate * 100)} %`
                        : minConfidence.toFixed(2)}
                      . Ce n’est pas que les détecteurs n’aient rien vu : le
                      filtre ne garde que ce que le hasard produit peu.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setViewMode("all")}>
                      Voir les {annotatedHits.length} figures
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Aucune forme géométrique dans cette fenêtre. Changez d’échelle
                    ou élargissez la fenêtre de travail.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={runRules}>
                  Passer les règles sur cette courbe
                </Button>
                {firedCount !== null ? (
                  <span className="text-xs text-muted-foreground">
                    {firedCount === 0
                      ? "Aucun déclenchement — aucune règle active ne correspond."
                      : `${firedCount} déclenchement${firedCount > 1 ? "s" : ""} consigné${firedCount > 1 ? "s" : ""} au journal.`}
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <SensePanel
        values={senseRead.values}
        named={senseRead.named}
        scope={senseRead.scope}
        fromDate={senseRead.fromDate}
        toDate={senseRead.toDate}
        shortSelection={senseRead.shortSelection}
        windowSense={windowSense}
        previousSense={previousSense}
        hasPrevious={study.previous != null}
        segments={senseRead.segments}
      />

      <WindowCompare
        hits={hits}
        previousHits={previousHits}
        window={study.window}
        previous={study.previous}
        sense={windowSense}
        previousSense={previousSense}
        segments={windowSegments}
        previousSegments={previousSegments}
      />

      <LabelAtelier
        curve={curve}
        selection={selection}
        onSelect={setSelection}
        contextCount={study.contextCount}
      />

      <CurveMap
        draws={study.window.withWarmup}
        specs={specs}
        scales={study.scales}
        contextCount={study.contextCount}
        target={targetRate}
        onTarget={setTargetRate}
        curveId={curveId}
        onPick={setCurveId}
        stateKey={`${era}|${preset}|${lastN}|${scaleChoice}|${targetRate}`}
      />

      <Sketchpad curve={curve} era={era} weekday={weekdayApiValue(weekday)} />

      <RulesPanel hit={hit} hits={hits} curve={curve} alongsideFor={alongsideFor} />

      <BacktestPanel
        curve={curve}
        hits={annotatedHits}
        era={era}
        scales={bars.scales}
        bar={{ minConfidence: bars.minConfidence, byScale: bars.byScale }}
        studyWindow={study.window}
        contextCount={study.contextWanted}
        weekday={weekdayApiValue(weekday)}
      />
    </div>
  )
}
