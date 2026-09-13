"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { BacktestPanel } from "@/components/chartisme/backtest-panel"
import { CurveCanvas, type CurveSelection } from "@/components/chartisme/curve-canvas"
import { LabelAtelier } from "@/components/chartisme/label-atelier"
import { RulesPanel } from "@/components/chartisme/rules-panel"
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
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { baseRateAbove, baseRateNote, sampleBaseRate } from "@/lib/chartisme/base-rate"
import { buildCurve, curveLabel, curveSpecs, type Curve } from "@/lib/chartisme/curves"
import { collapseZones, scanCurve, sortByRank, type ScanHit } from "@/lib/chartisme/scan"
import {
  alongsideIndex,
  stateFromHit,
  type AlongsideFigure,
  type ChartismeRule,
} from "@/lib/chartisme/rules"
import { loadRules, recordFirings } from "@/lib/chartisme/store"
import { evaluateRules } from "@/lib/chartisme/rules"
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
  studyBanner,
  type StudyPreset,
} from "@/lib/chartisme/window"
import { useDraws } from "@/lib/use-draws"

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
  const { draws, source, loading } = useDraws(era)

  const [curveId, setCurveId] = useState("sum")
  const [scaleChoice, setScaleChoice] = useState("auto")
  const [preset, setPreset] = useState<StudyPreset>(DEFAULT_STUDY_PRESET)
  const [lastN, setLastN] = useState("")
  const [minConfidence, setMinConfidence] = useState(0.6)
  const [selected, setSelected] = useState(0)
  const [selection, setSelection] = useState<CurveSelection | null>(null)
  const [status, setStatus] = useState<ModuleStatus | null>(null)
  const [firedCount, setFiredCount] = useState<number | null>(null)

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

  // La fenêtre d'étude découpe la zone lue ; le contexte qui la précède reste
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
    })
  }, [draws, preset, lastN, scaleChoice])

  // Les courbes se reconstruisent dans le navigateur : sur Netlify aucun
  // backend Python ne répond, et l'onglet doit rester entier.
  const curve = useMemo<Curve | null>(() => {
    if (!study.window.withWarmup.length) return null
    const spec = specs.find((s) => (s.n === null ? s.variable : `${s.variable}:${s.n}`) === curveId)
    if (!spec) return null
    return buildCurve(study.window.withWarmup, spec.variable, spec.n)
  }, [study, specs, curveId])

  const hits = useMemo<ScanHit[]>(() => {
    if (!curve) return []
    return sortByRank(
      collapseZones(
        scanCurve(curve, { scales: study.scales, minConfidence }).filter((hit) =>
          liveInWindow(hit, study.contextCount)
        )
      )
    )
  }, [curve, study, minConfidence])

  // La fenêtre précédente est lue exactement comme celle qu'on étudie : mêmes
  // échelles, même seuil, même longueur. Sans quoi la comparaison mesurerait
  // l'écart entre deux réglages plutôt qu'entre deux périodes.
  const previousCurve = useMemo<Curve | null>(() => {
    const rows = study.previous?.withWarmup
    if (!rows?.length) return null
    const spec = specs.find((s) => (s.n === null ? s.variable : `${s.variable}:${s.n}`) === curveId)
    if (!spec) return null
    return buildCurve(rows, spec.variable, spec.n)
  }, [study, specs, curveId])

  const previousHits = useMemo<ScanHit[]>(() => {
    if (!previousCurve || !study.previous) return []
    return sortByRank(
      collapseZones(
        scanCurve(previousCurve, { scales: study.scales, minConfidence }).filter((hit) =>
          liveInWindow(hit, study.previous!.warmupCount)
        )
      )
    )
  }, [previousCurve, study, minConfidence])

  // Le taux de base est échantillonné une fois par échelle, sans seuil : bouger
  // le curseur de confiance relit alors l'échantillon au lieu de le refaire.
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
  const baseRates = useMemo(
    () => samples.map((sample) => baseRateAbove(sample, minConfidence)),
    [samples, minConfidence]
  )

  // Trois mises en garde, de la plus dirimante à la plus nuancée : rien n'a été
  // balayé, puis rien ne peut tenir dans la fenêtre, puis la règle d'or n'a plus
  // ses vingt points. Une seule s'affiche, la première.
  const fitNote = curve ? scaleFitNote(study.scales, curve.values.length) : null
  const caveat = curve
    ? fitNote ?? shortWindowNote(study.drawCount) ?? shortScaleCaveat(study.scales)
    : null
  // Le chiffrage, lui, s'affiche toujours : c'est le seul point de comparaison
  // de la confiance lue à côté.
  const measured = curve && !fitNote ? baseRateNote(baseRates, minConfidence) : null

  // Même règle que la barre de fenêtre d'Analyse : un nombre de tirages
  // n'affine que les fenêtres comptées en tirages. Sur « 3 mois » ou
  // « Année civile », il ne les affinerait pas, il les remplacerait.
  const showLastN = preset.startsWith("last_") || lastN !== ""

  // Changer de courbe, de fenêtre ou de seuil renumérote les figures : la
  // sélection précédente désignerait autre chose. Ajusté au rendu plutôt que
  // dans un effet, qui provoquerait un rendu en cascade avec l'ancien index
  // affiché.
  const scanKey = `${era}|${curveId}|${scaleChoice}|${preset}|${lastN}|${minConfidence}`
  const [lastScanKey, setLastScanKey] = useState(scanKey)
  if (scanKey !== lastScanKey) {
    setLastScanKey(scanKey)
    setSelected(0)
    setSelection(null)
  }

  const hit = hits[selected] ?? null

  const byFigure = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const found of hits) counts[found.label] = (counts[found.label] ?? 0) + 1
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
            scanCurve(other, { scales: study.scales, minConfidence }).filter((entry) =>
              liveInWindow(entry, study.contextCount)
            )
          ).map((entry) => ({ ...entry, curve_id: id }))
        )
      }
      return found
    },
    [curveId, study, specs, minConfidence]
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
    <div className="flex flex-col gap-6">
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
              <Badge variant="outline">détection géométrique seule</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>
            {draws.length} tirages chargés · {specs.length} courbes disponibles
            {status?.last_cycle?.at
              ? ` · dernier cycle ${status.last_cycle.at} (${status.last_cycle.figures ?? 0} figures)`
              : ""}
          </p>
          {status?.models?.install_cmd && !status.models.available?.length ? (
            <p>
              Réseaux non installés. Pour les activer :{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                {status.models.install_cmd}
              </code>
              . Les 17 détecteurs géométriques fonctionnent sans eux.
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
                body: "Le balayage déplace une fenêtre sur la zone étudiée, aux échelles qui y tiennent. Chaque figure repérée est dessinée avec ses pivots nommés, sa ligne de cou ou ses bornes, sa cassure et son objectif projeté selon la table de référence. Une figure entièrement contenue dans le contexte grisé n'est pas listée : elle appartient au passé calculé pour alimenter les indicateurs, pas à la fenêtre.",
              }}
            >
              Courbe et figures
            </TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                  <span className="flex flex-1 text-left">{curveId}</span>
                </SelectTrigger>
                <SelectContent>
                  {specs.map((spec) => {
                    const id = spec.n === null ? spec.variable : `${spec.variable}:${spec.n}`
                    return (
                      <SelectItem key={id} value={id}>
                        {/* L'identifiant d'abord : c'est lui qu'une règle vise et
                            que le journal consigne. Le libellé suit pour qu'on
                            sache ce qu'on choisit dans une liste de {specs.length}. */}
                        {id} · {curveLabel(spec.variable, spec.n)}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </LabelHelp>

            <LabelHelp
              label="Fenêtre d’étude"
              help={{
                title: "Fenêtre d’étude",
                body: "La zone de tirages qu'on regarde — les 20, 50, 100 derniers, une durée, l'année, tout. Les tirages qui précèdent restent calculés en contexte (le retard d'une boule et la MM20 de la règle d'or ne repartent pas de zéro au premier tirage découpé), mais aucune figure entièrement contenue dans ce contexte n'est listée.",
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
                <SelectTrigger className="w-full" aria-label="Fenêtre d’étude">
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
                body: `Longueur des figures cherchées, distincte de la fenêtre d'étude. Une tête-épaules sur 30 tirages et un range sur 120 ne se lisent pas à la même échelle. « Auto » déduit trois échelles de la fenêtre — sa longueur, sa moitié, son quart — bornées en bas par ${MIN_STUDY_DRAWS} tirages, la plus courte figure détectable, et en haut par ${MAX_CYCLE}, au-delà desquels une figure ne décrit plus un cycle mais la longueur d'archive dont on dispose. Une seule lecture est gardée par zone, les autres passent en alternatives. Forcer une échelle plus longue que la fenêtre répond à une autre question : quelle figure longue s'achève ici.`,
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
              label={`Confiance minimale · ${minConfidence.toFixed(2)}`}
              help={{
                title: "Confiance minimale",
                body: "La confiance mesure la qualité de l'ajustement géométrique, pénalisée quand une borne repose sur moins de trois points. Attention : 85 % des marches aléatoires de 60 tirages portent au moins une figure à 0.6, et une échelle plus courte fait monter ce taux — une figure fréquente sur du bruit n'apprend rien.",
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
              Aucun tirage dans cette fenêtre — élargis la fenêtre d’étude ou
              change d’archive.
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
                <span>· {hits.length} figures</span>
                {byFigure.slice(0, 6).map(([label, count]) => (
                  <Badge key={label} variant="outline">
                    {label} × {count}
                  </Badge>
                ))}
              </div>

              <CurveCanvas
                values={curve.values}
                dates={curve.dates}
                activity={curve.activity}
                hit={hit}
                selection={selection}
                onSelect={setSelection}
                contextCount={study.contextCount}
                label={curve.label}
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
                  <div className="flex flex-wrap gap-1.5">
                    {hits.slice(0, 40).map((found, index) => (
                      <Button
                        key={`${found.figure}-${found.from_index}-${index}`}
                        size="xs"
                        variant={index === selected ? "default" : "outline"}
                        onClick={() => setSelected(index)}
                      >
                        {found.label} · {found.confidence.toFixed(2)}
                      </Button>
                    ))}
                  </div>
                  {hit ? (
                    <div className="rounded-lg border border-border p-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{hit.label}</span>
                        <Badge variant="secondary">{hit.kind}</Badge>
                        <Badge variant={outcomeVariant(hit)}>{outcomeLabel(hit)}</Badge>
                        {hit.breakout ? (
                          <Badge variant={hit.breakout.confirmed ? "default" : "destructive"}>
                            {hit.breakout.confirmed ? "cassure confirmée" : "fake breakout"}
                            {` · activité ${hit.breakout.activity_ratio.toFixed(2)}× MM20`}
                          </Badge>
                        ) : (
                          <Badge variant="outline">en formation</Badge>
                        )}
                      </div>
                      <p className="mt-2 text-muted-foreground">
                        Signal : {hit.signal}.{" "}
                        {hit.target
                          ? `Objectif ${hit.target.value.toFixed(1)} — ${hit.target.basis}.`
                          : "Objectif non projetable sans cassure."}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {hit.from} → {hit.to} · échelle {hit.scale} · détecteur{" "}
                        {hit.detector}
                      </p>
                      {hit.alternatives?.length ? (
                        <p className="mt-1 text-muted-foreground">
                          Autres lectures de la zone :{" "}
                          {hit.alternatives
                            .map((alt) => `${alt.label} (${alt.confidence.toFixed(2)})`)
                            .join(", ")}
                          .
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                ) : fitNote ? null : (
                  <p className="text-sm text-muted-foreground">
                    Aucune figure au-dessus de {minConfidence.toFixed(2)} dans cette
                    fenêtre. Baisse le seuil, change d’échelle ou élargis la
                    fenêtre d’étude.
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

      <WindowCompare
        hits={hits}
        previousHits={previousHits}
        window={study.window}
        previous={study.previous}
      />

      <LabelAtelier
        curve={curve}
        selection={selection}
        onSelect={setSelection}
        contextCount={study.contextCount}
      />

      <Sketchpad curve={curve} era={era} />

      <RulesPanel hit={hit} hits={hits} curve={curve} alongsideFor={alongsideFor} />

      <BacktestPanel
        curve={curve}
        hits={hits}
        era={era}
        scales={study.scales}
        studyWindow={study.window}
        contextCount={study.contextWanted}
      />
    </div>
  )
}
