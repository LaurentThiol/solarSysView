"use client"

import type { Candle } from "@/lib/analysis"
import { cn } from "@/lib/utils"

export function CandleChart({
  candles,
  onSelect,
}: {
  candles: Candle[]
  onSelect?: (from: string) => void
}) {
  if (candles.length === 0) {
    return <p className="text-sm text-muted-foreground">Pas assez de tirages pour des chandeliers.</p>
  }
  const highs = candles.map((c) => c.h)
  const lows = candles.map((c) => c.l)
  const max = Math.max(...highs)
  const min = Math.min(...lows)
  const span = max - min || 1
  const width = Math.max(320, candles.length * 14)
  const height = 220
  const pad = 16
  const innerH = height - pad * 2
  const slot = (width - pad * 2) / candles.length

  function y(value: number) {
    return pad + ((max - value) / span) * innerH
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label="Chandeliers OHLC"
        className="max-w-none"
      >
        {candles.map((candle, index) => {
          const x = pad + slot * index + slot / 2
          const up = candle.c >= candle.o
          const color = up ? "var(--chart-3)" : "var(--chart-5)"
          const bodyTop = y(Math.max(candle.o, candle.c))
          const bodyBot = y(Math.min(candle.o, candle.c))
          const bodyH = Math.max(2, bodyBot - bodyTop)
          return (
            <g
              key={`${candle.key}-${index}`}
              className={cn(onSelect && "cursor-pointer")}
              onClick={() => onSelect?.(candle.from)}
            >
              <line
                x1={x}
                x2={x}
                y1={y(candle.h)}
                y2={y(candle.l)}
                stroke={color}
                strokeWidth={1.5}
              />
              <rect
                x={x - Math.min(5, slot * 0.35)}
                y={bodyTop}
                width={Math.min(10, slot * 0.7)}
                height={bodyH}
                fill={color}
              />
            </g>
          )
        })}
      </svg>
      <p className="mt-1 text-center text-[11px] text-muted-foreground">
        {candles[0].from} → {candles[candles.length - 1].to} · {candles.length} bougies
      </p>
    </div>
  )
}
