"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  isAltKeyboardEvent,
  isDemagnetizeModifier,
  modifierReleasesMagnet,
  shouldPreventAltKeyDown,
  shouldReleaseAltHold,
  type ModifierSource,
} from "@/lib/chart-draw/magnet"

type Listener = (released: boolean) => void

/**
 * Option / Alt lâche l’aimant à l’arrivée.
 * Sur macOS, preventDefault au keydown retire `altKey` des événements souris,
 * et Safari envoie un keyup au clic. Le bouton « Hors courbe » reste donc
 * un équivalent durable, et le clic mémorise l’état vu au pointerdown.
 */
export function useMagnetHold(active: boolean) {
  const heldRef = useRef(false)
  const stickyRef = useRef(false)
  const pointerDownRef = useRef(false)
  const gestureRef = useRef(false)
  const keyupDeferredRef = useRef(false)
  const releaseOnMoveRef = useRef(false)
  const listenersRef = useRef(new Set<Listener>())
  const [freeArrival, setFreeArrivalState] = useState(false)

  const emit = useCallback(() => {
    const released = modifierReleasesMagnet({
      eventAlt: false,
      held: heldRef.current,
      stickyOff: stickyRef.current,
      gesture: gestureRef.current,
    })
    for (const listener of listenersRef.current) listener(released)
  }, [])

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const endGesture = useCallback(() => {
    gestureRef.current = false
    pointerDownRef.current = false
    if (!keyupDeferredRef.current) return
    keyupDeferredRef.current = false
    // Le keyup est arrivé pendant le clic. On ne coupe l’aimant qu’au
    // prochain déplacement sans Alt : le clic a déjà lu le geste.
    releaseOnMoveRef.current = true
  }, [])

  useEffect(() => {
    if (!active) {
      heldRef.current = false
      pointerDownRef.current = false
      gestureRef.current = false
      keyupDeferredRef.current = false
      releaseOnMoveRef.current = false
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!isAltKeyboardEvent(event)) return
      // Sur macOS, preventDefault ici retire altKey des clics.
      const agent = typeof navigator === "undefined" ? "" : navigator.userAgent
      if (shouldPreventAltKeyDown(agent)) event.preventDefault()
      if (heldRef.current) return
      heldRef.current = true
      emit()
    }

    function onKeyUp(event: KeyboardEvent) {
      if (!isAltKeyboardEvent(event)) return
      let stillDown = false
      try {
        stillDown = event.getModifierState("Alt") || event.getModifierState("AltGraph")
      } catch {
        stillDown = false
      }
      if (!shouldReleaseAltHold({ pointerDown: pointerDownRef.current, stillDown })) {
        if (!stillDown && pointerDownRef.current) keyupDeferredRef.current = true
        event.preventDefault()
        return
      }
      event.preventDefault()
      if (!heldRef.current) return
      heldRef.current = false
      emit()
    }

    function onBlur() {
      if (typeof document !== "undefined" && document.hasFocus()) return
      pointerDownRef.current = false
      gestureRef.current = false
      keyupDeferredRef.current = false
      releaseOnMoveRef.current = false
      if (!heldRef.current) return
      heldRef.current = false
      emit()
    }

    function onPointerDown(event: PointerEvent) {
      pointerDownRef.current = true
      if (isDemagnetizeModifier(event)) heldRef.current = true
      if (isDemagnetizeModifier(event) || heldRef.current || stickyRef.current) {
        gestureRef.current = true
      }
    }

    function onPointerUp() {
      // Le clic est dispatché avant le timer : il lit encore le geste.
      window.setTimeout(() => endGesture(), 0)
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)
    window.addEventListener("pointerdown", onPointerDown, true)
    window.addEventListener("pointerup", onPointerUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
      window.removeEventListener("pointerdown", onPointerDown, true)
      window.removeEventListener("pointerup", onPointerUp)
    }
  }, [active, emit, endGesture])

  const notePointerDown = useCallback((event: ModifierSource) => {
    pointerDownRef.current = true
    if (isDemagnetizeModifier(event)) heldRef.current = true
    gestureRef.current =
      isDemagnetizeModifier(event) || heldRef.current || stickyRef.current
  }, [])

  const notePointerMove = useCallback((event: ModifierSource) => {
    if (isDemagnetizeModifier(event)) {
      releaseOnMoveRef.current = false
      if (!heldRef.current) heldRef.current = true
      return
    }
    if (!releaseOnMoveRef.current) return
    releaseOnMoveRef.current = false
    heldRef.current = false
  }, [])

  const releases = useCallback((event: ModifierSource, override?: boolean) => {
    if (override != null) return override
    return modifierReleasesMagnet({
      eventAlt: isDemagnetizeModifier(event),
      held: heldRef.current,
      stickyOff: stickyRef.current,
      gesture: gestureRef.current,
    })
  }, [])

  const setFreeArrival = useCallback(
    (value: boolean) => {
      stickyRef.current = value
      setFreeArrivalState(value)
      emit()
    },
    [emit]
  )

  return {
    freeArrival,
    setFreeArrival,
    notePointerDown,
    notePointerMove,
    releases,
    endGesture,
    subscribe,
  }
}
