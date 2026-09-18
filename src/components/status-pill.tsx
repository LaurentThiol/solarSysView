"use client"

import type { ButtonHTMLAttributes, ReactNode } from "react"

import { worstStatusTone, type StatusTone } from "@/lib/status-tone"
import { cn } from "@/lib/utils"

export type { StatusTone }
export { worstStatusTone }

const TONES: Record<StatusTone, string> = {
  ok: "border-ok/40 bg-ok/15 text-ok",
  warn: "border-warn/40 bg-warn/15 text-warn",
  err: "border-err/40 bg-err/15 text-err",
  info: "border-info/40 bg-info/15 text-info",
  off: "border-border bg-muted/40 text-muted-foreground",
  load: "border-border bg-muted/20 text-muted-foreground",
}

const DOTS: Record<StatusTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  err: "bg-err",
  info: "bg-info",
  off: "bg-muted-foreground/50",
  load: "bg-muted-foreground/40 animate-pulse",
}

export function StatusPill({
  label,
  detail,
  tone,
  dot = true,
  className,
  children,
  ...props
}: {
  label: ReactNode
  detail?: ReactNode
  tone: StatusTone
  dot?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
        TONES[tone],
        className
      )}
      {...props}
    >
      {dot ? <span className={cn("size-1.5 rounded-full", DOTS[tone])} /> : null}
      <span>{label}</span>
      {detail ? <span className="hidden font-normal opacity-80 sm:inline">{detail}</span> : null}
      {children}
    </button>
  )
}
