"use client"

import { createRoot } from "react-dom/client"

import { RunnerUniverse } from "@/components/brain/run-arcade-universe"
import { captureNodePng, fitImageDataUrl } from "@/lib/capture/png"
import type { ThoughtDraw } from "@/lib/run-arcade/thought"

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

/**
 * Image d’une pensée pour le modèle de vision local. Le dessin est rendu à part,
 * depuis le passé que lit le prompt, puis retiré de la page.
 * Série longue : l’image montre le bout, vingt tirages, sans le curseur.
 */
export async function captureDraw(runnerId: string, draw: ThoughtDraw): Promise<string | null> {
  const host = document.createElement("div")
  host.setAttribute("aria-hidden", "true")
  host.style.cssText = "position:fixed;left:0;top:0;width:380px;height:224px;z-index:-1;pointer-events:none"
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    root.render(
      <RunnerUniverse runnerId={`${runnerId}-vision`} thought={draw} pan={false} className="h-[224px] w-[380px]" />
    )
    await nextFrame()
    const png = await captureNodePng(host)
    return png ? await fitImageDataUrl(png) : null
  } catch {
    return null
  } finally {
    root.unmount()
    host.remove()
  }
}
