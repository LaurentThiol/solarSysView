"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"

import { TitleHelp } from "@/components/help"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatShortDate } from "@/lib/draws"
import { formatFr } from "@/lib/frequency-board"
import { decadeIndex } from "@/lib/grid-shape"
import { PROBA_DYNAMIC_HELP, chargePhrase } from "@/lib/proba-dynamic-help"
import {
  NUMBER_MISS_RATE,
  NUMBER_POOL,
  STAR_MISS_RATE,
  STAR_POOL,
  type ChargeRow,
  type ProbaKind,
  type ProbaScaleBoard,
  type ProbaSort,
} from "@/lib/proba-dynamic"
import { cn } from "@/lib/utils"

const ROW = 16
const GAP = 1
const GROUP_GAP = 5
const CAPTION = 16
const LABEL_W = 76

type Slot = { kind: ProbaKind; value: number; y: number }
type Pin = { kind: ProbaKind; value: number }

function placeSlots(order: readonly number[], kind: ProbaKind, sort: ProbaSort, origin: number) {
  const slots: Slot[] = []
  let y = origin
  let previous: number | null = null
  for (const value of order) {
    const group = sort === "dizaines" ? decadeIndex(value) : sort === "unites" ? value % 10 : null
    if (previous != null && group != null && group !== previous) y += GROUP_GAP
    slots.push({ kind, value, y })
    y += ROW + GAP
    previous = group
  }
  const bottom = slots.length === 0 ? origin : slots[slots.length - 1].y + ROW
  return { slots, bottom }
}

function rowOf(bandRows: readonly ChargeRow[] | undefined, value: number) {
  return bandRows?.[value - 1] ?? null
}

