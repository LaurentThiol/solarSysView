"use client"

import { useCallback, useEffect, useState } from "react"

type StartupPayload = {
  frontend: { ok: boolean }
  backend: { ok: boolean; url?: string; error?: string }
  neon: {
    ok?: boolean
    configured?: boolean
    latency_ms?: number
    error?: string
  }
  git:
    | {
        ok: true
        sha: string
        branch: string
        dirty: boolean
        ahead: number
        behind: number
      }
    | { ok: false }
  draws: number | null
  latest: { draw_date?: string } | null
}

type Tone = "ok" | "warn" | "err" | "off" | "load"

function Pill({
  label,
  detail,
  tone,
  onClick,
}: {
  label: string
  detail?: string
  tone: Tone
  onClick: () => void
}) {
  const tones: Record<Tone, string> = {
    ok: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
    warn: "border-amber-400/40 bg-amber-400/15 text-amber-200",
    err: "border-red-500/40 bg-red-500/15 text-red-200",
    off: "border-border bg-muted/40 text-muted-foreground",
    load: "border-border bg-muted/20 text-muted-foreground",
  }
  const dots: Record<Tone, string> = {
    ok: "bg-emerald-400",
    warn: "bg-amber-400",
    err: "bg-red-400",
    off: "bg-muted-foreground/50",
    load: "bg-muted-foreground/40 animate-pulse",
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title="Retester"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide ${tones[tone]}`}
    >
      <span className={`size-1.5 rounded-full ${dots[tone]}`} />
      <span>{label}</span>
      {detail ? (
        <span className="hidden font-normal opacity-80 sm:inline">{detail}</span>
      ) : null}
    </button>
  )
}

export function StartupStatus() {
  const [data, setData] = useState<StartupPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/startup", { cache: "no-store" })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      setData((await response.json()) as StartupPayload)
    } catch (err) {
      setError(err instanceof Error ? err.message : "échec")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (loading && !data) {
    return (
      <div className="flex flex-wrap gap-2">
        <Pill label="API" tone="load" onClick={refresh} />
        <Pill label="Neon" tone="load" onClick={refresh} />
        <Pill label="GitHub" tone="load" onClick={refresh} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-wrap gap-2">
        <Pill
          label="Statut"
          detail={error || "injoignable"}
          tone="err"
          onClick={refresh}
        />
      </div>
    )
  }

  const apiTone: Tone = data.backend.ok ? "ok" : "err"
  const apiDetail = data.backend.ok
    ? data.draws != null
      ? `${data.draws} tirages`
      : "vivante"
    : data.backend.error || "arrêtée"

  let neonTone: Tone = "off"
  let neonDetail = "non configuré"
  if (data.neon.ok) {
    neonTone = "ok"
    neonDetail =
      data.neon.latency_ms != null
        ? `${data.neon.latency_ms} ms`
        : data.latest?.draw_date || "en ligne"
  } else if (data.neon.configured) {
    neonTone = "err"
    neonDetail = "hors ligne"
  }

  let gitTone: Tone = "off"
  let gitDetail = "inconnu"
  if (data.git.ok) {
    gitDetail = data.git.sha
    if (data.git.behind > 0) {
      gitTone = "warn"
      gitDetail = `${data.git.behind} à tirer`
    } else if (data.git.dirty) {
      gitTone = "warn"
      gitDetail = "modifs locales"
    } else {
      gitTone = "ok"
      gitDetail = `${data.git.sha} · ${data.git.branch}`
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Pill label="API" detail={apiDetail} tone={apiTone} onClick={refresh} />
      <Pill label="Neon" detail={neonDetail} tone={neonTone} onClick={refresh} />
      <Pill
        label="GitHub"
        detail={gitDetail}
        tone={gitTone}
        onClick={refresh}
      />
    </div>
  )
}
