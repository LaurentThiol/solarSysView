"use client"

import { useMemo, useState, type ReactNode } from "react"

import { TitleHelp, type HelpCopy } from "@/components/help"
import {
  PULSE_PRESET_LABELS,
  pulseChannelLabel,
  pulseGeneratorLabel,
  pulsePLabel,
  pulsePercent,
  type PulseGroup,
  type PulsePreset,
  type PulseSlice,
} from "@/lib/pulse"
import { cn } from "@/lib/utils"

type SortDir = "asc" | "desc"
type SortValue = string | number | null

type Column = {
  key: string
  label: string
  align: "left" | "right"
}

const SLICE_COLUMNS: Column[] = [
  { key: "preset", label: "Échantillon", align: "left" },
  { key: "generator", label: "Générateur", align: "left" },
  { key: "period", label: "Période", align: "right" },
  { key: "from", label: "Du", align: "left" },
  { key: "to", label: "Au", align: "left" },
  { key: "concordance", label: "Concordance", align: "right" },
  { key: "hits", label: "Sorties", align: "right" },
  { key: "r", label: "R", align: "right" },
  { key: "p", label: "p", align: "right" },
]

const GROUP_COLUMNS: Column[] = [
  { key: "members", label: "Membres", align: "left" },
  { key: "generator", label: "Générateur", align: "left" },
  { key: "preset", label: "Échantillon", align: "left" },
  { key: "period", label: "Période", align: "right" },
  { key: "rotation", label: "Rotation", align: "right" },
  { key: "from", label: "Du", align: "left" },
  { key: "to", label: "Au", align: "left" },
  { key: "concordance", label: "Concordance", align: "right" },
  { key: "hits", label: "Sorties", align: "right" },
  { key: "p", label: "p", align: "right" },
]

function presetLabel(preset: string) {
  return PULSE_PRESET_LABELS[preset as PulsePreset] ?? preset
}

