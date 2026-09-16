"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

type CoachStep = {
  id: string
  target: string
  title: string
  body: string
}

function placePanel(anchor: HTMLElement, panel: HTMLElement | null, width: number) {
  const rect = anchor.getBoundingClientRect()
  const pad = 8
  let left = rect.left + rect.width / 2 - width / 2
  left = Math.max(pad, Math.min(left, window.innerWidth - width - pad))

  const panelHeight = panel?.offsetHeight ?? 140
  const spaceBelow = window.innerHeight - rect.bottom - pad
  const spaceAbove = rect.top - pad
  const showBelow = spaceBelow >= panelHeight || (spaceBelow >= spaceAbove && spaceBelow >= 88)

  if (showBelow) {
    const top = rect.bottom + 10
    return { top, left, maxHeight: Math.min(280, Math.max(88, window.innerHeight - top - pad)) }
  }

  const maxHeight = Math.min(280, Math.max(88, spaceAbove))
  const used = Math.min(panelHeight, maxHeight)
  return { top: Math.max(pad, rect.top - 10 - used), left, maxHeight }
}

export function DemoCoach({
  stepId,
  steps,
}: {
  stepId: string | null
  steps: readonly CoachStep[]
}) {
  const current = steps.find((item) => item.id === stepId) ?? null
  const panelRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState({ top: 0, left: 0, maxHeight: 240 })
  const width = 340

  useLayoutEffect(() => {
    if (!current) return
    const update = () => {
      const anchor = document.querySelector(`[data-demo="${current.target}"]`)
      if (!(anchor instanceof HTMLElement)) return
      setCoords(placePanel(anchor, panelRef.current, width))
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
  }, [current])

  if (!current || typeof document === "undefined") return null

  const index = steps.findIndex((item) => item.id === current.id)

  return createPortal(
    <div
      ref={panelRef}
      role="status"
      aria-live="polite"
      aria-label={`${current.title} — étape ${index + 1} sur ${steps.length}`}
      style={{
        top: coords.top,
        left: coords.left,
        width,
        maxHeight: coords.maxHeight,
      }}
      className="fixed z-[210] overflow-auto rounded-xl border border-primary/40 bg-popover p-3 text-popover-foreground shadow-xl ring-1 ring-primary/25"
    >
      <p className="text-[10px] font-medium tracking-wide text-primary uppercase">
        {index + 1} / {steps.length}
      </p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{current.title}</p>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{current.body}</p>
    </div>,
    document.body
  )
}
