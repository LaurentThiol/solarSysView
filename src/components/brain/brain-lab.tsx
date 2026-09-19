"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  BookOpen,
  Cloud,
  ListChecks,
  NotebookPen,
  Pause,
  Pin,
  Play,
  ScanSearch,
  Send,
  Sparkles,
  Star,
  StopCircle,
} from "lucide-react"

import { WindowBar } from "@/components/analysis/window-bar"
import {
  familyLabel,
  JOB_STATUS_LABELS,
  KIND_LABELS,
  KIND_TONE,
  LAB_TONE,
  STARTER_QUESTIONS,
  StatusDot,
  WALKER_STATUS_LABELS,
} from "@/components/brain/brain-chrome"
import { BrainDemoBar, BrainDemoPopup } from "@/components/brain/brain-demo"
import { BrainMascot } from "@/components/brain/brain-mascot"
import { BrainSpecialists } from "@/components/brain/brain-specialists"
import { FigureThumb } from "@/components/chartisme/figure-thumb"
import { CurveName, CurveThumb } from "@/components/chartisme/curve-thumb"
import { useRegisterCapture } from "@/components/capture"
import { HelpTip } from "@/components/help"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  DEFAULT_WARMUP,
  resolveWindow,
  type WindowPreset,
} from "@/lib/analysis-window"
import {
  VARIABLE_LABELS,
  VARIABLE_NAMES,
  seriesIndex,
  variableNeedsBall,
  variableNeedsStar,
  type VariableName,
} from "@/lib/analysis"
import {
  BRAIN_CATALOG,
  BRAIN_LABS,
  BRAIN_LAB_LABELS,
  BRAIN_PACKS,
  catalogEntry,
  type BrainLab,
  type CatalogEntry,
} from "@/lib/brain/catalog"
import {
  DEMO_GRID,
  DEMO_NOTE,
  DEMO_WATCH_ID,
  demoEntries,
  demoJobs,
  demoStepOf,
  demoWantsStart,
  resolveDemoPins,
  scrollDemoTarget,
  type DemoStepId,
} from "@/lib/brain/demo"
import {
  clearPendingBrainPins,
  readPendingBrainPins,
  specialistDemoWantsStart,
} from "@/lib/brain/specialist-demo"
import { deepLinkFor } from "@/lib/brain/deep-links"
import { formatHandle, parseHandle, parseHandlesInText } from "@/lib/brain/handles"
import { DEMO_QUESTION, lectureFromWorkingSet, TABLE_LECTURE_MODEL } from "@/lib/brain/lecture"
import { listSpecialists, specialistToEntry } from "@/lib/brain/specialists"
import {
  addNote,
  lastWatchlistRun,
  listReadings,
  readingsToCsv,
  readingsToMarkdown,
  readWatchlist,
  retrieveMemories,
  saveReading,
  writeWatchlist,
  type BrainReading,
} from "@/lib/brain/journal"
import {
  analogAxesFromObjects,
  analogRetrieveHint,
  analogWorkingObjects,
  mergeAnalogPack,
  retrieveAnalogs,
  wantsAnalogs,
} from "@/lib/brain/analogs"
import { takePendingAnalogs } from "@/lib/brain/pending-analogs"
import { BRAIN_SYSTEM_PROMPT } from "@/lib/brain/prompt"
import { resolveEntry, windowMetaFrom } from "@/lib/brain/resolve"
import {
  CLOUD_LOT_CONFIRM,
  approxTokens,
  createWalker,
  flaggedLots,
  LLM_LOT_SIZE,
  newWalkerId,
  runJob,
} from "@/lib/brain/walker"
import { runWatchlist } from "@/lib/brain/watchlist"
import { packWorkingSet } from "@/lib/brain/working-set"
import type { BrainFiche, ResolveContext, WalkerState, WorkingObject } from "@/lib/brain/types"
import { fetchHarmo } from "@/lib/harmo"
import { INDEPENDENCE_DISCLAIMER } from "@/lib/capture/snapshot"
import { readModel, writeModel } from "@/lib/capture/store"
import { streamIaChat } from "@/lib/ia/client"
import {
  localLiveIds,
  pickAvailableModel,
  preferredModel,
  type IaChatMessage,
  type IaModelOption,
  type IaProviderId,
} from "@/lib/ia/models"
import { readStoredProposals, writeStoredProposals } from "@/lib/combinations"
import { useDraws } from "@/lib/use-draws"
import { cn } from "@/lib/utils"

type Status = {
  google: boolean
  openai: boolean
  local?: boolean
  localHost?: string
  localModelEnv?: string | null
  default: IaProviderId | null
  defaultModel?: string | null
  models?: IaModelOption[]
}

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

function formatObserved(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })
}

function demoHighlight(step: DemoStepId | null, ids: DemoStepId[], elevate = false) {
  return step && ids.includes(step)
    ? cn(
        "ring-2 ring-primary/80 ring-offset-2 ring-offset-background",
        elevate && "relative z-[70]"
      )
    : ""
}

