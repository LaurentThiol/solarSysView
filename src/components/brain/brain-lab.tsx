"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { WindowBar } from "@/components/analysis/window-bar"
import { useRegisterCapture } from "@/components/capture"
import { HelpTip } from "@/components/help"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
  type BrainLab,
  type CatalogEntry,
} from "@/lib/brain/catalog"
import { deepLinkFor } from "@/lib/brain/deep-links"
import { parseHandle, parseHandlesInText } from "@/lib/brain/handles"
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
import { BRAIN_SYSTEM_PROMPT } from "@/lib/brain/prompt"
import { resolveEntry, windowMetaFrom } from "@/lib/brain/resolve"
import {
  CLOUD_LOT_CONFIRM,
  approxTokens,
  createWalker,
  flaggedLots,
  LLM_LOT_SIZE,
  runJob,
} from "@/lib/brain/walker"
import { runWatchlist } from "@/lib/brain/watchlist"
import { packWorkingSet } from "@/lib/brain/working-set"
import type { BrainFiche, ResolveContext, WalkerState, WorkingObject } from "@/lib/brain/types"
import { fetchHarmo } from "@/lib/harmo"
import { streamIaChat } from "@/lib/ia/client"
import {
  pickAvailableModel,
  preferredModel,
  type IaChatMessage,
  type IaProviderId,
} from "@/lib/ia/models"
import { readStoredProposals } from "@/lib/combinations"
import { INDEPENDENCE_DISCLAIMER } from "@/lib/capture/snapshot"
import { useDraws } from "@/lib/use-draws"

