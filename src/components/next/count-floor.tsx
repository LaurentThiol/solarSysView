"use client"

import { HelpTip, type HelpCopy } from "@/components/help"
import { Button } from "@/components/ui/button"
import {
  MIN_COUNT_OPTIONS,
  minCountAria,
  minCountLabel,
  type MinCount,
} from "@/lib/next/min-count"

export function CountFloorControl({
  value,
  onChange,
  help,
}: {
  value: MinCount
  onChange: (next: MinCount) => void
  help: HelpCopy
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-count-floor={value}>
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        Compte
        <HelpTip {...help} />
      </span>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Compte minimum">
        {MIN_COUNT_OPTIONS.map((item) => (
          <Button
            key={item}
            type="button"
            size="xs"
            variant={value === item ? "default" : "outline"}
            aria-pressed={value === item}
            aria-label={minCountAria(item)}
            onClick={() => onChange(item)}
          >
            {minCountLabel(item)}
          </Button>
        ))}
      </div>
    </div>
  )
}
