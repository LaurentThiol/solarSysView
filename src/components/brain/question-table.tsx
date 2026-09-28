"use client"

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react"
import { Loader2 } from "lucide-react"

import { HelpTip } from "@/components/help"
import {
  loadQuestionTable,
  type DecisionQuestionInput,
} from "@/lib/brain/decision-tree"
import {
  bandCaption,
  columnExtent,
  columnGroups,
  formatCell,
  tableSummary,
  unitScale,
  type QuestionTable,
} from "@/lib/brain/question-table-view"
import type { WeekdayScope } from "@/lib/weekday-scope"
import { cn } from "@/lib/utils"

const HELP = {
  title: "Tableau",
  body: "Le flux est ce tableau. Une ligne est l’état juste avant le tirage t ; la bande de droite est l’étiquette sur ce tirage. Les teintes vont du minimum au maximum de chaque colonne. Le trait doré ouvre le contrôle. Lire le flux fait couper ce tableau par un arbre.",
}

type Layout = {
  cell: number
  rowH: number
  gutter: number
  labelCol: number
  width: number
  height: number
  gap: number
}

function layoutOf(table: QuestionTable, box: number): Layout {
  const count = table.features.length
  const bands = Math.max(table.bands.length, 1)
  const gutter = 78
  const labelCol = 14
  const minCell = count > 40 ? 10 : count > 16 ? 16 : 28
  const natural = gutter + count * minCell + labelCol
  const cell = box > natural && count > 0 ? (box - gutter - labelCol) / count : minCell
  const rowH = Math.max(4, Math.min(16, 380 / bands))
  return {
    cell,
    rowH,
    gutter,
    labelCol,
    width: Math.max(1, gutter + count * cell + labelCol),
    height: Math.max(1, table.bands.length * rowH),
    gap: cell >= 14 ? 1 : 0,
  }
}