type Status = {
  google: boolean
  openai: boolean
  local?: boolean
  localHost?: string
  default: IaProviderId | null
  defaultModel?: string | null
  models?: Array<{ id: string; provider: IaProviderId; label: string; available: boolean }>
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
  const [inspector, setInspector] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

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
      grid: proposals[0] ?? null,
      fetchHarmo: (path, params) => fetchHarmo(path, params),
    }
  }, [archive, resolved, variable, ball, star, curveId, periodX, era, source])

  const catalog = useMemo(() => {
    const q = query.trim().toLowerCase()
    return BRAIN_CATALOG.filter((entry) => {
      if (activeLab !== "all" && entry.lab !== activeLab) return false
      if (!q) return true
      return `${entry.handle} ${entry.label} ${entry.aliases.join(" ")}`.toLowerCase().includes(q)
    })
  }, [activeLab, query])

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
        setModel(pickAvailableModel(models as never, "local", payload.defaultModel) ?? preferredModel("local"))
      } catch {
        setStatus({ google: false, openai: false, local: false, default: null })
      }
    })()
  }, [refreshJournal])

  const pinEntry = useCallback((entry: CatalogEntry) => {
    setPins((prev) => (prev.some((item) => item.id === entry.id) ? prev : [...prev, entry]))
  }, [])

  const resolvePins = useCallback(async () => {
    const objects: WorkingObject[] = []
    for (const entry of pins) {
      const fiche = await resolveEntry({ ...ctxBase, entry })
      objects.push({
        kind: "pin",
        id: entry.id,
        handle: `@${entry.handle}`,
        label: entry.label,
        inPrompt: true,
        summary: fiche.summary,
        fiche,
      })
    }
    setFiches(objects)
    return objects
  }, [pins, ctxBase])

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
      const retrieved = await retrieveMemories(question, 8)
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
      const snapshot = packWorkingSet([
        ...objects,
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
        setError("LLM local injoignable. Pas de bascule cloud.")
        return
      }
      if (useCloud && nextProvider === "local") {
        setError("Escalade : aucune clé Gemini / OpenAI.")
        return
      }
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
        setError(err instanceof Error ? err.message : "échec chat")
      } finally {
        setBusy(false)
      }
    },
    [escalate, fiches, handleCtx, messages, model, pinEntry, status]
  )

  const runWalker = useCallback(
    async (mode: "catalog" | "curves") => {
      const state = createWalker(mode, cloudLots)
      stopRef.current = false
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
          `Lots cloud : ${lots.length} appels prévus (seuil ${CLOUD_LOT_CONFIRM}). Continuer ?`
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
            setError("LLM local injoignable. Lots non commentés. Pas de bascule cloud.")
            break
          }
          if (cloudLots && nextProvider === "local") {
            setError("Lots cloud : aucune clé Gemini / OpenAI.")
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
                      "Commente ce lot de fiches flaggées. Cite @handle#id si l’id est là. Shortlist les plus remarquables. Pas de pronostic.",
                  },
                ],
                snapshot,
                systemPrompt: BRAIN_SYSTEM_PROMPT,
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
            setError(err instanceof Error ? err.message : "échec lot LLM")
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

  const suggestions = useMemo(() => {
    const last = draft.split(/\s/).pop() ?? ""
    if (!last.startsWith("@") || last.length < 2) return []
    return BRAIN_CATALOG.filter((entry) => `@${entry.handle}`.startsWith(last.toLowerCase()) || entry.handle.startsWith(last.slice(1).toLowerCase())).slice(0, 8)
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

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs leading-5 text-muted-foreground">{INDEPENDENCE_DISCLAIMER}</p>
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
      <div className="flex flex-wrap gap-2 text-xs">
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
          Variable
          <select
            className="rounded-md border border-border bg-background px-2 py-1"
            value={variable}
            onChange={(event) => setVariable(event.target.value as VariableName)}
          >
            {VARIABLE_NAMES.map((name) => (
              <option key={name} value={name}>
                {VARIABLE_LABELS[name]}
              </option>
            ))}
          </select>
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
        <label className="flex items-center gap-1">
          X
          <Input className="w-16" type="number" min={2} max={200} value={periodX} onChange={(e) => setPeriodX(Number(e.target.value) || 14)} />
        </label>
        <label className="flex items-center gap-1">
          Courbe
          <Input className="w-28" value={curveId} onChange={(e) => setCurveId(e.target.value || "sum")} />
        </label>
        <span className="text-muted-foreground">{loading ? "tirages…" : `${resolved.work.length} tirages · ${source}`}</span>
        <span className="text-muted-foreground">n={seriesIndex(variable, ball, star)}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Catalog
              <HelpTip title="Catalog" body="Handles stables. Un clic pin pour le working set. Les packs pinent un lot." />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1">
              <Button size="xs" variant={activeLab === "all" ? "default" : "outline"} onClick={() => setActiveLab("all")}>
                Tous
              </Button>
              {BRAIN_LABS.map((lab) => (
                <Button key={lab} size="xs" variant={activeLab === lab ? "default" : "outline"} onClick={() => setActiveLab(lab)}>
                  {BRAIN_LAB_LABELS[lab]}
                </Button>
              ))}
            </div>
            <Input placeholder="rechercher @rsi…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="flex flex-wrap gap-1">
              {BRAIN_PACKS.map((pack) => (
                <Button
                  key={pack.id}
                  size="xs"
                  variant="secondary"
                  onClick={() => {
                    for (const handle of pack.handles) {
                      const parsed = parseHandle(`@${handle}`, handleCtx)
                      if (parsed.entry) pinEntry(parsed.entry)
                    }
                  }}
                >
                  {pack.label}
                </Button>
              ))}
            </div>
            <div className="max-h-64 overflow-auto text-sm">
              {catalog.map((entry) => {
                const watched = watch.includes(entry.id)
                return (
                  <div key={entry.id} className="flex items-center gap-2 border-b border-border/60 py-1">
                    <button type="button" className="text-left hover:text-foreground" onClick={() => pinEntry(entry)}>
                      @{entry.handle} · {entry.label}
                    </button>
                    <button
                      type="button"
                      className="ml-auto text-[10px] text-muted-foreground"
                      onClick={() => {
                        const next = watched ? watch.filter((id) => id !== entry.id) : [...watch, entry.id]
                        setWatch(next)
                        writeWatchlist(next)
                      }}
                    >
                      {watched ? "watch ✓" : "watch"}
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="flex flex-wrap gap-1">
              {pins.map((entry) => (
                <Badge
                  key={entry.id}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => setPins((prev) => prev.filter((item) => item.id !== entry.id))}
                >
                  @{entry.handle} ×
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Objets (= prompt)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {board.length === 0 ? (
              <p className="text-muted-foreground">Pin un handle ou lance l’agent.</p>
            ) : (
              board.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-md border px-2 py-1 ${item.inPrompt ? "border-primary/40 bg-primary/10" : "border-border"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.handle}</span>
                    <Badge variant="outline">{item.kind}</Badge>
                    {item.fiche ? (
                      <a className="ml-auto text-xs underline" href={deepLinkFor({ entry: pins.find((p) => p.id === item.fiche?.id) ?? BRAIN_CATALOG.find((e) => e.id === item.fiche?.id) ?? BRAIN_CATALOG[0], variable: item.fiche.params.variable, n: item.fiche.params.n, periodX: item.fiche.params.periodX, preset, curveId: item.fiche.params.curveId }).href}>
                        ouvrir
                      </a>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{item.summary}</p>
                </div>
              ))
            )}
            <Button size="sm" variant="outline" onClick={() => setInspector((v) => !v)}>
              {inspector ? "Masquer JSON" : "Inspecteur JSON"}
            </Button>
            {inspector ? (
              <pre className="max-h-48 overflow-auto text-[10px] leading-4">{JSON.stringify(packed.tech, null, 2)}</pre>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Console agent</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void runWalker("catalog")} disabled={walker?.status === "running"}>
              Parcourir le catalog
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void runWalker("curves")} disabled={walker?.status === "running"}>
              Parcourir les 142 courbes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                pausedRef.current = !pausedRef.current
                setPaused(pausedRef.current)
                setWalker((prev) => (prev && prev.status === "running" ? { ...prev, status: pausedRef.current ? "paused" : "running" } : prev))
              }}
            >
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
              Arrêt
            </Button>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={cloudLots} onChange={(e) => setCloudLots(e.target.checked)} />
              Lots cloud
            </label>
            <Button size="sm" variant="outline" onClick={() => void refreshWatchlist()}>
              Watchlist (chiffres)
            </Button>
            {lastWatchlistRun() ? <span className="text-xs text-muted-foreground">watch {lastWatchlistRun()}</span> : null}
          </div>
          {walker ? (
            <div className="text-xs">
              <p>
                {walker.mode} · {walker.status} · {walker.index} / {walker.jobs.length} · flaggés {walker.flagged.length} ·
                local {walker.localCalls} / cloud {walker.cloudCalls} · notes {walker.notes} · ~{walker.tokensApprox} tok
              </p>
              <div className="mt-2 max-h-40 overflow-auto">
                {walker.jobs.map((job) => (
                  <div key={job.id} className="flex gap-2">
                    <span className="w-20 text-muted-foreground">{job.status}</span>
                    <span>{job.handle}</span>
                    <span className="text-muted-foreground">{job.fiche?.summary ?? job.error}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Déclenchement manuel seulement. Le LLM commente les lots flaggés, pas tout le catalog.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Journal</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">Source {journalSource}{journalSource === "local" ? " (Neon indisponible)" : ""}</p>
            <Input placeholder="filtre @rsi ou texte…" value={journalFilter} onChange={(e) => setJournalFilter(e.target.value)} />
            <div className="max-h-72 overflow-auto text-sm">
              {journal
                .filter((item) => {
                  const q = journalFilter.trim().toLowerCase().replace(/^@/, "")
                  if (!q) return true
                  const summary = String((item.payload as { summary?: string })?.summary ?? "")
                  const notes = (item.notes ?? []).map((note) => note.body).join(" ")
                  return `${item.handle} ${summary} ${notes}`.toLowerCase().includes(q)
                })
                .map((item) => (
                <div key={String(item.id)} className="border-b border-border py-2">
                  <div className="flex gap-2">
                    <span className="font-medium">
                      @{item.handle}#{item.id}
                    </span>
                    <span className="text-xs text-muted-foreground">{item.observed_at}</span>
                    <Badge variant="outline">{item.source}</Badge>
                  </div>
                  <p className="text-xs">{String((item.payload as { summary?: string })?.summary ?? "")}</p>
                  {(item.notes ?? []).map((note) => (
                    <p key={String(note.id)} className="text-xs text-muted-foreground">
                      ({note.author}) {note.body}
                    </p>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="commentaire sur la 1re lecture…" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
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

        <Card>
          <CardHeader>
            <CardTitle>Chat</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2 text-xs">
              <span>Fournisseur {provider}</span>
              <span>{model}</span>
              <span>{status?.local ? `local ${status.localHost ?? "ok"}` : "local off"}</span>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={escalate} onChange={(e) => setEscalate(e.target.checked)} />
                Escalader ce tour
              </label>
            </div>
            <div className="max-h-56 overflow-auto rounded-md border border-border p-2 text-sm">
              {messages.map((message, index) => (
                <p key={`${message.role}-${index}`} className={message.role === "assistant" ? "mt-2" : "mt-2 text-muted-foreground"}>
                  <strong>{message.role === "user" ? "Toi" : "Brain"}.</strong> {message.content}
                </p>
              ))}
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <div className="relative">
              <textarea
                className="min-h-20 w-full rounded-md border border-border bg-background p-2 text-sm"
                placeholder="@rsi et @adx sur cette fenêtre…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              {suggestions.length ? (
                <div className="absolute bottom-full left-0 z-10 mb-1 rounded-md border border-border bg-background p-1 text-xs">
                  {suggestions.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="block w-full px-2 py-1 text-left hover:bg-muted"
                      onClick={() => {
                        setDraft((prev) => prev.replace(/@[^\s]*$/, `@${entry.handle} `))
                        pinEntry(entry)
                      }}
                    >
                      @{entry.handle} · {entry.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <Button
              size="sm"
              disabled={busy || !draft.trim()}
              onClick={() => {
                const text = draft.trim()
                setDraft("")
                void ask(text)
              }}
            >
              {busy ? "…" : "Envoyer"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
