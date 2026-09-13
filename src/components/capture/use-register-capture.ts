"use client"

import { useEffect, useLayoutEffect, useRef } from "react"

import {
  registerCaptureCollector,
  type CaptureCollector,
} from "@/lib/capture/registry"

export function useRegisterCapture(collector: CaptureCollector) {
  const ref = useRef(collector)

  useLayoutEffect(() => {
    ref.current = collector
  })

  useEffect(() => {
    const bound: CaptureCollector = () => ref.current()
    return registerCaptureCollector(bound)
  }, [])
}
