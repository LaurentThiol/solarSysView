"use client"

import { useId, useRef, type KeyboardEvent } from "react"

import { HelpTip, type HelpCopy } from "@/components/help"
import { cn } from "@/lib/utils"

export type PillTabItem<T extends string> = {
  id: T
  label: string
  help?: HelpCopy
}

export type PillTabGroup<T extends string> = {
  label?: string
  items: readonly PillTabItem<T>[]
}

export function pillTabId(prefix: string, id: string) {
  return `${prefix}-tab-${id}`
}

export function pillPanelId(prefix: string, id: string) {
  return `${prefix}-panel-${id}`
}

function flatten<T extends string>(
  items: readonly PillTabItem<T>[] | undefined,
  groups: readonly PillTabGroup<T>[] | undefined
): PillTabItem<T>[] {
  if (groups?.length) return groups.flatMap((group) => [...group.items])
  return items ? [...items] : []
}

export function PillTabs<T extends string>({
  label,
  value,
  onValueChange,
  items,
  groups,
  mode = "tabs",
  idPrefix,
  className,
}: {
  label: string
  value: T
  onValueChange: (id: T) => void
  items?: readonly PillTabItem<T>[]
  groups?: readonly PillTabGroup<T>[]
  mode?: "tabs" | "chips"
  idPrefix?: string
  className?: string
}) {
  const reactId = useId()
  const prefix = idPrefix ?? reactId
  const flat = flatten(items, groups)
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const isTabs = mode === "tabs"

  function focusAndSelect(id: T) {
    onValueChange(id)
    requestAnimationFrame(() => buttonRefs.current[id]?.focus())
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!flat.length) return
    const last = flat.length - 1
    let next = index
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = last
    else return
    event.preventDefault()
    focusAndSelect(flat[next].id)
  }

  function renderButton(item: PillTabItem<T>, index: number) {
    const selected = item.id === value
    return (
      <span key={item.id} className="inline-flex items-center gap-1">
        <button
          ref={(node) => {
            buttonRefs.current[item.id] = node
          }}
          type="button"
          id={isTabs ? pillTabId(prefix, item.id) : undefined}
          role={isTabs ? "tab" : undefined}
          aria-selected={isTabs ? selected : undefined}
          aria-pressed={!isTabs ? selected : undefined}
          aria-controls={isTabs ? pillPanelId(prefix, item.id) : undefined}
          tabIndex={isTabs ? (selected ? 0 : -1) : 0}
          onClick={() => onValueChange(item.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
          className={cn(
            "inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
            selected
              ? "border-primary bg-primary/15 text-foreground"
              : "border-border text-muted-foreground hover:text-foreground"
          )}
        >
          {item.label}
        </button>
        {item.help ? <HelpTip {...item.help} /> : null}
      </span>
    )
  }

  const rows = groups?.length
    ? groups.map((group) => ({
        key: group.label ?? "group",
        caption: group.label,
        items: group.items,
      }))
    : [{ key: "items", caption: undefined, items: items ?? [] }]

  const starts = rows.map((_, index) =>
    rows.slice(0, index).reduce((sum, row) => sum + row.items.length, 0)
  )

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {rows.map((row, rowIndex) => {
        const start = starts[rowIndex]
        return (
          <div key={row.key} className="flex flex-col gap-1.5">
            {row.caption ? (
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {row.caption}
              </p>
            ) : null}
            <nav
              className="-mx-4 flex flex-nowrap gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:thin] sm:mx-0 sm:flex-wrap sm:px-0"
              aria-label={row.caption ? `${label} · ${row.caption}` : label}
              role={isTabs ? "tablist" : "group"}
            >
              {row.items.map((item, index) => renderButton(item, start + index))}
            </nav>
          </div>
        )
      })}
    </div>
  )
}

export function PillTabPanel({
  idPrefix,
  tab,
  labelledBy,
  children,
  className,
}: {
  idPrefix: string
  tab: string
  labelledBy?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      role="tabpanel"
      id={pillPanelId(idPrefix, tab)}
      aria-labelledby={labelledBy ?? pillTabId(idPrefix, tab)}
      tabIndex={0}
      className={cn("min-w-0 outline-none", className)}
    >
      {children}
    </div>
  )
}
