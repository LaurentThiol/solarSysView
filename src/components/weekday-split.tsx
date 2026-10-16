"use client"

import { Fragment } from "react"
import { Line } from "recharts"

import { HelpTip } from "@/components/help"
import {
  WEEKDAY_LINE_COLOR,
  weekdayLineDash,
  weekdayOverlayField,
  weekdayPointMark,
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
  seriesKey,
  cx,
  cy,
  payload,
}: DotProps & { day: DrawWeekday; seriesKey?: string }) {
  const key = seriesKey
    ? weekdayOverlayField(day, seriesKey)
    : day === "mardi"
      ? "overlayMardi"
      : "overlayVendredi"
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

type SeriesDayDotProps = {
  cx?: number | null
  cy?: number | null
  r?: number
  fill?: string
  stroke?: string
  payload?: { weekday?: string | null }
}

/** La série porte sa couleur sur `stroke`. Le `fill` par défaut de Recharts est blanc. */
function seriesDotColor(fill: string | undefined, stroke: string | undefined) {
  const strokeColor = typeof stroke === "string" && stroke && stroke !== "none" ? stroke : null
  const fillColor = typeof fill === "string" && fill && fill !== "none" ? fill : null
  const fillIsBlank = fillColor == null || fillColor === "#fff" || fillColor === "#ffffff"
  if (strokeColor && fillIsBlank) return strokeColor
  return fillColor ?? strokeColor ?? "currentColor"
}

/** Point de la série mixte : rond le mardi, losange le vendredi, couleur de la série. */
export function SeriesDayDot({ cx, cy, r = 3, fill, stroke, payload }: SeriesDayDotProps) {
  if (cx == null || cy == null || Number.isNaN(cx) || Number.isNaN(cy)) return <g />
  const color = seriesDotColor(fill, stroke)
  const radius = typeof r === "number" && Number.isFinite(r) && r > 0 ? r : 3
  const edge = { fill: color, stroke: "var(--background)", strokeWidth: 1 }
  if (weekdayPointMark(payload?.weekday) === "diamond") {
    const arm = radius + 1.25
    return (
      <polygon
        points={`${cx},${cy - arm} ${cx + arm},${cy} ${cx},${cy + arm} ${cx - arm},${cy}`}
        {...edge}
      />
    )
  }
  return <circle cx={cx} cy={cy} r={radius} {...edge} />
}

/** Légende fixe des points, quand mardi et vendredi partagent la même courbe. */
export function WeekdayPointLegend() {
  return (
    <span
      className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-2 py-1 text-xs"
      data-weekday-point-legend
    >
      <span className="inline-flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0">
          <circle cx="6" cy="6" r="3.5" fill="currentColor" />
        </svg>
        Mardi
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0">
          <polygon points="6,1 11,6 6,11 1,6" fill="currentColor" />
        </svg>
        Vendredi
      </span>
      <span className="text-muted-foreground">La couleur reste celle de la série.</span>
    </span>
  )
}

/** Une paire mardi / vendredi par série visible. Le 1er rang n’est pas dans `seriesKeys`. */
export function WeekdaySeriesLines({
  seriesKeys,
  showMardi,
  showVendredi,
  yAxisId,
  type = "linear",
}: {
  seriesKeys: readonly string[]
  showMardi: boolean
  showVendredi: boolean
  yAxisId?: (key: string) => string | number
  /** `stepAfter` pour une série 0 / +1 : un segment droit inventerait une pente. */
  type?: "linear" | "step" | "stepBefore" | "stepAfter"
}) {
  return seriesKeys.map((key) => {
    const axis = yAxisId?.(key)
    const axisProps = axis == null ? {} : { yAxisId: axis }
    return (
      <Fragment key={`day-${key}`}>
        <Line
          {...axisProps}
          dataKey={weekdayOverlayField("mardi", key)}
          type={type}
          stroke={WEEKDAY_LINE_COLOR.mardi}
          strokeWidth={2.75}
          strokeDasharray={weekdayLineDash("mardi")}
          connectNulls
          hide={!showMardi}
          dot={(props) => <WeekdayDot {...props} day="mardi" seriesKey={key} />}
          activeDot={(props) => <WeekdayDot {...props} day="mardi" seriesKey={key} />}
          isAnimationActive={false}
          legendType="none"
          name={`Mardi ${key}`}
        />
        <Line
          {...axisProps}
          dataKey={weekdayOverlayField("vendredi", key)}
          type={type}
          stroke={WEEKDAY_LINE_COLOR.vendredi}
          strokeWidth={2.75}
          strokeDasharray={weekdayLineDash("vendredi")}
          connectNulls
          hide={!showVendredi}
          dot={(props) => <WeekdayDot {...props} day="vendredi" seriesKey={key} />}
          activeDot={(props) => <WeekdayDot {...props} day="vendredi" seriesKey={key} />}
          isAnimationActive={false}
          legendType="none"
          name={`Vendredi ${key}`}
        />
      </Fragment>
    )
  })
}

export function WeekdaySplitLegend({
  metric,
  seriesCount = 1,
  showMardi,
  showVendredi,
  onToggle,
}: {
  metric: string
  seriesCount?: number
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
        body={
          seriesCount > 1
            ? `Chaque série visible (${metric}) a ses deux courbes. Le mardi (trait plein, cyan) relie un soir au mardi suivant ; le vendredi (tirets, rose) fait de même de son côté. Les soirs ne se mélangent pas, et n1 ne porte pas les autres n. Cliquez pour afficher ou masquer.`
            : `Courbes du soir sur « ${metric} ». Chaque mardi est relié au mardi suivant (trait plein, cyan) ; chaque vendredi au vendredi suivant (tirets, rose). Les deux soirs restent séparés. Cliquez pour afficher ou masquer.`
        }
      />
    </span>
  )
}
