import {
  canvasSize,
  cellNumber,
  cellRect,
  cellStar,
  N_COLS,
  N_ROWS,
  STAR_COLS,
  STAR_ROWS,
  numbersOrigin,
  starsOrigin,
} from "@/lib/morpho/board"

function Cells({
  origin,
  rows,
  cols,
  filled,
  idFn,
  labels,
}: {
  origin: [number, number]
  rows: number
  cols: number
  filled: Set<number>
  idFn: (r: number, c: number) => number
  labels: boolean
}) {
  const nodes = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = idFn(r, c)
      const [x, y, w, h] = cellRect(origin, r, c)
      const on = filled.has(n)
      nodes.push(
        <g key={`${origin[1]}-${n}`}>
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            rx={5}
            fill={on ? "var(--primary)" : "var(--card)"}
            stroke={on ? "var(--primary)" : "var(--border)"}
            strokeWidth={1}
          />
          {labels ? (
            <text
              x={x + w / 2}
              y={y + h / 2 + 4}
              textAnchor="middle"
              fontSize={11}
              fill={on ? "var(--primary-foreground)" : "var(--muted-foreground)"}
            >
              {n}
            </text>
          ) : null}
        </g>
      )
    }
  }
  return <>{nodes}</>
}

export function GlyphBoard({
  numbers,
  stars,
  labels = true,
  title,
  className,
}: {
  numbers: number[]
  stars: number[]
  labels?: boolean
  title?: string
  className?: string
}) {
  const [width, height] = canvasSize()
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={title || "Glyphe"}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      <rect width={width} height={height} fill="var(--background)" rx={8} />
      <Cells
        origin={numbersOrigin()}
        rows={N_ROWS}
        cols={N_COLS}
        filled={new Set(numbers)}
        idFn={cellNumber}
        labels={labels}
      />
      <Cells
        origin={starsOrigin()}
        rows={STAR_ROWS}
        cols={STAR_COLS}
        filled={new Set(stars)}
        idFn={cellStar}
        labels={labels}
      />
    </svg>
  )
}

export function GlyphThumb({
  numbers,
  stars,
  selected,
  onClick,
  label,
}: {
  numbers: number[]
  stars: number[]
  selected?: boolean
  onClick?: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[88px] rounded-lg border p-1 text-left ${
        selected ? "border-primary" : "border-border hover:border-foreground/40"
      }`}
    >
      <GlyphBoard numbers={numbers} stars={stars} labels={false} />
      {label ? (
        <span className="mt-1 block px-0.5 text-[10px] text-muted-foreground">{label}</span>
      ) : null}
    </button>
  )
}
