import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

const FDJ_HREF =
  "https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/historique"

export function PageShell({
  title,
  description,
  notice,
  children,
  footer = true,
  compact = false,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  notice?: ReactNode
  children: ReactNode
  footer?: boolean
  compact?: boolean
  className?: string
}) {
  const hasIntro = title != null || description != null || notice != null
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip",
        className
      )}
    >
      {hasIntro ? (
        <div
          className={cn(
            "mx-auto w-full min-w-0 max-w-6xl px-4 sm:px-6",
            compact ? "py-3" : "py-6 sm:py-8"
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
          {description != null ? (
            <div className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </div>
          ) : null}
          {notice != null ? (
            <div className="mt-3 max-w-2xl rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {notice}
            </div>
          ) : null}
        </div>
      ) : null}
      <main
        className={cn(
          "mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-12 sm:px-6",
          !hasIntro && "pt-6"
        )}
      >
        {children}
      </main>
      {footer ? (
        <footer className="border-t border-border">
          <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground sm:px-6">
            Archives FDJ :{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href={FDJ_HREF}
            >
              fdj.fr
            </a>
            .
          </p>
        </footer>
      ) : null}
    </div>
  )
}
