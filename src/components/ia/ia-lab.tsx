"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { HelpTip, LabelHelp } from "@/components/help"
import { ModelSelect } from "@/components/ia/model-select"
import { IaThreadList } from "@/components/ia/thread-list"
import { Button } from "@/components/ui/button"
import { snapshotVisual, withStoredImage } from "@/lib/capture/images"
import { printSnapshot, printThread } from "@/lib/capture/pdf"
import { formatCapturedAt, labLabel, type DiagnosticSnapshot } from "@/lib/capture/snapshot"
import { suggestionsFor, DEFAULT_QUESTION } from "@/lib/capture/suggestions"
import {
  CAPTURE_PENDING_EVENT,
  clearPending,
  clearThreads,
  deleteThread,
  hydratePending,
  importThreads,
  keepVisual,
  pinThread,
  readCompareModel,
  readCompareOn,
  readLastModel,
  readModel,
  readPending,
  readProvider,
  readThreads,
  renameThread,
  threadTitle,
  upsertThread,
  writeCompareModel,
  writeCompareOn,
  writeModel,
  writeProvider,
  type IaChatMessage,
  type IaProviderId,
  type IaThread,
} from "@/lib/capture/store"
import { downloadThreadJson, downloadThreadMarkdown, downloadThreadsJson, parseThreadsExport, threadToMarkdown } from "@/lib/ia/export"
import { streamIaChat } from "@/lib/ia/client"
import {
  IA_MODELS,
  localLiveIds,
  modelLabel,
  pickAvailableModel,
  pickCompareModel,
  preferredModel,
  providerLabel,
  providerOfModel,
  type IaMessageLane,
  type IaModelOption,
} from "@/lib/ia/models"
import { groupIaTurns, historyForLane } from "@/lib/ia/turns"

type Status = {
  google: boolean
  openai: boolean
  local?: boolean
  localHost?: string
  localModelEnv?: string | null
  default: IaProviderId | null
  models?: IaModelOption[]
  live?: { google: boolean | null; openai: boolean | null; local?: boolean | null }
}

type AskOptions = {
  compare?: boolean
  modelB?: string | null
  deepen?: boolean
}

function pickProvider(status: Status | null, stored: IaProviderId | null): IaProviderId | null {
  if (stored && status?.[stored]) return stored
  return status?.default ?? null
}

function snapshotPayload(snapshot: DiagnosticSnapshot) {
  return {
    lab: snapshot.lab,
    tab: snapshot.tab,
    route: snapshot.route,
    capturedAt: snapshot.capturedAt,
    gitSha: snapshot.gitSha,
    archive: snapshot.archive,
    summary: snapshot.summary,
    tech: snapshot.tech,
    disclaimer: snapshot.disclaimer,
    question: snapshot.question,
    imageDataUrl: snapshot.imageDataUrl,
  }
}

function patchLane(
  messages: IaChatMessage[],
  pairId: string,
  lane: IaMessageLane,
  patch: Partial<IaChatMessage> | ((current: IaChatMessage) => IaChatMessage)
) {
  return messages.map((item) => {
    if (item.pairId !== pairId || (item.lane ?? "a") !== lane) return item
    return typeof patch === "function" ? patch(item) : { ...item, ...patch }
  })
}

