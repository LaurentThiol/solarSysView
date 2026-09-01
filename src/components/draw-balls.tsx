import { cn } from "@/lib/utils"

function Ball({
  value,
  highlight,
  variant,
}: {
  value: number
  highlight?: boolean
  variant: "number" | "star"
}) {
  return (
    <span
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full text-xs font-semibold tabular-nums sm:size-9 sm:text-sm",
        variant === "number" &&
          "bg-primary text-primary-foreground shadow-[0_0_0_1px_oklch(0.82_0.12_85/0.35)]",
        variant === "star" &&
          "bg-[oklch(0.78_0.14_75)] text-[oklch(0.18_0.04_260)] shadow-[0_0_0_1px_oklch(0.9_0.12_85/0.45)]",
        highlight && "ring-2 ring-white ring-offset-2 ring-offset-background"
      )}
    >
      {value}
    </span>
  )
}

export function DrawBalls({
  numbers,
  stars,
  highlights = [],
}: {
  numbers: number[]
  stars: number[]
  highlights?: number[]
}) {
  const wanted = new Set(highlights)
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {numbers.map((n) => (
        <Ball
          key={`n-${n}`}
          value={n}
          variant="number"
          highlight={wanted.has(n)}
        />
      ))}
      <span className="mx-1 text-muted-foreground" aria-hidden>
        +
      </span>
      {stars.map((n) => (
        <Ball
          key={`s-${n}`}
          value={n}
          variant="star"
          highlight={wanted.has(n)}
        />
      ))}
    </div>
  )
}
