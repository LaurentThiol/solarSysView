"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { HelpTip, LabelHelp } from "@/components/help"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select"
import { printSnapshot } from "@/lib/capture/pdf"
import { labLabel, type DiagnosticSnapshot } from "@/lib/capture/snapshot"
import { suggestionsFor, DEFAULT_QUESTION } from "@/lib/capture/suggestions"
import {
  CAPTURE_PENDING_EVENT,
  clearPending,
  readPending,
  readModel,
  readProvider,
  readThreads,
  threadTitle,
  upsertThread,
  writeModel,
  writeProvider,
  type IaChatMessage,
  type IaProviderId,
  type IaThread,
} from "@/lib/capture/store"
import {
  IA_MODELS,
  modelLabel,
  pickAvailableModel,
  preferredModel,
  providerLabel,
  providerOfModel,
  type IaModelOption,
} from "@/lib/ia/models"

type Status = {
  google: boolean
  openai: boolean
  default: IaProviderId | null
  models?: IaModelOption[]
  live?: { google: boolean | null; openai: boolean | null }
}

type ChatReply = {
  ok?: boolean
  text?: string
  error?: string
  model?: string
  provider?: IaProviderId
  requested?: string
  imageOmitted?: boolean
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

export function IaLab() {
  const [status, setStatus] = useState<Status | null>(null)
  const [provider, setProvider] = useState<IaProviderId | null>(null)
  const [model, setModel] = useState<string | null>(preferredModel("google"))
  const [threads, setThreads] = useState<IaThread[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<DiagnosticSnapshot | null>(null)
  const [messages, setMessages] = useState<IaChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [techOpen, setTechOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const pendingAuto = useRef<DiagnosticSnapshot | null>(null)
  const providerRef = useRef<IaProviderId | null>(null)
  const modelRef = useRef<string | null>(null)
  const askRef = useRef<
    (
      content: string,
      pack: DiagnosticSnapshot | null,
      history: IaChatMessage[],
      chosen: IaProviderId | null,
      chosenModel: string | null
    ) => Promise<void>
  >(async () => undefined)

  useEffect(() => {
    void Promise.resolve().then(() => setThreads(readThreads()))
    void (async () => {
      try {
        const response = await fetch("/api/ia/status", { cache: "no-store" })
        const payload = (await response.json()) as Status & { ok?: boolean }
        setStatus(payload)
        const nextProvider = pickProvider(payload, readProvider())
        setProvider(nextProvider)
        if (nextProvider) {
          setModel(pickAvailableModel(payload.models ?? [], nextProvider, readModel(nextProvider)))
        } else {
          setModel(
            readModel("google") || readModel("openai") || preferredModel("google")
          )
        }
      } catch {
        setStatus({ google: false, openai: false, default: null, models: [] })
      }
    })()
  }, [])

  const persist = useCallback(
    (
      nextSnapshot: DiagnosticSnapshot,
      nextMessages: IaChatMessage[],
      nextProvider: IaProviderId | null,
      nextModel: string | null
    ) => {
      const thread: IaThread = {
        id: nextSnapshot.id,
        updatedAt: new Date().toISOString(),
        title: threadTitle(nextSnapshot, nextSnapshot.question || nextMessages[0]?.content || ""),
        provider: nextProvider || "google",
        model: nextModel || undefined,
        snapshot: nextSnapshot,
        messages: nextMessages,
      }
      upsertThread(thread)
      setThreads(readThreads())
    },
    []
  )

  const ask = useCallback(
    async (
      content: string,
      pack: DiagnosticSnapshot | null,
      history: IaChatMessage[],
      chosen: IaProviderId | null,
      chosenModel: string | null
    ) => {
      const text = content.trim() || DEFAULT_QUESTION
      if (!chosen) {
        setError("Aucune clé Gemini / OpenAI. Configure-les dans Admin.")
        return
      }
      const nextMessages: IaChatMessage[] = [...history, { role: "user", content: text }]
      setMessages(nextMessages)
      setDraft("")
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        const response = await fetch("/api/ia/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: chosen,
            model: chosenModel,
            messages: nextMessages,
            snapshot: pack ? snapshotPayload(pack) : null,
          }),
        })
        const payload = (await response.json()) as ChatReply
        if (!payload.ok || !payload.text) {
          throw new Error(payload.error || `HTTP ${response.status}`)
        }
        const withReply: IaChatMessage[] = [
          ...nextMessages,
          {
            role: "assistant",
            content: payload.text,
            model: payload.model,
            provider: payload.provider ?? chosen,
            requested: payload.requested,
          },
        ]
        setMessages(withReply)
        if (pack) {
          persist(
            { ...pack, question: pack.question || text },
            withReply,
            chosen,
            payload.model || chosenModel
          )
        }
        if (payload.imageOmitted) {
          setNotice("Modèle sans vision : le visuel n’a pas été envoyé, seulement les données.")
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "échec IA")
      } finally {
        setBusy(false)
      }
    },
    [persist]
  )

  useLayoutEffect(() => {
    providerRef.current = provider
    modelRef.current = model
    askRef.current = ask
  }, [provider, model, ask])

  useEffect(() => {
    function ingest() {
      const pending = readPending()
      if (!pending) return
      clearPending()
      setSnapshot(pending.snapshot)
      setActiveId(pending.snapshot.id)
      setMessages([])
      setError(null)
      setNotice(null)
      if (!pending.autoSend) return
      const chosen = providerRef.current
      if (chosen) {
        void askRef.current(
          pending.snapshot.question || DEFAULT_QUESTION,
          pending.snapshot,
          [],
          chosen,
          modelRef.current
        )
      } else {
        pendingAuto.current = pending.snapshot
      }
    }
    const timeout = window.setTimeout(ingest, 0)
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
    const chosen = provider
    const chosenModel = model
    void Promise.resolve().then(() =>
      ask(pack.question || DEFAULT_QUESTION, pack, [], chosen, chosenModel)
    )
  }, [provider, model, ask])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, busy])

  const suggestions = useMemo(
    () => suggestionsFor(snapshot?.lab ?? "other", snapshot?.tab ?? null),
    [snapshot]
  )

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
  const catalogModels = provider
    ? providerModels.filter((item) => item.source === "catalog")
    : []
  const liveModels = providerModels.filter((item) => item.source === "live")
  const currentModel = allModels.find((item) => item.id === model) ?? null
  const hasImage = Boolean(snapshot?.imageDataUrl)
  const activeLabel = model ? modelLabel(model, allModels) : null
  const canSend = Boolean(provider && model && status?.[provider])

  function openThread(thread: IaThread) {
    setActiveId(thread.id)
    setSnapshot(thread.snapshot)
    setMessages(thread.messages)
    setProvider(thread.provider)
    setModel(thread.model || pickAvailableModel(allModels, thread.provider, readModel(thread.provider)))
    setError(null)
    setNotice(null)
  }

  function selectProvider(id: IaProviderId) {
    setProvider(id)
    writeProvider(id)
    const next = pickAvailableModel(allModels, id, readModel(id))
    setModel(next)
  }

  function selectModel(id: string | null) {
    if (!id) return
    const owner = provider ?? providerOfModel(id)
    if (!owner) return
    setModel(id)
    writeModel(owner, id)
    if (status?.[owner] && owner !== provider) {
      setProvider(owner)
      writeProvider(owner)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
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
            {!status?.google && !status?.openai ? (
              <span className="text-xs text-muted-foreground">
                Clés dans Admin (Google / OpenAI).
              </span>
            ) : null}
          </div>

          <LabelHelp
              label="Modèle"
              className="sm:ml-auto"
              help={{
                title: "Modèle",
                body: "Gemini ou OpenAI, puis le modèle envoyé avec le pack. Le catalogue est recommandé pour la lecture d’écran ; tes clés peuvent en ajouter d’autres. Le modèle réellement utilisé s’affiche sous la réponse. Un aperçu introuvable replie vers le catalogue.",
                items: [
                  {
                    label: "Vision",
                    text: "Les captures avec visuel demandent un modèle vision. Sinon seules les données partent.",
                  },
                  {
                    label: "Mémoire",
                    text: "Le dernier modèle de chaque fournisseur est mémorisé dans ce navigateur.",
                  },
                ],
              }}
            >
              <Select value={model ?? undefined} onValueChange={(value) => selectModel(value)}>
                <SelectTrigger className="w-full sm:w-72" aria-label="Modèle">
                  <span className="flex flex-1 text-left">
                    {currentModel ? currentModel.label : "Choisir un modèle"}
                  </span>
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false} className="min-w-72">
                  {provider ? (
                    <>
                      <SelectGroup>
                        <SelectLabel>Catalogue</SelectLabel>
                        {catalogModels.map((item) => (
                          <SelectItem key={item.id} value={item.id} disabled={!item.available}>
                            {`${item.label} · ${item.hint}`}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      {liveModels.length ? (
                        <SelectGroup>
                          <SelectLabel>Autres sur cette clé</SelectLabel>
                          {liveModels.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <SelectGroup>
                        <SelectLabel>Gemini</SelectLabel>
                        {catalogGoogle.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {`${item.label} · ${item.hint}`}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>OpenAI</SelectLabel>
                        {catalogOpenAI.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {`${item.label} · ${item.hint}`}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </>
                  )}
                  {model && !allModels.some((item) => item.id === model) ? (
                    <SelectItem value={model}>{model}</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </LabelHelp>
        </div>

        {currentModel ? (
          <p className="text-[11px] leading-4 text-muted-foreground">
            {providerLabel(currentModel.provider)} · {currentModel.id}
            {hasImage && !currentModel.vision
              ? " · sans vision : le visuel ne partira pas"
              : hasImage
                ? " · vision"
                : ""}
          </p>
        ) : null}

        {snapshot ? (
          <div className="rounded-xl border border-border bg-card/40 p-3">
            <div className="flex flex-wrap items-start gap-3">
              {snapshot.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={snapshot.imageDataUrl}
                  alt="Capture jointe"
                  className="h-24 w-36 rounded-md border border-border object-cover"
                />
              ) : (
                <div className="flex h-24 w-36 items-center justify-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground">
                  Sans visuel
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {labLabel(snapshot.lab)}
                  {snapshot.tab ? ` · ${snapshot.tab}` : ""}
                </p>
                <ul className="mt-1 space-y-0.5 text-xs leading-5 text-muted-foreground">
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
                    onClick={() => printSnapshot(snapshot)}
                  >
                    PDF
                  </button>
                </div>
              </div>
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
          className="flex max-h-[28rem] min-h-48 flex-col gap-3 overflow-auto rounded-xl border border-border bg-card/20 p-3"
        >
          {messages.length === 0 && !busy ? (
            <p className="text-xs text-muted-foreground">
              La conversation commence avec le pack. Tu peux aussi poser une question
              générale sur la lecture des courbes.
            </p>
          ) : null}
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[46rem] rounded-lg px-3 py-2 text-sm leading-6 whitespace-pre-wrap ${
                message.role === "user"
                  ? "ml-auto bg-primary/15 text-foreground"
                  : "bg-muted/40 text-foreground"
              }`}
            >
              {message.content}
              {message.role === "assistant" && message.model ? (
                <span className="mt-1.5 block text-[11px] leading-4 text-muted-foreground">
                  {providerLabel(message.provider ?? "google")} · {modelLabel(message.model, allModels)}
                  {message.requested && message.requested !== message.model
                    ? ` · repli depuis ${message.requested}`
                    : ""}
                </span>
              ) : null}
            </div>
          ))}
          {busy ? (
            <p className="text-xs text-muted-foreground">
              Lecture en cours{activeLabel ? ` · ${activeLabel}` : ""}…
            </p>
          ) : null}
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}

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
            void ask(draft, snapshot, messages, provider, model)
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            placeholder="Question sur la lecture…"
            className="min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
          <Button type="submit" disabled={busy || !canSend}>
            Envoyer
          </Button>
        </form>
      </div>

      <aside className="flex flex-col gap-2">
        <p className="inline-flex items-center gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Captures
          <HelpTip
            title="Historique"
            body="Les huit derniers packs restent dans ce navigateur. Rouvrir un fil restaure le fournisseur et le modèle de la conversation."
          />
        </p>
        {threads.length === 0 ? (
          <p className="text-xs text-muted-foreground">Pas encore d’historique.</p>
        ) : (
          threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => openThread(thread)}
              className={`rounded-lg border px-2.5 py-2 text-left text-xs leading-4 ${
                activeId === thread.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="block font-medium text-foreground">{thread.title}</span>
              <span className="mt-0.5 block opacity-80">
                {labLabel(thread.snapshot.lab)} · {providerLabel(thread.provider)}
                {thread.model ? ` · ${modelLabel(thread.model, allModels)}` : ""}
              </span>
            </button>
          ))
        )}
      </aside>
    </div>
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
