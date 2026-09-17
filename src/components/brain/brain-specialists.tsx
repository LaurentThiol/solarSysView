"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BrainCircuit, Loader2, Pin, Trash2 } from "lucide-react"

import { DemoTourBar } from "@/components/brain/brain-demo"
import { DemoCoach } from "@/components/brain/demo-coach"
import { HelpTip, HelpWrap, LabelHelp } from "@/components/help"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { VARIABLE_LABELS, VARIABLE_NAMES, type VariableName } from "@/lib/analysis"
import type { CatalogEntry } from "@/lib/brain/catalog"
import {
  DEMO_SPECIALIST,
  DEMO_SPECIALIST_NOTE,
  DEMO_SPECIALIST_STEPS,
  queueBrainPin,
  scrollSpecialistDemo,
  specialistDemoHighlight,
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
import { cn } from "@/lib/utils"

const DEFAULT_INDICATORS = [...DEMO_SPECIALIST.indicators]

const HELP = {
  title: {
    title: "Spécialistes",
    body: "Un petit réseau par série (parité, somme…). Entraîné sur l’ère formule, noté sur les 20/50/100 derniers. Le skill dit s’il bat le hasard. Jamais une grille 5+2.",
  },
  name: {
    title: "Nom",
    body: "Libellé humain. Il devient le handle @specialist.paire-impair, sauvé dans .brain/specialists/.",
  },
  target: {
    title: "Cible",
    body: "Série à forecast : parité (0–5 pairs), somme, étendue… Pas une grille. Le réseau ne voit que cette question.",
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
  features: {
    title: "Indicateurs",
    body: "Entrées du réseau, calculées jusqu’au tirage t. Pas de fuite du futur. Au moins un indicateur.",
  },
  instructions: {
    title: "Instructions",
    body: "Consignes collées à Brain : comment lire ce spécialiste, quand s’abstenir. Obligatoire.",
  },
  force: {
    title: "Sauver même si skill ≤ 0",
    body: "Par défaut on ne sauve pas un réseau qui ne bat pas le hasard. Coche seulement pour inspecter un échec.",
  },
  train: {
    title: "Entraîner",
    body: "Ère formule, score sur 20 / 50 / 100. CPU, une minute tout au plus. N’écrit que si le skill est > 0, sauf force.",
  },
  saved: {
    title: "Sauvés",
    body: "Réseaux déjà écrits. Réinférer = nouveau forecast t+1. Épingler = Brain le voit. Supprimer retire le dossier.",
  },
  pin: {
    title: "Épingler",
    body: "Pose le spécialiste sur la table de Brain. Sans ça, Brain ne le cite pas.",
  },
  infer: {
    title: "Réinférer",
    body: "Recalcule le forecast t+1 sur l’ère affichée, sans réentraîner.",
  },
}

function scoreCell(record: SpecialistRecord, key: "20" | "50" | "100") {
  const row = record.windows?.[key]
  const skill = row?.skill ?? (key === "20" ? record.skill_20 : key === "50" ? record.skill_50 : record.skill_100)
  if (skill == null) return "—"
  return String(skill)
}

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
  const [name, setName] = useState(DEMO_SPECIALIST.name)
  const [target, setTarget] = useState<VariableName>(DEMO_SPECIALIST.target)
  const [task, setTask] = useState<SpecialistTask | "auto">(DEMO_SPECIALIST.task)
  const [horizon, setHorizon] = useState<SpecialistHorizon>(DEMO_SPECIALIST.horizon)
  const [picked, setPicked] = useState<string[]>(DEFAULT_INDICATORS)
  const [instructions, setInstructions] = useState(DEMO_SPECIALIST.instructions)
  const [force, setForce] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<SpecialistRecord | null>(null)
  const [demoStep, setDemoStep] = useState<SpecialistDemoStepId | null>(null)
  const [demoRunning, setDemoRunning] = useState(false)
  const [demoDone, setDemoDone] = useState(false)
  const demoStopRef = useRef(false)
  const demoAutoRef = useRef(false)
  const pathname = usePathname()
  const dedicated = pathname.includes("specialistes")

  const onIndexRef = useRef(onIndex)
  onIndexRef.current = onIndex

  const refresh = useCallback(async () => {
    const listed = await listSpecialists()
    setItems(listed.items)
    onIndexRef.current?.(listed.items)
    if (listed.error && !listed.items.length) setError(listed.error)
    const nextFeatures = await listSpecialistFeatures()
    setFeatures(nextFeatures)
    return listed.items
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
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "entraînement impossible")
    } finally {
      setBusy(false)
    }
  }

  const stopDemo = useCallback(() => {
    demoStopRef.current = true
    setDemoRunning(false)
    setDemoDone(true)
  }, [])

  const runDemo = useCallback(async () => {
    if (demoRunning) return
    demoAutoRef.current = true
    demoStopRef.current = false
    setDemoRunning(true)
    setDemoDone(false)
    setError(null)

    const go = async (step: SpecialistDemoStepId) => {
      if (demoStopRef.current) return false
      setDemoStep(step)
      const targetId = DEMO_SPECIALIST_STEPS.find((item) => item.id === step)?.target
      if (targetId) scrollSpecialistDemo(targetId)
      await waitDemoMs(1600)
      return !demoStopRef.current
    }

    try {
      if (!(await go("intro"))) return
      setName(DEMO_SPECIALIST.name)
      if (!(await go("name"))) return
      setTarget(DEMO_SPECIALIST.target)
      if (!(await go("target"))) return
      setTask(DEMO_SPECIALIST.task)
      if (!(await go("task"))) return
      setHorizon(DEMO_SPECIALIST.horizon)
      if (!(await go("horizon"))) return
      setPicked([...DEMO_SPECIALIST.indicators])
      if (!(await go("features"))) return
      setInstructions(DEMO_SPECIALIST.instructions)
      if (!(await go("instructions"))) return
      setForce(false)
      if (!(await go("force"))) return
      if (!(await go("train"))) return
      const listed = await refresh()
      if (!(await go("saved"))) return
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
      if (!(await go("pin"))) return
      if (first) {
        const entry = specialistToEntry(first)
        onPin(entry)
        queueBrainPin(entry.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "La démo a buté.")
    } finally {
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
      className={cn("scroll-mt-24", specialistDemoHighlight(demoStep, ["intro"]))}
    >
      {demoRunning ? <DemoCoach stepId={demoStep} steps={DEMO_SPECIALIST_STEPS} /> : null}
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BrainCircuit className="size-4 text-primary" />
          Spécialistes
          <HelpTip {...HELP.title} />
        </CardTitle>
        <CardDescription>
          Un réseau, une question. Instructions collées au modèle. Sauvegardé dans .brain/specialists/ pour réemploi.{" "}
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
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DemoTourBar
          title="Démo Spécialistes"
          help={{
            title: "Démo Spécialistes",
            body: `${DEMO_SPECIALIST_NOTE} Une pastille s’ouvre à chaque étape. Ollama n’est pas requis.`,
          }}
          steps={DEMO_SPECIALIST_STEPS}
          step={demoStep}
          running={demoRunning}
          done={demoDone}
          idleHint="Formulaire Paire impair, pop-ups, épinglage s’il existe. Sans entraîner."
          doneHint="Terminée : le formulaire, les sauvés et l’épingle restent sous tes yeux."
          onStart={() => void runDemo()}
          onStop={stopDemo}
          startLabel="Lancer la démo"
          dataDemo="spec-bar"
        />

        <div className="grid gap-3 lg:grid-cols-2">
          <div
            data-demo="spec-name"
            className={cn("rounded-xl p-0.5", specialistDemoHighlight(demoStep, ["name"]))}
          >
            <LabelHelp label="Nom" help={HELP.name}>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Paire impair" />
            </LabelHelp>
          </div>
          <div
            data-demo="spec-target"
            className={cn("rounded-xl p-0.5", specialistDemoHighlight(demoStep, ["target"]))}
          >
            <LabelHelp label="Cible" help={HELP.target}>
              <select
                className="h-8 rounded-lg border border-border bg-background px-2"
                value={target}
                onChange={(event) => setTarget(event.target.value as VariableName)}
              >
                {VARIABLE_NAMES.filter(
                  (item) => item !== "delay" && item !== "hit" && item !== "star_delay" && item !== "star_hit"
                ).map((item) => (
                  <option key={item} value={item}>
                    {VARIABLE_LABELS[item]}
                  </option>
                ))}
              </select>
            </LabelHelp>
          </div>
          <div
            data-demo="spec-task"
            className={cn("rounded-xl p-0.5", specialistDemoHighlight(demoStep, ["task"]))}
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
            className={cn("rounded-xl p-0.5", specialistDemoHighlight(demoStep, ["horizon"]))}
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
          className={cn("rounded-xl p-0.5", specialistDemoHighlight(demoStep, ["features"]))}
        >
          <p className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium">
            Indicateurs (features causales jusqu’à t)
            <HelpTip {...HELP.features} />
          </p>
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

        <div
          data-demo="spec-instructions"
          className={cn("rounded-xl p-0.5", specialistDemoHighlight(demoStep, ["instructions"]))}
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
            specialistDemoHighlight(demoStep, ["force"])
          )}
        >
          <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
          <span className="inline-flex items-center gap-1">
            Sauver même si le skill ≤ 0 (ne bat pas le hasard)
            <HelpTip {...HELP.force} />
          </span>
        </label>

        <div
          data-demo="spec-train"
          className={cn("flex flex-wrap items-center gap-2 rounded-xl p-0.5", specialistDemoHighlight(demoStep, ["train"]))}
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
          <span className="text-[11px] text-muted-foreground">Ère formule, score sur 20 / 50 / 100. CPU, une minute tout au plus.</span>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        {last ? (
          <div className="rounded-xl border border-primary/30 bg-primary/8 px-3 py-2 text-xs">
            <p className="font-medium">
              @{last.handle} · skill {last.skill ?? "—"} · {last.verdict ?? "—"}
              {last.saved ? " · sauvé" : " · non sauvé"}
            </p>
            <p className="mt-1 text-muted-foreground">
              20 : {scoreCell(last, "20")} · 50 : {scoreCell(last, "50")} · 100 : {scoreCell(last, "100")}
            </p>
          </div>
        ) : null}

        <div
          data-demo="spec-saved"
          className={cn("rounded-xl p-0.5", specialistDemoHighlight(demoStep, ["saved", "pin"]))}
        >
          <p className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium">
            Sauvés
            <HelpTip {...HELP.saved} />
          </p>
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
              Aucun spécialiste. Crée « Paire impair » ou « Somme totale » ci-dessus.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item, index) => (
                <div
                  key={item.slug}
                  data-demo={index === 0 ? "spec-pin" : undefined}
                  className={cn(
                    "rounded-xl border border-border/70 px-3 py-2",
                    index === 0 ? specialistDemoHighlight(demoStep, ["pin"]) : ""
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] text-primary">@specialist.{item.slug}</span>
                    <Badge variant="outline">{item.target}</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      skill {item.skill ?? "—"} · {item.verdict ?? "—"}
                    </span>
                    <div className="ml-auto flex gap-1">
                      <HelpWrap help={HELP.pin}>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            const entry = specialistToEntry(item)
                            onPin(entry)
                            queueBrainPin(entry.id)
                          }}
                        >
                          <Pin />
                          Épingler
                        </Button>
                      </HelpWrap>
                      <HelpWrap help={HELP.infer}>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            void inferSpecialist(item.slug, era).then((fresh) => {
                              setLast(fresh)
                              void refresh()
                            })
                          }}
                        >
                          Réinférer
                        </Button>
                      </HelpWrap>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Supprimer"
                        onClick={() => {
                          void deleteSpecialist(item.slug).then(() => refresh())
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{item.instructions}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    20 {scoreCell(item, "20")} · 50 {scoreCell(item, "50")} · 100 {scoreCell(item, "100")}
                    {item.last_forecast?.value != null ? ` · dernier ${item.last_forecast.value}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
