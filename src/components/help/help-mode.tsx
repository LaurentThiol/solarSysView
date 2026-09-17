"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

const STORAGE_KEY = "synchro-help-mode"

const listeners = new Set<() => void>()

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange)
  window.addEventListener("storage", onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
    window.removeEventListener("storage", onStoreChange)
  }
}

function getSnapshot() {
  return window.localStorage.getItem(STORAGE_KEY) !== "0"
}

function getServerSnapshot() {
  return true
}

function writeEnabled(value: boolean) {
  window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0")
  for (const listener of listeners) listener()
}

type HelpModeContextValue = {
  enabled: boolean
  setEnabled: (value: boolean) => void
  openId: string | null
  setOpenId: (id: string | null) => void
}

const HelpModeContext = createContext<HelpModeContextValue | null>(null)

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

export function HelpModeProvider({ children }: { children: ReactNode }) {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [openId, setOpenId] = useState<string | null>(null)

  const setEnabled = useCallback((value: boolean) => {
    writeEnabled(value)
    if (!value) setOpenId(null)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenId(null)
        return
      }
      if (event.key === "?" && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (isTypingTarget(event.target)) return
        event.preventDefault()
        const next = !getSnapshot()
        writeEnabled(next)
        if (!next) setOpenId(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const value = useMemo(
    () => ({ enabled, setEnabled, openId, setOpenId }),
    [enabled, setEnabled, openId]
  )

  return (
    <HelpModeContext.Provider value={value}>{children}</HelpModeContext.Provider>
  )
}

export function useHelpMode() {
  const ctx = useContext(HelpModeContext)
  if (!ctx) {
    throw new Error("useHelpMode must be used within HelpModeProvider")
  }
  return ctx
}

export function HelpModeToggle() {
  const { enabled, setEnabled } = useHelpMode()
  return (
    <button
      type="button"
      aria-pressed={enabled}
      aria-label="Afficher ou masquer l’aide contextuelle"
      title="Aide : points d’exclamation sur les champs et boutons. Raccourci « ? »."
      onClick={() => setEnabled(!enabled)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide ${
        enabled
          ? "border-amber-400/50 bg-amber-400/15 text-amber-200"
          : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      <span className="inline-flex size-3.5 items-center justify-center rounded-full border border-current text-[9px] font-bold leading-none">
        !
      </span>
      <span className="hidden sm:inline">Aide</span>
    </button>
  )
}
