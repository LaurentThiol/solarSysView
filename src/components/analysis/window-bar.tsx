"use client"

import {
  DEFAULT_WARMUP,
  WINDOW_PRESETS,
  WINDOW_PRESET_LABELS,
  formatWindowBanner,
  type ResolvedWindow,
  type WindowPreset,
} from "@/lib/analysis-window"
import { HelpTip, LabelHelp } from "@/components/help"
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
  const showDates = preset === "custom"
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <LabelHelp
          label="Fenêtre de travail"
          help={{
            title: "Fenêtre de travail",
            body: "Jeu de tirages lu par tous les onglets (Vue, Numéros, Hasard…). Un preset fixe N tirages, une durée ou l’année ; Personnalisé suit les dates Du / Au.",
          }}
        >
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
        </LabelHelp>
        <LabelHelp
          label="Du"
          help={{
            title: "Date de début",
            body: "Premier tirage inclus. Modifier une date passe automatiquement en fenêtre personnalisée.",
          }}
        >
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => onFrom(e.target.value)}
            className="w-40"
            aria-label="Date de début"
          />
        </LabelHelp>
        <LabelHelp
          label="Au"
          help={{
            title: "Date de fin",
            body: "Dernier tirage inclus. Laisser vide pour aller jusqu’au plus récent de l’archive chargée.",
          }}
        >
          <Input
            type="date"
            value={toDate}
            onChange={(e) => onTo(e.target.value)}
            className="w-40"
            aria-label="Date de fin"
          />
        </LabelHelp>
        {showLastN || showDates ? (
          <LabelHelp
            label="Derniers N"
            help={{
              title: "Derniers N tirages",
              body: "Force les N derniers tirages de la plage. « auto » suit le preset (20, 50, 100…). Utile pour recaler un preset last_* après avoir touché les dates.",
            }}
          >
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
          </LabelHelp>
        ) : null}
        <LabelHelp
          label="Warmup"
          help={{
            title: "Warmup",
            body: `Tirages situés juste avant la fenêtre (défaut ${DEFAULT_WARMUP}). Ils initialisent EMA, RSI, Ichimoku, sans entrer dans χ², Bayes ni le VWAP de fenêtre.`,
          }}
        >
          <Input
            type="number"
            min={0}
            max={400}
            value={warmup}
            onChange={(e) => onWarmup(Number(e.target.value) || 0)}
            className="w-24"
            aria-label="Tirages de warmup"
          />
        </LabelHelp>
        <label className="flex items-center gap-2 pb-1 text-sm">
          <input
            type="checkbox"
            checked={compareOn}
            onChange={(e) => onCompare(e.target.checked)}
          />
          <span className="inline-flex items-center gap-1">
            Comparer à la fenêtre précédente
            <HelpTip
              title="Comparer"
              body="Calcule les écarts de moyenne / σ / couverture par rapport à la fenêtre de même longueur qui précède immédiatement celle-ci."
            />
          </span>
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
