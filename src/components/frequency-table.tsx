"use client"

import { useMemo, useState } from "react"

import { ExpectedMeter } from "@/components/expected-meter"
import { HelpTip, type HelpCopy } from "@/components/help"
import {
  boardDigest,
  boardSummary,
  defaultSortDir,
  formatFr,
  formatSignedFr,
  sortFrequencyRows,
  type FrequencySortKey,
  type SortDir,
} from "@/lib/frequency-board"
import type { FrequencyItem } from "@/lib/frequency-rank"
import { cn } from "@/lib/utils"

const COLUMN_HELP: Record<FrequencySortKey, HelpCopy> = {
  value: {
    title: "Trier par numéro",
    body: "Cliquez pour ranger du plus petit au plus grand. Un second clic inverse le sens.",
  },
  parity: {
    title: "Trier par parité",
    body: "Pairs d’abord (or), puis impairs (bleu). Un second clic met les impairs devant.",
  },
  count: {
    title: "Trier par sorties",
    body: "Nombre de sorties dans la fenêtre. Le premier clic met les plus sortis en haut.",
  },
  delta: {
    title: "Trier par écart",
    body: "Sorties moins l’attendu. Positif : au-dessus de la loi. Le premier clic met le plus grand écart en haut. Ce n’est pas une chance supplémentaire.",
  },
  delay: {
    title: "Trier par retard",
    body: "Tirages depuis la dernière sortie. Le premier clic met les plus longs en haut. Un retard élevé ne change pas la chance au tirage suivant.",
  },
  ratio: {
    title: "Trier par rapport à l’attendu",
    body: "La barre est l’observé, le trait vertical est la loi, le × est observé / attendu. Or = pair, bleu = impair, rouge = plus de 2× la loi. Le tri suit ce rapport.",
  },
}

const COLUMNS: {
  key: FrequencySortKey
  label: string
  short: string
  align: "left" | "right"
  width: string
  /** Parité et écart restent dans la barre : on les garde pour le grand écran. */
  wide?: boolean
}[] = [
  { key: "value", label: "Numéro", short: "N°", align: "left", width: "w-11 sm:w-auto" },
  { key: "parity", label: "P/I", short: "P/I", align: "left", wide: true, width: "sm:w-auto" },
  { key: "count", label: "Sorties", short: "×", align: "right", width: "w-12 sm:w-auto" },
  { key: "delta", label: "Δ", short: "Δ", align: "right", wide: true, width: "sm:w-auto" },
  { key: "delay", label: "Retard", short: "R", align: "right", width: "w-10 sm:w-auto" },
  { key: "ratio", label: "Attendu", short: "Loi", align: "left", width: "w-auto" },
]

function columnHelp(key: FrequencySortKey, noun: string): HelpCopy {
  if (key !== "value") return COLUMN_HELP[key]
  return {
    title: `Trier par ${noun.toLowerCase()}`,
    body: COLUMN_HELP.value.body,
  }
}

function defaultAria(item: FrequencyItem, selected: boolean, noun: string) {
  const parity = item.value % 2 === 0 ? "pair" : "impair"
  const verb = selected ? "Retirer" : "Choisir"
  return `${verb} ${noun.toLowerCase()} ${item.value}, ${parity}, ${item.count} sorties, retard ${item.delayDraws}`
}