function Saw({
  series,
  expected,
  tone,
}: {
  series: readonly number[]
  expected: number
  tone: "number" | "star"
}) {
  if (series.length === 0) return null
  const width = 240
  const height = 42
  const peak = Math.max(1, ...series, expected)
  const xOf = (index: number) =>
    series.length === 1 ? 0 : (index / (series.length - 1)) * width
  const yOf = (value: number) => height - 2 - (value / peak) * (height - 6)
  const path = series
    .map((value, index) => `${index === 0 ? "M" : "L"}${xOf(index).toFixed(2)},${yOf(value).toFixed(2)}`)
    .join(" ")
  const yExpected = yOf(expected)
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("mt-2 h-12 w-full", tone === "star" ? "text-[var(--star)]" : "text-[var(--chart-2)]")}
      role="img"
      aria-label="Dent de scie du compteur"
    >
      <line
        x1="0"
        x2={width}
        y1={yExpected}
        y2={yExpected}
        stroke="var(--muted-foreground)"
        strokeDasharray="3 3"
        strokeWidth="1"
      />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export function ChargeBoard({
  board,
  numberOrder,
  starOrder,
  sort,
  pinned,
  onPin,
}: {
  board: ProbaScaleBoard
  numberOrder: readonly number[]
  starOrder: readonly number[]
  sort: ProbaSort
  pinned: Pin | null
  onPin: (kind: ProbaKind, value: number) => void
}) {
  const labelId = useId()
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hostWidth, setHostWidth] = useState(0)
  const [hover, setHover] = useState<{ slot: Slot; index: number } | null>(null)

  const layout = useMemo(() => {
    const numbers = placeSlots(numberOrder, "number", sort, CAPTION)
    const stars =
      board.stars == null
        ? null
        : placeSlots(starOrder, "star", sort, numbers.bottom + CAPTION)
    const slots = stars ? [...numbers.slots, ...stars.slots] : numbers.slots
    const height = stars ? stars.bottom : numbers.bottom
    return { slots, height }
  }, [board.stars, numberOrder, sort, starOrder])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const measure = () => setHostWidth(host.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => observer.disconnect()
  }, [board.drawCount])

  const col =
    hostWidth <= 0 || board.drawCount === 0
      ? 0
      : Math.max(3, Math.min(6, hostWidth / board.drawCount))
  const plotWidth = board.drawCount * col

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || board.drawCount === 0 || plotWidth < 1 || layout.height < 1) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const width = Math.max(1, Math.round(plotWidth * dpr))
    const height = Math.max(1, Math.round(layout.height * dpr))
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const style = getComputedStyle(document.documentElement)
    const probe = document.createElement("span")
    probe.style.display = "none"
    document.body.appendChild(probe)
    const color = (token: string) => {
      const raw = style.getPropertyValue(token).trim()
      if (!raw) return "gray"
      probe.style.color = raw
      return getComputedStyle(probe).color || raw
    }
    const muted = color("--muted")
    const hot = color("--chart-2")
    const star = color("--star")
    const over = color("--destructive")
    const pinColor = color("--foreground")
    const hoverColor = color("--chart-1")
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, plotWidth, layout.height)
      for (const slot of layout.slots) {
        const row =
          slot.kind === "number"
            ? rowOf(board.numbers.rows, slot.value)
            : rowOf(board.stars?.rows, slot.value)
        ctx.globalAlpha = 1
        ctx.fillStyle = muted
        ctx.fillRect(0, slot.y, plotWidth, ROW)
        if (!row) continue
        for (let index = 0; index < board.drawCount; index += 1) {
          const charge = row.series[index] ?? 0
          if (charge <= 0) continue
          ctx.globalAlpha = charge >= 1 ? 1 : Math.sqrt(Math.min(1, charge))
          ctx.fillStyle = charge >= 1 ? over : slot.kind === "star" ? star : hot
          ctx.fillRect(index * col, slot.y, Math.max(1, col - 0.4), ROW)
        }
        ctx.globalAlpha = 1
        const marked =
          (pinned?.kind === slot.kind && pinned.value === slot.value) ||
          (hover?.slot.kind === slot.kind && hover.slot.value === slot.value)
        if (!marked) continue
        ctx.strokeStyle =
          pinned?.kind === slot.kind && pinned.value === slot.value ? pinColor : hoverColor
        ctx.lineWidth = 1
        ctx.strokeRect(0.5, slot.y + 0.5, Math.max(0, plotWidth - 1), ROW - 1)
      }
    } finally {
      probe.remove()
    }
  }, [board, col, hover, layout, pinned, plotWidth])

  const starTop = layout.slots.find((slot) => slot.kind === "star")
  const range =
    board.fromDate && board.toDate
      ? `${formatShortDate(board.fromDate)} – ${formatShortDate(board.toDate)}`
      : "Aucun tirage"

  const pinnedRow =
    pinned?.kind === "star"
      ? rowOf(board.stars?.rows, pinned.value)
      : pinned?.kind === "number"
        ? rowOf(board.numbers.rows, pinned.value)
        : null
  const hoverRow = hover
    ? hover.slot.kind === "star"
      ? rowOf(board.stars?.rows, hover.slot.value)
      : rowOf(board.numbers.rows, hover.slot.value)
    : null
  const hoverDate = hover ? board.dates[hover.index] : null
  const phrase = (() => {
    if (!hover || !hoverRow || !hoverDate) return null
    const pool = hover.slot.kind === "star" ? STAR_POOL : NUMBER_POOL
    const miss = hover.slot.kind === "star" ? STAR_MISS_RATE : NUMBER_MISS_RATE
    const charge = hoverRow.series[hover.index] ?? 0
    const delay = Math.round(charge * pool)
    return chargePhrase({
      kind: hover.slot.kind,
      value: hover.slot.value,
      date: hoverDate,
      charge,
      delay,
      rarity: miss ** delay,
      censored: hoverRow.censored && hover.index === board.drawCount - 1,
      windowFloor: hoverRow.windowFloor,
    })
  })()

  function locate(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas || col <= 0) return null
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const index = Math.floor(x / col)
    const slot = layout.slots.find((item) => y >= item.y && y < item.y + ROW)
    if (!slot || index < 0 || index >= board.drawCount) return null
    return { slot, index }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium" id={labelId}>
          <TitleHelp help={PROBA_DYNAMIC_HELP.echelles}>{board.label}</TitleHelp>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {range} · {board.drawCount} tirage{board.drawCount > 1 ? "s" : ""}
        </p>
      </CardHeader>
      <CardContent>
        {board.drawCount === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun tirage dans cette échelle.</p>
        ) : (
          <div className="flex min-w-0 gap-1">
            <div className="relative shrink-0" style={{ width: LABEL_W, height: layout.height }}>
              <span className="absolute top-0 left-0 text-[10px] leading-none text-muted-foreground">
                Numéros
              </span>
              {starTop ? (
                <span
                  className="absolute left-0 text-[10px] leading-none text-muted-foreground"
                  style={{ top: starTop.y - CAPTION }}
                >
                  Étoiles
                </span>
              ) : null}
              {layout.slots.map((slot) => {
                const row =
                  slot.kind === "number"
                    ? rowOf(board.numbers.rows, slot.value)
                    : rowOf(board.stars?.rows, slot.value)
                const charge = row?.series.at(-1) ?? 0
                const active = pinned?.kind === slot.kind && pinned.value === slot.value
                const noun = slot.kind === "number" ? "Numéro" : "Étoile"
                return (
                  <button
                    key={`${slot.kind}-${slot.value}`}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${noun} ${slot.value}, compteur ${formatFr(charge, 2)}`}
                    className={cn(
                      "absolute right-0 left-0 flex items-center justify-between rounded-sm px-1 text-[10px] leading-none tabular-nums",
                      active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                    )}
                    style={{ top: slot.y, height: ROW }}
                    onClick={() => onPin(slot.kind, slot.value)}
                  >
                    <span className={slot.kind === "star" ? "text-[var(--star)]" : undefined}>
                      {slot.value}
                    </span>
                    <span className={charge >= 1 ? "text-destructive" : "text-muted-foreground"}>
                      {formatFr(charge, 2)}
                    </span>
                  </button>
                )
              })}
            </div>
            <div ref={hostRef} className="min-w-0 flex-1 overflow-x-auto">
              <canvas
                ref={canvasRef}
                aria-labelledby={labelId}
                className="block cursor-crosshair"
                style={{ width: plotWidth, height: layout.height }}
                onMouseMove={(event) => {
                  const next = locate(event)
                  setHover(next)
                }}
                onMouseLeave={() => setHover(null)}
                onClick={(event) => {
                  const next = locate(event)
                  if (next) onPin(next.slot.kind, next.slot.value)
                }}
              />
            </div>
          </div>
        )}
        {board.starNote ? <p className="mt-2 text-xs text-muted-foreground">{board.starNote}</p> : null}
        {pinned && pinnedRow && board.drawCount > 0 ? (
          <Saw
            series={pinnedRow.series}
            expected={pinned.kind === "star" ? (board.stars?.expected ?? 5 / 12) : board.numbers.expected}
            tone={pinned.kind}
          />
        ) : null}
        {board.drawCount > 0 ? (
          <p className="mt-2 min-h-10 text-xs leading-5 text-muted-foreground" aria-live="polite">
            {phrase ??
              (pinned
                ? "Ancien à gauche. La dent de scie est celle de la boule épinglée."
                : "Ancien à gauche. Un clic épingle la dent de scie.")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
