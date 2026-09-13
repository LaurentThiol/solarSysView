"use client"

import { useEffect, useRef } from "react"

import type { HarmoHeatmap, HarmoRidge } from "@/lib/harmo"

function colorAt(t: number) {
  const u = Math.max(0, Math.min(1, t))
  const r = Math.round(255 * Math.min(1, Math.max(0, 1.7 * u - 0.3)))
  const g = Math.round(255 * Math.min(1, 0.2 + 1.1 * u))
  const b = Math.round(255 * Math.min(1, 0.55 + 0.4 * (1 - u)))
  return [r, g, b] as const
}

export function Spectrogram({
  heatmap,
  ridges,
}: {
  heatmap?: HarmoHeatmap | null
  ridges?: HarmoRidge[]
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const z = heatmap?.z
  const freqs = heatmap?.freqs ?? []
  const times = heatmap?.times ?? []

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !z?.length || !z[0]?.length) return
    const nF = z.length
    const nT = z[0].length
    canvas.width = nT
    canvas.height = nF
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const image = ctx.createImageData(nT, nF)
    const lo = heatmap?.db_min ?? 0
    const hi = heatmap?.db_max ?? 1
    const span = hi - lo || 1
    for (let f = 0; f < nF; f++) {
      const row = z[nF - 1 - f]
      for (let t = 0; t < nT; t++) {
        const [r, g, b] = colorAt(((row[t] ?? lo) - lo) / span)
        const i = (f * nT + t) * 4
        image.data[i] = r
        image.data[i + 1] = g
        image.data[i + 2] = b
        image.data[i + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
    if (ridges?.length && times.length > 1 && freqs.length > 1) {
      const t0 = times[0]
      const t1 = times[times.length - 1]
      const f0 = freqs[0]
      const f1 = freqs[freqs.length - 1]
      ctx.lineWidth = 1
      for (const ridge of ridges) {
        const xs = ridge.times ?? []
        const ys = ridge.freqs ?? []
        if (xs.length < 2) continue
        ctx.strokeStyle = ridge.kind === "grid" ? "#f8fafc" : "#fbbf24"
        ctx.beginPath()
        for (let i = 0; i < xs.length; i++) {
          const px = ((xs[i] - t0) / (t1 - t0 || 1)) * (nT - 1)
          const py = (1 - (ys[i] - f0) / (f1 - f0 || 1)) * (nF - 1)
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.stroke()
      }
    }
  }, [z, freqs, times, ridges, heatmap?.db_min, heatmap?.db_max])

  if (!z?.length) {
    return <p className="text-sm text-muted-foreground">Pas de spectrogramme.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>index de tirage →</span>
        <span>Nyquist 0,5 c/tirage</span>
      </div>
      <canvas
        ref={canvasRef}
        className="h-56 w-full rounded-md border border-border bg-card"
        role="img"
        aria-label="Spectrogramme temps-fréquence"
      />
      <p className="text-[10px] text-muted-foreground">
        Blanc = crête réseau (horizontale). Ambre = crête mécanique (oblique).
      </p>
    </div>
  )
}
