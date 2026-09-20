"use client"

import { Suspense, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Check, Copy, ExternalLink } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  ADDRESS_KIND_LABELS,
  addressCopyValue,
  addressMatchesLocation,
  filterAddresses,
  groupedAddresses,
  type AddressEntry,
  type AddressKind,
} from "@/lib/addresses"
import { applyHelpOverlaySearch, readHelpOverlay } from "@/lib/help-overlay"
import { cn } from "@/lib/utils"

const KIND_FILTERS: { id: AddressKind | "all"; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "page", label: ADDRESS_KIND_LABELS.page },
  { id: "onglet", label: ADDRESS_KIND_LABELS.onglet },
  { id: "api", label: ADDRESS_KIND_LABELS.api },
  { id: "raccourci", label: ADDRESS_KIND_LABELS.raccourci },
]

function CopyAddress({ entry }: { entry: AddressEntry }) {
  const [copied, setCopied] = useState(false)
  const value = addressCopyValue(entry)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
      title={`Copier ${value}`}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copié" : "Copier"}
    </button>
  )
}

function overlayNavigateHref(entry: AddressEntry, pathname: string, search: string) {
  if (!entry.href.startsWith("?")) return entry.href
  const overlay = readHelpOverlay(entry.href)
  const next = applyHelpOverlaySearch(search, {
    glossary: overlay.glossary,
    adresse: overlay.adresse,
  })
  return next ? `${pathname}?${next}` : pathname
}

function AddressHref({
  entry,
  current,
  pathname,
  search,
}: {
  entry: AddressEntry
  current: boolean
  pathname: string
  search: string
}) {
  const className = cn(
    "font-mono text-[11px] break-all",
    current ? "text-foreground" : "text-muted-foreground"
  )
  const label = entry.method ? `${entry.method} ${entry.href}` : entry.href
  const href = overlayNavigateHref(entry, pathname, search)

  if (entry.action === "navigate") {
    return (
      <Link href={href} scroll={false} className={cn(className, "underline-offset-2 hover:underline hover:text-foreground")}>
        {label}
      </Link>
    )
  }
  if (entry.action === "open") {
    return (
      <a
        href={entry.href}
        target="_blank"
        rel="noreferrer"
        className={cn(className, "inline-flex items-center gap-1 underline-offset-2 hover:underline hover:text-foreground")}
      >
        {label}
        <ExternalLink className="size-3 shrink-0" />
      </a>
    )
  }
  return <span className={className}>{label}</span>
}

function AddressCatalogBody({
  compact,
  searchId,
}: {
  compact: boolean
  searchId: string
}) {
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState<AddressKind | "all">("all")
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()

  const groups = useMemo(
    () => groupedAddresses(filterAddresses(query, kind)),
    [query, kind]
  )

  return (
    <div className="flex flex-col gap-3">
      <label className="block text-xs text-muted-foreground" htmlFor={searchId}>
        Rechercher
        <Input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Analyse, /api/health, jumeaux, raccourci…"
          aria-label="Rechercher une adresse"
          className="mt-1"
        />
      </label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par type">
        {KIND_FILTERS.map((item) => {
          const selected = kind === item.id
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setKind(item.id)}
              className={cn(
                "inline-flex min-h-7 items-center rounded-full border px-2.5 py-0.5 text-[11px] whitespace-nowrap transition-colors",
                selected
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aucune adresse ne correspond à « {query.trim() || KIND_FILTERS.find((item) => item.id === kind)?.label} ».
        </p>
      ) : (
        <div className={cn("flex flex-col", compact ? "gap-4" : "gap-5")}>
          {groups.map((group) => (
            <section key={group.id} aria-label={group.label}>
              <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {group.label}
                <span className="ml-1.5 font-normal tabular-nums">({group.entries.length})</span>
              </h3>
              <ul className={cn("mt-2 flex flex-col", compact ? "gap-2.5" : "gap-3")}>
                {group.entries.map((entry) => {
                  const current = addressMatchesLocation(entry, pathname, search)
                  return (
                    <li
                      key={entry.id}
                      className={cn(
                        "rounded-lg border px-2.5 py-2",
                        current ? "border-primary/50 bg-primary/10" : "border-border/80 bg-card/40"
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-foreground">
                            <span>{entry.label}</span>
                            <span className="rounded-full border border-border px-1.5 py-px text-[10px] font-normal text-muted-foreground">
                              {ADDRESS_KIND_LABELS[entry.kind]}
                            </span>
                            {current ? (
                              <span className="rounded-full border border-primary/40 px-1.5 py-px text-[10px] font-normal text-foreground">
                                Ici
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5">
                            <AddressHref
                              entry={entry}
                              current={current}
                              pathname={pathname}
                              search={search}
                            />
                          </p>
                        </div>
                        <CopyAddress entry={entry} />
                      </div>
                      <p
                        className={cn(
                          "mt-1 leading-5 text-muted-foreground",
                          compact ? "text-xs" : "text-sm leading-6"
                        )}
                      >
                        {entry.text}
                      </p>
                      {entry.params ? (
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                          Paramètres : {entry.params}
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

export function AddressCatalog({
  compact = false,
  searchId,
}: {
  compact?: boolean
  searchId: string
}) {
  return (
    <Suspense fallback={<p className="text-xs text-muted-foreground">Chargement de l’annuaire…</p>}>
      <AddressCatalogBody compact={compact} searchId={searchId} />
    </Suspense>
  )
}
