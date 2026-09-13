import type { CaptureContext } from "@/lib/capture/snapshot"

export type CaptureCollector = () => CaptureContext | Promise<CaptureContext>

let collector: CaptureCollector | null = null

export function registerCaptureCollector(fn: CaptureCollector) {
  collector = fn
  return () => {
    if (collector === fn) collector = null
  }
}

export function getCaptureCollector() {
  return collector
}
