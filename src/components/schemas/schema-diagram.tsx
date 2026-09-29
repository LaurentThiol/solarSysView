"use client"

import { useEffect, useId, useState } from "react"

let queue: Promise<void> = Promise.resolve()

function draw(id: string, source: string) {
  const run = queue.then(async () => {
    const mermaid = (await import("mermaid")).default
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "dark",
      fontFamily: "var(--font-sans), ui-sans-serif, sans-serif",
      logLevel: "error",
    })
    return mermaid.render(id, source)
  })
  queue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export function SchemaDiagram({ source, label }: { source: string; label: string }) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "")
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSvg(null)
    setError(null)
    draw(`schema${reactId}`, source)
      .then((result) => {
        if (cancelled) return
        if (/<script/i.test(result.svg)) {
          setError("Schéma refusé.")
          return
        }
        setSvg(result.svg)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Schéma illisible.")
      })
    return () => {
      cancelled = true
    }
  }, [reactId, source])

  return (
    <figure className="my-6 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10" aria-label={label}>
      <figcaption className="px-4 pt-3 text-xs text-muted-foreground">{label}</figcaption>
      <div className="overflow-x-auto px-2 pb-4" aria-busy={svg == null && error == null}>
        {error ? (
          <p className="px-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : svg ? (
          <div
            className="schema-diagram min-w-[42rem] [&_svg]:h-auto [&_svg]:max-w-none"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <p className="px-2 py-6 text-sm text-muted-foreground">Tracé du schéma…</p>
        )}
      </div>
    </figure>
  )
}
