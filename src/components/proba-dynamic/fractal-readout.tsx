"use client"

import { useEffect, useState } from "react"

import { HelpTip } from "@/components/help"
import { formatFr, formatSignedFr } from "@/lib/frequency-board"
import { PROBA_DYNAMIC_HELP } from "@/lib/proba-dynamic-help"
import { cn } from "@/lib/utils"

type Fit = {
  dimension: number | null
  stderr: number | null
  r_squared: number | null
  scales: number[]
  counts: number[]
  sufficient: boolean
  n_scales: number
}

type Gap = {
  delta: number | null
}

type Report = {
  surface: Fit
  null: { surface: Gap }
  phrase: string
}

function LogLog({
  scales,
  counts,
  label,
}: {
  scales: readonly number[]
  counts: readonly number[]
  label: string
}) {
  if (scales.length < 2 || counts.length !== scales.length) return null
  const xs = scales.map((scale) => Math.log(1 / scale))
  const ys = counts.map((count) => Math.log(count))
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = 320
  const height = 72
  const xOf = (value: number) => (maxX === minX ? width / 2 : ((value - minX) / (maxX - minX)) * width)
  const yOf = (value: number) =>
    maxY === minY ? height / 2 : height - 4 - ((value - minY) / (maxY - minY)) * (height - 10)
  const path = xs
    .map((value, index) => `${index === 0 ? "M" : "L"}${xOf(value).toFixed(2)},${yOf(ys[index]).toFixed(2)}`)
    .join(" ")
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-16 w-full text-[var(--chart-2)]"
      role="img"
      aria-label={label}
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function formatScale(value: number) {
  if (!Number.isFinite(value)) return "—"
  return formatFr(value, Number.isInteger(value) ? 0 : 3)
}

function readingLine(title: string, fit: Fit, gap: Gap) {
  const dimension = fit.dimension == null ? "pas de pente" : formatFr(fit.dimension, 2)
  const stderr = fit.stderr == null ? "" : ` ± ${formatFr(fit.stderr, 2)}`
  const determination = fit.r_squared == null ? "—" : formatFr(fit.r_squared, 3)
  const scaleCount =
    fit.n_scales === 0
      ? "aucune échelle"
      : `${fit.n_scales} échelle${fit.n_scales > 1 ? "s" : ""}`
  const span =
    fit.scales.length > 0
      ? `, de ${formatScale(fit.scales[0])} à ${formatScale(fit.scales[fit.scales.length - 1])}`
      : ""
  const delta = gap.delta == null ? "—" : formatSignedFr(gap.delta, 2)
  return `${title} · ${dimension}${stderr} · R² ${determination} · ${scaleCount}${span} · écart au mélange ${delta}`
}

export function FractalReadout({ columns }: { columns: readonly (readonly { charge: number }[])[] }) {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(true)

  useEffect(() => {
    if (columns.length < 2 || (columns[0]?.length ?? 0) < 2) return
    const height = columns.map((column) => column.map((cell) => cell.charge))
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setPending(true)
      void fetch("/api/analysis/fractal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ height }),
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          const body = (await response.json().catch(() => null)) as
            | (Partial<Report> & { detail?: unknown; error?: unknown })
            | null
          if (!response.ok || !body?.surface || typeof body.phrase !== "string") {
            const detail = body && typeof body.detail === "string" ? body.detail : null
            const message = body && typeof body.error === "string" ? body.error : null
            throw new Error(detail || message || "Comptage indisponible.")
          }
          if (controller.signal.aborted) return
          setReport({
            surface: body.surface,
            null: body.null ?? { surface: { delta: null } },
            phrase: body.phrase,
          })
          setError(null)
        })
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === "AbortError") return
          if (reason instanceof Error && reason.name === "AbortError") return
          if (controller.signal.aborted) return
          setReport(null)
          setError(reason instanceof Error ? reason.message : "Comptage indisponible.")
        })
        .finally(() => {
          if (!controller.signal.aborted) setPending(false)
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [columns])

  return (
    <section className={cn("space-y-2", pending && report && "opacity-60")} aria-busy={pending}>
      <p className="inline-flex items-center gap-1 text-xs text-foreground">
        Comptage de boîtes
        <HelpTip {...PROBA_DYNAMIC_HELP.comptage} />
      </p>
      {report ? (
        <div>
          <p className="text-xs text-muted-foreground">
            {readingLine("Surface", report.surface, report.null.surface)}
          </p>
          <LogLog
            scales={report.surface.scales}
            counts={report.surface.counts}
            label="log(N) en fonction de log(1/ε), surface 3D"
          />
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {pending && !report && !error ? (
        <p className="text-sm text-muted-foreground">Calcul du comptage…</p>
      ) : null}
      {report ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {report.phrase}
        </p>
      ) : null}
    </section>
  )
}
