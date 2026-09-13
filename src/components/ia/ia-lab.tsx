"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { printSnapshot } from "@/lib/capture/pdf"
import { labLabel, type DiagnosticSnapshot } from "@/lib/capture/snapshot"
import { suggestionsFor, DEFAULT_QUESTION } from "@/lib/capture/suggestions"
import {
  CAPTURE_PENDING_EVENT,
  clearPending,
  readPending,
  readProvider,
  readThreads,
  threadTitle,
  upsertThread,
  writeProvider,
  type IaChatMessage,
  type IaProviderId,
  type IaThread,
} from "@/lib/capture/store"

type Status = {
  google: boolean
  openai: boolean
  default: IaProviderId | null
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
  const [threads, setThreads] = useState<IaThread[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<DiagnosticSnapshot | null>(null)
  const [messages, setMessages] = useState<IaChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [techOpen, setTechOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const pendingAuto = useRef<DiagnosticSnapshot | null>(null)
  const providerRef = useRef<IaProviderId | null>(null)
  const askRef = useRef<
    (
      content: string,
      pack: DiagnosticSnapshot | null,
      history: IaChatMessage[],
      chosen: IaProviderId | null
    ) => Promise<void>
  >(async () => undefined)

  useEffect(() => {
    void Promise.resolve().then(() => setThreads(readThreads()))
    void (async () => {
      try {
        const response = await fetch("/api/ia/status", { cache: "no-store" })
        const payload = (await response.json()) as Status & { ok?: boolean }
        setStatus(payload)
        setProvider(pickProvider(payload, readProvider()))
      } catch {
        setStatus({ google: false, openai: false, default: null })
      }
    })()
  }, [])

  const persist = useCallback(
    (nextSnapshot: DiagnosticSnapshot, nextMessages: IaChatMessage[], nextProvider: IaProviderId | null) => {
      const thread: IaThread = {
        id: nextSnapshot.id,
        updatedAt: new Date().toISOString(),
        title: threadTitle(nextSnapshot, nextSnapshot.question || nextMessages[0]?.content || ""),
        provider: nextProvider || "google",
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
      chosen: IaProviderId | null
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
      try {
        const response = await fetch("/api/ia/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: chosen,
            messages: nextMessages,
            snapshot: pack ? snapshotPayload(pack) : null,
          }),
        })
        const payload = (await response.json()) as { ok?: boolean; text?: string; error?: string }
        if (!payload.ok || !payload.text) {
          throw new Error(payload.error || `HTTP ${response.status}`)
        }
        const withReply: IaChatMessage[] = [
          ...nextMessages,
          { role: "assistant", content: payload.text },
        ]
        setMessages(withReply)
        if (pack) persist({ ...pack, question: pack.question || text }, withReply, chosen)
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
    askRef.current = ask
  }, [provider, ask])

  useEffect(() => {
    function ingest() {
      const pending = readPending()
      if (!pending) return
      clearPending()
      setSnapshot(pending.snapshot)
      setActiveId(pending.snapshot.id)
      setMessages([])
      setError(null)
      if (!pending.autoSend) return
      const chosen = providerRef.current
      if (chosen) {
        void askRef.current(
          pending.snapshot.question || DEFAULT_QUESTION,
          pending.snapshot,
          [],
          chosen
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
    if (!pack || !provider) return
    pendingAuto.current = null
    const chosen = provider
    void Promise.resolve().then(() =>
      ask(pack.question || DEFAULT_QUESTION, pack, [], chosen)
    )
  }, [provider, ask])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, busy])

  function openThread(thread: IaThread) {
    setActiveId(thread.id)
    setSnapshot(thread.snapshot)
    setMessages(thread.messages)
    setProvider(thread.provider)
    setError(null)
  }

  function selectProvider(id: IaProviderId) {
    setProvider(id)
    writeProvider(id)
  }

  const suggestions = useMemo(
    () => suggestionsFor(snapshot?.lab ?? "other", snapshot?.tab ?? null),
    [snapshot]
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="flex min-w-0 flex-col gap-4">
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
            </div>
          ))}
          {busy ? (
            <p className="text-xs text-muted-foreground">Lecture en cours…</p>
          ) : null}
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

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
            void ask(draft, snapshot, messages, provider)
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            placeholder="Question sur la lecture…"
            className="min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
          <Button type="submit" disabled={busy || !provider}>
            Envoyer
          </Button>
        </form>
      </div>

      <aside className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Captures
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
                {labLabel(thread.snapshot.lab)} · {thread.provider === "google" ? "Gemini" : "OpenAI"}
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
