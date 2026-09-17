"use client"

import { useEffect, useMemo, useState } from "react"
import { BrainCircuit, FlaskConical, Loader2 } from "lucide-react"

import { SpecialistCard } from "@/components/brain/specialist-card"
import { HelpTip } from "@/components/help"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { VARIABLE_LABELS, VARIABLE_NAMES, type VariableName } from "@/lib/analysis"
import type { CatalogEntry } from "@/lib/brain/catalog"
import {
  deleteSpecialist,
  inferSpecialist,
  listSpecialistFeatures,
  listSpecialists,
  specialistFeatures,
  specialistIndex,
  specialistToEntry,
  trainSpecialist,
  type SpecialistHorizon,
  type SpecialistRecord,
  type SpecialistTask,
} from "@/lib/brain/specialists"
import { beatsChanceCount, formatSkill, skillOf } from "@/lib/brain/specialist-view"
import { cn } from "@/lib/utils"

const DEFAULT_INDICATORS = ["lag1", "lag2", "rsi", "macd", "bollinger"]

const TRAIN_TARGETS = VARIABLE_NAMES.filter(
  (item) => item !== "delay" && item !== "hit" && item !== "star_delay" && item !== "star_hit"
)

export function BrainSpecialists({
  era,
  onPin,
  onIndex,
}: {
  era: "current" | "all"
  onPin: (entry: CatalogEntry) => void
  onIndex?: (items: SpecialistRecord[]) => void
}) {
  const [items, setItems] = useState<SpecialistRecord[]>(() => specialistIndex())
  const [features, setFeatures] = useState(() => specialistFeatures())
  const [name, setName] = useState("Père impair")
  const [target, setTarget] = useState<VariableName>("parity")
  const [task, setTask] = useState<SpecialistTask | "auto">("auto")
  const [horizon, setHorizon] = useState<SpecialistHorizon>("value")
  const [picked, setPicked] = useState<string[]>(DEFAULT_INDICATORS)
  const [instructions, setInstructions] = useState(
    "Forecast du nombre de pairs (0–5) à t+1. S’abstenir si la confiance est basse. Pas une grille."
  )
  const [force, setForce] = useState(false)
  const [busy, setBusy] = useState(false)
  const [inferring, setInferring] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<SpecialistRecord | null>(null)
  const [ready, setReady] = useState(() => specialistIndex().length > 0)
  const [atelierForced, setAtelierForced] = useState<boolean | null>(() =>
    specialistIndex().length > 0 ? false : null
  )

  const atelierOpen = atelierForced ?? (ready && items.length === 0)
  const beating = beatsChanceCount(items)

  const refresh = async () => {
    try {
      const listed = await listSpecialists()
      setItems(listed.items)
      onIndex?.(listed.items)
      if (listed.error && !listed.items.length) setError(listed.error)
      const nextFeatures = await listSpecialistFeatures()
      setFeatures(nextFeatures)
    } finally {
      setReady(true)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const grouped = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, typeof features>()
    for (const feature of features) {
      if (!map.has(feature.family)) {
        order.push(feature.family)
        map.set(feature.family, [])
      }
      map.get(feature.family)?.push(feature)
    }
    return order.map((family) => ({ family, items: map.get(family) ?? [] }))
  }, [features])

  const train = async () => {
    setBusy(true)
    setError(null)
    try {
      const record = await trainSpecialist({
        name,
        target,
        indicators: picked,
        instructions,
        task: task === "auto" ? null : task,
        horizon,
        force,
        era,
      })
      setLast(record)
      if (!record.saved && record.reason) setError(record.reason)
      if (record.saved) setAtelierForced(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "entraînement impossible")
    } finally {
      setBusy(false)
    }
  }

  const infer = async (slug: string) => {
    setInferring(slug)
    setError(null)
    try {
      const fresh = await inferSpecialist(slug, era)
      setLast(fresh)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "inférence impossible")
    } finally {
      setInferring(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <BrainCircuit className="size-4 text-primary" />
              Spécialistes
              <HelpTip
                title="Spécialistes"
                body="Un petit réseau par série (parité, somme…). Entraîné sur l’ère formule, noté sur les 20/50/100 derniers. Le skill dit s’il bat le hasard. Jamais une grille 5+2."
              />
              {items.length ? (
                <span className="rounded-full border border-primary/35 bg-primary/12 px-2 py-0.5 text-[10px] font-medium">
                  {items.length}
                </span>
              ) : null}
              {items.length ? (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    beating
                      ? "border-chart-3/40 bg-chart-3/15"
                      : "border-border bg-muted/40 text-muted-foreground"
                  )}
                >
                  {beating ? `${beating} ${beating > 1 ? "battent" : "bat"} le nul` : "aucun ne bat le nul"}
                </span>
              ) : null}
            </CardTitle>
            <CardDescription>
              Un réseau, une question. Roster d’abord : skill, verdict, forecast. L’atelier entraîne un nouveau
              spécialiste.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => setAtelierForced(!atelierOpen)}
          >
            <FlaskConical />
            {atelierOpen ? "Replier" : "Nouvel atelier"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {items.length === 0 && !atelierOpen ? (
          <div
            data-specialist-empty=""
            className="rounded-xl border border-dashed border-border px-3 py-5 text-center"
          >
            <p className="text-xs text-muted-foreground">
              Aucun spécialiste. Crée « Père impair » ou « Somme totale » dans l’atelier.
            </p>
            <Button size="sm" className="mt-3" onClick={() => setAtelierForced(true)}>
              <FlaskConical />
              Ouvrir l’atelier
            </Button>
          </div>
        ) : null}

        {items.length ? (
          <div data-specialist-roster="" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <SpecialistCard
                key={item.slug}
                record={item}
                highlighted={last?.slug === item.slug}
                inferring={inferring === item.slug}
                onPin={() => onPin(specialistToEntry(item))}
                onInfer={() => void infer(item.slug)}
                onDelete={() => {
                  void deleteSpecialist(item.slug).then(() => refresh())
                }}
              />
            ))}
          </div>
        ) : null}

        {atelierOpen ? (
          <div
            data-specialist-atelier=""
            className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3"
          >
            <div>
              <p className="text-xs font-medium">Atelier</p>
              <p className="text-[11px] text-muted-foreground">
                Nom, cible, features causales. Ère formule, score sur 20 / 50 / 100. CPU, une minute tout au plus.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                Nom
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Père impair" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Cible
                <select
                  className="h-8 rounded-lg border border-border bg-background px-2"
                  value={target}
                  onChange={(event) => setTarget(event.target.value as VariableName)}
                >
                  {TRAIN_TARGETS.map((item) => (
                    <option key={item} value={item}>
                      {VARIABLE_LABELS[item]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Forme
                <select
                  className="h-8 rounded-lg border border-border bg-background px-2"
                  value={task}
                  onChange={(event) => setTask(event.target.value as SpecialistTask | "auto")}
                >
                  <option value="auto">auto (classes si parité…)</option>
                  <option value="classes">classes (0–5)</option>
                  <option value="binary">binaire (plus de pairs)</option>
                  <option value="regression">régression (somme…)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Horizon
                <select
                  className="h-8 rounded-lg border border-border bg-background px-2"
                  value={horizon}
                  onChange={(event) => setHorizon(event.target.value as SpecialistHorizon)}
                >
                  <option value="value">valeur t+1</option>
                  <option value="delta">évolution Δ</option>
                </select>
              </label>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium">Indicateurs (features causales jusqu’à t)</p>
              <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/30 p-2">
                {grouped.map((group) => (
                  <div key={group.family} className="flex flex-wrap gap-1.5">
                    {group.items.map((feature) => {
                      const on = picked.includes(feature.id)
                      return (
                        <button
                          key={feature.id}
                          type="button"
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px]",
                            on ? "border-primary/50 bg-primary/15 text-foreground" : "border-border text-muted-foreground"
                          )}
                          onClick={() =>
                            setPicked((prev) => (on ? prev.filter((id) => id !== feature.id) : [...prev, feature.id]))
                          }
                        >
                          {feature.label}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1 text-xs">
              Instructions complémentaires
              <textarea
                className="min-h-20 rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="Comment Brain doit lire ce spécialiste, quand s’abstenir…"
              />
            </label>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
              Sauver même si le skill ≤ 0 (ne bat pas le hasard)
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={busy || !name.trim() || !instructions.trim() || picked.length === 0}
                onClick={() => void train()}
              >
                {busy ? <Loader2 className="animate-spin" /> : <BrainCircuit />}
                {busy ? "Entraînement…" : "Entraîner"}
              </Button>
            </div>
          </div>
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        {last && !last.saved ? (
          <div className="rounded-xl border border-primary/30 bg-primary/8 px-3 py-2 text-xs">
            <p className="font-medium">
              @{last.handle} · skill {formatSkill(last.skill ?? skillOf(last, "50"))} · {last.verdict ?? "—"} · non
              sauvé
            </p>
            <p className="mt-1 text-muted-foreground">
              20 : {formatSkill(skillOf(last, "20"))} · 50 : {formatSkill(skillOf(last, "50"))} · 100 :{" "}
              {formatSkill(skillOf(last, "100"))}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
