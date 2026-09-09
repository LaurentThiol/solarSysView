"use client"

import {
  DEFAULT_WARMUP,
  WINDOW_PRESETS,
  WINDOW_PRESET_LABELS,
  formatWindowBanner,
  type ResolvedWindow,
  type WindowPreset,
} from "@/lib/analysis-window"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"

export function WindowBar({
  window,
  preset,
  fromDate,
  toDate,
  lastN,
  warmup,
  compareOn,
  onPreset,
  onFrom,
  onTo,
  onLastN,
  onWarmup,
  onCompare,
}: {
  window: ResolvedWindow<{ date: string }>
  preset: WindowPreset
  fromDate: string
  toDate: string
  lastN: string
  warmup: number
  compareOn: boolean
  onPreset: (v: WindowPreset) => void
  onFrom: (v: string) => void
  onTo: (v: string) => void
  onLastN: (v: string) => void
  onWarmup: (v: number) => void
  onCompare: (v: boolean) => void
}) {
  const showLastN = preset.startsWith("last_") || lastN !== ""
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Fenêtre de travail
          <Select value={preset} onValueChange={(v) => onPreset(v as WindowPreset)}>
            <SelectTrigger className="w-full sm:w-64" aria-label="Fenêtre">
              <span className="flex flex-1 text-left">{WINDOW_PRESET_LABELS[preset]}</span>
            </SelectTrigger>
            <SelectContent>
              {WINDOW_PRESETS.map((item) => (
                <SelectItem key={item} value={item}>
                  {WINDOW_PRESET_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Du
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => onFrom(e.target.value)}
            className="w-40"
            aria-label="Date de début"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Au
          <Input
            type="date"
            value={toDate}
            onChange={(e) => onTo(e.target.value)}
            className="w-40"
            aria-label="Date de fin"
          />
        </label>
        {showLastN || showDates ? (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Derniers N
            <Input
              type="number"
              min={2}
              max={2000}
              value={lastN}
              onChange={(e) => onLastN(e.target.value)}
              placeholder="auto"
              className="w-24"
              aria-label="Derniers N tirages"
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Warmup
          <Input
            type="number"
            min={0}
            max={400}
            value={warmup}
            onChange={(e) => onWarmup(Number(e.target.value) || 0)}
            className="w-24"
            aria-label="Tirages de warmup"
          />
        </label>
        <label className="flex items-center gap-2 pb-1 text-sm">
          <input
            type="checkbox"
            checked={compareOn}
            onChange={(e) => onCompare(e.target.checked)}
          />
          Comparer à la fenêtre précédente
        </label>
      </div>
      <p className="text-sm text-foreground">{formatWindowBanner(window)}</p>
      <p className="text-xs text-muted-foreground">
        Tous les onglets lisent ce jeu de tirages. Le warmup (défaut {DEFAULT_WARMUP})
        alimente EMA / RSI / Ichimoku sans entrer dans χ², Bayes ni le VWAP de fenêtre.
        X plus bas est la période des indicateurs, pas la plage calendaire.
      </p>
    </div>
  )
}
