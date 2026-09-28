"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { ReadingProgress, TreeViewport } from "@/components/brain/decision-tree-frame"
import { SpecialistGlyph } from "@/components/brain/specialist-card"
import { HelpTip } from "@/components/help"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { VARIABLE_LABELS, VARIABLE_NAMES, type VariableName } from "@/lib/analysis"
import {
  cancelDecisionJob,
  clearSpecialistDraft,
  readSpecialistDraft,
  startDecisionJob,
  waitDecisionJob,
  type DecisionDraft,
  type DecisionReading,
} from "@/lib/brain/decision-tree"
import type { SpecialistDemoStepId } from "@/lib/brain/specialist-demo"
import { specialistDemoHighlight } from "@/lib/brain/specialist-demo"
import { specialistFeatures, trainSpecialist, type SpecialistFeature } from "@/lib/brain/specialists"
import { targetGlyph } from "@/lib/brain/specialist-view"
import type { WeekdayScope } from "@/lib/weekday-scope"
import { cn } from "@/lib/utils"

const CARDS: { series: VariableName; label: string; phrase: string }[] = [
  { series: "parity", label: "Parité", phrase: "parité ≥ 3" },
  { series: "sum", label: "Somme", phrase: "somme haute" },
  { series: "spread", label: "Étendue", phrase: "étendue haute" },
  { series: "n1", label: "n1", phrase: "n1 haut" },
]

const DEMO_DRAFT: DecisionDraft = {
  name: "Parité · flux",
  target: "parity",
  task: "binary",
  horizon: "value",
  indicators: ["lag1", "slope"],
  instructions: "Arbre decisionTree. Forme binaire : parité ≥ 3.",
  origin: "demo-flux",
  label_phrase: "parité ≥ 3",
}

const OTHER = (["n2", "n3", "n4", "n5", "e1", "e2", "g1", "g2", "g3", "g4"] as const).filter((item) =>
  (VARIABLE_NAMES as readonly string[]).includes(item)
)

