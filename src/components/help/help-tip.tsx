"use client"

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"

import { useHelpMode } from "@/components/help/help-mode"
import { cn } from "@/lib/utils"

export type HelpItem = {
  label: string
  text: string
}

export type HelpCopy = {
  title: string
  body: string
  items?: HelpItem[]
  /** Wider popover for a multi-paragraph help sheet. */
  wide?: boolean
}

const PANEL_NARROW = 320
const PANEL_WIDE = 380

function placePanel(
  button: HTMLElement,
  panel: HTMLElement | null,
  panelWidth: number,
  maxCap: number
): { top: number; left: number; maxHeight: number } {
  const rect = button.getBoundingClientRect()
  const pad = 8
  let left = rect.left + rect.width / 2 - panelWidth / 2
  left = Math.max(pad, Math.min(left, window.innerWidth - panelWidth - pad))

  const panelHeight = panel?.offsetHeight ?? 160
  const spaceBelow = window.innerHeight - rect.bottom - pad
  const spaceAbove = rect.top - pad
  const showBelow =
    spaceBelow >= panelHeight || (spaceBelow >= spaceAbove && spaceBelow >= 96)

  if (showBelow) {
    const top = rect.bottom + 6
    return {
      top,
      left,
      maxHeight: Math.min(maxCap, Math.max(96, window.innerHeight - top - pad)),
    }
  }

  const maxHeight = Math.min(maxCap, Math.max(96, spaceAbove))
  const used = Math.min(panelHeight, maxHeight)
  return {
    top: Math.max(pad, rect.top - 6 - used),
    left,
    maxHeight,
  }
}

function HelpBody({ body }: { body: string }) {
  const paragraphs = body.trim().split(/\n\n+/)
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p
          key={index}
          className="mt-1.5 text-xs leading-5 whitespace-pre-line text-muted-foreground"
        >
          {paragraph}
        </p>
      ))}
    </>
  )
}

export function HelpTip({
  title,
  body,
  items,
  wide,
  className,
}: HelpCopy & { className?: string }) {
  const uid = useId()
  const { enabled, openId, setOpenId } = useHelpMode()
  const open = openId === uid
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState({ top: 0, left: 0, maxHeight: 320 })
  const panelWidth = wide ? PANEL_WIDE : PANEL_NARROW
  const maxCap = wide ? 520 : 480

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const update = () => {
      if (!btnRef.current) return
      setCoords(placePanel(btnRef.current, panelRef.current, panelWidth, maxCap))
    }
    update()
    const frame = window.requestAnimationFrame(update)
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [open, title, body, items, panelWidth, maxCap])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const node = event.target as Node
      if (btnRef.current?.contains(node) || panelRef.current?.contains(node)) return
      setOpenId(null)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open, setOpenId])

  if (!enabled) return null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-amber-400/70 bg-amber-400/20 text-[10px] font-bold leading-none text-amber-100 transition-colors hover:bg-amber-400/35 focus-visible:ring-2 focus-visible:ring-amber-300/60 focus-visible:outline-none",
          open && "bg-amber-400/45 ring-2 ring-amber-300/40",
          className
        )}
        aria-label={`Aide : ${title}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`${title} — cliquer pour la fenêtre d’aide`}
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpenId(open ? null : uid)
        }}
      >
        !
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={title}
              style={{
                top: coords.top,
                left: coords.left,
                width: panelWidth,
                maxHeight: coords.maxHeight,
              }}
              className="fixed z-[200] overflow-auto rounded-lg border border-amber-400/35 bg-popover p-3 text-popover-foreground shadow-xl ring-1 ring-amber-400/20"
            >
              <p className="text-sm font-medium text-foreground">{title}</p>
              <HelpBody body={body} />
              {items?.length ? (
                <dl className="mt-2.5 space-y-2">
                  {items.map((item) => (
                    <div key={item.label}>
                      <dt className="text-xs font-medium text-foreground">{item.label}</dt>
                      <dd className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        {item.text}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </>
  )
}

export function WithHelp({
  help,
  children,
  className,
}: {
  help: HelpCopy
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <div className="min-w-0 flex-1">{children}</div>
      <HelpTip {...help} />
    </div>
  )
}

export function LabelHelp({
  label,
  help,
  children,
  className,
  row = false,
}: {
  label: ReactNode
  help: HelpCopy
  children: ReactNode
  className?: string
  row?: boolean
}) {
  return (
    <label
      className={cn(
        row
          ? "flex items-center gap-2 text-sm"
          : "flex flex-col gap-1 text-xs text-muted-foreground",
        className
      )}
    >
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {label}
        <HelpTip {...help} />
      </span>
      {children}
    </label>
  )
}

export function HelpWrap({
  help,
  children,
  className,
}: {
  help: HelpCopy
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn("relative inline-flex pr-2.5 pt-1", className)}>
      {children}
      <span className="absolute top-0 right-0 z-10">
        <HelpTip {...help} />
      </span>
    </span>
  )
}

export function TitleHelp({
  children,
  help,
  className,
}: {
  children: ReactNode
  help: HelpCopy
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {children}
      <HelpTip {...help} />
    </span>
  )
}
