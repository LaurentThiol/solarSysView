import type { ReactNode } from "react"

import type { Inline, ProseBlock } from "@/lib/schemas/document"

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((item, index) => {
        const key = `${item.kind}-${index}`
        if (item.kind === "code") {
          return (
            <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
              {item.text}
            </code>
          )
        }
        if (item.kind === "strong") return <strong key={key}>{item.text}</strong>
        if (item.kind === "link") {
          const external = item.href.startsWith("http")
          return (
            <a
              key={key}
              href={item.href}
              className="underline underline-offset-2 hover:text-foreground"
              {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
            >
              {item.text}
            </a>
          )
        }
        return <span key={key}>{item.text}</span>
      })}
    </>
  )
}

const HEADING: Record<2 | 3 | 4, string> = {
  2: "mt-8 text-xl font-semibold tracking-tight first:mt-0",
  3: "mt-6 text-lg font-semibold tracking-tight",
  4: "mt-5 text-base font-semibold",
}

export function SchemaProse({ blocks }: { blocks: ProseBlock[] }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-6 text-muted-foreground">
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  )
}

function renderBlock(block: ProseBlock, index: number): ReactNode {
  if (block.kind === "heading") {
    const className = `${HEADING[block.level]} text-foreground`
    if (block.level === 2) {
      return (
        <h2 key={index} className={className}>
          <Inlines items={block.inlines} />
        </h2>
      )
    }
    if (block.level === 3) {
      return (
        <h3 key={index} className={className}>
          <Inlines items={block.inlines} />
        </h3>
      )
    }
    return (
      <h4 key={index} className={className}>
        <Inlines items={block.inlines} />
      </h4>
    )
  }
  if (block.kind === "list") {
    return (
      <ul key={index} className="list-disc space-y-1 pl-5">
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>
            <Inlines items={item} />
          </li>
        ))}
      </ul>
    )
  }
  if (block.kind === "table") {
    return (
      <div key={index} className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-foreground">
              {block.headers.map((cell, cellIndex) => (
                <th key={cellIndex} className="px-2 py-1.5 font-medium">
                  <Inlines items={cell} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/70">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-2 py-1.5 align-top">
                    <Inlines items={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <p key={index}>
      <Inlines items={block.inlines} />
    </p>
  )
}
