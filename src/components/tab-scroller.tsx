import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Horizontal tab strip that scrolls on narrow viewports instead of wrapping. */
export function TabScroller({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "-mx-4 flex flex-nowrap gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:thin] sm:mx-0 sm:px-0",
        className
      )}
    >
      {children}
    </nav>
  )
}