function formatTableDate(iso: string | null) {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00`))
}

function memberNames(group: PulseGroup) {
  return group.members.map((member) => pulseChannelLabel(member.kind, member.n)).join(" · ")
}

function compareValues(left: SortValue, right: SortValue, dir: SortDir) {
  const leftMissing = left == null || left === ""
  const rightMissing = right == null || right === ""
  if (leftMissing && rightMissing) return 0
  if (leftMissing) return 1
  if (rightMissing) return -1
  const compared =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), "fr", { numeric: true, sensitivity: "base" })
  return dir === "asc" ? compared : -compared
}

function defaultDir(key: string): SortDir {
  if (key === "concordance" || key === "hits" || key === "r" || key === "to") return "desc"
  return "asc"
}

function useSorted<T>(rows: readonly T[], read: (row: T, key: string) => SortValue) {
  const [sortKey, setSortKey] = useState("concordance")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const sorted = useMemo(
    () => [...rows].sort((left, right) => compareValues(read(left, sortKey), read(right, sortKey), sortDir)),
    [read, rows, sortDir, sortKey]
  )
  function toggle(key: string) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    setSortDir(defaultDir(key))
  }
  return { sorted, sortKey, sortDir, toggle }
}

function SortHeaders({
  columns,
  sortKey,
  sortDir,
  onSort,
}: {
  columns: Column[]
  sortKey: string
  sortDir: SortDir
  onSort: (key: string) => void
}) {
  return (
    <tr className="text-left text-xs text-muted-foreground">
      {columns.map((column) => {
        const active = sortKey === column.key
        return (
          <th
            key={column.key}
            scope="col"
            aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
            className={cn(
              "sticky top-0 z-10 bg-card px-2 py-1.5 font-medium whitespace-nowrap shadow-[inset_0_-1px_0_var(--border)]",
              column.align === "right" && "text-right"
            )}
          >
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 hover:text-foreground",
                column.align === "right" && "flex-row-reverse"
              )}
              onClick={() => onSort(column.key)}
            >
              {column.label}
              <span aria-hidden className={cn("w-3 text-[10px] leading-none", !active && "opacity-40")}>
                {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
              </span>
            </button>
          </th>
        )
      })}
    </tr>
  )
}

function TableFrame({
  label,
  hint,
  help,
  testId,
  sortKey,
  sortDir,
  columns,
  onSort,
  children,
}: {
  label: string
  hint: string
  help?: HelpCopy
  testId: string
  sortKey: string
  sortDir: SortDir
  columns: Column[]
  onSort: (key: string) => void
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-card/40 p-3" aria-label={label}>
      <h3 className="text-sm font-medium">
        {help ? <TitleHelp help={help}>{label}</TitleHelp> : label}
      </h3>
      <p className="mt-1 mb-3 text-xs text-muted-foreground">{hint}</p>
      <div
        className="max-h-[28rem] overflow-auto"
        data-pulse-table={testId}
        data-sort-key={sortKey}
        data-sort-dir={sortDir}
      >
        <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">{label}</caption>
          <thead>
            <SortHeaders columns={columns} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  )
}

function sliceSort(slice: PulseSlice, key: string): SortValue {
  switch (key) {
    case "preset":
      return presetLabel(String(slice.preset))
    case "generator":
      return pulseGeneratorLabel(slice.generator)
    case "period":
      return slice.period
    case "from":
      return slice.from
    case "to":
      return slice.to
    case "concordance":
      return slice.concordance
    case "hits":
      return slice.hits
    case "r":
      return slice.r
    case "p":
      return slice.p
    default:
      return null
  }
}

function sliceText(slice: PulseSlice, key: string) {
  switch (key) {
    case "preset":
      return presetLabel(String(slice.preset))
    case "generator":
      return pulseGeneratorLabel(slice.generator)
    case "period":
      return slice.period == null ? "—" : String(slice.period)
    case "from":
      return formatTableDate(slice.from)
    case "to":
      return formatTableDate(slice.to)
    case "concordance":
      return pulsePercent(slice.concordance)
    case "hits":
      return String(slice.hits)
    case "r":
      return slice.r.toFixed(2)
    case "p":
      return pulsePLabel(slice.p)
    default:
      return "—"
  }
}

function groupSort(group: PulseGroup, key: string): SortValue {
  switch (key) {
    case "members":
      return memberNames(group)
    case "generator":
      return pulseGeneratorLabel(group.generator)
    case "preset":
      return presetLabel(group.preset)
    case "period":
      return group.period
    case "rotation":
      return group.period2
    case "from":
      return group.from
    case "to":
      return group.to
    case "concordance":
      return group.concordance
    case "hits":
      return group.hits ?? null
    case "p":
      return group.p ?? null
    default:
      return null
  }
}

function groupText(group: PulseGroup, key: string) {
  switch (key) {
    case "members":
      return memberNames(group)
    case "generator":
      return pulseGeneratorLabel(group.generator)
    case "preset":
      return presetLabel(group.preset)
    case "period":
      return String(group.period)
    case "rotation":
      return String(group.period2)
    case "from":
      return formatTableDate(group.from)
    case "to":
      return formatTableDate(group.to)
    case "concordance":
      return pulsePercent(group.concordance)
    case "hits":
      return group.hits == null ? "—" : String(group.hits)
    case "p":
      return pulsePLabel(group.p)
    default:
      return "—"
  }
}

const SLICE_HINT =
  "Un clic sur un en-tête trie la colonne. Un second clic inverse le sens. Une ligne choisit la tranche tracée au-dessus."
const GROUP_HINT =
  "Un clic sur un en-tête trie la colonne. Un second clic inverse le sens. Une ligne choisit le groupe tracé au-dessus."

export function PulseSliceTable({
  slices,
  activeId,
  help,
  onSelect,
}: {
  slices: PulseSlice[]
  activeId: string | null
  help?: HelpCopy
  onSelect: (slice: PulseSlice) => void
}) {
  const { sorted, sortKey, sortDir, toggle } = useSorted(slices, sliceSort)
  if (slices.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune tranche pour ce numéro.</p>
  }
  return (
    <TableFrame
      label="Tranches"
      hint={SLICE_HINT}
      help={help}
      testId="slices"
      sortKey={sortKey}
      sortDir={sortDir}
      columns={SLICE_COLUMNS}
      onSort={toggle}
    >
      {sorted.map((slice) => {
        const active = slice.id === activeId
        const period = slice.period == null ? "sans période" : `période ${slice.period}`
        return (
          <tr
            key={slice.id}
            aria-selected={active}
            data-state={active ? "selected" : undefined}
            className={cn("cursor-pointer", active ? "bg-primary/15" : "hover:bg-muted/40")}
            onClick={() => onSelect(slice)}
          >
            {SLICE_COLUMNS.map((column, index) => {
              const text = sliceText(slice, column.key)
              const className = cn(
                "border-t border-border px-2 py-1.5 whitespace-nowrap",
                column.align === "right" && "text-right tabular-nums"
              )
              if (index === 0) {
                return (
                  <th key={column.key} scope="row" className={cn(className, "text-left font-medium")}>
                    <button
                      type="button"
                      className="text-left hover:underline"
                      aria-pressed={active}
                      aria-label={`${active ? "Tranche affichée" : "Afficher la tranche"}, ${text}, ${pulseGeneratorLabel(slice.generator)}, ${period}, concordance ${pulsePercent(slice.concordance)}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelect(slice)
                      }}
                    >
                      {text}
                    </button>
                  </th>
                )
              }
              return (
                <td key={column.key} className={className}>
                  {text}
                </td>
              )
            })}
          </tr>
        )
      })}
    </TableFrame>
  )
}

