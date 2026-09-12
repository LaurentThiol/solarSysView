"use client"

import { useEffect, useMemo, useState } from "react"

import { BacktestPanel } from "@/components/chartisme/backtest-panel"
import { CurveCanvas, type CurveSelection } from "@/components/chartisme/curve-canvas"
import { LabelAtelier } from "@/components/chartisme/label-atelier"
import { RulesPanel } from "@/components/chartisme/rules-panel"
import { Sketchpad } from "@/components/chartisme/sketchpad"
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
import { buildCurve, curveSpecs, type Curve } from "@/lib/chartisme/curves"
import { collapseZones, scanCurve, sortByRank, type ScanHit } from "@/lib/chartisme/scan"
import { stateFromHit } from "@/lib/chartisme/rules"
import { loadRules, recordFirings } from "@/lib/chartisme/store"
import { evaluateRules } from "@/lib/chartisme/rules"
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
  { value: "multi", label: "Multi-échelle (30 · 60 · 120)" },
  { value: "30", label: "Courte (30 tirages)" },
  { value: "60", label: "Moyenne (60 tirages)" },
  { value: "120", label: "Longue (120 tirages)" },
]

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
  const [scaleChoice, setScaleChoice] = useState("multi")
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

  // Les courbes se reconstruisent dans le navigateur : sur Netlify aucun
  // backend Python ne répond, et l'onglet doit rester entier.
  const curve = useMemo<Curve | null>(() => {
    if (!draws.length) return null
    const spec = specs.find((s) => (s.n === null ? s.variable : `${s.variable}:${s.n}`) === curveId)
    if (!spec) return null
    return buildCurve(draws, spec.variable, spec.n)
  }, [draws, specs, curveId])

  const hits = useMemo<ScanHit[]>(() => {
    if (!curve) return []
    const scales = scaleChoice === "multi" ? null : [Number(scaleChoice)]
    return sortByRank(
      collapseZones(scanCurve(curve, { scales, minConfidence }))
    )
  }, [curve, scaleChoice, minConfidence])

  useEffect(() => {
    setSelected(0)
    setSelection(null)
  }, [curveId, scaleChoice, minConfidence])

  const hit = hits[selected] ?? null

  const byFigure = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const found of hits) counts[found.label] = (counts[found.label] ?? 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [hits])

  function runRules() {
    const rules = loadRules()
    if (!rules.length) {
      setFiredCount(0)
      return
    }
    const firings = hits.flatMap((found) =>
      evaluateRules(rules, stateFromHit(found, { curve }))
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
                body: "Le balayage déplace une fenêtre sur toute la courbe, à trois échelles. Chaque figure repérée est dessinée avec ses pivots nommés, sa ligne de cou ou ses bornes, sa cassure et son objectif projeté selon la table de référence.",
              }}
            >
              Courbe et figures
            </TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <LabelHelp
              label="Courbe"
              help={{
                title: "Courbe",
                body: "Une courbe = une variable d'analyse déroulée sur les tirages. Somme, étendue, parité, mais aussi le retard ou la présence de chaque boule et de chaque étoile : 124 courbes en tout.",
              }}
            >
              <Select value={curveId} onValueChange={(v) => setCurveId(v ?? curveId)}>
                <SelectTrigger className="w-full" />
                <SelectContent>
                  {specs.map((spec) => {
                    const id = spec.n === null ? spec.variable : `${spec.variable}:${spec.n}`
                    return (
                      <SelectItem key={id} value={id}>
                        {id}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </LabelHelp>

            <LabelHelp
              label="Échelle"
              help={{
                title: "Échelle de la fenêtre",
                body: "Une tête-épaules sur 30 tirages et un range sur 120 ne se lisent pas à la même échelle. Le mode multi-échelle balaie les trois puis ne garde qu'une lecture par zone, les autres passant en alternatives.",
              }}
            >
              <Select
                value={scaleChoice}
                onValueChange={(v) => setScaleChoice(v ?? "multi")}
              >
                <SelectTrigger className="w-full" />
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
                body: "La confiance mesure la qualité de l'ajustement géométrique, pénalisée quand une borne repose sur moins de trois points. Attention : 85 % des marches aléatoires portent au moins une figure à 0.6 — une figure fréquente sur du bruit n'apprend rien.",
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
              label="Période"
              help={{
                title: "Période",
                body: "« Ère courante » se limite au format à 5 étoiles sur 12 ; « tout » remonte à 2004, au prix d'une rupture de règles au milieu de l'archive.",
              }}
            >
              <Select
                value={era}
                onValueChange={(value) => setEra(value as "current" | "all")}
              >
                <SelectTrigger className="w-full" />
                <SelectContent>
                  <SelectItem value="current">Ère courante</SelectItem>
                  <SelectItem value="all">Toute l’archive</SelectItem>
                </SelectContent>
              </Select>
            </LabelHelp>
          </div>

          {loading && !curve ? (
            <p className="text-sm text-muted-foreground">Chargement des tirages…</p>
          ) : null}

          {curve ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{curve.label}</span>
                <span>· {curve.draw_count} tirages</span>
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
                label={curve.label}
              />

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
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucune figure au-dessus de {minConfidence.toFixed(2)} sur cette
                  courbe. Baisse le seuil ou change d’échelle.
                </p>
              )}

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

      <LabelAtelier curve={curve} selection={selection} onSelect={setSelection} />

      <Sketchpad curve={curve} era={era} />

      <RulesPanel hit={hit} hits={hits} curve={curve} />

      <BacktestPanel curve={curve} hits={hits} era={era} />
    </div>
  )
}
