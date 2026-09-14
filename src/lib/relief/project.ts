export type Camera = {
  yaw: number
  pitch: number
  zoom: number
}

export const DEFAULT_CAMERA: Camera = {
  yaw: 0.78,
  pitch: 0.66,
  zoom: 1,
}

export const PITCH_MIN = 0.22
export const PITCH_MAX = 1.22
export const ZOOM_MIN = 0.42
export const ZOOM_MAX = 2.8

export function clampCamera(camera: Camera): Camera {
  return {
    yaw: camera.yaw,
    pitch: Math.min(PITCH_MAX, Math.max(PITCH_MIN, camera.pitch)),
    zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, camera.zoom)),
  }
}

export type Projected = { x: number; y: number; depth: number }

export function projectPoint(
  x: number,
  y: number,
  z: number,
  camera: Camera,
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

export function fitScale(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  width: number,
  height: number
) {
  const span = Math.max(maxX - minX, maxZ - minZ, 2)
  return (0.42 * Math.min(width, height)) / span
}