export function SpecialistFluxCards({
  era,
  weekday,
  demoStep,
  onOpenAtelier,
}: {
  era: "current" | "all"
  weekday?: WeekdayScope
  demoStep?: SpecialistDemoStepId | null
  onOpenAtelier: (draft: DecisionDraft) => void
}) {
  const [other, setOther] = useState<VariableName>("n2")
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState<string | null>(null)
  const [k, setK] = useState(0)
  const [n, setN] = useState(0)
  const [jobId, setJobId] = useState("")
  const [reading, setReading] = useState<DecisionReading | null>(null)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [training, setTraining] = useState(false)
  const features = specialistFeatures()
  const showDemo = demoStep === "confirm"
  const draft = showDemo ? DEMO_DRAFT : reading?.drafts?.[0]
  const beats = showDemo ? true : Boolean(reading?.beats_independence)
  const seriesLabel = CARDS.find((item) => item.series === (draft?.target || reading?.series))?.label ?? "cette série"

  useEffect(() => {
    const stored = readSpecialistDraft()
    if (!stored) return
    clearSpecialistDraft()
    onOpenAtelier(stored)
  }, [onOpenAtelier])

  const readSeries = async (series: string) => {
    setError(null)
    setReading(null)
    setRunning(true)
    setStage("tableau")
    try {
      const job = await startDecisionJob({ question: "series", series, era }, weekday)
      setJobId(job.id)
      const result = await waitDecisionJob(job.id, (tick) => {
        setStage(tick.stage ?? null)
        setK(tick.k ?? 0)
        setN(tick.n ?? 0)
      })
      if (result) {
        setReading(result)
        setName(result.drafts?.[0]?.name ?? "")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lecture impossible")
    } finally {
      setRunning(false)
    }
  }

  const train = async () => {
    if (!draft || !reading) return
    setTraining(true)
    setError(null)
    try {
      const record = await trainSpecialist(
        {
          name: name.trim() || draft.name,
          target: draft.target,
          indicators: draft.indicators,
          instructions: draft.instructions,
          task: "binary",
          horizon: "value",
          era,
          origin: reading.slug,
        },
        weekday
      )
      if (!record.saved && record.reason) setError(record.reason)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Entraînement impossible")
    } finally {
      setTraining(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        Quatre séries, ou une autre. Un clic lit le flux de cette seule série, avec la même question binaire que le spécialiste.
        <HelpTip
          title="Cartes de flux"
          body="Parité, Somme, Étendue et n1 lancent decisionTree sur cette série. Si un seuil tient, la carte de confirmation montre les indicateurs allumés et les consignes déjà écrites. Seul le nom se corrige avant d’entraîner. Un verdict sans seuil laisse les autres cartes, et l’atelier manuel reste replié."
        />
      </p>
      <div
        data-demo="spec-flux-cards"
        className={cn("grid gap-2 sm:grid-cols-2 xl:grid-cols-5", specialistDemoHighlight(demoStep ?? null, ["flux"]))}
      >
        {CARDS.map((item) => (
          <button
            key={item.series}
            type="button"
            className="rounded-xl border border-border bg-card/40 px-2.5 py-2 text-left"
            onClick={() => void readSeries(item.series)}
            disabled={running}
          >
            <span className="flex items-center gap-2">
              <SpecialistGlyph kind={targetGlyph(item.series)} className="size-8 text-primary" />
              <span>
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-[11px] text-muted-foreground">{item.phrase}</span>
              </span>
            </span>
          </button>
        ))}
        <div className="flex flex-col gap-1 rounded-xl border border-dashed border-border px-2.5 py-2">
          <p className="text-sm font-medium">Autre série</p>
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={other}
            aria-label="Autre série"
            onChange={(event) => setOther(event.target.value as VariableName)}
          >
            {OTHER.map((item) => (
              <option key={item} value={item}>
                {(VARIABLE_LABELS as Record<string, string>)[item] ?? item}
              </option>
            ))}
          </select>
          <Button type="button" size="xs" variant="outline" disabled={running} onClick={() => void readSeries(other)}>
            Lire le flux
          </Button>
        </div>
      </div>
      {running ? (
        <div className="flex flex-col gap-2">
          <ReadingProgress stage={stage} k={k} n={n} running />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (jobId) void cancelDecisionJob(jobId)
              setRunning(false)
            }}
          >
            Annuler
          </Button>
        </div>
      ) : null}
      {reading && !beats ? (
        <p className="text-xs text-muted-foreground">Pas de seuil de flux sur {seriesLabel.toLowerCase()}.</p>
      ) : null}
      {draft && (beats || showDemo) ? (
        <div
          data-demo="spec-flux-confirm"
          className={cn(
            "flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3",
            specialistDemoHighlight(demoStep ?? null, ["confirm"])
          )}
        >
          <p className="text-sm">{showDemo ? "Le flux porte un seuil sur la parité." : reading?.verdict_text}</p>
          {reading?.case_svg && !showDemo ? (
            <TreeViewport svg={reading.case_svg} label="Chemin du prochain tirage" compact fallbackHint={false} />
          ) : null}
          <p className="text-[11px] text-muted-foreground">{draft.label_phrase}</p>
          <IndicatorRow features={features} picked={draft.indicators} />
          <label className="text-xs">
            Nom
            <Input className="mt-1" value={name || draft.name} onChange={(event) => setName(event.target.value)} />
          </label>
          <p className="text-[11px] leading-4 text-muted-foreground">{draft.instructions}</p>
          {beats && !showDemo ? (
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" size="sm" disabled={training} onClick={() => void train()}>
                {training ? <Loader2 className="animate-spin" /> : null}
                Entraîner
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => onOpenAtelier({ ...draft, name: name || draft.name })}>
                Ouvrir l’atelier
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div data-demo="spec-flux-confirm" className={specialistDemoHighlight(demoStep ?? null, ["confirm"])} />
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

function IndicatorRow({ features, picked }: { features: SpecialistFeature[]; picked: string[] }) {
  const known = features.length ? features : picked.map((id) => ({ id, label: id, family: "", period: 1 }))
  return (
    <div className="flex flex-wrap gap-1">
      {known.map((feature) => {
        const on = picked.includes(feature.id)
        return (
          <span
            key={feature.id}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px]",
              on ? "border-primary/50 bg-primary/15 text-foreground" : "border-border text-muted-foreground opacity-50"
            )}
          >
            {feature.label}
          </span>
        )
      })}
    </div>
  )
}