export function PulseGroupTable({
  groups,
  activeId,
  help,
  onSelect,
}: {
  groups: PulseGroup[]
  activeId: string | null
  help?: HelpCopy
  onSelect: (group: PulseGroup) => void
}) {
  const { sorted, sortKey, sortDir, toggle } = useSorted(groups, groupSort)
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Aucune paire ni triplet pour les générateurs cochés.</p>
    )
  }
  return (
    <TableFrame
      label="Groupes"
      hint={GROUP_HINT}
      help={help}
      testId="groups"
      sortKey={sortKey}
      sortDir={sortDir}
      columns={GROUP_COLUMNS}
      onSort={toggle}
    >
      {sorted.map((group) => {
        const active = group.id === activeId
        const names = memberNames(group)
        return (
          <tr
            key={group.id}
            aria-selected={active}
            data-state={active ? "selected" : undefined}
            className={cn("cursor-pointer", active ? "bg-primary/15" : "hover:bg-muted/40")}
            onClick={() => onSelect(group)}
          >
            {GROUP_COLUMNS.map((column, index) => {
              const text = groupText(group, column.key)
              const className = cn(
                "border-t border-border px-2 py-1.5 whitespace-nowrap",
                column.align === "right" && "text-right tabular-nums"
              )
              if (index === 0) {
                return (
                  <th key={column.key} scope="row" className={cn(className, "text-left font-medium")}>
                    <button
                      type="button"
                      className="text-left hover:underline"
                      aria-pressed={active}
                      aria-label={`${active ? "Groupe affiché" : "Afficher le groupe"} ${names}, ${pulseGeneratorLabel(group.generator)}, concordance ${pulsePercent(group.concordance)}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelect(group)
                      }}
                    >
                      {text}
                    </button>
                  </th>
                )
              }
              return (
                <td key={column.key} className={className}>
                  {text}
                </td>
              )
            })}
          </tr>
        )
      })}
    </TableFrame>
  )
}
