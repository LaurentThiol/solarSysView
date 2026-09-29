"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"

import { Input } from "@/components/ui/input"
import { searchSchemaLabels, type SchemaLabelRecord } from "@/lib/schemas/search"

export function SchemaLabelSearch({
  records,
  children,
}: {
  records: SchemaLabelRecord[]
  children: ReactNode
}) {
  const [query, setQuery] = useState("")
  const groups = searchSchemaLabels(records, query)
  const active = query.trim().length > 0

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="schema-label-search" className="sr-only">
          Chercher un libellé
        </label>
        <Input
          id="schema-label-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Chercher un libellé"
          autoComplete="off"
        />
      </div>
      {active ? (
        <div aria-label="Libellés trouvés" className="flex max-h-[70vh] flex-col gap-4 overflow-auto">
          {groups.length === 0 ? (
            <p className="px-2 text-sm text-foreground">Aucun libellé.</p>
          ) : (
            groups.map((group) => (
              <div key={group.moduleLabel} className="flex flex-col gap-1">
                <p className="px-2 text-xs tracking-wide text-muted-foreground uppercase">{group.moduleLabel}</p>
                <div className="flex flex-col gap-2 pl-4">
                  {group.cards.map((card) => (
                    <div key={card.href}>
                      <Link href={card.href} className="rounded-md px-2 py-1 text-sm font-medium text-foreground hover:bg-accent/60">
                        {card.card}
                      </Link>
                      {card.snippets.length ? (
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {card.snippets.map((snippet) => (
                            <li key={snippet}>
                              <Link
                                href={card.href}
                                className="block rounded-md px-2 py-0.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                              >
                                {snippet}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        children
      )}
    </div>
  )
}
