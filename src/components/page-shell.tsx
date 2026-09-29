import type { ReactNode } from "react"

import { FDJ_ARCHIVE_URL } from "@/lib/copy"
import { cn } from "@/lib/utils"

export function PageNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "mt-3 max-w-2xl rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground",
        className
      )}
    >
      {children}
    </p>
  )
}

export function FdjFooter() {
  return (
    <footer className="border-t border-border">
      <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
        Archives FDJ :{" "}
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href={FDJ_ARCHIVE_URL}
        >
          fdj.fr
        </a>
        .
      </p>
    </footer>
  )
}

export function PageShell({
  title,
  subtitle,
  description,
  note,
  notice,
  children,
  footer = true,
  compact = false,
  wide = false,
  className,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  description?: ReactNode
  note?: ReactNode
  notice?: ReactNode
  children: ReactNode
  footer?: boolean
  compact?: boolean
  wide?: boolean
  className?: string
}) {
  const intro = subtitle ?? description
  const aside = note ?? notice
  const hasIntro = title != null || intro != null || aside != null
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip", className)}>
      {hasIntro ? (
        <div
          className={cn(
            "mx-auto w-full min-w-0 px-4 sm:px-6",
            wide ? "max-w-[92rem]" : "max-w-6xl",
            compact ? "pt-3 pb-0" : "pt-6 sm:pt-8 pb-0"
          )}
        >
          {title != null ? (
            <h1
              className={cn(
                "font-semibold tracking-tight",
                compact ? "text-2xl" : "text-2xl sm:text-3xl"
              )}
            >
              {title}
            </h1>
          ) : null}
          {intro != null ? (
            <div className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{intro}</div>
          ) : null}
          {aside != null ? <PageNote>{aside}</PageNote> : null}
        </div>
      ) : null}
      <main
        id="contenu"
        className={cn(
          "mx-auto w-full min-w-0 flex-1 px-4 pb-12 sm:px-6",
          wide ? "max-w-[92rem]" : "max-w-6xl",
          hasIntro ? "pt-6" : "pt-6"
        )}
      >
        {children}
      </main>
      {footer ? <FdjFooter /> : null}
    </div>
  )
}
