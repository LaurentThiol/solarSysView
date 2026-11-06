"use client"

import { createRoot } from "react-dom/client"

import { RunnerUniverse } from "@/components/brain/run-arcade-universe"
import { captureNodePng, fitImageDataUrl } from "@/lib/capture/png"
import {
  CAPTURE_DRAW_TIMEOUT_MS,
  releaseCaptureSlot,
  tryCaptureSlot,
  waitBounded,
} from "@/lib/run-arcade/capture-bound"
import type { ThoughtDraw } from "@/lib/run-arcade/thought"

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

/**
 * Image d’une pensée pour le modèle de vision local. Le dessin est rendu à part,
 * depuis le passé que lit le prompt, puis retiré de la page.
 * Série longue : l’image montre le bout, vingt tirages, sans le curseur.
 * Les derniers tirages y sont plus espacés que le début.
 * Borne propre : passé `CAPTURE_DRAW_TIMEOUT_MS`, l’hôte est démonté et le résultat est `null`.
 * Au plus une capture en attente : un appel pendant une capture rend `null`, sans monter un second hôte.
 */
export async function captureDraw(runnerId: string, draw: ThoughtDraw): Promise<string | null> {
  if (!tryCaptureSlot()) return null
  const host = document.createElement("div")
  host.setAttribute("aria-hidden", "true")
  host.style.cssText = "position:fixed;left:0;top:0;width:960px;z-index:-1;pointer-events:none"
  document.body.appendChild(host)
  const root = createRoot(host)
  const work = (async (): Promise<string | null> => {
    try {
      root.render(
        <RunnerUniverse runnerId={`${runnerId}-vision`} thought={draw} pan={false} />
      )
      await nextFrame()
      const png = await captureNodePng(host)
      return png ? await fitImageDataUrl(png) : null
    } catch {
      return null
    }
  })()
  try {
    return await waitBounded(work, CAPTURE_DRAW_TIMEOUT_MS)
  } catch {
    return null
  } finally {
    root.unmount()
    host.remove()
    releaseCaptureSlot()
  }
}
