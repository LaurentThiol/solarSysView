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
          "bg-primary text-primary-foreground shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary),transparent_65%)]",
        variant === "star" &&
          "bg-star text-primary-foreground shadow-[0_0_0_1px_color-mix(in_oklch,var(--star),white_35%)]",
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
  highlightNumbers,
  highlightStars,
}: {
  numbers: number[]
  stars: number[]
  highlights?: number[]
  highlightNumbers?: number[]
  highlightStars?: number[]
}) {
  const numberHits = new Set(highlightNumbers ?? highlights)
  const starHits = new Set(highlightStars ?? highlights)
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {numbers.map((n) => (
        <Ball
          key={`n-${n}`}
          value={n}
          variant="number"
          highlight={numberHits.has(n)}
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
          highlight={starHits.has(n)}
        />
      ))}
    </div>
  )
}
