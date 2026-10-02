"use client"

import { HelpTip, type HelpCopy } from "@/components/help"
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
  inline = false,
  help = WEEKDAY_SCOPE_HELP,
}: {
  value: WeekdayScope
  onChange: (value: WeekdayScope) => void
  compact?: boolean
  /** Libellé à côté des pastilles, pour tenir dans le bandeau. */
  inline?: boolean
  help?: HelpCopy
}) {
  return (
    <div
      className={cn(
        "flex max-w-full gap-1.5",
        inline ? "min-w-0 flex-row flex-wrap items-center" : "flex-col",
        compact && !inline && "min-w-0"
      )}
    >
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        Jour
        <HelpTip {...help} />
      </span>
      <div
        className={cn("flex max-w-full gap-1.5", inline ? "flex-wrap sm:flex-nowrap" : "flex-wrap")}
        role="group"
        aria-label="Jour des tirages"
      >
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
