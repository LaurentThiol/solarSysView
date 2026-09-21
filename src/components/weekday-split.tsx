"use client"

import { HelpTip } from "@/components/help"
import {
  WEEKDAY_LINE_COLOR,
  type DrawWeekday,
} from "@/lib/weekday-scope"
import { cn } from "@/lib/utils"

type DotProps = {
  cx?: number
  cy?: number
  payload?: Record<string, number | string | null | undefined>
}

export function WeekdayDot({
  day,
  cx,
  cy,
  payload,
}: DotProps & { day: DrawWeekday }) {
  const key = day === "mardi" ? "overlayMardi" : "overlayVendredi"
  const value = payload?.[key]
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    cx == null ||
    cy == null ||
    Number.isNaN(cx) ||
    Number.isNaN(cy)
  ) {
    return <g />
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={WEEKDAY_LINE_COLOR[day]}
      stroke="var(--background)"
      strokeWidth={1}
    />
  )
}

export function WeekdaySplitLegend({
  metric,
  showMardi,
  showVendredi,
  onToggle,
}: {
  metric: string
  showMardi: boolean
  showVendredi: boolean
  onToggle: (day: DrawWeekday) => void
}) {
  const items: { day: DrawWeekday; label: string }[] = [
    { day: "mardi", label: "Mardi" },
    { day: "vendredi", label: "Vendredi" },
  ]
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {items.map((item) => {
        const on = item.day === "mardi" ? showMardi : showVendredi
        return (
          <button
            key={item.day}
            type="button"
            aria-pressed={on}
            title={`${item.label} · ${metric}. Points de ce soir, reliés au suivant du même soir.`}
            onClick={() => onToggle(item.day)}
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-opacity hover:bg-muted",
              !on && "opacity-40"
            )}
          >
            <span
              aria-hidden
              className="h-0.5 w-4 shrink-0"
              style={{
                background:
                  item.day === "vendredi"
                    ? `repeating-linear-gradient(90deg, ${WEEKDAY_LINE_COLOR[item.day]} 0 4px, transparent 4px 7px)`
                    : WEEKDAY_LINE_COLOR[item.day],
              }}
            />
            {item.label}
          </button>
        )
      })}
      <HelpTip
        title="Mardi + vendredi"
        body={`Courbes du soir sur « ${metric} ». Chaque mardi est relié au mardi suivant (trait plein, cyan) ; chaque vendredi au vendredi suivant (tirets, rose). Les deux soirs restent séparés. Cliquez pour masquer.`}
      />
    </span>
  )
}
