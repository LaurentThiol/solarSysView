export type Camera = {
  yaw: number
  pitch: number
  zoom: number
  panX: number
  panY: number
}

export type CameraInput = {
  yaw: number
  pitch: number
  zoom: number
  panX?: number
  panY?: number
}

export const DEFAULT_CAMERA: Camera = {
  yaw: 0.62,
  pitch: 0.72,
  zoom: 1,
  panX: 0,
  panY: 0,
}

export const PLAN_CAMERA: Camera = {
  yaw: 0,
  pitch: 1.18,
  zoom: 1.05,
  panX: 0,
  panY: 0,
}

export const PITCH_MIN = 0.22
export const PITCH_MAX = 1.22
export const ZOOM_MIN = 0.42
export const ZOOM_MAX = 14
export const PAN_MAX = 2800

export function clampCamera(camera: CameraInput): Camera {
  return {
    yaw: camera.yaw,
    pitch: Math.min(PITCH_MAX, Math.max(PITCH_MIN, camera.pitch)),
    zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, camera.zoom)),
    panX: Math.min(PAN_MAX, Math.max(-PAN_MAX, camera.panX ?? 0)),
    panY: Math.min(PAN_MAX, Math.max(-PAN_MAX, camera.panY ?? 0)),
  }
}

/** Home zoom: 100/200 start closer to the n1→n5 drawing. */
export function homeZoom(sample: number, style: "scene" | "plan" = "scene"): number {
  const n = Math.max(1, sample)
  let z = 1
  if (n >= 200) z = 1.38
  else if (n >= 100) z = 1.22
  else if (n >= 50) z = 1.08
  if (style === "plan") z *= 1.06
  return Math.min(ZOOM_MAX, z)
}

export function homeCamera(style: "scene" | "plan", sample = 20): Camera {
  const base = style === "plan" ? PLAN_CAMERA : DEFAULT_CAMERA
  return clampCamera({
    ...base,
    zoom: homeZoom(sample, style),
    panX: 0,
    panY: 0,
  })
}

export type Projected = { x: number; y: number; depth: number }

export function projectPoint(
  x: number,
  y: number,
  z: number,
  camera: CameraInput,
  cx: number,
  cy: number,
  scale: number
): Projected {
  const cosY = Math.cos(camera.yaw)
  const sinY = Math.sin(camera.yaw)
  const cosP = Math.cos(camera.pitch)
  const sinP = Math.sin(camera.pitch)
  const x1 = x * cosY - z * sinY
  const z1 = x * sinY + z * cosY
  const y1 = y * cosP - z1 * sinP
  const z2 = y * sinP + z1 * cosP
  const persp = 1 / Math.max(0.35, 1 + z2 * 0.018)
  const s = scale * camera.zoom * persp
  return { x: cx + x1 * s, y: cy - y1 * s, depth: z2 }
}

export function depthOfQuad(
  ax: number,
  az: number,
  cx: number,
  cz: number,
  yaw: number
) {
  const mx = (ax + cx) / 2
  const mz = (az + cz) / 2
  return mx * Math.sin(yaw) + mz * Math.cos(yaw)
}

/**
 * Fit the XZ box in the canvas. A long time axis (100/200 tirages) must not
 * shrink n1→n5 to a few pixels: size the rank axis, let time overflow.
 */
export function fitScale(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  width: number,
  height: number
) {
  const spanX = Math.max(maxX - minX, 0.6)
  const spanZ = Math.max(maxZ - minZ, 0.6)
  const sx = (0.86 * width) / spanX
  const sz = (0.78 * height) / spanZ
  const packed = Math.min(sx, sz)
  const aspect = spanZ / spanX
  if (aspect < 12) return packed
  const targetZ = Math.min(spanZ, spanX * 7.4)
  const byZ = (0.82 * height) / targetZ
  const byX = (0.62 * width) / spanX
  return Math.min(byX, byZ)
}

/**
 * When the unzoomed scale crops the time axis, look at the newest slice
 * (independent of zoom, so wheel zoom does not slide the look-at).
 */
export function focusPoint(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  scale: number,
  height: number
): { midX: number; midZ: number } {
  const midX = (minX + maxX) / 2
  const spanZ = Math.max(maxZ - minZ, 0.6)
  const visibleZ = (0.9 * height) / Math.max(scale, 1e-6)
  if (visibleZ >= spanZ * 0.94) {
    return { midX, midZ: (minZ + maxZ) / 2 }
  }
  return { midX, midZ: maxZ - visibleZ * 0.42 }
}

/** Zoom around a canvas point: the world under the cursor stays put. */
export function zoomToward(
  camera: CameraInput,
  factor: number,
  cursorX: number,
  cursorY: number,
  cx: number,
  cy: number
): Camera {
  const prev = clampCamera(camera)
  const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev.zoom * factor))
  const k = nextZoom / prev.zoom
  const localX = cursorX - cx - prev.panX
  const localY = cursorY - cy - prev.panY
  return clampCamera({
    ...prev,
    zoom: nextZoom,
    panX: prev.panX + localX * (1 - k),
    panY: prev.panY + localY * (1 - k),
  })
}

/** Hauteur cible ≈ 36 % de l’emprise, pour que le relief se lise quelle que soit la maille. */
export function autoExaggeration(maxH: number, spanX: number, spanZ: number, user = 1) {
  const span = Math.max(spanX, spanZ, 1)
  const target = 0.36 * span
  const base = maxH > 0 ? target / maxH : 1
  return base * user
}
