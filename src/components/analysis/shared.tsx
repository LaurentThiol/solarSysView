"use client"

import { HelpTip, type HelpCopy } from "@/components/help"
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

export const HELP = {
  sma: {
    title: "SMA",
    body: "Moyenne mobile simple sur X tirages. Cliquez pour afficher ou masquer cette courbe.",
  },
  ema: {
    title: "EMA",
    body: "Moyenne exponentielle : les tirages récents pèsent plus. Cliquez pour afficher ou masquer.",
  },
  wma: {
    title: "WMA",
    body: "Moyenne pondérée linéaire. Cliquez pour afficher ou masquer.",
  },
  hma: {
    title: "HMA",
    body: "Hull Moving Average, plus réactive qu’une SMA. Cliquez pour afficher ou masquer.",
  },
  vwma: {
    title: "VWMA",
    body: "Moyenne pondérée par l’activité (true range × count), pas un volume de marché. Cliquez pour afficher ou masquer.",
  },
  bollinger: {
    title: "Bollinger",
    body: "Bandes SMA ± 2σ. Un squeeze (bandes étroites) précède souvent un élargissement. Afficher/masquer.",
  },
  keltner: {
    title: "Keltner — canal d’ATR",
    body: "Indicateur : EMA ± k·ATR, pas un tunnel chartiste. Si Bollinger est à l’intérieur, c’est un squeeze. Afficher/masquer.",
  },
  donchian: {
    title: "Donchian — canal des extrêmes",
    body: "Indicateur : plus haut / plus bas sur X tirages (Turtle). Ce n’est pas le canal de la table Chartisme. Afficher/masquer.",
  },
  rsi: {
    title: "RSI",
    body: "Indice de force relative 14. Zones 70 / 30. Afficher ou masquer le graphe.",
  },
  macd: {
    title: "MACD",
    body: "12 / 26 / 9 : ligne, signal et histogramme. Afficher ou masquer.",
  },
  stoch: {
    title: "Stochastique",
    body: "%K / %D (14 / 3). Zones 80 / 20. Afficher ou masquer.",
  },
  cci: {
    title: "CCI",
    body: "Commodity Channel Index 20. Extrêmes ±100 / ±200. Afficher ou masquer.",
  },
  wr: {
    title: "Williams %R",
    body: "Oscillateur −100 à 0. Zones −20 / −80. Afficher ou masquer.",
  },
  adx: {
    title: "ADX / DMI",
    body: "Force de tendance (ADX) et direction (+DI / −DI). Seuil usuel 20–25. Afficher/masquer.",
  },
  supertrend: {
    title: "Supertrend",
    body: "Suivi de tendance ATR (10, mult=3). Afficher ou masquer.",
  },
  psar: {
    title: "PSAR",
    body: "Parabolic SAR : points de retournement / trailing. Afficher ou masquer.",
  },
  aroon: {
    title: "Aroon",
    body: "Aroon up/down : proximité du plus haut / plus bas récent. Afficher ou masquer.",
  },
  ichimoku: {
    title: "Ichimoku",
    body: "Nuage 9 / 26 / 52 : Tenkan, Kijun, Senkou, Chikou. Afficher ou masquer.",
  },
  fibonacci: {
    title: "Fibonacci",
    body: "Retracements 0,236…0,786 sur le swing ZigZag. Afficher ou masquer.",
  },
  obv: {
    title: "OBV",
    body: "On-Balance Volume transposé à l’activité des tirages. Afficher ou masquer.",
  },
  adl: {
    title: "ADL",
    body: "Accumulation / distribution, même transposition. Afficher ou masquer.",
  },
  mfi: {
    title: "MFI",
    body: "Money Flow Index 14 (80 / 20). Afficher ou masquer.",
  },
  vwap: {
    title: "VWAP",
    body: "Prix moyen pondéré recalé au début de la fenêtre de travail. Afficher ou masquer.",
  },
  filterAll: {
    title: "Tous",
    body: "Affiche les 50 numéros du tableau, pairs et impairs.",
  },
  filterEven: {
    title: "Pairs",
    body: "Ne garde que les numéros pairs (2, 4, … 50). Le détail de la boule déjà choisie reste affiché.",
  },
  filterOdd: {
    title: "Impairs",
    body: "Ne garde que les numéros impairs. Le détail de la boule déjà choisie reste affiché.",
  },
} satisfies Record<string, HelpCopy>

export function OverlayToggle({
  label,
  on,
  onClick,
  help,
}: {
  label: string
  on: boolean
  onClick: () => void
  help: HelpCopy
}) {
  return (
    <span className="inline-flex items-center gap-1">
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
      <HelpTip {...help} />
    </span>
  )
}

export function Disclaimer({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-5 text-muted-foreground">{children}</p>
}

export { ChartContainer, ChartTooltip, ChartTooltipContent }