export function IaLab() {
  const [status, setStatus] = useState<Status | null>(null)
  const [provider, setProvider] = useState<IaProviderId | null>(null)
  const [model, setModel] = useState<string | null>(preferredModel("google"))
  const [modelB, setModelB] = useState<string | null>(null)
  const [compare, setCompare] = useState(false)
  const [deepen, setDeepen] = useState(false)
  const [threads, setThreads] = useState<IaThread[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<DiagnosticSnapshot | null>(null)
  const [messages, setMessages] = useState<IaChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [techOpen, setTechOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [liveLanes, setLiveLanes] = useState<Partial<Record<IaMessageLane, boolean>>>({})
  const listRef = useRef<HTMLDivElement>(null)
  const pendingAuto = useRef<DiagnosticSnapshot | null>(null)
  const providerRef = useRef<IaProviderId | null>(null)
  const modelRef = useRef<string | null>(null)
  const compareRef = useRef(false)
  const modelBRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<IaChatMessage[]>([])
  const persistRef = useRef<
    (
      nextSnapshot: DiagnosticSnapshot,
      nextMessages: IaChatMessage[],
      nextProvider: IaProviderId | null,
      nextModel: string | null
    ) => Promise<DiagnosticSnapshot>
  >(async (nextSnapshot) => nextSnapshot)
  const openGen = useRef(0)
  const askRef = useRef<(content: string, pack: DiagnosticSnapshot | null, history: IaChatMessage[], options: AskOptions & { provider: IaProviderId | null; model: string | null }) => Promise<void>>(
    async () => undefined
  )

  useEffect(() => {
    void Promise.resolve().then(() => {
      setThreads(readThreads())
      setCompare(readCompareOn())
    })
    void (async () => {
      try {
        const response = await fetch("/api/ia/status", { cache: "no-store" })
        const payload = (await response.json()) as Status & { ok?: boolean }
        setStatus(payload)
        const nextProvider = pickProvider(payload, readProvider())
        setProvider(nextProvider)
        const models = payload.models ?? []
        const nextModel = nextProvider
          ? pickAvailableModel(models, nextProvider, readModel(nextProvider), {
              envModel: payload.localModelEnv,
              liveIds: localLiveIds(models),
            })
          : readLastModel() || preferredModel("google")
        setModel(nextModel)
        setModelB(pickCompareModel(models, nextModel, readCompareModel()))
      } catch {
        setStatus({ google: false, openai: false, local: false, default: null, models: [] })
      }
    })()
  }, [])

  const persist = useCallback(
    async (
      nextSnapshot: DiagnosticSnapshot,
      nextMessages: IaChatMessage[],
      nextProvider: IaProviderId | null,
      nextModel: string | null
    ) => {
      const existing = readThreads().find((item) => item.id === nextSnapshot.id)
      const stored = await upsertThread({
        id: nextSnapshot.id,
        updatedAt: new Date().toISOString(),
        title: existing?.titleLocked
          ? existing.title
          : threadTitle(nextSnapshot, nextSnapshot.question || nextMessages[0]?.content || ""),
        titleLocked: existing?.titleLocked,
        pinned: existing?.pinned,
        provider: nextProvider || "google",
        model: nextModel || undefined,
        snapshot: nextSnapshot,
        messages: nextMessages,
      })
      const hydrated = keepVisual(nextSnapshot, stored)
      setThreads((prev) =>
        readThreads().map((item) => {
          const memory = prev.find((entry) => entry.id === item.id)?.snapshot
          let packed = item.snapshot
          if (item.id === hydrated.id) packed = keepVisual(hydrated, packed)
          if (memory) packed = keepVisual(memory, packed)
          return { ...item, snapshot: packed }
        })
      )
      return hydrated
    },
    []
  )

  const ask = useCallback(
    async (
      content: string,
      pack: DiagnosticSnapshot | null,
      history: IaChatMessage[],
      options: AskOptions & { provider: IaProviderId | null; model: string | null }
    ) => {
      const text = content.trim() || DEFAULT_QUESTION
      const chosen = options.provider
      const chosenModel = options.model
      if (!chosen || !chosenModel) {
        setError("Aucun LLM. Lance Ollama ou configure Gemini / OpenAI dans Admin.")
        return
      }
      const compareRun = Boolean(options.compare && options.modelB && options.modelB !== chosenModel)
      const providerB = options.modelB ? providerOfModel(options.modelB) : null
      if (compareRun && !providerB) {
        setError("Second modèle inconnu.")
        return
      }
      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort
      const pairId = crypto.randomUUID()
      const userMessage: IaChatMessage = { role: "user", content: text }
      const laneA: IaChatMessage = {
        role: "assistant",
        content: "",
        model: chosenModel,
        provider: chosen,
        lane: "a",
        pairId,
      }
      const laneB: IaChatMessage | null =
        compareRun && options.modelB && providerB
          ? {
              role: "assistant",
              content: "",
              model: options.modelB,
              provider: providerB,
              lane: "b",
              pairId,
            }
          : null
      const nextMessages: IaChatMessage[] = [
        ...history,
        userMessage,
        laneA,
        ...(laneB ? [laneB] : []),
      ]
      messagesRef.current = nextMessages
      setMessages(nextMessages)
      setDraft("")
      setBusy(true)
      setError(null)
      setNotice(null)
      setLiveLanes(compareRun ? { a: true, b: true } : { a: true })
      if (pack) {
        void persist({ ...pack, question: pack.question || text }, nextMessages, chosen, chosenModel)
      }

      function commitLane(
        lane: IaMessageLane,
        patch: Partial<IaChatMessage> | ((current: IaChatMessage) => IaChatMessage)
      ) {
        const next = patchLane(messagesRef.current, pairId, lane, patch)
        messagesRef.current = next
        setMessages(next)
      }

      async function streamLane(lane: IaMessageLane, providerId: IaProviderId, modelId: string) {
        const requestMessages = [...historyForLane(history, lane), userMessage]
        try {
          await streamIaChat(
            {
              provider: providerId,
              model: modelId,
              messages: requestMessages,
              snapshot: pack ? snapshotPayload(pack) : null,
              deepen: providerId === "local" ? Boolean(options.deepen) : false,
            },
            {
              signal: abort.signal,
              onEvent: (event) => {
                if (event.type === "meta") {
                  commitLane(lane, {
                    model: event.model,
                    provider: event.provider,
                    requested: event.requested,
                  })
                  if (event.imageOmitted) {
                    setNotice("Modèle sans vision : le visuel n’a pas été envoyé, seulement les données.")
                  }
                }
                if (event.type === "delta") {
                  commitLane(lane, (item) => ({
                    ...item,
                    content: `${item.content}${event.text}`,
                  }))
                }
                if (event.type === "done") {
                  commitLane(lane, {
                    content: event.text,
                    model: event.model,
                    provider: event.provider,
                    requested: event.requested,
                  })
                }
              },
            }
          )
        } catch (err) {
          if (abort.signal.aborted) return
          setError(err instanceof Error ? err.message : "échec IA")
        } finally {
          setLiveLanes((current) => ({ ...current, [lane]: false }))
        }
      }

      try {
        const tasks = [streamLane("a", chosen, chosenModel)]
        if (compareRun && laneB && providerB && options.modelB) {
          tasks.push(streamLane("b", providerB, options.modelB))
        }
        await Promise.all(tasks)
      } finally {
        if (pack) {
          const stored = await persist(
            { ...pack, question: pack.question || text },
            messagesRef.current,
            chosen,
            chosenModel
          )
          setSnapshot((current) =>
            current && current.id === stored.id ? keepVisual(current, stored) : current
          )
        }
        if (abortRef.current === abort) abortRef.current = null
        setBusy(false)
        setLiveLanes({})
      }
    },
    [persist]
  )

  useLayoutEffect(() => {
    providerRef.current = provider
    modelRef.current = model
    compareRef.current = compare
    modelBRef.current = modelB
    messagesRef.current = messages
    askRef.current = ask
    persistRef.current = persist
  }, [provider, model, compare, modelB, ask, persist, messages])

  useEffect(() => {
    function ingest(): boolean {
      const pending = readPending()
      if (!pending) return false
      clearPending()
      abortRef.current?.abort()
      const gen = (openGen.current += 1)
      void (async () => {
        const hydrated = await hydratePending(pending)
        if (openGen.current !== gen) return
        setSnapshot(hydrated.snapshot)
        setActiveId(hydrated.snapshot.id)
        setMessages([])
        setError(null)
        setNotice(null)
        setPreviewOpen(false)
        setBusy(false)
        setLiveLanes({})
        const chosen = providerRef.current
        await persistRef.current(hydrated.snapshot, [], chosen, modelRef.current)
        if (!hydrated.autoSend) return
        if (chosen) {
          void askRef.current(hydrated.snapshot.question || DEFAULT_QUESTION, hydrated.snapshot, [], {
            provider: chosen,
            model: modelRef.current,
            compare: compareRef.current,
            modelB: modelBRef.current,
          })
        } else {
          pendingAuto.current = hydrated.snapshot
        }
      })()
      return true
    }
    async function openLatest() {
      const list = readThreads()
      if (!list[0]) return
      const thread = list[0]
      const gen = (openGen.current += 1)
      setActiveId(thread.id)
      setSnapshot(thread.snapshot)
      setMessages(thread.messages)
      setProvider(thread.provider)
      if (thread.model) setModel(thread.model)
      setPreviewOpen(false)
      setNotice(null)
      const packed = await withStoredImage(thread.snapshot)
      if (openGen.current !== gen) return
      setSnapshot(packed)
    }
    const timeout = window.setTimeout(() => {
      if (!ingest()) void openLatest()
    }, 0)
    window.addEventListener(CAPTURE_PENDING_EVENT, ingest)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener(CAPTURE_PENDING_EVENT, ingest)
    }
  }, [])

  useEffect(() => {
    const pack = pendingAuto.current
    if (!pack || !provider || !model) return
    pendingAuto.current = null
    void Promise.resolve().then(() =>
      ask(pack.question || DEFAULT_QUESTION, pack, [], {
        provider,
        model,
        compare,
        modelB,
      })
    )
  }, [provider, model, compare, modelB, ask])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, liveLanes])

  const turns = useMemo(() => groupIaTurns(messages), [messages])
  const suggestions = useMemo(
    () => suggestionsFor(snapshot?.lab ?? "other", snapshot?.tab ?? null),
    [snapshot]
  )
  const visual = snapshot ? snapshotVisual(snapshot) : null

  const allModels = useMemo<IaModelOption[]>(() => {
    if (status?.models?.length) return status.models
    return IA_MODELS.map((item) => ({
      ...item,
      available: false,
      source: "catalog" as const,
    }))
  }, [status])

  const providerModels = useMemo(() => {
    if (!provider) return allModels
    return allModels.filter((item) => item.provider === provider)
  }, [allModels, provider])

  const catalogGoogle = allModels.filter(
    (item) => item.source === "catalog" && item.provider === "google"
  )
  const catalogOpenAI = allModels.filter(
    (item) => item.source === "catalog" && item.provider === "openai"
  )
  const catalogLocal = allModels.filter(
    (item) => item.source === "catalog" && item.provider === "local"
  )
  const catalogModels = provider
    ? providerModels.filter((item) => item.source === "catalog")
    : []
  const liveModels = providerModels.filter((item) => item.source === "live")
  const liveAll = allModels.filter((item) => item.source === "live")
  const currentModel = allModels.find((item) => item.id === model) ?? null
  const currentModelB = allModels.find((item) => item.id === modelB) ?? null
  const hasImage = Boolean(visual)
  const canSend = Boolean(provider && model && status?.[provider])
  const providerB = modelB ? providerOfModel(modelB) : null
  const canSendB = Boolean(providerB && status?.[providerB] && modelB && modelB !== model)
  const canSubmit = compare ? canSend && canSendB : canSend
  const livePairId =
    liveLanes.a || liveLanes.b
      ? [...messages].reverse().find((item) => item.pairId)?.pairId ?? null
      : null
  const groupedAll = [
    { label: "Gemini", items: catalogGoogle },
    { label: "OpenAI", items: catalogOpenAI },
    { label: "Local", items: catalogLocal },
    { label: "Autres sur cette clé", items: liveAll },
  ]
  const groupedA =
    compare || !provider
      ? groupedAll
      : [
          { label: "Catalogue", items: catalogModels },
          { label: "Autres sur cette clé", items: liveModels },
        ]

  async function openThread(thread: IaThread) {
    abortRef.current?.abort()
    const gen = (openGen.current += 1)
    setActiveId(thread.id)
    setSnapshot(thread.snapshot)
    setMessages(thread.messages)
    setProvider(thread.provider)
    setModel(thread.model || pickAvailableModel(allModels, thread.provider, readModel(thread.provider), {
      envModel: status?.localModelEnv,
      liveIds: localLiveIds(allModels),
    }))
    setError(null)
    setNotice(null)
    setBusy(false)
    setLiveLanes({})
    setPreviewOpen(false)
    const packed = await withStoredImage(thread.snapshot)
    if (openGen.current !== gen) return
    setSnapshot(packed)
  }

  function selectProvider(id: IaProviderId) {
    setProvider(id)
    writeProvider(id)
    const next = pickAvailableModel(allModels, id, readModel(id), {
      envModel: status?.localModelEnv,
      liveIds: localLiveIds(allModels),
    })
    setModel(next)
    if (compare) {
      const nextB = pickCompareModel(allModels, next, readCompareModel())
      setModelB(nextB)
      if (nextB) writeCompareModel(nextB)
    }
  }

  function selectModel(id: string | null) {
    if (!id || id === model) return
    const owner = provider ?? providerOfModel(id)
    if (!owner) return
    setModel(id)
    writeModel(owner, id)
    if (status?.[owner] && owner !== provider) {
      setProvider(owner)
      writeProvider(owner)
    }
    if (compare && (id === modelB || !modelB)) {
      const nextB = pickCompareModel(allModels, id, id === modelB ? null : readCompareModel())
      setModelB(nextB)
      if (nextB) writeCompareModel(nextB)
    }
  }

  function selectModelB(id: string | null) {
    if (!id || id === modelB) return
    if (id === model) return
    setModelB(id)
    writeCompareModel(id)
  }

  function toggleCompare() {
    const next = !compare
    setCompare(next)
    writeCompareOn(next)
    if (next) {
      const picked = pickCompareModel(allModels, model, readCompareModel())
      setModelB(picked)
      if (picked) writeCompareModel(picked)
    }
  }

  function stop() {
    abortRef.current?.abort()
    setBusy(false)
    setLiveLanes({})
  }

  const activeThread = threads.find((item) => item.id === activeId) ?? null

  function liveThread(thread: IaThread): IaThread {
    if (thread.id !== activeId) return thread
    return {
      ...thread,
      messages,
      snapshot: snapshot ?? thread.snapshot,
    }
  }

  function threadToMarkdownLive(thread: IaThread) {
    return threadToMarkdown(liveThread(thread))
  }

  function applyStored(next: IaThread[]) {
    setThreads((prev) =>
      next.map((item) => {
        const memory = prev.find((entry) => entry.id === item.id)?.snapshot
        return memory ? { ...item, snapshot: keepVisual(memory, item.snapshot) } : item
      })
    )
  }

  function exportMarkdown(thread: IaThread) {
    downloadThreadMarkdown(liveThread(thread))
    setNotice("Fil exporté en Markdown.")
  }

  function exportJson(thread: IaThread) {
    const packed = liveThread(thread)
    downloadThreadJson(packed, Boolean(packed.snapshot.imageDataUrl))
    setNotice("Fil exporté en JSON.")
  }

  function handleRename(id: string, title: string) {
    const next = renameThread(id, title)
    if (!next) return false
    applyStored(next)
    setNotice("Fil renommé.")
    return true
  }

  function handleDelete(id: string) {
    abortRef.current?.abort()
    const next = deleteThread(id)
    applyStored(next)
    setNotice("Fil supprimé.")
    if (activeId !== id) return
    const fallback = next[0]
    if (fallback) {
      void openThread(fallback)
    } else {
      setActiveId(null)
      setSnapshot(null)
      setMessages([])
    }
  }

  function handlePin(id: string) {
    applyStored(pinThread(id))
  }

  function handleClearAll() {
    if (!window.confirm("Supprimer toutes les lectures IA de ce navigateur ?")) return
    abortRef.current?.abort()
    clearThreads()
    setThreads([])
    setActiveId(null)
    setSnapshot(null)
    setMessages([])
    setNotice("Historique IA effacé.")
  }

  async function handleImportFile(file: File) {
    try {
      const raw = JSON.parse(await file.text()) as unknown
      const incoming = parseThreadsExport(raw)
      if (!incoming.length) {
        setError("Fichier d’export IA illisible.")
        return
      }
      const next = await importThreads(incoming)
      applyStored(next)
      setError(null)
      setNotice(
        `${incoming.length} lecture${incoming.length > 1 ? "s" : ""} importée${
          incoming.length > 1 ? "s" : ""
        }.`
      )
    } catch {
      setError("Fichier d’export IA illisible.")
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ProviderPill
              id="google"
              label="Gemini"
              enabled={Boolean(status?.google)}
              active={provider === "google"}
              onSelect={selectProvider}
            />
            <ProviderPill
              id="openai"
              label="OpenAI"
              enabled={Boolean(status?.openai)}
              active={provider === "openai"}
              onSelect={selectProvider}
            />
            <ProviderPill
              id="local"
              label="Local"
              enabled={Boolean(status?.local)}
              active={provider === "local"}
              onSelect={selectProvider}
            />
            <button
              type="button"
              aria-pressed={compare}
              onClick={toggleCompare}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                compare
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Comparer
            </button>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={deepen}
                onChange={(event) => setDeepen(event.target.checked)}
                disabled={provider !== "local"}
              />
              Approfondir
            </label>
            <HelpTip
              title="Comparer"
              body="Même pack, deux lectures en parallèle. Utile en Chartisme / Harmo : un modèle rapide contre un plus précis, ou Gemini contre OpenAI. Les réponses arrivent en flux."
            />
            {!status?.google && !status?.openai && !status?.local ? (
              <span className="text-xs text-muted-foreground">
                Ollama en local, ou clés Gemini / OpenAI dans Admin.
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <LabelHelp
              label={compare ? "Modèle A" : "Modèle"}
              className="min-w-0 sm:flex-1"
              help={{
                title: "Modèle",
                body: "Le modèle envoyé avec le pack. En comparaison, A et B reçoivent la même question. Le modèle réellement utilisé s’affiche sous la réponse.",
                items: [
                  {
                    label: "Vision",
                    text: "Les captures avec visuel demandent un modèle vision. Sinon seules les données partent.",
                  },
                  {
                    label: "Flux",
                    text: "La réponse s’écrit au fil de l’eau. Arrêter conserve le texte déjà reçu.",
                  },
                ],
              }}
            >
              <ModelSelect
                label={compare ? "Modèle A" : "Modèle"}
                value={model}
                models={allModels}
                groups={groupedA}
                onChange={selectModel}
              />
            </LabelHelp>
            {compare ? (
              <LabelHelp
                label="Modèle B"
                className="min-w-0 sm:flex-1"
                help={{
                  title: "Modèle B",
                  body: "Second lecteur du même pack. Choisis un modèle différent — autre fournisseur, ou Flash contre Pro.",
                }}
              >
                <ModelSelect
                  label="Modèle B"
                  value={modelB}
                  models={allModels}
                  groups={groupedAll}
                  onChange={selectModelB}
                />
              </LabelHelp>
            ) : null}
          </div>
        </div>

        {currentModel ? (
          <p className="text-[11px] leading-4 text-muted-foreground">
            {compare ? "A · " : ""}
            {providerLabel(currentModel.provider)} · {currentModel.id}
            {hasImage && !currentModel.vision ? " · sans vision" : hasImage ? " · vision" : ""}
            {compare && currentModelB ? (
              <>
                {" · B · "}
                {providerLabel(currentModelB.provider)} · {currentModelB.id}
                {hasImage && !currentModelB.vision ? " · sans vision" : ""}
              </>
            ) : null}
          </p>
        ) : null}

        {snapshot ? (
          <div className="rounded-xl border border-border bg-card/40 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium leading-5">
                {snapshot.question || "Lecture sans question"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {labLabel(snapshot.lab)}
                {snapshot.tab ? ` · ${snapshot.tab}` : ""}
                {" · "}
                {formatCapturedAt(snapshot.capturedAt)}
              </p>
            </div>
            {visual ? (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="mt-3 block w-full overflow-hidden rounded-md border border-border bg-muted/20"
                title="Agrandir le graphique"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={snapshot.id}
                  src={visual}
                  alt="Graphique capturé"
                  className="max-h-72 w-full object-contain"
                />
              </button>
            ) : (
              <div className="mt-3 flex h-28 items-center justify-center rounded-md border border-dashed border-border px-3 text-center text-[11px] leading-4 text-muted-foreground">
                Visuel non conservé — le graphique n’a pas pu être enregistré
                (thème CSS ou quota du navigateur).
              </div>
            )}
            <ul className="mt-3 space-y-0.5 text-xs leading-5 text-muted-foreground">
              {snapshot.summary.slice(0, 4).map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="text-[11px] text-primary underline-offset-2 hover:underline"
                onClick={() => setTechOpen((value) => !value)}
              >
                {techOpen ? "Masquer le JSON" : "Données techniques"}
              </button>
              <button
                type="button"
                className="text-[11px] text-primary underline-offset-2 hover:underline"
                onClick={() => {
                  const thread = threads.find((item) => item.id === snapshot.id)
                  void withStoredImage(snapshot).then((packed) => {
                    if (thread && (thread.messages.length || messages.length)) {
                      printThread({
                        ...thread,
                        snapshot: packed,
                        messages: thread.id === activeId ? messages : thread.messages,
                      })
                    } else {
                      printSnapshot(packed)
                    }
                  })
                }}
              >
                PDF
              </button>
              {activeThread ? (
                <>
                  <button
                    type="button"
                    className="text-[11px] text-primary underline-offset-2 hover:underline"
                    onClick={() => exportMarkdown(activeThread)}
                  >
                    Markdown
                  </button>
                  <button
                    type="button"
                    className="text-[11px] text-primary underline-offset-2 hover:underline"
                    onClick={() => exportJson(activeThread)}
                  >
                    JSON
                  </button>
                  <button
                    type="button"
                    className="text-[11px] text-primary underline-offset-2 hover:underline"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(threadToMarkdownLive(activeThread))
                        .then(
                          () => setNotice("Conversation copiée."),
                          () => setNotice("Impossible de copier.")
                        )
                    }}
                  >
                    Copier
                  </button>
                </>
              ) : null}
            </div>
            {techOpen ? (
              <pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-muted/40 p-2 text-[11px] leading-4">
                {JSON.stringify(snapshot.tech, null, 2)}
              </pre>
            ) : null}
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{snapshot.disclaimer}</p>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            Aucun pack pour l’instant. Ouvre un laboratoire, clique <strong>Capture</strong>{" "}
            (ou la touche <kbd className="rounded border border-border px-1">c</kbd>), puis
            Envoyer à l’IA.
          </p>
        )}

        <div
          ref={listRef}
          className="flex max-h-[36rem] min-h-48 flex-col gap-3 overflow-auto rounded-xl border border-border bg-card/20 p-3"
        >
          {messages.length === 0 && !busy ? (
            <p className="text-xs text-muted-foreground">
              La conversation commence avec le pack. Tu peux aussi poser une question
              générale sur la lecture des courbes.
            </p>
          ) : null}
          {turns.map((turn) => {
            if (turn.kind === "user") {
              return (
                <div
                  key={`user-${turn.index}`}
                  className="ml-auto max-w-[46rem] rounded-lg bg-primary/15 px-3 py-2 text-sm leading-6 whitespace-pre-wrap"
                >
                  {turn.message.content}
                </div>
              )
            }
            if (turn.kind === "compare") {
              return (
                <div key={turn.pairId} className="grid gap-3 md:grid-cols-2">
                  <CompareColumn
                    message={turn.a}
                    models={allModels}
                    streaming={Boolean(livePairId === turn.pairId && liveLanes.a)}
                  />
                  <CompareColumn
                    message={turn.b}
                    models={allModels}
                    streaming={Boolean(livePairId === turn.pairId && liveLanes.b)}
                  />
                </div>
              )
            }
            return (
              <AssistantBubble
                key={`assistant-${turn.index}`}
                message={turn.message}
                models={allModels}
                streaming={Boolean(
                  livePairId === turn.message.pairId &&
                    liveLanes[turn.message.lane === "b" ? "b" : "a"]
                )}
              />
            )
          })}
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
        {compare && model && modelB && model === modelB ? (
          <p className="text-xs text-muted-foreground">Choisis un second modèle différent.</p>
        ) : null}
        {compare && providerB && !status?.[providerB] ? (
          <p className="text-xs text-muted-foreground">
            Le modèle B n’a pas de clé (Admin).
          </p>
        ) : null}

        {messages.length === 0 && !busy ? (
          <div className="flex flex-col gap-1.5">
            {suggestions.map((item) => (
              <button
                key={item}
                type="button"
                className="rounded-lg border border-border px-2.5 py-1.5 text-left text-[11px] leading-4 text-muted-foreground hover:text-foreground"
                onClick={() => setDraft(item)}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            if (busy) return
            void ask(draft, snapshot, messages, {
              provider,
              model,
              compare,
              modelB,
              deepen: provider === "local" ? deepen : false,
            })
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            placeholder="Question sur la lecture…"
            className="min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
          {busy ? (
            <Button type="button" variant="outline" onClick={stop}>
              Arrêter
            </Button>
          ) : (
            <Button type="submit" disabled={!canSubmit}>
              {compare ? "Comparer" : "Envoyer"}
            </Button>
          )}
        </form>
      </div>

      <IaThreadList
        threads={threads}
        activeId={activeId}
        models={allModels}
        onOpen={(thread) => void openThread(thread)}
        onRename={handleRename}
        onDelete={handleDelete}
        onPin={handlePin}
        onExportMarkdown={exportMarkdown}
        onExportJson={exportJson}
        onExportAll={() => {
          downloadThreadsJson(threads.map(liveThread))
          setNotice("Historique exporté en JSON.")
        }}
        onImportFile={(file) => void handleImportFile(file)}
        onClearAll={handleClearAll}
      />

      {previewOpen && visual ? (
        <button
          type="button"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewOpen(false)}
          aria-label="Fermer le graphique"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={visual}
            alt="Graphique capturé"
            className="max-h-[90vh] max-w-[92vw] rounded-lg border border-border object-contain"
          />
        </button>
      ) : null}
    </div>
  )
}

function streamingOf(message: IaChatMessage, live: boolean) {
  return live && message.role === "assistant"
}

function AssistantBubble({
  message,
  models,
  streaming,
}: {
  message: IaChatMessage
  models: IaModelOption[]
  streaming: boolean
}) {
  return (
    <div className="max-w-[46rem] rounded-lg bg-muted/40 px-3 py-2 text-sm leading-6 whitespace-pre-wrap">
      {message.content}
      {streaming ? <Caret /> : null}
      {message.model ? (
        <span className="mt-1.5 block text-[11px] leading-4 text-muted-foreground">
          {providerLabel(message.provider ?? "google")} · {modelLabel(message.model, models)}
          {message.requested && message.requested !== message.model
            ? ` · repli depuis ${message.requested}`
            : ""}
        </span>
      ) : null}
    </div>
  )
}

function CompareColumn({
  message,
  models,
  streaming,
}: {
  message: IaChatMessage | null
  models: IaModelOption[]
  streaming: boolean
}) {
  if (!message) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        En attente du second modèle…
      </div>
    )
  }
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground">
        {providerLabel(message.provider ?? "google")} · {modelLabel(message.model || "", models)}
      </p>
      <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm leading-6 whitespace-pre-wrap">
        {message.content || (streaming ? "" : "…")}
        {streamingOf(message, streaming) ? <Caret /> : null}
      </div>
    </div>
  )
}

function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-primary/80"
    />
  )
}

function ProviderPill({
  id,
  label,
  enabled,
  active,
  onSelect,
}: {
  id: IaProviderId
  label: string
  enabled: boolean
  active: boolean
  onSelect: (id: IaProviderId) => void
}) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={() => onSelect(id)}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        active
          ? "border-primary bg-primary/15 text-foreground"
          : enabled
            ? "border-border text-muted-foreground hover:text-foreground"
            : "border-border text-muted-foreground/50"
      }`}
    >
      {label}
      {!enabled ? " · off" : null}
    </button>
  )
}
