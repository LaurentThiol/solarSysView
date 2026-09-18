import type { ReactNode } from "react"

import {
  clockMarkRatio,
  clockOverheat,
  clockScale,
  heatClockFace,
  heatClockRim,
} from "@/lib/heat-clock"
import { cn } from "@/lib/utils"

export function HeatClock({
  value,
  peak,
  even,
  expected,
  className,
  children,
}: {
  value: number
  peak: number
  even: boolean
  expected?: number
  className?: string
  children?: ReactNode
}) {
  const scale = clockScale(peak, expected)
  const overheat = clockOverheat(value, expected)
  const mark = expected == null ? null : clockMarkRatio(expected, scale)
  return (
    <span
      className={cn(
        "heat-clock relative flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded-full",
        overheat && "heat-clock-hot",
        className
      )}
      style={{
        background: heatClockFace(value, scale, overheat),
        boxShadow: `inset 0 0 0 2px ${heatClockRim(even)}`,
      }}
    >
      <span className="heat-clock-hole absolute rounded-full bg-card" />
      {mark != null ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ transform: `rotate(${mark * 360}deg)` }}
        >
          <span className="heat-clock-tick absolute left-1/2 top-0 w-[2px] -translate-x-1/2 rounded-full bg-background shadow-[0_0_0_1px_var(--foreground)]" />
        </span>
      ) : null}
      {children != null ? (
        <span className="relative z-10 leading-none font-semibold tabular-nums">{children}</span>
      ) : null}
    </span>
  )
}

export function HeatClockLegend({
  fillLabel,
  showExpected = false,
}: {
  fillLabel?: string
  showExpected?: boolean
}) {
  const scaleLabel = fillLabel ?? (showExpected ? "vide → 6 h → 2×" : "vide → plein")
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <HeatClock value={1} peak={1} even className="size-3.5" />
        Pair
      </span>
      <span className="flex items-center gap-1.5">
        <HeatClock value={1} peak={1} even={false} className="size-3.5" />
        Impair
      </span>
      <span className="flex items-center gap-1">
        {showExpected ? (
          <>
            <HeatClock value={0} peak={2} expected={1} even className="size-3.5" />
            <HeatClock value={1} peak={2} expected={1} even className="size-3.5" />
            <HeatClock value={2} peak={2} expected={1} even className="size-3.5" />
          </>
        ) : (
          <>
            <HeatClock value={0} peak={1} even className="size-3.5" />
            <HeatClock value={1} peak={2} even className="size-3.5" />
            <HeatClock value={1} peak={1} even className="size-3.5" />
          </>
        )}
        {scaleLabel}
      </span>
      {showExpected ? (
        <>
          <span className="flex items-center gap-1.5">
            <HeatClock value={3} peak={2} expected={1} even className="size-3.5" />
            surchauffe
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-3 w-0.5 rounded-full bg-background shadow-[0_0_0_1px_var(--foreground)]"
            />
            attendu (6 h)
          </span>
        </>
      ) : null}
    </div>
  )
}