export function FrequencyTable({
  items,
  expected = 0,
  caption,
  emptyLabel = "Aucune boule dans la fenêtre.",
  noun = "Numéro",
  shortNoun = "N°",
  selected,
  onPick,
  isDisabled,
  disabledReason,
  ariaLabel,
  scroll,
}: {
  items: FrequencyItem[]
  expected?: number
  caption: string
  emptyLabel?: string
  noun?: string
  shortNoun?: string
  selected?: ReadonlySet<number>
  onPick?: (value: number) => void
  isDisabled?: (value: number) => boolean
  disabledReason?: string
  ariaLabel?: (item: FrequencyItem, selected: boolean) => string
  scroll?: boolean
}) {
  const [sortKey, setSortKey] = useState<FrequencySortKey>("value")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const law = Number.isFinite(expected) ? expected : 0
  const rows = useMemo(
    () => sortFrequencyRows(items, sortKey, sortDir, law),
    [items, sortKey, sortDir, law]
  )
  const summary = boardSummary(boardDigest(items, law), law)
  const tall = scroll ?? items.length > 16

  function toggleSort(key: FrequencySortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    setSortDir(defaultSortDir(key))
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <div data-frequency-table data-sort-key={sortKey} data-sort-dir={sortDir}>
      <p className="text-xs tabular-nums text-muted-foreground">{summary}</p>
      <MeterLegend expected={law} />
      <div className={cn("mt-3", tall ? "max-h-[28rem] overflow-auto" : "overflow-x-auto")}>
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm sm:min-w-[42rem] sm:table-auto">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-left text-muted-foreground">
              {COLUMNS.map((column) => {
                const label = column.key === "value" ? noun : column.label
                const short = column.key === "value" ? shortNoun : column.short
                const active = sortKey === column.key
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
                    }
                    className={cn(
                      "sticky top-0 z-10 bg-card px-1 py-1.5 font-medium whitespace-nowrap shadow-[inset_0_-1px_0_var(--border)] sm:px-2",
                      column.width,
                      column.align === "right" && "text-right",
                      column.wide && "hidden sm:table-cell"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        column.align === "right" && "flex-row-reverse"
                      )}
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleSort(column.key)}
                      >
                        <span className="sm:hidden">{short}</span>
                        <span className="hidden sm:inline">{label}</span>
                        <span
                          aria-hidden
                          className={cn(
                            "w-3 text-[10px] leading-none",
                            !active && "opacity-40"
                          )}
                        >
                          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                      <HelpTip {...columnHelp(column.key, noun)} />
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const even = item.value % 2 === 0
              const on = selected?.has(item.value) ?? false
              const locked = isDisabled?.(item.value) ?? false
              const delta = item.count - law
              return (
                <tr
                  key={item.value}
                  data-state={on ? "selected" : undefined}
                  className={cn(
                    "border-border",
                    on && "bg-primary/15",
                    !on && "hover:bg-muted/40",
                    locked && "opacity-45"
                  )}
                  onClick={
                    onPick && !locked
                      ? () => onPick(item.value)
                      : undefined
                  }
                >
                  <td className="border-t border-border px-1 py-1.5 sm:px-2">
                    {onPick ? (
                      <button
                        type="button"
                        disabled={locked}
                        aria-pressed={on}
                        title={locked ? disabledReason : undefined}
                        aria-label={
                          ariaLabel?.(item, on) ?? defaultAria(item, on, noun)
                        }
                        className="font-medium tabular-nums hover:underline disabled:cursor-not-allowed disabled:no-underline"
                        onClick={(event) => {
                          event.stopPropagation()
                          if (!locked) onPick(item.value)
                        }}
                      >
                        {item.value}
                      </button>
                    ) : (
                      <span className="font-medium tabular-nums">{item.value}</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "hidden border-t border-border px-1 py-1.5 sm:table-cell sm:px-2",
                      even ? "text-chart-1" : "text-chart-2"
                    )}
                  >
                    {even ? "pair" : "impair"}
                  </td>
                  <td className="border-t border-border px-1 py-1.5 text-right tabular-nums sm:px-2">
                    {item.count}×
                  </td>
                  <td
                    className={cn(
                      "hidden border-t border-border px-1 py-1.5 text-right tabular-nums sm:table-cell sm:px-2",
                      law > 0 && delta < 0 && "text-muted-foreground",
                      law > 0 && item.count > law * 2 && "font-medium text-destructive"
                    )}
                  >
                    {law > 0 ? formatSignedFr(delta, 1) : "—"}
                  </td>
                  <td className="border-t border-border px-1 py-1.5 text-right tabular-nums sm:px-2">
                    {item.delayDraws}
                  </td>
                  <td className="border-t border-border px-1 py-1.5 sm:px-2">
                    <ExpectedMeter
                      value={item.count}
                      expected={law}
                      even={even}
                      label={`${noun} ${item.value} · ${item.count} sorties, attendu ${formatFr(law, 1)}`}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MeterLegend({ expected }: { expected: number }) {
  const law = expected > 0 ? ` (${formatFr(expected, 1)}×)` : ""
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-6 rounded-full bg-chart-1" />
        pair
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-6 rounded-full bg-chart-2" />
        impair
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="relative inline-block h-2 w-8 rounded-full bg-muted">
          <span className="absolute inset-y-[-2px] left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-foreground" />
        </span>
        trait = attendu{law}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-6 rounded-full bg-destructive" />
        plus de 2×
      </span>
    </p>
  )
}
