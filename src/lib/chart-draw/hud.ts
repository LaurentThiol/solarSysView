/** Position de la carte détachée : clampée au viewport, jamais collée au curseur. */

export const HUD_PAD = 8
export const HUD_WIDTH = 288
export const HUD_HEIGHT = 200

export function clampHudPosition(input: {
  x: number
  y: number
  width?: number
  height?: number
  viewW: number
  viewH: number
  pad?: number
}): { x: number; y: number } {
  const width = input.width ?? HUD_WIDTH
  const height = input.height ?? HUD_HEIGHT
  const pad = input.pad ?? HUD_PAD
  const maxLeft = Math.max(pad, input.viewW - width - pad)
  const maxTop = Math.max(pad, input.viewH - height - pad)
  return {
    x: Math.min(maxLeft, Math.max(pad, input.x)),
    y: Math.min(maxTop, Math.max(pad, input.y)),
  }
}
