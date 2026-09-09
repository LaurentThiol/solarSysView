"use client"

import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export const lineConfig = {
  value: { label: "Valeur", color: "var(--chart-1)" },
  sma: { label: "SMA", color: "var(--chart-2)" },
  ema: { label: "EMA", color: "var(--chart-4)" },
  wma: { label: "WMA", color: "var(--chart-3)" },
  hma: { label: "HMA", color: "var(--chart-5)" },
  vwma: { label: "VWMA", color: "var(--chart-3)" },
  bbUpper: { label: "Bollinger +", color: "var(--chart-5)" },
  bbMiddle: { label: "Bollinger", color: "var(--chart-2)" },
  bbLower: { label: "Bollinger −", color: "var(--chart-5)" },
  kcUpper: { label: "Keltner +", color: "var(--chart-4)" },
  kcLower: { label: "Keltner −", color: "var(--chart-4)" },
  donchianUpper: { label: "Donchian +", color: "var(--chart-3)" },
  donchianLower: { label: "Donchian −", color: "var(--chart-3)" },
  rsi: { label: "RSI", color: "var(--chart-1)" },
  k: { label: "%K", color: "var(--chart-1)" },
  d: { label: "%D", color: "var(--chart-4)" },
  line: { label: "MACD", color: "var(--chart-1)" },
  signal: { label: "Signal", color: "var(--chart-4)" },
  histogram: { label: "Histogramme", color: "var(--chart-2)" },
  cci: { label: "CCI", color: "var(--chart-1)" },
  wr: { label: "Williams %R", color: "var(--chart-5)" },
  adx: { label: "ADX", color: "var(--chart-1)" },
  plusDi: { label: "+DI", color: "var(--chart-3)" },
  minusDi: { label: "−DI", color: "var(--chart-5)" },
  aroonUp: { label: "Aroon up", color: "var(--chart-3)" },
  aroonDown: { label: "Aroon down", color: "var(--chart-5)" },
  supertrend: { label: "Supertrend", color: "var(--chart-4)" },
  psar: { label: "PSAR", color: "var(--chart-5)" },
  tenkan: { label: "Tenkan", color: "var(--chart-1)" },
  kijun: { label: "Kijun", color: "var(--chart-4)" },
  senkouA: { label: "Senkou A", color: "var(--chart-3)" },
  senkouB: { label: "Senkou B", color: "var(--chart-5)" },
  chikou: { label: "Chikou", color: "var(--chart-2)" },
  obv: { label: "OBV", color: "var(--chart-1)" },
  adl: { label: "ADL", color: "var(--chart-4)" },
  mfi: { label: "MFI", color: "var(--chart-3)" },
  vwap: { label: "VWAP", color: "var(--chart-2)" },
  activity: { label: "Activité", color: "var(--chart-5)" },
  mean: { label: "Moyenne", color: "var(--chart-1)" },
  std: { label: "σ", color: "var(--chart-4)" },
  coverage: { label: "Couverture", color: "var(--chart-3)" },
  bbWidth: { label: "Largeur BB", color: "var(--chart-5)" },
  equity: { label: "Équité", color: "var(--chart-1)" },
  percentB: { label: "%B", color: "var(--chart-1)" },
} satisfies ChartConfig

export function formatStat(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—"
  return value.toLocaleString("fr-FR", { maximumFractionDigits: digits })
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
        <CardTitle className="text-lg tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

export function OverlayToggle({
  label,
  on,
  onClick,
}: {
  label: string
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-xs ${
        on
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  )
}

export function Disclaimer({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-5 text-muted-foreground">{children}</p>
}

export { ChartContainer, ChartTooltip, ChartTooltipContent }
