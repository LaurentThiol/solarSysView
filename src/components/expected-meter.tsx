import {
  formatMeterRatio,
  meterPhrase,
  meterReading,
} from "@/lib/frequency-board"
import { cn } from "@/lib/utils"

export function ExpectedMeter({
  value,
  expected,
  even,
  label,
}: {
  value: number
  expected: number
  even: boolean
  label: string
}) {
  const reading = meterReading(value, expected)
  const phrase = meterPhrase(reading.ratio)
  const spoken =
    reading.ratio == null
      ? label
      : `${label} · ${phrase}${reading.over ? " · plus de 2× l’attendu" : ""}`
  const color = reading.over
    ? "var(--destructive)"
    : even
      ? "var(--chart-1)"
      : "var(--chart-2)"

  return (
    <div className="flex min-w-0 items-center gap-1.5 sm:min-w-[8.5rem] sm:gap-2" title={spoken}>
      <div className="relative h-2.5 flex-1 rounded-full bg-muted" aria-hidden>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${reading.valuePct}%`,
            background: color,
            opacity: reading.over ? 1 : 0.9,
          }}
        />
        {reading.expectedPct != null ? (
          <span
            className="absolute inset-y-[-3px] w-0.5 -translate-x-1/2 rounded-full bg-foreground"
            style={{ left: `${reading.expectedPct}%` }}
          />
        ) : null}
      </div>
      <span
        className={cn(
          "w-11 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:w-14 sm:text-xs",
          reading.over && "font-medium text-destructive"
        )}
        aria-hidden
      >
        {formatMeterRatio(reading.ratio)}
      </span>
      <span className="sr-only">{spoken}</span>
    </div>
  )
}
