"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BrainCircuit, FlaskConical, Loader2 } from "lucide-react"

import { DemoTourBar, SpecialistDemoPopup } from "@/components/brain/brain-demo"
import { SpecialistCard } from "@/components/brain/specialist-card"
import { HelpTip, HelpWrap, LabelHelp } from "@/components/help"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CurveName } from "@/components/chartisme/curve-thumb"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { VARIABLE_LABELS, VARIABLE_NAMES, type VariableName } from "@/lib/analysis"
import type { CatalogEntry } from "@/lib/brain/catalog"
import type { WeekdayScope } from "@/lib/weekday-scope"
import {
  DEMO_SPECIALIST,
  DEMO_SPECIALIST_NOTE,
  DEMO_SPECIALIST_STEPS,
  queueBrainPin,
  scrollSpecialistDemo,
  specialistDemoHighlight,
  specialistDemoStepOf,
  specialistDemoWantsStart,
  waitDemoMs,
  type SpecialistDemoStepId,
} from "@/lib/brain/specialist-demo"
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
import { beatsChanceCount, formatSkill, skillOf, specialistFeatureHelp, specialistFeaturesHelp } from "@/lib/brain/specialist-view"
import { cn } from "@/lib/utils"

const DEFAULT_INDICATORS = [...DEMO_SPECIALIST.indicators]

const FEATURE_FAMILY_LABELS: Record<string, string> = {
  lags: "Lags",
  momentum: "Momentum",
  volatilite: "Volatilité",
  moyennes: "Moyennes",
  tendance: "Tendance",
}

const HELP = {
  title: {
    title: "Spécialistes",
    body: "Un petit réseau par série (parité, somme…). Entraîné sur l’ère formule, noté sur les 20/50/100 derniers. Le score vs hasard dit s’il bat le hasard. Jamais une grille 5+2.",
  },
  name: {
    title: "Nom",
    body: "Libellé humain. Il devient le handle @specialist.paire-impair, enregistré dans .brain/specialists/.",
  },
  target: {
    title: "Cible",
    body: "Série à prévoir : parité (0–5 pairs), somme, étendue… Pas une grille. Le réseau ne voit que cette question.",
  },
  task: {
    title: "Forme",
    body: "auto choisit classes pour une parité, régression pour une somme. Binaire = plus de pairs, ou pas.",
    items: [
      { label: "classes", text: "Une étiquette parmi 0–5 (nombre de pairs, etc.)." },
      { label: "régression", text: "Une valeur continue (somme, étendue…)." },
    ],
  },
  horizon: {
    title: "Horizon",
    body: "valeur = le prochain point (t+1). Δ = son évolution. Les deux restent une série nommée, pas une 5+2.",
  },
  instructions: {
    title: "Instructions",
    body: "Consignes collées à Brain : comment lire ce spécialiste, quand s’abstenir. Obligatoire.",
  },
  force: {
    title: "Enregistrer même si score ≤ 0",
    body: "Par défaut on n’enregistre pas un réseau qui ne bat pas le hasard. Cochez seulement pour inspecter un échec.",
  },
  train: {
    title: "Entraîner",
    body: "Ère formule, score sur 20 / 50 / 100. CPU, une minute tout au plus. N’écrit que si le score vs hasard est > 0, sauf force.",
  },
  saved: {
    title: "Enregistrés",
    body: "Réseaux déjà écrits. Réinférer = nouvelle prévision t+1. Épingler = Brain le voit. Supprimer retire le dossier.",
  },
  pin: {
    title: "Épingler",
    body: "Pose le spécialiste sur la table de Brain. Sans ça, Brain ne le cite pas.",
  },
  infer: {
    title: "Réinférer",
    body: "Recalcule la prévision t+1 sur l’ère affichée, sans réentraîner.",
  },
}

const TRAIN_TARGETS = VARIABLE_NAMES.filter(
  (item) => item !== "delay" && item !== "hit" && item !== "star_delay" && item !== "star_hit"
)

