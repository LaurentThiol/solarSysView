"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { usePathname, useRouter } from "next/navigation"

import { captureNodePng } from "@/lib/capture/png"
import { printSnapshot } from "@/lib/capture/pdf"
import { getCaptureCollector } from "@/lib/capture/registry"
import {
  defaultCollector,
  emptyArchive,
  INDEPENDENCE_DISCLAIMER,
  IMAGE_MAX_CHARS,
  newSnapshotId,
  type DiagnosticSnapshot,
  type SnapshotArchive,
} from "@/lib/capture/snapshot"
import { DEFAULT_QUESTION } from "@/lib/capture/suggestions"
import { writePending } from "@/lib/capture/store"

type CaptureState = {
  open: boolean
  capturing: boolean
  flash: boolean
  draft: DiagnosticSnapshot | null
  error: string | null
  startCapture: () => Promise<void>
  close: () => void
  sendToIa: (question: string) => void
  downloadPdf: (question: string) => void
}

const CaptureStateContext = createContext<CaptureState | null>(null)

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  )
}

async function fetchRuntimeMeta(): Promise<{ gitSha: string | null; archive: SnapshotArchive }> {
  try {
    const response = await fetch("/api/startup", { cache: "no-store" })
    if (!response.ok) throw new Error("startup")
    const data = (await response.json()) as {
      draws?: number | null
      stale?: boolean | null
      latest?: { draw_date?: string } | null
      git?: { current_short?: string | null; sha?: string | null }
      neon?: { ok?: boolean }
    }
    return {
      gitSha: data.git?.current_short || data.git?.sha || null,
      archive: {
        n: data.draws ?? null,
        from: null,
        to: data.latest?.draw_date ?? null,
        latest: data.latest?.draw_date ?? null,
        stale: data.stale ?? null,
        source: data.neon?.ok ? "neon" : null,
      },
    }
  } catch {
    return { gitSha: null, archive: emptyArchive() }
  }
}

function withQuestion(snapshot: DiagnosticSnapshot, question: string): DiagnosticSnapshot {
  const trimmed = question.trim()
  return { ...snapshot, question: trimmed || DEFAULT_QUESTION }
}

export function CaptureProvider({ children }: { children: ReactNode }) {
  const capturingLock = useRef(false)
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [flash, setFlash] = useState(false)
  const [draft, setDraft] = useState<DiagnosticSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  const startCapture = useCallback(async () => {
    if (capturingLock.current) return
    capturingLock.current = true
    setCapturing(true)
    setError(null)
    setFlash(true)
    await new Promise((resolve) => window.setTimeout(resolve, 140))
    setFlash(false)
    try {
      const collector = getCaptureCollector()
      const context = collector ? await collector() : defaultCollector(pathname)
      const blocked = pathname.startsWith("/admin")
        ? { reason: "La page Admin affiche des secrets. La capture y est désactivée." }
        : context.blocked
      const runtime = await fetchRuntimeMeta()
      const archive: SnapshotArchive = {
        ...runtime.archive,
        ...context.archive,
        n: context.archive?.n ?? runtime.archive.n,
        from: context.archive?.from ?? runtime.archive.from,
        to: context.archive?.to ?? runtime.archive.to,
        latest: runtime.archive.latest,
        stale: runtime.archive.stale,
        source: context.archive?.source ?? runtime.archive.source,
      }
      let imageDataUrl: string | null = null
      if (!blocked) {
        const root =
          context.captureRoot ||
          (document.querySelector("[data-capture-root]") as HTMLElement | null)
        if (root) imageDataUrl = await captureNodePng(root)
        if (imageDataUrl && imageDataUrl.length > IMAGE_MAX_CHARS) imageDataUrl = null
      }
      const snapshot: DiagnosticSnapshot = {
        id: newSnapshotId(),
        capturedAt: new Date().toISOString(),
        route: pathname || "/",
        lab: blocked ? "admin" : context.lab,
        tab: context.tab ?? null,
        gitSha: runtime.gitSha,
        archive,
        question: "",
        imageDataUrl,
        summary: blocked ? [] : context.summary,
        tech: blocked ? {} : context.tech,
        blocked: blocked || null,
        disclaimer: INDEPENDENCE_DISCLAIMER,
      }
      setDraft(snapshot)
      setOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "capture impossible")
      setOpen(true)
    } finally {
      capturingLock.current = false
      setCapturing(false)
    }
  }, [pathname])

  const sendToIa = useCallback(
    (question: string) => {
      if (!draft || draft.blocked) return
      writePending(withQuestion(draft, question), true)
      setOpen(false)
      router.push("/ia")
    },
    [draft, router]
  )

  const downloadPdf = useCallback(
    (question: string) => {
      if (!draft || draft.blocked) return
      printSnapshot(withQuestion(draft, question))
    },
    [draft]
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
        return
      }
      if (event.key !== "c" && event.key !== "C") return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (isTypingTarget(event.target)) return
      if (open || capturing) return
      event.preventDefault()
      void startCapture()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, capturing, startCapture])

  const value = useMemo(
    () => ({
      open,
      capturing,
      flash,
      draft,
      error,
      startCapture,
      close,
      sendToIa,
      downloadPdf,
    }),
    [open, capturing, flash, draft, error, startCapture, close, sendToIa, downloadPdf]
  )

  return (
    <CaptureStateContext.Provider value={value}>{children}</CaptureStateContext.Provider>
  )
}

export function useCapture() {
  const ctx = useContext(CaptureStateContext)
  if (!ctx) throw new Error("useCapture must be used within CaptureProvider")
  return ctx
}

export function CaptureRoot({ children }: { children: ReactNode }) {
  return (
    <div data-capture-root className="flex min-h-0 min-w-0 flex-1 flex-col">
      {children}
    </div>
  )
}

export function CaptureFlash() {
  const { flash } = useCapture()
  if (!flash) return null
  return (
    <div
      data-capture-ui
      className="pointer-events-none fixed inset-0 z-[90] bg-primary/20"
      aria-hidden
    />
  )
}