function waitMs(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

export function BrainLab() {
  const [era, setEra] = useState<"current" | "all">("current")
  const { draws, source, loading } = useDraws(era)
  const [preset, setPreset] = useState<WindowPreset>("last_100")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [lastN, setLastN] = useState("")
  const [warmup, setWarmup] = useState(DEFAULT_WARMUP)
  const [variable, setVariable] = useState<VariableName>("sum")
  const [ball, setBall] = useState(7)
  const [star, setStar] = useState(1)
  const [periodX, setPeriodX] = useState(14)
  const [curveId, setCurveId] = useState("sum")
  const [activeLab, setActiveLab] = useState<BrainLab | "all">("analyse")
  const [query, setQuery] = useState("")
  const [pins, setPins] = useState<CatalogEntry[]>([])
  const [watch, setWatch] = useState<string[]>([])
  const [fiches, setFiches] = useState<WorkingObject[]>([])
  const [walker, setWalker] = useState<WalkerState | null>(null)
  const [cloudLots, setCloudLots] = useState(false)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const stopRef = useRef(false)
  const [journal, setJournal] = useState<BrainReading[]>([])
  const [journalFilter, setJournalFilter] = useState("")
  const [journalSource, setJournalSource] = useState<"neon" | "local">("local")
  const [noteDraft, setNoteDraft] = useState("")
  const [draft, setDraft] = useState("")
  const [messages, setMessages] = useState<IaChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [provider, setProvider] = useState<IaProviderId>("local")
  const [model, setModel] = useState<string | null>(preferredModel("local"))
  const [escalate, setEscalate] = useState(false)
  const [deepen, setDeepen] = useState(false)
  const [inspector, setInspector] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [specialists, setSpecialists] = useState<CatalogEntry[]>([])
  const [gridOverride, setGridOverride] = useState<typeof DEMO_GRID | null>(null)
  const [demoStep, setDemoStep] = useState<DemoStepId | null>(null)
  const [demoRunning, setDemoRunning] = useState(false)
  const [demoDone, setDemoDone] = useState(false)
  const [demoWaiting, setDemoWaiting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const chatRef = useRef<HTMLDivElement | null>(null)
  const demoStopRef = useRef(false)
  const demoAutoRef = useRef(false)
  const demoGateRef = useRef<{ resolve: (ok: boolean) => void } | null>(null)
  const [analogPack, setAnalogPack] = useState<WorkingObject[]>([])
  const pendingAnalogsRef = useRef(false)

  const archive = useMemo(
    () => [...draws].sort((a, b) => a.date.localeCompare(b.date)),
    [draws]
  )
  const resolved = useMemo(() => {
    const parsedN = Number.parseInt(lastN, 10)
    return resolveWindow(archive, {
      preset,
      fromDate: customFrom || undefined,
      toDate: customTo || undefined,
      lastN: Number.isFinite(parsedN) && parsedN > 0 ? parsedN : undefined,
      warmup,
    })
  }, [archive, preset, customFrom, customTo, lastN, warmup])

  const ctxBase = useMemo((): Omit<ResolveContext, "entry"> => {
    const window = windowMetaFrom(resolved)
    const proposals = readStoredProposals()
    return {
      archive,
      work: resolved.work,
      withWarmup: resolved.withWarmup,
      warmupCount: resolved.warmupCount,
      variable,
      ball,
      star,
      curveId,
      periodX,
      window,
      era,
      source,
      grid: gridOverride ?? proposals[0] ?? null,
      fetchHarmo: (path, params) => fetchHarmo(path, params),
    }
  }, [archive, resolved, variable, ball, star, curveId, periodX, era, source, gridOverride])

  const catalog = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = [...BRAIN_CATALOG, ...specialists]
    return all.filter((entry) => {
      if (activeLab !== "all" && entry.lab !== activeLab) return false
      if (!q) return true
      return `${entry.handle} ${entry.label} ${entry.aliases.join(" ")}`.toLowerCase().includes(q)
    })
  }, [activeLab, query, specialists])

  const catalogGroups = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, CatalogEntry[]>()
    for (const entry of catalog) {
      if (!map.has(entry.family)) {
        order.push(entry.family)
        map.set(entry.family, [])
      }
      map.get(entry.family)?.push(entry)
    }
    return order.map((family) => ({ family, entries: map.get(family) ?? [] }))
  }, [catalog])

  const handleCtx = useMemo(
    () => ({
      activeLab: activeLab === "all" ? null : activeLab,
      variable,
      ball,
      star,
      curveId,
    }),
    [activeLab, variable, ball, star, curveId]
  )

  const refreshJournal = useCallback(async () => {
    const listed = await listReadings()
    setJournal(listed.items)
    setJournalSource(listed.source)
  }, [])

  useEffect(() => {
    void Promise.resolve().then(() => {
      setWatch(readWatchlist())
      void refreshJournal()
    })
    void (async () => {
      try {
        const response = await fetch("/api/ia/status", { cache: "no-store" })
        const payload = (await response.json()) as Status
        setStatus(payload)
        setProvider("local")
        const models = payload.models ?? []
        setModel(
          pickAvailableModel(models, "local", readModel("local"), {
            envModel: payload.localModelEnv,
            liveIds: localLiveIds(models),
          }) ?? preferredModel("local")
        )
      } catch {
        setStatus({ google: false, openai: false, local: false, default: null })
      }
    })()
  }, [refreshJournal])

  const pinEntry = useCallback((entry: CatalogEntry) => {
    setPins((prev) => (prev.some((item) => item.id === entry.id) ? prev : [...prev, entry]))
  }, [])

  useEffect(() => {
    const ids = readPendingBrainPins()
    if (!ids.length) return
    let pinned = 0
    for (const id of ids) {
      const entry = specialists.find((item) => item.id === id) ?? catalogEntry(id)
      if (entry) {
        pinEntry(entry)
        pinned += 1
      }
    }
    if (pinned) clearPendingBrainPins()
  }, [pinEntry, specialists])

  useEffect(() => {
    if (pendingAnalogsRef.current || loading) return
    const pending = takePendingAnalogs()
    pendingAnalogsRef.current = true
    if (!pending) return
    const entry = catalogEntry("analyse/analogs")
    if (entry) pinEntry(entry)
    void (async () => {
      const result = await retrieveAnalogs({
        date: pending.queryDate,
        axes: pending.axes,
        k: 8,
        era,
        from: resolved.fromDate,
        to: resolved.toDate,
        draws: resolved.work,
      })
      const inWindow = resolved.work.some((draw) => draw.date === pending.queryDate)
      const objects = analogWorkingObjects(result).map((item) => {
        if (item.id !== "analyse/analogs" || !item.fiche) return item
        if (inWindow && result.query?.date === pending.queryDate) return item
        return {
          ...item,
          summary: `Query ${pending.queryDate} hors fenêtre`,
          fiche: { ...item.fiche, error: `Query ${pending.queryDate} hors fenêtre` },
        }
      })
      setAnalogPack(objects)
      setDraft(`lis @analogs#${pending.focusDate}`)
    })()
  }, [era, loading, pinEntry, resolved.fromDate, resolved.toDate, resolved.work])

  useEffect(() => {
    if (pins.some((item) => item.id === "analyse/analogs")) return
    if (analogPack.length) setAnalogPack([])
  }, [analogPack.length, pins])

  const pinPack = useCallback(
    (handles: string[]) => {
      for (const handle of handles) {
        const parsed = parseHandle(`@${handle}`, handleCtx)
        if (parsed.entry) pinEntry(parsed.entry)
      }
    },
    [handleCtx, pinEntry]
  )

  const resolvePins = useCallback(async () => {
    const objects: WorkingObject[] = []
    for (const entry of pins) {
      const fiche = await resolveEntry({ ...ctxBase, entry })
      objects.push({
        kind: "pin",
        id: entry.id,
        handle: formatHandle(entry),
        label: entry.label,
        inPrompt: true,
        summary: fiche.summary,
        fiche,
      })
    }
    const merged = mergeAnalogPack(objects, analogPack)
    setFiches(merged)
    return merged
  }, [analogPack, pins, ctxBase])

  useEffect(() => {
    void Promise.resolve().then(() => {
      void resolvePins()
    })
  }, [pins, resolvePins])

  const packed = useMemo(() => packWorkingSet(fiches), [fiches])

  useRegisterCapture(() => ({
    lab: "brain",
    tab: walker?.mode ?? "chat",
    summary: packed.summary ?? ["Brain"],
    tech: (packed.tech as Record<string, unknown>) ?? {},
    archive: { n: resolved.work.length, from: resolved.fromDate, to: resolved.toDate, source },
  }))

  const ask = useCallback(
    async (question: string, extra: WorkingObject[] = []) => {
      const parsed = parseHandlesInText(question, handleCtx)
      for (const item of parsed) {
        if (item.entry) pinEntry(item.entry)
      }
      const retrieved = await retrieveMemories(question, 12)
      const memoryObjects: WorkingObject[] = retrieved.items.map((item) => ({
        kind: "memory",
        id: `mem-${item.id}`,
        handle: `@${String(item.handle).replace(/^@/, "")}#${item.id}`,
        label: item.handle,
        inPrompt: true,
        summary: String((item.payload as { summary?: string })?.summary ?? item.observed_at),
        score: item.score,
      }))
      const objects = extra.length ? extra : fiches
      const citedAnalog = parsed.find((item) => item.entry?.kind === "analog" && item.drawDate)?.drawDate
      const fromTable = analogRetrieveHint(objects)
      const analogQuery = fromTable.date ?? citedAnalog
      const analogAxes = fromTable.axes?.length ? fromTable.axes : analogAxesFromObjects(objects)
      const analogObjects =
        wantsAnalogs(objects, question) || analogQuery
          ? analogWorkingObjects(
              await retrieveAnalogs({
                date: analogQuery ?? resolved.work.at(-1)?.date,
                axes: analogAxes,
                k: 8,
                era,
                from: resolved.fromDate,
                to: resolved.toDate,
                draws: resolved.work,
              })
            )
          : []
      const snapshot = packWorkingSet([
        ...objects,
        ...analogObjects.filter((item) => !objects.some((obj) => obj.id === item.id || obj.handle === item.handle)),
        ...memoryObjects.filter((item) => !objects.some((obj) => item.handle.startsWith(obj.handle))),
      ])
      const useCloud = escalate
      const nextProvider: IaProviderId = useCloud
        ? status?.google
          ? "google"
          : status?.openai
            ? "openai"
            : "local"
        : "local"
      if (nextProvider === "local" && status && status.local === false) {
        setError("Ollama ne répond pas. Brain reste en local : pas de bascule automatique vers le cloud.")
        return
      }
      if (useCloud && nextProvider === "local") {
        setError("Pas de clé Gemini / OpenAI pour ce tour-ci. Dépose-les dans Admin, ou décoche le cloud.")
        return
      }
      setDraft("")
      setBusy(true)
      setError(null)
      const history: IaChatMessage[] = [...messages, { role: "user", content: question }]
      setMessages(history)
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      let assistant = ""
      let usedModel = model
      try {
        await streamIaChat(
          {
            provider: nextProvider,
            model,
            messages: history,
            snapshot,
            systemPrompt: BRAIN_SYSTEM_PROMPT,
            deepen: nextProvider === "local" ? deepen : false,
            surface: "brain",
          },
          {
            signal: controller.signal,
            onEvent: (event) => {
              if (event.type === "meta") usedModel = event.model
              if (event.type === "delta") {
                assistant += event.text
                setMessages([
                  ...history,
                  { role: "assistant", content: assistant, provider: nextProvider, model: usedModel ?? undefined },
                ])
              }
              if (event.type === "done") {
                setMessages([
                  ...history,
                  { role: "assistant", content: event.text, provider: event.provider, model: event.model },
                ])
              }
              if (event.type === "error") setError(event.error)
            },
          }
        )
        setEscalate(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "La discussion a buté. Réessaie dans un instant.")
      } finally {
        setBusy(false)
      }
    },
    [deepen, escalate, era, fiches, handleCtx, messages, model, pinEntry, resolved, status]
  )

  const sendDraft = useCallback(() => {
    const text = draft.trim()
    if (!text || busy) return
    void ask(text)
  }, [ask, busy, draft])

  const runWalker = useCallback(
    async (mode: "catalog" | "curves") => {
      const state = createWalker(mode, cloudLots)
      stopRef.current = false
      setScanOpen(true)
      setWalker({ ...state, status: "running", startedAt: new Date().toISOString() })
      setPaused(false)
      pausedRef.current = false
      const jobs = [...state.jobs]
      const flagged: BrainFiche[] = []
      for (let i = 0; i < jobs.length; i += 1) {
        if (stopRef.current) break
        while (pausedRef.current && !stopRef.current) {
          await new Promise((resolve) => window.setTimeout(resolve, 200))
        }
        if (stopRef.current) break
        jobs[i] = { ...jobs[i], status: "running" }
        setWalker((prev) => (prev ? { ...prev, index: i, jobs: [...jobs] } : prev))
        const done = await runJob(jobs[i], ctxBase)
        let readingId: number | string | undefined
        if (done.fiche) {
          const saved = await saveReading({ fiche: done.fiche, source: "agent" })
          readingId = saved.id
        }
        jobs[i] = { ...done, readingId }
        if (done.fiche?.flagged && done.fiche) flagged.push(done.fiche)
        setWalker((prev) =>
          prev
            ? {
                ...prev,
                index: i + 1,
                jobs: [...jobs],
                flagged: [...flagged],
                status: i + 1 >= jobs.length ? "done" : "running",
              }
            : prev
        )
      }
      await refreshJournal()
      if (stopRef.current) {
        setWalker((prev) => (prev ? { ...prev, status: "done" } : prev))
        return
      }
      const lots = flaggedLots(jobs, LLM_LOT_SIZE)
      if (cloudLots && lots.length > CLOUD_LOT_CONFIRM) {
        const ok = window.confirm(
          `Brain va commenter ${lots.length} lots dans le cloud (seuil ${CLOUD_LOT_CONFIRM}). On continue ?`
        )
        if (!ok) {
          setWalker((prev) => (prev ? { ...prev, status: "done" } : prev))
          return
        }
      }
      if (lots.length) {
        const lotObjects: WorkingObject[] = lots[0].map((job) => ({
          kind: "lot",
          id: job.id,
          handle: job.handle,
          label: job.label,
          inPrompt: true,
          summary: job.fiche?.summary ?? "",
          fiche: job.fiche,
        }))
        setFiches((prev) => [...prev.filter((item) => item.kind !== "lot"), ...lotObjects])
        let localCalls = 0
        let cloudCalls = 0
        let notes = 0
        let tokens = 0
        const shortlist: WorkingObject[] = []
        for (const lot of lots) {
          if (stopRef.current) break
          const objects: WorkingObject[] = lot.map((job) => ({
            kind: "lot" as const,
            id: job.id,
            handle: job.handle,
            label: job.label,
            inPrompt: true,
            summary: job.fiche?.summary ?? "",
            fiche: job.fiche,
          }))
          setFiches((prev) => [...prev.filter((item) => item.kind !== "lot"), ...objects])
          const snapshot = packWorkingSet(objects)
          const nextProvider: IaProviderId = cloudLots
            ? status?.google
              ? "google"
              : status?.openai
                ? "openai"
                : "local"
            : "local"
          if (nextProvider === "local" && status && status.local === false) {
            setError("Ollama ne répond pas. Les lots n’ont pas été commentés. Pas de bascule cloud.")
            break
          }
          if (cloudLots && nextProvider === "local") {
            setError("Commentaires cloud : aucune clé Gemini / OpenAI.")
            break
          }
          let text = ""
          try {
            await streamIaChat(
              {
                provider: nextProvider,
                model,
                messages: [
                  {
                    role: "user",
                    content:
                      "Propose 3–5 lectures concurrentes (faits cités, tensions, hypothèses, limites). Shortlist les plus remarquables. Cite @handle#id si l’id est là. Si les fiches le portent, ajoute un pronostic d’évolution (hypothèse, pas une certitude).",
                  },
                ],
                snapshot,
                systemPrompt: BRAIN_SYSTEM_PROMPT,
                surface: "brain",
              },
              {
                onEvent: (event) => {
                  if (event.type === "delta") text += event.text
                  if (event.type === "done") text = event.text || text
                },
              }
            )
            if (nextProvider === "local") localCalls += 1
            else cloudCalls += 1
            tokens += approxTokens(JSON.stringify(snapshot.tech) + text)
            const body = text.trim()
            if (body) {
              for (const job of lot) {
                if (job.readingId == null) continue
                await addNote(job.readingId, body.slice(0, 4000), "brain")
                notes += 1
              }
              shortlist.push(
                ...objects.map((item) => ({ ...item, kind: "shortlist" as const, inPrompt: true }))
              )
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : "Le commentaire de lot a buté.")
            if (nextProvider === "local") break
          }
        }
        if (shortlist.length) {
          setFiches((prev) => [...prev.filter((item) => item.kind !== "shortlist"), ...shortlist])
        }
        setWalker((prev) =>
          prev
            ? { ...prev, status: "done", localCalls, cloudCalls, notes, tokensApprox: tokens, flagged }
            : prev
        )
        await refreshJournal()
      }
    },
    [cloudLots, ctxBase, model, refreshJournal, status]
  )

  const refreshWatchlist = useCallback(async () => {
    await runWatchlist(ctxBase)
    await refreshJournal()
  }, [ctxBase, refreshJournal])

  const readTable = useCallback(
    (question?: string) => {
      const asked = question?.trim() || "Lis la table."
      const answer = lectureFromWorkingSet(fiches, {
        banner: ctxBase.window.banner,
        n: ctxBase.window.n,
        source,
      })
      setMessages((prev) => [
        ...prev,
        { role: "user", content: asked },
        { role: "assistant", content: answer, provider: "local", model: TABLE_LECTURE_MODEL },
      ])
    },
    [ctxBase.window.banner, ctxBase.window.n, fiches, source]
  )

  const finishDemoGate = useCallback((ok: boolean) => {
    const gate = demoGateRef.current
    demoGateRef.current = null
    setDemoWaiting(false)
    gate?.resolve(ok)
  }, [])

  const stopDemo = useCallback(() => {
    demoStopRef.current = true
    stopRef.current = true
    pausedRef.current = false
    setPaused(false)
    setDemoRunning(false)
    setDemoDone(true)
    finishDemoGate(false)
  }, [finishDemoGate])

  const nextDemoStep = useCallback(() => {
    finishDemoGate(true)
  }, [finishDemoGate])

  const runDemo = useCallback(async () => {
    if (demoRunning || loading) return
    demoAutoRef.current = true
    demoStopRef.current = false
    stopRef.current = false
    setDemoRunning(true)
    setDemoDone(false)
    setDemoWaiting(false)
    setError(null)
    setInspector(true)
    setScanOpen(true)
    setActiveLab("all")
    setQuery("")
    setPreset("last_100")
    setVariable("sum")
    setCurveId("sum")
    writeStoredProposals([DEMO_GRID])
    setGridOverride(DEMO_GRID)

    const begin = (step: DemoStepId) => {
      setDemoStep(step)
      setDemoWaiting(false)
      scrollDemoTarget(demoStepOf(step).target)
    }

    const ask = async (step: DemoStepId) => {
      if (demoStopRef.current) return false
      setDemoStep(step)
      scrollDemoTarget(demoStepOf(step).target)
      await waitMs(380)
      if (demoStopRef.current) return false
      setDemoWaiting(true)
      const ok = await new Promise<boolean>((resolve) => {
        demoGateRef.current = { resolve }
      })
      return ok && !demoStopRef.current
    }

    try {
      begin("window")
      if (!(await ask("window"))) return

      begin("pin")
      const specialistIndex = await listSpecialists()
      const liveSpecialists = specialistIndex.items.map((item) => specialistToEntry(item))
      if (liveSpecialists.length) setSpecialists(liveSpecialists)
      const entries = demoEntries(liveSpecialists.length ? liveSpecialists : specialists, handleCtx)
      setPins(entries)
      if (!(await ask("pin"))) return

      begin("table")
      const demoCtx: Omit<ResolveContext, "entry"> = {
        ...ctxBase,
        grid: DEMO_GRID,
        fetchHarmo: async (path, params) => {
          try {
            return await Promise.race([
              fetchHarmo(path, params),
              new Promise<never>((_, reject) => {
                window.setTimeout(() => reject(new Error("Harmo trop lent pour la démo")), 5000)
              }),
            ])
          } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : "Harmo injoignable" }
          }
        },
      }
      const objects = await resolveDemoPins(demoCtx, entries)
      if (demoStopRef.current) return
      setFiches(objects)
      if (!(await ask("table"))) return

      begin("chat")
      const answer = lectureFromWorkingSet(objects, {
        banner: demoCtx.window.banner,
        n: demoCtx.window.n,
        source,
      })
      setMessages([
        { role: "user", content: DEMO_QUESTION },
        { role: "assistant", content: answer, provider: "local", model: TABLE_LECTURE_MODEL },
      ])
      if (!(await ask("chat"))) return

      begin("watch")
      setWatch([DEMO_WATCH_ID])
      writeWatchlist([DEMO_WATCH_ID])
      await runWatchlist(demoCtx)
      if (!(await ask("watch"))) return

      begin("scan")
      const jobs = demoJobs(entries)
      const flagged: BrainFiche[] = []
      setWalker({
        id: newWalkerId(),
        mode: "demo",
        status: "running",
        index: 0,
        jobs,
        flagged: [],
        localCalls: 0,
        cloudCalls: 0,
        notes: 0,
        tokensApprox: 0,
        startedAt: new Date().toISOString(),
        cloudLots: false,
      })
      for (let i = 0; i < jobs.length; i += 1) {
        if (demoStopRef.current || stopRef.current) break
        jobs[i] = { ...jobs[i], status: "running" }
        setWalker((prev) => (prev ? { ...prev, index: i, jobs: [...jobs] } : prev))
        const done = await runJob(jobs[i], demoCtx)
        if (done.fiche) {
          const saved = await saveReading({ fiche: done.fiche, source: "agent" })
          done.readingId = saved.id
        }
        jobs[i] = done
        if (done.fiche?.flagged) flagged.push(done.fiche)
        setWalker((prev) =>
          prev
            ? {
                ...prev,
                index: i + 1,
                jobs: [...jobs],
                flagged: [...flagged],
                status: i + 1 >= jobs.length ? "done" : "running",
              }
            : prev
        )
      }
      if (flagged.length) {
        setFiches((prev) => [
          ...prev.filter((item) => item.kind !== "shortlist"),
          ...flagged.map((fiche) => ({
            kind: "shortlist" as const,
            id: `flag-${fiche.id}`,
            handle: `@${fiche.handle}`,
            label: fiche.label,
            inPrompt: true,
            summary: fiche.summary,
            fiche,
          })),
        ])
      }
      setWalker((prev) => (prev ? { ...prev, status: "done", flagged } : prev))
      if (!(await ask("scan"))) return

      begin("journal")
      await refreshJournal()
      const listed = await listReadings()
      const first = listed.items[0]
      if (first) await addNote(first.id, DEMO_NOTE, "user")
      await refreshJournal()
      if (!(await ask("journal"))) return
    } catch (err) {
      setError(err instanceof Error ? err.message : "La démo a buté.")
    } finally {
      setDemoWaiting(false)
      setDemoRunning(false)
      setDemoDone(true)
      if (!demoStopRef.current) setDemoStep("journal")
    }
  }, [ctxBase, demoRunning, handleCtx, loading, refreshJournal, source, specialists])

  useEffect(() => {
    if (demoAutoRef.current || loading) return
    if (typeof window === "undefined" || !demoWantsStart(window.location.search)) return
    const timer = window.setTimeout(() => {
      if (demoAutoRef.current) return
      demoAutoRef.current = true
      void runDemo()
    }, 50)
    return () => window.clearTimeout(timer)
  }, [loading, runDemo])

  useEffect(() => {
    if (typeof window === "undefined") return
    const wants =
      specialistDemoWantsStart(window.location.search, window.location.pathname) ||
      window.location.hash.toLowerCase().includes("special")
    if (!wants) return
    const timer = window.setTimeout(() => scrollDemoTarget("specialists"), 80)
    return () => window.clearTimeout(timer)
  }, [])

  const suggestions = useMemo(() => {
    const last = draft.split(/\s/).pop() ?? ""
    if (!last.startsWith("@") || last.length < 2) return []
    return BRAIN_CATALOG.filter(
      (entry) => `@${entry.handle}`.startsWith(last.toLowerCase()) || entry.handle.startsWith(last.slice(1).toLowerCase())
    ).slice(0, 8)
  }, [draft])

  const memories: WorkingObject[] = journal.slice(0, 8).map((item) => ({
    kind: "memory",
    id: `mem-${item.id}`,
    handle: `@${item.handle}#${item.id}`,
    label: item.handle,
    inPrompt: true,
    summary: String((item.payload as { summary?: string })?.summary ?? item.observed_at),
  }))

  const board: WorkingObject[] = [
    ...fiches,
    ...(walker?.jobs.find((job) => job.status === "running")
      ? [
          {
            kind: "current" as const,
            id: "running",
            handle: walker.jobs.find((job) => job.status === "running")?.handle ?? "",
            label: "En cours",
            inPrompt: false,
            summary: `curseur ${walker.index + 1} / ${walker.jobs.length}`,
          },
        ]
      : []),
    ...memories.filter((item) => !fiches.some((fiche) => item.handle.startsWith(fiche.handle))),
  ]

  const visibleJournal = journal.filter((item) => {
    const q = journalFilter.trim().toLowerCase().replace(/^@/, "")
    if (!q) return true
    const summary = String((item.payload as { summary?: string })?.summary ?? "")
    const notes = (item.notes ?? []).map((note) => note.body).join(" ")
    return `${item.handle} ${summary} ${notes}`.toLowerCase().includes(q)
  })

  const mascotMood = busy || walker?.status === "running" || demoRunning ? "think" : status?.local === false ? "sleep" : messages.length ? "talk" : "idle"
  const scanProgress = walker && walker.jobs.length ? Math.min(100, (walker.index / walker.jobs.length) * 100) : 0
  const localOn = Boolean(status?.local)
  const cloudReady = Boolean(status?.google || status?.openai)

  useEffect(() => {
    const node = chatRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages, busy])

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/22 via-chart-5/12 to-card p-5 sm:p-6">
        <div className="pointer-events-none absolute -top-12 -right-6 size-44 rounded-full bg-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/4 size-40 rounded-full bg-chart-5/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <BrainMascot mood={mascotMood} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium tracking-[0.18em] text-primary uppercase">Assistants</p>
            <p className="mt-1 text-xl font-semibold tracking-tight">Table de lecture</p>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              Épinglez un nom — <span className="text-foreground">@rsi</span>,{" "}
              <span className="text-foreground">@ete</span>,{" "}
              <span className="text-foreground">@specialist.paire-impair</span>{" "}
              — puis posez une question. Les spécialistes publient une prévision
              de série nommée. Brain décrit la fenêtre, puis peut pronostiquer
              (hypothèse, pas une certitude).
            </p>
            <ol className="mt-3 flex flex-wrap gap-2 text-xs">
              <li className="rounded-full border border-primary/35 bg-background/45 px-3 py-1">1. Épingle</li>
              <li className="rounded-full border border-primary/35 bg-background/45 px-3 py-1">2. Pose une question</li>
              <li className="rounded-full border border-primary/35 bg-background/45 px-3 py-1">3. Il ne voit que la table</li>
            </ol>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <StatusDot
              ok={localOn}
              label={localOn ? `Ollama ${status?.localHost ?? "allumé"}` : status ? "Ollama éteint" : "Ollama…"}
              hint="Brain discute d’abord en local. Le cloud n’intervient que si vous le demandez."
            />
            {cloudReady ? (
              <StatusDot
                ok
                label={status?.google && status?.openai ? "Gemini et OpenAI prêts" : status?.google ? "Gemini prêt" : "OpenAI prêt"}
              />
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              {pins.length ? `${pins.length} fiche${pins.length > 1 ? "s" : ""} sur la table` : "Table vide"}
              {watch.length ? ` · ${watch.length} suivi${watch.length > 1 ? "s" : ""}` : ""}
            </p>
            <Link
              href="/brain/specialistes"
              className="inline-flex h-7 items-center rounded-lg border border-border bg-background px-2.5 text-[0.8rem] hover:bg-muted"
            >
              Spécialistes
            </Link>
          </div>
        </div>
      </section>

      <p className="rounded-xl border border-primary/20 bg-primary/8 px-3 py-2 text-xs leading-5 text-muted-foreground">
        {INDEPENDENCE_DISCLAIMER}
      </p>

      <BrainDemoBar
        step={demoStep}
        running={demoRunning}
        done={demoDone}
        waiting={demoWaiting}
        onStart={() => void runDemo()}
        onStop={stopDemo}
      />
      <BrainDemoPopup
        step={demoStep}
        open={demoRunning && demoWaiting}
        onNext={nextDemoStep}
        onCancel={stopDemo}
      />

      <div data-demo="window" className={cn("flex flex-col gap-2 rounded-xl", demoHighlight(demoStep, ["window"], demoWaiting))}>
      <WindowBar
        window={resolved}
        preset={preset}
        fromDate={customFrom}
        toDate={customTo}
        lastN={lastN}
        warmup={warmup}
        compareOn={false}
        showCompare={false}
        onPreset={setPreset}
        onFrom={setCustomFrom}
        onTo={setCustomTo}
        onLastN={setLastN}
        onWarmup={setWarmup}
        onCompare={() => undefined}
      />

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            Archive
            <select
              className="rounded-md border border-border bg-background px-2 py-1"
              value={era}
              onChange={(event) => setEra(event.target.value as "current" | "all")}
            >
              <option value="current">formule actuelle</option>
              <option value="all">tout</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            Série
            <Select
              value={variable}
              onValueChange={(value) => value && setVariable(value as VariableName)}
            >
              <SelectTrigger size="sm" className="min-w-48" aria-label="Série">
                <span className="flex flex-1 text-left">
                  <CurveName kind={variable} label={VARIABLE_LABELS[variable]} />
                </span>
              </SelectTrigger>
              <SelectContent className="min-w-56">
                {VARIABLE_NAMES.map((name) => (
                  <SelectItem key={name} value={name}>
                    <CurveName kind={name} label={VARIABLE_LABELS[name]} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {variableNeedsBall(variable) ? (
            <label className="flex items-center gap-1">
              Boule
              <Input className="w-16" type="number" min={1} max={50} value={ball} onChange={(e) => setBall(Number(e.target.value) || 7)} />
            </label>
          ) : null}
          {variableNeedsStar(variable) ? (
            <label className="flex items-center gap-1">
              Étoile
              <Input className="w-16" type="number" min={1} max={12} value={star} onChange={(e) => setStar(Number(e.target.value) || 1)} />
            </label>
          ) : null}
          <span className="text-muted-foreground">{loading ? "tirages…" : `${resolved.work.length} tirages · ${source}`}</span>
          <button
            type="button"
            className="ml-auto text-[11px] text-primary underline-offset-2 hover:underline"
            onClick={() => setDetailsOpen((value) => !value)}
          >
            {detailsOpen ? "Masquer les réglages" : "Période, courbe…"}
          </button>
        </div>
        {detailsOpen ? (
          <div className="flex flex-wrap gap-2 border-t border-border/70 pt-2 text-xs">
            <label className="flex items-center gap-1">
              Période X
              <Input className="w-16" type="number" min={2} max={200} value={periodX} onChange={(e) => setPeriodX(Number(e.target.value) || 14)} />
            </label>
            <label className="flex items-center gap-1">
              Courbe
              <Input className="w-full min-w-0 sm:w-28" value={curveId} onChange={(e) => setCurveId(e.target.value || "sum")} />
            </label>
            <span className="text-muted-foreground">n={seriesIndex(variable, ball, star)}</span>
          </div>
        ) : null}
      </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <Card
          data-demo="discussion"
          className={cn("border-primary/20", demoHighlight(demoStep, ["chat"], demoWaiting))}
        >
          <CardHeader className="border-b border-border/60">
            <CardTitle className="flex items-center gap-2">
              <BrainMascot mood={mascotMood} size="sm" />
              Discussion
              <HelpTip
                title="Discussion"
                body="Brain ne lit que les fiches sur la table, plus quelques souvenirs. Tapez @ pour coller un nom. Ollama par défaut ; le cloud seulement si vous cochez « ce tour »."
              />
            </CardTitle>
            <CardDescription>Pose une question comme à un collègue. Les @ collent les fiches toutes seules.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusDot ok={localOn} label={localOn ? "local" : "local off"} />
              {localOn ? (
                <select
                  className="max-w-48 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs"
                  value={model ?? ""}
                  onChange={(event) => {
                    const next = event.target.value
                    setModel(next)
                    writeModel("local", next)
                  }}
                  aria-label="Modèle local"
                >
                  {model &&
                  !(status?.models ?? []).some((item) => item.provider === "local" && item.id === model) ? (
                    <option value={model}>{model}</option>
                  ) : null}
                  {(status?.models ?? [])
                    .filter((item) => item.provider === "local" && item.available)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label === item.id ? item.id : `${item.label} (${item.id})`}
                      </option>
                    ))}
                </select>
              ) : (
                <span className="text-muted-foreground">en attente d’Ollama</span>
              )}
              {escalate ? <Badge variant="secondary">ce tour dans le cloud</Badge> : null}
              <label className="flex items-center gap-1.5 text-muted-foreground">
                <input type="checkbox" checked={deepen} onChange={(e) => setDeepen(e.target.checked)} />
                Approfondir
              </label>
              <label className="ml-auto flex items-center gap-1.5 text-muted-foreground">
                <input type="checkbox" checked={escalate} onChange={(e) => setEscalate(e.target.checked)} />
                Ce tour dans le cloud
              </label>
            </div>
            <div
              ref={chatRef}
              className="flex max-h-[28rem] min-h-64 flex-col gap-3 overflow-auto rounded-2xl border border-border bg-gradient-to-b from-card/80 to-background/40 p-3"
            >
              {messages.length === 0 && !busy ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-3 py-6 text-center">
                  <BrainMascot mood={localOn ? "idle" : "sleep"} size="md" />
                  <p className="text-sm font-medium">Salut, je suis Brain.</p>
                  <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                    {localOn
                      ? "Épingle un indicateur à droite, clique une question, ou lance la démo."
                      : "Ollama est éteint : lancez la démo ou « Lire la table » — les chiffres sont calculés ici. Le cloud seulement si vous cochez « ce tour »."}
                  </p>
                  <div className="flex w-full max-w-md flex-col gap-1.5">
                    {STARTER_QUESTIONS.map((question) => (
                      <button
                        key={question}
                        type="button"
                        className="rounded-xl border border-primary/25 bg-primary/8 px-3 py-2 text-left text-[12px] leading-5 text-foreground hover:border-primary/50 hover:bg-primary/15"
                        onClick={() => {
                          setDraft(question)
                          for (const item of parseHandlesInText(question, handleCtx)) {
                            if (item.entry) pinEntry(item.entry)
                          }
                        }}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message, index) =>
                  message.role === "user" ? (
                    <div
                      key={`${message.role}-${index}`}
                      className="ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-primary/20 px-3 py-2 text-sm leading-6 whitespace-pre-wrap"
                    >
                      {message.content}
                    </div>
                  ) : (
                    <div key={`${message.role}-${index}`} className="flex max-w-[94%] items-start gap-2">
                      <BrainMascot mood="talk" size="sm" className="mt-0.5" />
                      <div className="rounded-2xl rounded-bl-md border border-border bg-card px-3 py-2 text-sm leading-6 whitespace-pre-wrap">
                        {message.content}
                        {message.model ? (
                          <p className="mt-1 text-[10px] text-muted-foreground">{message.provider} · {message.model}</p>
                        ) : null}
                      </div>
                    </div>
                  )
                )
              )}
              {busy ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <BrainMascot mood="think" size="sm" />
                  Brain lit la table…
                </p>
              ) : null}
            </div>
            {error ? (
              <p className="rounded-xl border border-primary/35 bg-primary/10 px-3 py-2 text-xs leading-5 text-foreground">
                {error}
              </p>
            ) : null}
            <div className="relative">
              <textarea
                className="min-h-20 w-full rounded-2xl border border-border bg-background p-3 pr-12 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder="Écris ici… tape @rsi pour coller un nom"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    sendDraft()
                  }
                }}
              />
              {suggestions.length ? (
                <div className="absolute bottom-full left-0 z-10 mb-1 w-full max-w-sm rounded-xl border border-border bg-popover p-1 text-xs shadow-xl">
                  {suggestions.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
                      onClick={() => {
                        setDraft((prev) => prev.replace(/@[^\s]*$/, `@${entry.handle} `))
                        pinEntry(entry)
                      }}
                    >
                      <span className="font-mono text-primary">@{entry.handle}</span>
                      {entry.kind === "figure" ? <FigureThumb figure={entry.handle} /> : null}
                      {entry.kind === "variable" ? <CurveThumb kind={entry.handle} /> : null}
                      <span className="truncate text-muted-foreground">{entry.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-muted-foreground">Entrée envoie · Maj+Entrée pour une ligne</p>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || demoRunning}
                onClick={() => readTable()}
              >
                <ListChecks />
                Lire la table
              </Button>
              <Button size="sm" className="ml-auto" disabled={busy || !draft.trim()} onClick={sendDraft}>
                <Send />
                {busy ? "…" : "Envoyer"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card
            data-demo="table"
            className={demoHighlight(demoStep, ["table"], demoWaiting)}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pin className="size-4 text-primary" />
                Sur la table
                <HelpTip
                  title="Sur la table"
                  body="C’est exactement ce que Brain reçoit. Une fiche épinglée, un souvenir, un lot : s’il n’est pas ici, Brain ne le voit pas."
                />
              </CardTitle>
              <CardDescription>Brain ne lit que ces fiches. Cliquez une pastille pour la retirer.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {pins.length ? (
                <div className="flex flex-wrap gap-1">
                  {pins.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                        LAB_TONE[entry.lab]
                      )}
                      onClick={() => setPins((prev) => prev.filter((item) => item.id !== entry.id))}
                      title="Retirer de la table"
                    >
                      @{formatHandle(entry).replace(/^@/, "")} ×
                    </button>
                  ))}
                </div>
              ) : null}
              {board.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-4 text-xs leading-5 text-muted-foreground">
                  Table vide. Cliquez un nom dans la bibliothèque, ou un kit ci-dessous : Brain aura enfin quelque chose à lire.
                </p>
              ) : (
                board.map((item) => {
                  const entry = pins.find((pin) => pin.id === item.fiche?.id) ?? BRAIN_CATALOG.find((row) => row.id === item.fiche?.id)
                  const href = item.fiche && entry
                    ? deepLinkFor({
                        entry,
                        variable: item.fiche.params.variable,
                        n: item.fiche.params.n,
                        periodX: item.fiche.params.periodX,
                        preset,
                        curveId: item.fiche.params.curveId,
                        queryDate: typeof item.fiche.last.query === "string" ? item.fiche.last.query : null,
                        axes: typeof item.fiche.last.axes === "string" ? item.fiche.last.axes : null,
                      }).href
                    : null
                  return (
                    <div
                      key={`${item.kind}:${item.id}`}
                      className={cn("rounded-xl border px-2.5 py-2", item.inPrompt ? KIND_TONE[item.kind] : "border-border bg-muted/20")}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px]">{item.handle}</span>
                        <Badge variant="outline">{KIND_LABELS[item.kind]}</Badge>
                        {item.inPrompt ? (
                          <span className="text-[10px] text-muted-foreground">vu par Brain</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">hors prompt</span>
                        )}
                        {href ? (
                          <a className="ml-auto text-[11px] text-primary underline-offset-2 hover:underline" href={href}>
                            ouvrir
                          </a>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.summary}</p>
                    </div>
                  )
                })
              )}
              <Button size="sm" variant="outline" onClick={() => setInspector((value) => !value)}>
                {inspector ? "Masquer le JSON" : "Inspecteur JSON"}
              </Button>
              {inspector ? (
                <pre className="max-h-48 overflow-auto rounded-lg bg-muted/40 p-2 text-[10px] leading-4">
                  {JSON.stringify(packed.tech, null, 2)}
                </pre>
              ) : null}
            </CardContent>
          </Card>

          <Card
            data-demo="library"
            className={demoHighlight(demoStep, ["pin", "watch"], demoWaiting)}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="size-4 text-primary" />
                Bibliothèque
                <HelpTip
                  title="Bibliothèque"
                  body="Noms stables. Un clic épingle. Un kit pose tout un petit plateau. L’étoile suit les chiffres, sans LLM."
                />
              </CardTitle>
              <CardDescription>Cliquez un nom pour l’épingler. L’étoile le suit à chaque synchro.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1">
                <Button size="xs" variant={activeLab === "all" ? "default" : "outline"} onClick={() => setActiveLab("all")}>
                  Tous
                </Button>
                {BRAIN_LABS.map((lab) => (
                  <Button
                    key={lab}
                    size="xs"
                    variant={activeLab === lab ? "default" : "outline"}
                    className={activeLab === lab ? undefined : LAB_TONE[lab]}
                    onClick={() => setActiveLab(lab)}
                  >
                    {BRAIN_LAB_LABELS[lab]}
                  </Button>
                ))}
              </div>
              <Input placeholder="chercher @rsi, tête-épaules…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="grid gap-2 sm:grid-cols-2">
                {BRAIN_PACKS.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    className="rounded-2xl border border-primary/25 bg-primary/8 px-3 py-2 text-left hover:border-primary/50 hover:bg-primary/14"
                    onClick={() => pinPack(pack.handles)}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Sparkles className="size-3.5 text-primary" />
                      Kit {pack.label}
                    </span>
                    <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                      {pack.handles.map((handle) => `@${handle}`).join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
              <div className="max-h-80 overflow-auto pr-1">
                {catalogGroups.map((group) => (
                  <div key={group.family} className="mb-3">
                    <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      {familyLabel(group.family)}
                    </p>
                    <div className="flex flex-col gap-1">
                      {group.entries.map((entry) => {
                        const watched = watch.includes(entry.id)
                        const pinned = pins.some((item) => item.id === entry.id)
                        return (
                          <div
                            key={entry.id}
                            className={cn(
                              "flex items-start gap-2 rounded-xl border px-2 py-1.5",
                              pinned ? "border-primary/40 bg-primary/10" : "border-border/70 bg-card/30"
                            )}
                          >
                            <button
                              type="button"
                              className="min-w-0 flex-1 text-left"
                              title={entry.reading}
                              onClick={() => pinEntry(entry)}
                            >
                              <span className="font-mono text-[13px] text-primary">{formatHandle(entry)}</span>
                              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
                                {entry.kind === "figure" ? <FigureThumb figure={entry.handle} /> : null}
                                {entry.kind === "variable" ? <CurveThumb kind={entry.handle} /> : null}
                                {entry.label}
                                {entry.units ? ` · ${entry.units}` : ""}
                              </span>
                            </button>
                            <button
                              type="button"
                              className={cn(
                                "mt-0.5 rounded-full p-1",
                                watched ? "text-primary" : "text-muted-foreground hover:text-foreground"
                              )}
                              title={watched ? "Ne plus suivre" : "Suivre les chiffres"}
                              onClick={() => {
                                const next = watched ? watch.filter((id) => id !== entry.id) : [...watch, entry.id]
                                setWatch(next)
                                writeWatchlist(next)
                              }}
                            >
                              <Star className={cn("size-3.5", watched && "fill-current")} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {catalog.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun nom ne correspond. Essayez rsi, ete, fft…</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div
        data-demo="specialists"
        className={cn("rounded-xl", demoHighlight(demoStep, ["pin"], demoWaiting))}
      >
        <BrainSpecialists
          era={era}
          onPin={pinEntry}
          onIndex={(items) => setSpecialists(items.map((item) => specialistToEntry(item)))}
        />
      </div>

      <Card
        data-demo="scan"
        className={demoHighlight(demoStep, ["scan"], demoWaiting)}
      >
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex flex-wrap items-center gap-2">
                <ScanSearch className="size-4 text-primary" />
                Balayage
                <HelpTip
                  title="Balayage"
                  body="Sur bouton seulement : Brain parcourt la bibliothèque ou les 142 courbes, note les fiches à relire, puis peut commenter ces lots. Rien ne part tout seul."
                />
              </CardTitle>
              <CardDescription>Lecture automatique, uniquement quand vous lancez. Pause et arrêt à tout moment.</CardDescription>
            </div>
            <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setScanOpen((value) => !value)}>
              {scanOpen || walker ? "Replier" : "Ouvrir"}
            </Button>
          </div>
        </CardHeader>
        {scanOpen || walker ? (
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void runWalker("catalog")} disabled={walker?.status === "running"}>
                <ScanSearch />
                Lire la bibliothèque
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void runWalker("curves")} disabled={walker?.status === "running"}>
                Lire les 142 courbes
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  pausedRef.current = !pausedRef.current
                  setPaused(pausedRef.current)
                  setWalker((prev) =>
                    prev && prev.status === "running"
                      ? { ...prev, status: pausedRef.current ? "paused" : "running" }
                      : prev
                  )
                }}
              >
                {paused ? <Play /> : <Pause />}
                {paused ? "Reprendre" : "Pause"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  stopRef.current = true
                  pausedRef.current = false
                  setPaused(false)
                }}
              >
                <StopCircle />
                Arrêt
              </Button>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={cloudLots} onChange={(e) => setCloudLots(e.target.checked)} />
                <Cloud className="size-3.5" />
                Commenter les fiches à relire dans le cloud
              </label>
              <Button size="sm" variant="outline" onClick={() => void refreshWatchlist()}>
                <Star />
                Rafraîchir les suivis
              </Button>
              {lastWatchlistRun() ? (
                <span className="text-xs text-muted-foreground">suivis {formatObserved(lastWatchlistRun() ?? "")}</span>
              ) : null}
            </div>
            {walker ? (
              <div className="flex flex-col gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {walker.mode === "curves" ? "142 courbes" : walker.mode === "demo" ? "démo" : "bibliothèque"}
                  </Badge>
                  <span>{WALKER_STATUS_LABELS[walker.status] ?? walker.status}</span>
                  <span className="text-muted-foreground">
                    {walker.index} / {walker.jobs.length} · {walker.flagged.length} à relire · local {walker.localCalls} / cloud{" "}
                    {walker.cloudCalls}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${scanProgress}%` }} />
                </div>
                <div className="max-h-44 overflow-auto rounded-xl border border-border/70">
                  {walker.jobs.map((job) => (
                    <div key={job.id} className="flex gap-2 border-b border-border/50 px-2 py-1 last:border-0">
                      <span
                        className={cn(
                          "w-20 shrink-0",
                          job.status === "flagged"
                            ? "text-primary"
                            : job.status === "error"
                              ? "text-destructive"
                              : "text-muted-foreground"
                        )}
                      >
                        {JOB_STATUS_LABELS[job.status] ?? job.status}
                      </span>
                      <span className="font-mono">{job.handle}</span>
                      <span className="truncate text-muted-foreground">{job.fiche?.summary ?? job.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs leading-5 text-muted-foreground">
                Rien ne se lance tout seul. Brain commente seulement les fiches à relire, pas toute la bibliothèque.
              </p>
            )}
          </CardContent>
        ) : null}
      </Card>

      <Card
        data-demo="journal"
        className={demoHighlight(demoStep, ["journal"], demoWaiting)}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <NotebookPen className="size-4 text-primary" />
            Carnet
            <HelpTip
              title="Carnet"
              body="Lectures datées, souvenirs locaux, notes humaines. Neon si disponible, sinon cet ordinateur. Exporte en Markdown ou CSV."
            />
          </CardTitle>
          <CardDescription>
            {journalSource === "neon" ? "Enregistré sur Neon." : "Sur cet ordinateur (Neon indisponible)."} {journal.length} lecture
            {journal.length > 1 ? "s" : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Input placeholder="filtre @rsi ou un mot…" value={journalFilter} onChange={(e) => setJournalFilter(e.target.value)} />
          <div className="max-h-72 overflow-auto text-sm">
            {visibleJournal.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                Encore vide. Une lecture apparaît après un balayage, un suivi, ou une discussion qui épingle un nom.
              </p>
            ) : (
              visibleJournal.map((item) => (
                <div key={String(item.id)} className="border-b border-border/70 py-2 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px]">
                      @{item.handle}#{item.id}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{formatObserved(item.observed_at)}</span>
                    <Badge variant="outline">
                      {item.source === "agent" ? "balayage" : item.source === "watchlist" ? "suivi" : "toi"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs leading-5">{String((item.payload as { summary?: string })?.summary ?? "")}</p>
                  {(item.notes ?? []).map((note) => (
                    <p key={String(note.id)} className="text-xs leading-5 text-muted-foreground">
                      {note.author === "brain" ? "Brain" : "Toi"} · {note.body}
                    </p>
                  ))}
                </div>
              ))
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <Input placeholder="commentaire sur la lecture la plus récente…" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} className="min-w-0 flex-1" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const first = journal[0]
                if (!first || !noteDraft.trim()) return
                void addNote(first.id, noteDraft).then(() => {
                  setNoteDraft("")
                  void refreshJournal()
                })
              }}
            >
              Noter
            </Button>
            <Button size="sm" variant="ghost" onClick={() => download("brain-journal.md", readingsToMarkdown(journal), "text/markdown")}>
              MD
            </Button>
            <Button size="sm" variant="ghost" onClick={() => download("brain-journal.csv", readingsToCsv(journal), "text/csv")}>
              CSV
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
