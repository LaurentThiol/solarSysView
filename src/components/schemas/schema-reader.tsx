import Link from "next/link"

import { SchemaDiagram } from "@/components/schemas/schema-diagram"
import { SchemaProse } from "@/components/schemas/schema-prose"
import { parseInlines } from "@/lib/schemas/document"
import type { SchemaDoc } from "@/lib/schemas/load"
import { cn } from "@/lib/utils"

function moduleLabel(moduleId: string) {
  if (!moduleId) return "Méthode"
  if (moduleId === "decision-tree") return "decisionTree"
  return moduleId.charAt(0).toUpperCase() + moduleId.slice(1)
}

function groupsOf(docs: SchemaDoc[]) {
  const ids: string[] = []
  for (const doc of docs) {
    if (!ids.includes(doc.moduleId)) ids.push(doc.moduleId)
  }
  return ids.map((id) => ({
    id,
    label: moduleLabel(id),
    docs: docs.filter((doc) => doc.moduleId === id),
  }))
}

export function SchemaReader({ docs, current }: { docs: SchemaDoc[]; current: SchemaDoc }) {
  const groups = groupsOf(docs)
  const index = docs.findIndex((doc) => doc.id === current.id)
  const previous = index > 0 ? docs[index - 1] : null
  const next = index >= 0 && index < docs.length - 1 ? docs[index + 1] : null

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <nav aria-label="Sommaire des schémas" className="flex flex-col gap-4 lg:sticky lg:top-4">
        {groups.map((group) => (
          <div key={group.id || "methode"} className="flex flex-col gap-1">
            <p className="px-2 text-xs tracking-wide text-muted-foreground uppercase">{group.label}</p>
            <div className="flex flex-col gap-0.5 pl-4">
              {group.docs.map((doc) => (
                <Link
                  key={doc.id || "methode"}
                  href={doc.href}
                  aria-current={doc.id === current.id ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2 py-1 text-sm",
                    doc.id === current.id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )}
                >
                  {doc.shortTitle}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <article className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight">{current.title}</h2>
        <p className="mt-2 font-mono text-xs text-muted-foreground">{current.sourcePath}</p>
        <SchemaMeta meta={current.meta} docId={current.id} />
        <div className="mt-6">
          {current.blocks.map((block, blockIndex) => {
            if (block.kind === "diagram") {
              const diagramCount = current.blocks
                .slice(0, blockIndex + 1)
                .filter((item) => item.kind === "diagram").length
              return (
                <SchemaDiagram
                  key={`${current.id}-diagram-${blockIndex}`}
                  source={block.source}
                  label={diagramCount === 1 ? "Schéma" : `Schéma ${diagramCount}`}
                />
              )
            }
            return <SchemaProse key={`${current.id}-prose-${blockIndex}`} blocks={block.blocks} />
          })}
        </div>
        <nav aria-label="Schémas voisins" className="mt-10 flex flex-wrap items-baseline justify-between gap-3 border-t border-border pt-4 text-sm">
          {previous ? (
            <Link href={previous.href} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              Précédent : {previous.shortTitle}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={next.href} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              Suivant : {next.shortTitle}
            </Link>
          ) : null}
        </nav>
      </article>
    </div>
  )
}

function SchemaMeta({ meta, docId }: { meta: SchemaDoc["meta"]; docId: string }) {
  const rows = [
    meta.revision ? { label: "Révision", value: meta.revision } : null,
    meta.level ? { label: "Niveau", value: meta.level } : null,
    meta.module ? { label: "Module", value: meta.module } : null,
    meta.code ? { label: "Code", value: meta.code } : null,
  ].filter((row): row is { label: string; value: string } => row != null)
  if (rows.length === 0) return null
  return (
    <dl className="mt-4 flex flex-col gap-1 text-sm text-muted-foreground">
      {rows.map((row) => (
        <div key={row.label}>
          <dt className="inline font-medium text-foreground">{row.label}. </dt>
          <dd className="inline">
            <SchemaProseInline text={row.value} docId={docId} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

function SchemaProseInline({ text, docId }: { text: string; docId: string }) {
  const items = parseInlines(text, docId)
  return (
    <>
      {items.map((item, index) => {
        if (item.kind === "code") {
          return (
            <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
              {item.text}
            </code>
          )
        }
        if (item.kind === "strong") return <strong key={index}>{item.text}</strong>
        if (item.kind === "link") {
          return (
            <a key={index} href={item.href} className="underline underline-offset-2">
              {item.text}
            </a>
          )
        }
        return <span key={index}>{item.text}</span>
      })}
    </>
  )
}