export function BrainSpecialists({
  era,
  weekday,
  onPin,
  onIndex,
}: {
  era: "current" | "all"
  weekday?: WeekdayScope
  onPin: (entry: CatalogEntry) => void
  onIndex?: (items: SpecialistRecord[]) => void
}) {
  const [items, setItems] = useState<SpecialistRecord[]>(() => specialistIndex())
  const [features, setFeatures] = useState(() => specialistFeatures())
  const [name, setName] = useState(DEMO_SPECIALIST.name)
  const [target, setTarget] = useState<VariableName>(DEMO_SPECIALIST.target)
  const [task, setTask] = useState<SpecialistTask | "auto">(DEMO_SPECIALIST.task)
  const [horizon, setHorizon] = useState<SpecialistHorizon>(DEMO_SPECIALIST.horizon)
  const [picked, setPicked] = useState<string[]>(DEFAULT_INDICATORS)
  const [instructions, setInstructions] = useState(DEMO_SPECIALIST.instructions)
  const [force, setForce] = useState(false)
  const [busy, setBusy] = useState(false)
  const [inferring, setInferring] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<SpecialistRecord | null>(null)
  const [ready, setReady] = useState(() => specialistIndex().length > 0)
  const [atelierForced, setAtelierForced] = useState<boolean | null>(() =>
    specialistIndex().length > 0 ? false : null
  )
  const [demoStep, setDemoStep] = useState<SpecialistDemoStepId | null>(null)
  const [demoRunning, setDemoRunning] = useState(false)
  const [demoDone, setDemoDone] = useState(false)
  const [demoWaiting, setDemoWaiting] = useState(false)
  const demoStopRef = useRef(false)
  const demoAutoRef = useRef(false)
  const demoGateRef = useRef<{ resolve: (ok: boolean) => void } | null>(null)
  const pathname = usePathname()
  const dedicated = pathname.includes("specialistes")

  const atelierOpen = demoRunning || (atelierForced ?? (ready && items.length === 0))
  const beating = beatsChanceCount(items)

  const onIndexRef = useRef(onIndex)
  onIndexRef.current = onIndex

  const refresh = useCallback(async () => {
    try {
      const listed = await listSpecialists()
      setItems(listed.items)
      onIndexRef.current?.(listed.items)
      if (listed.error && !listed.items.length) setError(listed.error)
      const nextFeatures = await listSpecialistFeatures()
      setFeatures(nextFeatures)
      return listed.items
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

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

  const pinEntry = (entry: CatalogEntry) => {
    onPin(entry)
    queueBrainPin(entry.id)
  }

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
      }, weekday)
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
      const fresh = await inferSpecialist(slug, era, weekday)
      setLast(fresh)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "inférence impossible")
    } finally {
      setInferring(null)
    }
  }

  const finishDemoGate = useCallback((ok: boolean) => {
    const gate = demoGateRef.current
    demoGateRef.current = null
    setDemoWaiting(false)
    gate?.resolve(ok)
  }, [])

  const stopDemo = useCallback(() => {
    demoStopRef.current = true
    setDemoRunning(false)
    setDemoDone(true)
    setDemoStep(null)
    finishDemoGate(false)
  }, [finishDemoGate])

  const nextDemoStep = useCallback(() => {
    finishDemoGate(true)
  }, [finishDemoGate])

  const runDemo = useCallback(async () => {
    if (demoRunning) return
    demoAutoRef.current = true
    demoStopRef.current = false
    setDemoRunning(true)
    setDemoDone(false)
    setDemoWaiting(false)
    setError(null)
    setAtelierForced(true)

    const begin = (step: SpecialistDemoStepId) => {
      setDemoStep(step)
      setDemoWaiting(false)
      scrollSpecialistDemo(specialistDemoStepOf(step).target)
    }

    const ask = async (step: SpecialistDemoStepId) => {
      if (demoStopRef.current) return false
      setDemoStep(step)
      scrollSpecialistDemo(specialistDemoStepOf(step).target)
      await waitDemoMs(380)
      if (demoStopRef.current) return false
      setDemoWaiting(true)
      const ok = await new Promise<boolean>((resolve) => {
        demoGateRef.current = { resolve }
      })
      return ok && !demoStopRef.current
    }

    try {
      begin("intro")
      if (!(await ask("intro"))) return

      begin("name")
      setName(DEMO_SPECIALIST.name)
      if (!(await ask("name"))) return

      begin("target")
      setTarget(DEMO_SPECIALIST.target)
      if (!(await ask("target"))) return

      begin("task")
      setTask(DEMO_SPECIALIST.task)
      if (!(await ask("task"))) return

      begin("horizon")
      setHorizon(DEMO_SPECIALIST.horizon)
      if (!(await ask("horizon"))) return

      begin("features")
      setPicked([...DEMO_SPECIALIST.indicators])
      if (!(await ask("features"))) return

      begin("instructions")
      setInstructions(DEMO_SPECIALIST.instructions)
      if (!(await ask("instructions"))) return

      begin("force")
      setForce(false)
      if (!(await ask("force"))) return

      begin("train")
      if (!(await ask("train"))) return

      begin("saved")
      const listed = await refresh()
      const first = listed[0]
      if (first) {
        try {
          const fresh = await inferSpecialist(first.slug, era)
          if (demoStopRef.current) return
          setLast(fresh)
        } catch {
          setLast(first)
        }
      }
      if (!(await ask("saved"))) return

      begin("pin")
      if (first) {
        const entry = specialistToEntry(first)
        onPin(entry)
        queueBrainPin(entry.id)
      }
      if (!(await ask("pin"))) return
    } catch (err) {
      setError(err instanceof Error ? err.message : "La démo a buté.")
    } finally {
      setDemoWaiting(false)
      setDemoRunning(false)
      setDemoDone(true)
      if (!demoStopRef.current) setDemoStep("pin")
    }
  }, [demoRunning, era, onPin, refresh])

  useEffect(() => {
    if (demoAutoRef.current) return
    if (typeof window === "undefined") return
    if (!specialistDemoWantsStart(window.location.search, window.location.pathname)) return
    const timer = window.setTimeout(() => {
      if (demoAutoRef.current) return
      void runDemo()
    }, 80)
    return () => window.clearTimeout(timer)
  }, [runDemo])

  return (
    <Card
      id="specialistes"
      data-demo="specialists"
      className={cn("scroll-mt-24", specialistDemoHighlight(demoStep, ["intro"], demoWaiting))}
    >
      <SpecialistDemoPopup
        step={demoStep}
        open={demoRunning && demoWaiting}
        onNext={nextDemoStep}
        onCancel={stopDemo}
      />
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <BrainCircuit className="size-4 text-primary" />
              Spécialistes
              <HelpTip {...HELP.title} />
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
              Un réseau, une question. Roster d’abord : score vs hasard, verdict, prévision. L’atelier entraîne un nouveau
              spécialiste.{" "}
              {dedicated ? (
                <Link className="text-primary underline-offset-2 hover:underline" href="/brain">
                  Discussion Brain
                </Link>
              ) : (
                <Link className="text-primary underline-offset-2 hover:underline" href="/brain/specialistes">
                  Page dédiée
                </Link>
              )}
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
        <DemoTourBar
          title="Démo Spécialistes"
          help={{
            title: "Démo Spécialistes",
            body: `${DEMO_SPECIALIST_NOTE} Un pop-up vous arrête après chaque étape : Suivant ou Annuler. Ollama n’est pas requis.`,
          }}
          steps={DEMO_SPECIALIST_STEPS}
          step={demoStep}
          running={demoRunning}
          done={demoDone}
          waiting={demoWaiting}
          idleHint="Formulaire Paire impair, pop-up Suivant/Annuler, épinglage s’il existe. Sans entraîner."
          doneHint="Terminée : le formulaire, les enregistrés et l’épingle restent sous vos yeux."
          onStart={() => void runDemo()}
          onStop={stopDemo}
          startLabel="Lancer la démo"
          dataDemo="spec-bar"
        />

        <div
          data-demo="spec-saved"
          className={cn("rounded-xl p-0.5", specialistDemoHighlight(demoStep, ["saved"], demoWaiting))}
        >
          <p className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium">
            Enregistrés
            <HelpTip {...HELP.saved} />
          </p>
          {items.length === 0 ? (
            <div
              data-specialist-empty=""
              data-demo="spec-pin"
              className="rounded-xl border border-dashed border-border px-3 py-5 text-center"
            >
              <p className="text-xs text-muted-foreground">
                Aucun spécialiste. Crée « Paire impair » ou « Somme totale » dans l’atelier.
              </p>
              {!atelierOpen ? (
                <Button size="sm" className="mt-3" onClick={() => setAtelierForced(true)}>
                  <FlaskConical />
                  Ouvrir l’atelier
                </Button>
              ) : null}
            </div>
          ) : (
            <div data-specialist-roster="" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item, index) => (
                <div
                  key={item.slug}
                  data-demo={index === 0 ? "spec-pin" : undefined}
                  className={cn(
                    "rounded-xl",
                    index === 0 ? specialistDemoHighlight(demoStep, ["pin"], demoWaiting) : ""
                  )}
                >
                  <SpecialistCard
                    record={item}
                    highlighted={last?.slug === item.slug || (demoStep === "pin" && index === 0)}
                    inferring={inferring === item.slug}
                    onPin={() => pinEntry(specialistToEntry(item))}
                    onInfer={() => void infer(item.slug)}
                    onDelete={() => {
                      void deleteSpecialist(item.slug).then(() => refresh())
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

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
              <div
                data-demo="spec-name"
                className={cn("rounded-xl p-0.5", specialistDemoHighlight(demoStep, ["name"], demoWaiting))}
              >
                <LabelHelp label="Nom" help={HELP.name}>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Paire impair"
                  />
                </LabelHelp>
              </div>
              <div
                data-demo="spec-target"
                className={cn("rounded-xl p-0.5", specialistDemoHighlight(demoStep, ["target"], demoWaiting))}
              >
                <LabelHelp label="Cible" help={HELP.target}>
                  <Select
                    value={target}
                    onValueChange={(value) => value && setTarget(value as VariableName)}
                  >
                    <SelectTrigger className="w-full" aria-label="Cible">
                      <span className="flex flex-1 text-left">
                        <CurveName kind={target} label={VARIABLE_LABELS[target]} />
                      </span>
                    </SelectTrigger>
                    <SelectContent className="min-w-56">
                      {TRAIN_TARGETS.map((item) => (
                        <SelectItem key={item} value={item}>
                          <CurveName kind={item} label={VARIABLE_LABELS[item]} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </LabelHelp>
              </div>
              <div
                data-demo="spec-task"
                className={cn("rounded-xl p-0.5", specialistDemoHighlight(demoStep, ["task"], demoWaiting))}
              >
                <LabelHelp label="Forme" help={HELP.task}>
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
                </LabelHelp>
              </div>
              <div
                data-demo="spec-horizon"
                className={cn("rounded-xl p-0.5", specialistDemoHighlight(demoStep, ["horizon"], demoWaiting))}
              >
                <LabelHelp label="Horizon" help={HELP.horizon}>
                  <select
                    className="h-8 rounded-lg border border-border bg-background px-2"
                    value={horizon}
                    onChange={(event) => setHorizon(event.target.value as SpecialistHorizon)}
                  >
                    <option value="value">valeur t+1</option>
                    <option value="delta">évolution Δ</option>
                  </select>
                </LabelHelp>
              </div>
            </div>

            <div
              data-demo="spec-features"
              className={cn("rounded-xl p-0.5", specialistDemoHighlight(demoStep, ["features"], demoWaiting))}
            >
              <p className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium">
                Indicateurs (features causales jusqu’à t)
                <HelpTip {...specialistFeaturesHelp(features)} />
              </p>
              <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/30 p-2">
                {grouped.map((group) => (
                  <div key={group.family} className="flex flex-col gap-1">
                    <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                      {FEATURE_FAMILY_LABELS[group.family] ?? group.family}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((feature) => {
                        const on = picked.includes(feature.id)
                        const help = specialistFeatureHelp(feature)
                        return (
                          <span key={feature.id} className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              title={help.body}
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[11px]",
                                on
                                  ? "border-primary/50 bg-primary/15 text-foreground"
                                  : "border-border text-muted-foreground"
                              )}
                              onClick={() =>
                                setPicked((prev) =>
                                  on ? prev.filter((id) => id !== feature.id) : [...prev, feature.id]
                                )
                              }
                            >
                              {feature.label}
                            </button>
                            <HelpTip {...help} />
                          </span>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              data-demo="spec-instructions"
              className={cn("rounded-xl p-0.5", specialistDemoHighlight(demoStep, ["instructions"], demoWaiting))}
            >
              <LabelHelp label="Instructions complémentaires" help={HELP.instructions}>
                <textarea
                  className="min-h-20 rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  placeholder="Comment Brain doit lire ce spécialiste, quand s’abstenir…"
                />
              </LabelHelp>
            </div>

            <label
              data-demo="spec-force"
              className={cn(
                "flex items-center gap-2 rounded-xl p-0.5 text-xs text-muted-foreground",
                specialistDemoHighlight(demoStep, ["force"], demoWaiting)
              )}
            >
              <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
              <span className="inline-flex items-center gap-1">
                Enregistrer même si le score vs hasard ≤ 0
                <HelpTip {...HELP.force} />
              </span>
            </label>

            <div
              data-demo="spec-train"
              className={cn(
                "flex flex-wrap items-center gap-2 rounded-xl p-0.5",
                specialistDemoHighlight(demoStep, ["train"], demoWaiting)
              )}
            >
              <HelpWrap help={HELP.train}>
                <Button
                  size="sm"
                  disabled={busy || demoRunning || !name.trim() || !instructions.trim() || picked.length === 0}
                  onClick={() => void train()}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <BrainCircuit />}
                  {busy ? "Entraînement…" : "Entraîner"}
                </Button>
              </HelpWrap>
              <span className="text-[11px] text-muted-foreground">
                Ère formule, score sur 20 / 50 / 100. CPU, une minute tout au plus.
              </span>
            </div>
          </div>
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        {last && !last.saved ? (
          <div className="rounded-xl border border-primary/30 bg-primary/8 px-3 py-2 text-xs">
            <p className="font-medium">
              @{last.handle} · score vs hasard {formatSkill(last.skill ?? skillOf(last, "50"))} · {last.verdict ?? "—"} · non
              enregistré
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