function heatColor(unit: number | null): string {
  if (unit == null) return "oklch(0.27 0.015 260)"
  const t = Math.min(1, Math.max(0, unit))
  const l = 0.34 + 0.48 * t
  const c = 0.03 + 0.11 * t
  const h = 255 - 170 * t
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`
}

function labelColor(unit: number | null): string {
  if (unit == null) return "oklch(0.27 0.015 260)"
  const t = Math.min(1, Math.max(0, unit))
  const l = 0.42 + 0.32 * t
  const h = 245 - 90 * t
  return `oklch(${l.toFixed(3)} 0.13 ${h.toFixed(1)})`
}

function paint(
  canvas: HTMLCanvasElement,
  table: QuestionTable,
  layout: Layout,
  hover: { band: number; column: number } | null
) {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(layout.width * dpr)
  canvas.height = Math.round(layout.height * dpr)
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, layout.width, layout.height)
  const extents = table.features.map((_, index) => columnExtent(table.bands, index))
  if (table.cut_band != null) {
    ctx.fillStyle = "oklch(0.82 0.12 85 / 0.14)"
    ctx.fillRect(0, table.cut_band * layout.rowH, layout.gutter - 6, layout.height - table.cut_band * layout.rowH)
  }
  table.bands.forEach((band, row) => {
    const y = row * layout.rowH
    table.features.forEach((_, column) => {
      const x = layout.gutter + column * layout.cell
      ctx.fillStyle = heatColor(unitScale(band.values[column] ?? null, extents[column] ?? null))
      ctx.fillRect(x, y, Math.max(1, layout.cell - layout.gap), Math.max(1, layout.rowH - (layout.rowH >= 8 ? 1 : 0)))
    })
    const labelX = layout.gutter + table.features.length * layout.cell
    ctx.fillStyle = labelColor(band.y)
    ctx.fillRect(labelX, y, layout.labelCol, Math.max(1, layout.rowH - (layout.rowH >= 8 ? 1 : 0)))
  })
  ctx.fillStyle = "oklch(0.78 0.02 250)"
  ctx.font = "10px ui-sans-serif, system-ui, sans-serif"
  const stamps: { y: number; text: string }[] = []
  if (table.bands[0]?.from) stamps.push({ y: 11, text: table.bands[0].from })
  if (table.cut_band != null && table.cut_band > 0) {
    const band = table.bands[table.cut_band]
    if (band?.from) stamps.push({ y: table.cut_band * layout.rowH + 11, text: band.from })
  }
  const last = table.bands[table.bands.length - 1]
  if (last?.to) stamps.push({ y: layout.height - 4, text: last.to })
  let previous = -20
  for (const stamp of stamps) {
    if (stamp.y - previous < 12) continue
    ctx.fillText(stamp.text, 2, stamp.y)
    previous = stamp.y
  }
  if (table.cut_band != null && table.cut_band > 0) {
    const y = table.cut_band * layout.rowH
    ctx.strokeStyle = "oklch(0.82 0.12 85)"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(4, y)
    ctx.lineTo(layout.width, y)
    ctx.stroke()
  }
  if (hover && table.bands[hover.band]) {
    ctx.strokeStyle = "oklch(0.96 0.02 90 / 0.85)"
    ctx.lineWidth = 1
    const y = hover.band * layout.rowH
    if (hover.column >= 0) {
      ctx.strokeRect(layout.gutter + hover.column * layout.cell + 0.5, y + 0.5, layout.cell - 1, layout.rowH - 1)
    } else {
      ctx.strokeRect(layout.gutter + table.features.length * layout.cell + 0.5, y + 0.5, layout.labelCol - 1, layout.rowH - 1)
    }
  }
}

function QuestionHeatmap({ table }: { table: QuestionTable }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState(0)
  const [hover, setHover] = useState<{ band: number; column: number; x: number; y: number } | null>(null)
  const layout = useMemo(() => layoutOf(table, box), [table, box])
  const groups = useMemo(() => columnGroups(table.features), [table.features])

  useEffect(() => {
    const node = wrap.current
    if (!node) return
    const update = () => setBox(node.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const node = canvas.current
    if (!node) return
    paint(node, table, layout, hover)
  }, [table, layout, hover])

  const onMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const node = canvas.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const host = wrap.current?.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * layout.width
    const y = ((event.clientY - rect.top) / rect.height) * layout.height
    const band = Math.floor(y / layout.rowH)
    if (band < 0 || band >= table.bands.length || x < layout.gutter) {
      setHover(null)
      return
    }
    const column = Math.floor((x - layout.gutter) / layout.cell)
    const next = column >= table.features.length ? -1 : column
    setHover({
      band,
      column: next,
      x: event.clientX - (host?.left ?? rect.left),
      y: event.clientY - (host?.top ?? rect.top),
    })
  }

  return (
    <div ref={wrap} className="relative min-w-0">
      <div className="overflow-x-auto">
        <div style={{ width: layout.width }}>
          {groups.length ? (
            <div className="flex" style={{ paddingLeft: layout.gutter }}>
              {groups.map((group, index) => (
                <span
                  key={`${group.label}-${index}`}
                  title={group.label}
                  className="shrink-0 truncate border-l border-border/50 pl-0.5 text-[10px] text-muted-foreground"
                  style={{ width: group.span * layout.cell }}
                >
                  {group.span * layout.cell >= 28 ? group.label : ""}
                </span>
              ))}
            </div>
          ) : null}
          <canvas
            ref={canvas}
            role="img"
            aria-label={tableSummary(table)}
            className="block cursor-crosshair"
            style={{ width: layout.width, height: layout.height }}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </div>
      </div>
      {hover ? (
        <p
          className="pointer-events-none absolute z-10 max-w-56 rounded-lg border border-border bg-popover px-2 py-1 text-[11px] leading-4 whitespace-pre-line text-popover-foreground shadow-md"
            style={{
            left: Math.min(hover.x + 12, Math.max(0, box - 180)),
            top: hover.y + 14,
          }}
        >
          {bandCaption(table, hover.band, hover.column)}
        </p>
      ) : null}
    </div>
  )
}

function TailTable({ table }: { table: QuestionTable }) {
  const showRaw = table.sense === "ge" || table.sense === "le"
  const hasBall = table.tail.some((row) => row.ball != null)
  if (!table.tail.length) return null
  return (
    <div className="max-h-64 overflow-auto">
      <table className="w-max min-w-full border-collapse text-[10px]">
        <caption className="sr-only">Huit dernières lignes du tableau, en nombres exacts.</caption>
        <thead className="sticky top-0 bg-card">
          <tr className="text-left text-muted-foreground">
            <th className="px-1.5 py-1 font-medium">date</th>
            {hasBall ? <th className="px-1.5 py-1 font-medium">boule</th> : null}
            {table.features.map((feature) => (
              <th key={feature.name} className="px-1.5 py-1 font-medium" title={feature.label}>
                {feature.measure}
              </th>
            ))}
            {showRaw ? <th className="px-1.5 py-1 font-medium">valeur</th> : null}
            <th className="px-1.5 py-1 font-medium">étiquette</th>
          </tr>
        </thead>
        <tbody>
          {table.tail.map((row) => (
            <tr key={`${row.date}-${row.index}`} className={cn("border-t border-border/70", row.holdout && "text-muted-foreground")}>
              <td className="px-1.5 py-1 whitespace-nowrap">{row.date}</td>
              {hasBall ? <td className="px-1.5 py-1">{row.ball}</td> : null}
              {row.values.map((value, index) => (
                <td key={table.features[index]?.name ?? index} className="px-1.5 py-1 tabular-nums">
                  {formatCell(value)}
                </td>
              ))}
              {showRaw ? <td className="px-1.5 py-1 tabular-nums">{formatCell(row.raw)}</td> : null}
              <td className="px-1.5 py-1">
                {row.y != null && row.y >= 1 ? table.class_names[1] || "1" : table.class_names[0] || "0"}
                {row.holdout ? " · contrôle" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OpenBalls({ table }: { table: QuestionTable }) {
  const rows = table.open?.rows ?? []
  if (!rows.length) return null
  const extents = table.features.map((_, index) => columnExtent(rows, index))
  return (
    <div className="flex flex-col gap-1">
      <div className="max-h-52 overflow-auto">
        <table className="w-max min-w-full border-collapse text-[10px]">
          <thead className="sticky top-0 bg-card">
            <tr className="text-left text-muted-foreground">
              <th className="px-1.5 py-1 font-medium">boule</th>
              {table.features.map((feature) => (
                <th key={feature.name} className="px-1.5 py-1 font-medium">
                  {feature.measure}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ball} className="border-t border-border/70">
                <td className="px-1.5 py-1">{row.ball}</td>
                {row.values.map((value, index) => {
                  const unit = unitScale(value, extents[index] ?? null)
                  return (
                    <td
                      key={table.features[index]?.name ?? index}
                      className="px-1.5 py-1 tabular-nums"
                      style={{
                        background: heatColor(unit),
                        color: unit != null && unit > 0.62 ? "oklch(0.16 0.03 260)" : "oklch(0.96 0.01 90)",
                      }}
                    >
                      {formatCell(value)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function QuestionTablePanel({
  input,
  weekday,
  enabled = true,
}: {
  input: Pick<DecisionQuestionInput, "question" | "label" | "series" | "era" | "curves">
  weekday: WeekdayScope
  enabled?: boolean
}) {
  const [snapshot, setSnapshot] = useState<{
    key: string
    table: QuestionTable | null
    error: string | null
  } | null>(null)
  const [inflight, setInflight] = useState<string | null>(null)
  const key = JSON.stringify({ ...input, weekday })

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const payload = JSON.parse(key) as Pick<
        DecisionQuestionInput,
        "question" | "label" | "series" | "era" | "curves"
      >
      setInflight(key)
      void loadQuestionTable(payload, weekday, controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return
          setSnapshot({ key, table: next, error: null })
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return
          const name = err instanceof Error ? err.name : ""
          if (name === "AbortError") return
          setSnapshot({
            key,
            table: null,
            error: err instanceof Error ? err.message : "Tableau impossible",
          })
        })
        .finally(() => {
          if (!controller.signal.aborted) setInflight((current) => (current === key ? null : current))
        })
    }, 180)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, key, weekday])

  const table = snapshot?.key === key ? snapshot.table : null
  const error = snapshot?.key === key ? snapshot.error : null
  const pending = enabled && (snapshot?.key !== key || inflight === key)

  const counts = table
    ? `${table.rows.toLocaleString("fr-FR")} lignes · ${table.columns.toLocaleString("fr-FR")} colonnes · apprentissage ${table.train_n.toLocaleString("fr-FR")} · contrôle ${table.holdout_n.toLocaleString("fr-FR")}`
    : null

  return (
    <section data-demo="tree-tableau" className="flex flex-col gap-2 rounded-2xl border border-border bg-card/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="inline-flex items-center gap-1 text-sm font-medium">
          Tableau
          <HelpTip {...HELP} />
        </p>
        {pending ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Le tableau se fabrique…
          </span>
        ) : null}
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">
        Le flux est ce tableau. Lire le flux le fait couper par un arbre.
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {table && table.rows > 0 ? (
        <div className={cn("flex flex-col gap-2", pending && "opacity-60")}>
          <p className="text-sm">{table.phrase}</p>
          <p className="text-[11px] text-muted-foreground">
            {counts}
            {table.from_date && table.to_date ? ` · ${table.from_date} → ${table.to_date}` : ""}
          </p>
          <QuestionHeatmap table={table} />
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-8 rounded-sm" style={{ background: "linear-gradient(90deg, oklch(0.34 0.03 255), oklch(0.82 0.14 85))" }} />
              min → max
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-sm" style={{ background: "oklch(0.42 0.13 245)" }} />
              {table.class_names[0] || "basse"}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-sm" style={{ background: "oklch(0.74 0.13 155)" }} />
              {table.class_names[1] || "haute"}
            </span>
            {table.cut_band != null && table.cut_band > 0 ? <span>Le trait doré ouvre le contrôle.</span> : null}
          </div>
          <details className="rounded-xl border border-border/80 px-2 py-1">
            <summary className="cursor-pointer text-[11px] text-muted-foreground">
              Huit dernières lignes
            </summary>
            <div className="pt-2">
              <TailTable table={table} />
            </div>
          </details>
          {table.open?.rows?.length ? (
            <details className="rounded-xl border border-border/80 px-2 py-1">
              <summary className="cursor-pointer text-[11px] text-muted-foreground">
                {table.open.rows.length} boules, étiquette encore absente
              </summary>
              <div className="pt-2">
                <OpenBalls table={table} />
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
      {table && table.rows === 0 && !pending ? (
        <p className="text-xs text-muted-foreground">Ce tableau est vide.</p>
      ) : null}
    </section>
  )
}
