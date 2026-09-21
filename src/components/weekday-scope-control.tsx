"use client"

import { HelpTip } from "@/components/help"
import { cn } from "@/lib/utils"
import {
  WEEKDAY_SCOPE_HELP,
  WEEKDAY_SCOPE_OPTIONS,
  type WeekdayScope,
} from "@/lib/weekday-scope"

export function WeekdayScopeControl({
  value,
  onChange,
  compact = false,
}: {
  value: WeekdayScope
  onChange: (value: WeekdayScope) => void
  compact?: boolean
}) {
  return (
    <div className={cn("flex flex-col gap-1", compact && "min-w-0")}>
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        Jour
        <HelpTip {...WEEKDAY_SCOPE_HELP} />
      </span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Jour des tirages">
        {WEEKDAY_SCOPE_OPTIONS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={value === item.value}
            onClick={() => onChange(item.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs",
              value === item.value
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
