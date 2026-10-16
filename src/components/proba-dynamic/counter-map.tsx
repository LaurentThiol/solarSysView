"use client"

import { useEffect, useRef, useState } from "react"

import { HelpTip } from "@/components/help"
import { FractalReadout } from "@/components/proba-dynamic/fractal-readout"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatFr } from "@/lib/frequency-board"
import { MAP_SCALE_LABELS, mapViewYaw, type ProbaMap } from "@/lib/proba-map"
import { PROBA_DYNAMIC_HELP, mapPhrase } from "@/lib/proba-dynamic-help"
import { PROBA_FLOOR_OFF, probaFloorDelay, type ProbaKind } from "@/lib/proba-dynamic"
import { cn } from "@/lib/utils"

/** Repère du relief. synchro/fractal/boxcount.py reprend ces trois valeurs. */
const X_SPAN = 2.4
const Z_SPAN = 1.15
const Y_GAIN = 1.15
const MIN_DIST = 0.07
const MAX_DIST = 36
/** Un cran de molette (~100 px) rapproche d’environ un tiers. */
const ZOOM_WHEEL = 0.0036
const DEFAULT_YAW = -0.72
/**
 * Assez haut pour lire la pente en profondeur.
 * À 0.58 le relief est une falaise : somme et moyenne ont la même crête,
 * brut n’est qu’un filet. 1.02 montre le bord bas de la somme et la rampe du brut.
 */
const DEFAULT_PITCH = 1.02

function lawDelay(kind: ProbaKind) {
  return kind === "number" ? 9 : 5
}

type Pin = { kind: ProbaKind; value: number }
type Hover = { left: number; top: number; phrase: string }
type Camera = { yaw: number; pitch: number; dist: number }

function formatMapDate(isoDate: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${isoDate.slice(0, 10)}T12:00:00`))
}

function cssRgb(token: string): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim() || "gray"
  const probe = document.createElement("canvas")
  probe.width = 1
  probe.height = 1
  const ctx = probe.getContext("2d", { willReadFrequently: true })
  if (!ctx) return [0.5, 0.5, 0.5]
  ctx.fillStyle = "#000"
  ctx.fillStyle = raw
  ctx.fillRect(0, 0, 1, 1)
  const pixel = ctx.getImageData(0, 0, 1, 1).data
  return [pixel[0] / 255, pixel[1] / 255, pixel[2] / 255]
}

function Saw({
  series,
  expected,
  tone,
}: {
  series: readonly number[]
  expected: number | null
  tone: ProbaKind
}) {
  if (series.length === 0) return null
  const width = 640
  const height = 72
  const peak = Math.max(1, expected ?? 0, ...series)
  const xOf = (index: number) => (series.length === 1 ? 0 : (index / (series.length - 1)) * width)
  const yOf = (value: number) => height - 4 - (value / peak) * (height - 10)
  const path = series
    .map((value, index) => `${index === 0 ? "M" : "L"}${xOf(index).toFixed(2)},${yOf(value).toFixed(2)}`)
    .join(" ")
  const yExpected = expected == null ? null : yOf(expected)
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-16 w-full", tone === "star" ? "text-[var(--star)]" : "text-[var(--chart-2)]")}
      role="img"
      aria-label="Dent de scie brute du compteur épinglé"
    >
      {yExpected != null ? (
        <line
          x1="0"
          x2={width}
          y1={yExpected}
          y2={yExpected}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          strokeWidth="1"
        />
      ) : null}
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function multiply(a: Float32Array, b: Float32Array) {
  const out = new Float32Array(16)
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3]
    }
  }
  return out
}

function perspective(fov: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fov / 2)
  const nf = 1 / (near - far)
  const out = new Float32Array(16)
  out[0] = f / aspect
  out[5] = f
  out[10] = (far + near) * nf
  out[11] = -1
  out[14] = 2 * far * near * nf
  return out
}

function lookAt(eye: readonly number[], target: readonly number[]) {
  let zx = eye[0] - target[0]
  let zy = eye[1] - target[1]
  let zz = eye[2] - target[2]
  const zLen = Math.hypot(zx, zy, zz) || 1
  zx /= zLen
  zy /= zLen
  zz /= zLen
  // up = (0, 1, 0). x = up × z, y = z × x.
  let xx = zz
  let xy = 0
  let xz = -zx
  const xLen = Math.hypot(xx, xy, xz) || 1
  xx /= xLen
  xy /= xLen
  xz /= xLen
  const yx = zy * xz - zz * xy
  const yy = zz * xx - zx * xz
  const yz = zx * xy - zy * xx
  const out = new Float32Array(16)
  out[0] = xx
  out[1] = yx
  out[2] = zx
  out[4] = xy
  out[5] = yy
  out[6] = zy
  out[8] = xz
  out[9] = yz
  out[10] = zz
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2])
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2])
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2])
  out[15] = 1
  return out
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error("shader")
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "Compilation du relief impossible."
    gl.deleteShader(shader)
    throw new Error(log)
  }
  return shader
}

function link(gl: WebGL2RenderingContext, vertex: WebGLShader, fragment: WebGLShader) {
  const program = gl.createProgram()
  if (!program) throw new Error("program")
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || "Lien du relief impossible."
    gl.deleteProgram(program)
    throw new Error(log)
  }
  return program
}

const SURFACE_VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in float aPin;
layout(location = 3) in vec2 aIndex;
uniform mat4 uMvp;
uniform float uYGain;
out vec3 vNormal;
out float vCharge;
out float vPin;
out vec2 vIndex;
void main() {
  vNormal = aNormal;
  vCharge = aPos.y / uYGain;
  vPin = aPin;
  vIndex = aIndex;
  gl_Position = uMvp * vec4(aPos, 1.0);
}`

const SURFACE_FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in float vCharge;
in float vPin;
out vec4 fragColor;
uniform vec3 uLow;
uniform vec3 uHot;
uniform vec3 uOver;
uniform vec3 uPin;
uniform vec3 uLight;
void main() {
  vec3 color = vCharge >= 1.0
    ? uOver
    : mix(uLow, uHot, sqrt(clamp(vCharge, 0.0, 1.0)));
  float nLen = length(vNormal);
  float shade = nLen < 1e-4
    ? 1.0
    : 0.72 + 0.28 * clamp(dot(vNormal / nLen, normalize(uLight)), 0.0, 1.0);
  color *= shade;
  if (vPin > 0.5) color = mix(color, uPin, 0.78);
  fragColor = vec4(color, 1.0);
}`

const PICK_FRAG = `#version 300 es
precision highp float;
in vec2 vIndex;
uniform float uColumns;
uniform float uSlots;
out vec4 fragColor;
void main() {
  float column = clamp(floor(vIndex.x + 0.5), 0.0, uColumns - 1.0);
  float slot = clamp(floor(vIndex.y + 0.5), 0.0, uSlots - 1.0);
  float high = floor(column / 256.0);
  float low = column - high * 256.0;
  fragColor = vec4(low / 255.0, high / 255.0, slot / 255.0, 1.0);
}`

const FLAT_VERT = `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uMvp;
uniform float uPointSize;
void main() {
  gl_Position = uMvp * vec4(aPos, 1.0);
  gl_PointSize = uPointSize;
}`

const FLAT_FRAG = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 fragColor;
void main() {
  fragColor = uColor;
}`

export function CounterMap({
  map,
  pinned,
  onPin,
  floorDelay,
  onFloor,
}: {
  map: ProbaMap
  pinned: Pin | null
  onPin: (kind: ProbaKind, value: number) => void
  floorDelay?: number
  onFloor: (delay: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<Camera>({ yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, dist: 3.4 })
  const frameRef = useRef<Camera>({ yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, dist: 3.4 })
  const framedKey = useRef("")
  const drawRef = useRef<() => void>(() => {})
  const onPinRef = useRef(onPin)
  const [hover, setHover] = useState<Hover | null>(null)
  const [phrase, setPhrase] = useState("Glisser pour tourner, molette pour zoomer.")
  const [failed, setFailed] = useState<string | null>(null)
  const pinBall = pinned?.kind === map.kind ? pinned.value : null
  const resolvedFloor = floorDelay ?? lawDelay(map.kind)
  const floorShown = probaFloorDelay(resolvedFloor)
  const floorRef = useRef(resolvedFloor)

  useEffect(() => {
    onPinRef.current = onPin
  }, [onPin])

  useEffect(() => {
    floorRef.current = resolvedFloor
    drawRef.current()
  }, [resolvedFloor])

  useEffect(() => {
    let cancelled = false
    const report = (message: string | null) => {
      window.setTimeout(() => {
        if (!cancelled) setFailed(message)
      }, 0)
    }
    const canvas = canvasRef.current
    if (!canvas || map.columns.length < 2 || map.columns[0].length < 2) return
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      depth: true,
      preserveDrawingBuffer: true,
    })
    if (!gl) {
      report("Ce navigateur ne trace pas la carte (WebGL2).")
      return () => {
        cancelled = true
      }
    }
    report(null)

    const tCount = map.columns.length
    const zCount = map.columns[0].length
    const count = tCount * zCount
    let peak = Math.max(1, map.expected)
    const positions = new Float32Array(count * 3)
    const pins = new Float32Array(count)
    const indices2 = new Float32Array(count * 2)
    for (let column = 0; column < tCount; column += 1) {
      for (let slot = 0; slot < zCount; slot += 1) {
        const cell = map.columns[column][slot]
        const vertex = column * zCount + slot
        const x = tCount === 1 ? 0 : -X_SPAN / 2 + (column / (tCount - 1)) * X_SPAN
        const z = zCount === 1 ? 0 : -Z_SPAN / 2 + (slot / (zCount - 1)) * Z_SPAN
        positions[vertex * 3] = x
        positions[vertex * 3 + 1] = cell.charge * Y_GAIN
        positions[vertex * 3 + 2] = z
        pins[vertex] = cell.ball === pinBall ? 1 : 0
        indices2[vertex * 2] = column
        indices2[vertex * 2 + 1] = slot
        if (cell.charge > peak) peak = cell.charge
      }
    }
    const normals = new Float32Array(count * 3)
    const at = (column: number, slot: number) => {
      const vertex = (column * zCount + slot) * 3
      return [positions[vertex], positions[vertex + 1], positions[vertex + 2]]
    }
    for (let column = 0; column < tCount; column += 1) {
      for (let slot = 0; slot < zCount; slot += 1) {
        const left = at(Math.max(0, column - 1), slot)
        const right = at(Math.min(tCount - 1, column + 1), slot)
        const back = at(column, Math.max(0, slot - 1))
        const front = at(column, Math.min(zCount - 1, slot + 1))
        const tx = [right[0] - left[0], right[1] - left[1], right[2] - left[2]]
        const tz = [front[0] - back[0], front[1] - back[1], front[2] - back[2]]
        let normal = [
          tx[1] * tz[2] - tx[2] * tz[1],
          tx[2] * tz[0] - tx[0] * tz[2],
          tx[0] * tz[1] - tx[1] * tz[0],
        ]
        if (normal[1] < 0) normal = [-normal[0], -normal[1], -normal[2]]
        const length = Math.hypot(normal[0], normal[1], normal[2])
        if (length < 1e-8) normal = [0, 1, 0]
        else normal = [normal[0] / length, normal[1] / length, normal[2] / length]
        const vertex = (column * zCount + slot) * 3
        normals[vertex] = normal[0]
        normals[vertex + 1] = normal[1]
        normals[vertex + 2] = normal[2]
      }
    }
    const indexCount = (tCount - 1) * (zCount - 1) * 6
    const elements = new Uint32Array(indexCount)
    let cursor = 0
    for (let column = 0; column < tCount - 1; column += 1) {
      for (let slot = 0; slot < zCount - 1; slot += 1) {
        const a = column * zCount + slot
        const b = a + 1
        const c = a + zCount
        const d = c + 1
        elements[cursor++] = a
        elements[cursor++] = c
        elements[cursor++] = b
        elements[cursor++] = b
        elements[cursor++] = c
        elements[cursor++] = d
      }
    }
    const height = Math.max(peak, map.expected, 1) * Y_GAIN
    const radius = Math.hypot(X_SPAN / 2, height * 0.55, Z_SPAN / 2)
    const framed: Camera = {
      yaw: mapViewYaw(DEFAULT_YAW),
      pitch: DEFAULT_PITCH,
      dist: Math.min(28, Math.max(2.4, (radius / Math.tan(0.45)) * 1.05)),
    }
    frameRef.current = framed
    const frameKey = `${map.placement}:${map.scale}:${map.kind}:${map.dates.length}:${map.dates[0] ?? ""}:${map.dates.at(-1) ?? ""}`
    if (framedKey.current !== frameKey) {
      framedKey.current = frameKey
      cameraRef.current = { ...framed }
    }
    const targetY = Math.min(height * 0.35, 0.8)

    const yPlane = map.expected * Y_GAIN
    const plane = new Float32Array([
      -X_SPAN / 2, yPlane, -Z_SPAN / 2,
      X_SPAN / 2, yPlane, -Z_SPAN / 2,
      X_SPAN / 2, yPlane, Z_SPAN / 2,
      -X_SPAN / 2, yPlane, -Z_SPAN / 2,
      X_SPAN / 2, yPlane, Z_SPAN / 2,
      -X_SPAN / 2, yPlane, Z_SPAN / 2,
    ])

    let surfaceProgram: WebGLProgram | null = null
    let pickProgram: WebGLProgram | null = null
    let flatProgram: WebGLProgram | null = null
    try {
      const surfaceVert = compile(gl, gl.VERTEX_SHADER, SURFACE_VERT)
      const surfaceFrag = compile(gl, gl.FRAGMENT_SHADER, SURFACE_FRAG)
      const pickFrag = compile(gl, gl.FRAGMENT_SHADER, PICK_FRAG)
      const flatVert = compile(gl, gl.VERTEX_SHADER, FLAT_VERT)
      const flatFrag = compile(gl, gl.FRAGMENT_SHADER, FLAT_FRAG)
      surfaceProgram = link(gl, surfaceVert, surfaceFrag)
      pickProgram = link(gl, surfaceVert, pickFrag)
      flatProgram = link(gl, flatVert, flatFrag)
      gl.deleteShader(surfaceVert)
      gl.deleteShader(surfaceFrag)
      gl.deleteShader(pickFrag)
      gl.deleteShader(flatVert)
      gl.deleteShader(flatFrag)
    } catch (error) {
      report(error instanceof Error ? error.message : "La carte n’a pas pu être tracée.")
      return () => {
        cancelled = true
      }
    }

    const buffer = (target: number, data: BufferSource) => {
      const id = gl.createBuffer()
      gl.bindBuffer(target, id)
      gl.bufferData(target, data, gl.STATIC_DRAW)
      return id
    }
    const positionBuffer = buffer(gl.ARRAY_BUFFER, positions)
    const normalBuffer = buffer(gl.ARRAY_BUFFER, normals)
    const pinBuffer = buffer(gl.ARRAY_BUFFER, pins)
    const indexAttr = buffer(gl.ARRAY_BUFFER, indices2)
    const elementBuffer = buffer(gl.ELEMENT_ARRAY_BUFFER, elements)
    const planeBuffer = buffer(gl.ARRAY_BUFFER, plane)

    const colorTex = gl.createTexture()
    const depthRb = gl.createRenderbuffer()
    const pickFbo = gl.createFramebuffer()
    const low = cssRgb("--muted")
    const hot = cssRgb(map.kind === "star" ? "--star" : "--chart-2")
    const over = cssRgb("--destructive")
    const pin = cssRgb("--chart-1")
    const mark = cssRgb("--foreground")
    const background = cssRgb("--canvas")
    const planeColor = cssRgb("--muted-foreground")
    const markBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, markBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, 18 * 4, gl.DYNAMIC_DRAW)
    let hoverCell: { column: number; slot: number } | null = null

    const cellCorner = (column: number, slot: number, stepColumn: number, stepSlot: number) => {
      const nextColumn = Math.min(tCount - 1, Math.max(0, column + stepColumn))
      const nextSlot = Math.min(zCount - 1, Math.max(0, slot + stepSlot))
      const here = (column * zCount + slot) * 3
      const there = (nextColumn * zCount + nextSlot) * 3
      if (nextColumn === column && nextSlot === slot) {
        const dx = stepColumn === 0 ? 0 : Math.sign(stepColumn) * (X_SPAN / Math.max(1, tCount - 1)) * 0.45
        const dz = stepSlot === 0 ? 0 : Math.sign(stepSlot) * (Z_SPAN / Math.max(1, zCount - 1)) * 0.45
        return [positions[here] + dx, positions[here + 1] + 0.03, positions[here + 2] + dz]
      }
      return [
        (positions[here] + positions[there]) / 2,
        (positions[here + 1] + positions[there + 1]) / 2 + 0.03,
        (positions[here + 2] + positions[there + 2]) / 2,
      ]
    }

    const bindSurface = () => {
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer)
      gl.enableVertexAttribArray(1)
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, pinBuffer)
      gl.enableVertexAttribArray(2)
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, indexAttr)
      gl.enableVertexAttribArray(3)
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementBuffer)
    }

    const resizeTargets = (width: number, heightPx: number) => {
      gl.bindTexture(gl.TEXTURE_2D, colorTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, heightPx, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb)
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, heightPx)
      gl.bindFramebuffer(gl.FRAMEBUFFER, pickFbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0)
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }

    const mvpOf = () => {
      const camera = cameraRef.current
      const aspect = canvas.width / Math.max(1, canvas.height)
      const cy = Math.cos(camera.pitch)
      const eye = [
        camera.dist * cy * Math.sin(camera.yaw),
        targetY + camera.dist * Math.sin(camera.pitch),
        camera.dist * cy * Math.cos(camera.yaw),
      ]
      const near = Math.min(0.05, Math.max(0.004, camera.dist * 0.15))
      return multiply(perspective(0.9, aspect, near, 80), lookAt(eye, [0, targetY, 0]))
    }

    const draw = () => {
      if (canvas.width < 2 || canvas.height < 2 || !surfaceProgram || !flatProgram) return
      const mvp = mvpOf()
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.enable(gl.DEPTH_TEST)
      gl.disable(gl.BLEND)
      gl.clearColor(background[0], background[1], background[2], 1)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.useProgram(surfaceProgram)
      bindSurface()
      gl.uniformMatrix4fv(gl.getUniformLocation(surfaceProgram, "uMvp"), false, mvp)
      gl.uniform1f(gl.getUniformLocation(surfaceProgram, "uYGain"), Y_GAIN)
      gl.uniform3fv(gl.getUniformLocation(surfaceProgram, "uLow"), low)
      gl.uniform3fv(gl.getUniformLocation(surfaceProgram, "uHot"), hot)
      gl.uniform3fv(gl.getUniformLocation(surfaceProgram, "uOver"), over)
      gl.uniform3fv(gl.getUniformLocation(surfaceProgram, "uPin"), pin)
      gl.uniform3fv(gl.getUniformLocation(surfaceProgram, "uLight"), [0.22, 0.9, 0.36])
      gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0)

      gl.useProgram(flatProgram)
      gl.uniformMatrix4fv(gl.getUniformLocation(flatProgram, "uMvp"), false, mvp)
      const shownFloor = probaFloorDelay(floorRef.current)
      if (shownFloor != null) {
        const yPlane = (shownFloor / map.pool) * Y_GAIN
        const x0 = -X_SPAN / 2
        const x1 = X_SPAN / 2
        const z0 = -Z_SPAN / 2
        const z1 = Z_SPAN / 2
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
        gl.depthMask(false)
        // Biais constant : le facteur de pente (-1) avalait les faces du relief.
        gl.enable(gl.POLYGON_OFFSET_FILL)
        gl.polygonOffset(0, -1)
        gl.bindBuffer(gl.ARRAY_BUFFER, planeBuffer)
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([
            x0, yPlane, z0,
            x1, yPlane, z0,
            x1, yPlane, z1,
            x0, yPlane, z0,
            x1, yPlane, z1,
            x0, yPlane, z1,
          ]),
          gl.DYNAMIC_DRAW
        )
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
        gl.disableVertexAttribArray(1)
        gl.disableVertexAttribArray(2)
        gl.disableVertexAttribArray(3)
        gl.uniform1f(gl.getUniformLocation(flatProgram, "uPointSize"), 1)
        gl.uniform4f(gl.getUniformLocation(flatProgram, "uColor"), planeColor[0], planeColor[1], planeColor[2], 0.07)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
        const xCuts = 4
        const zCuts = 3
        const lines: number[] = []
        const yLine = yPlane + 0.012
        for (let step = 0; step <= zCuts; step += 1) {
          const z = z0 + (step / zCuts) * Z_SPAN
          lines.push(x0, yLine, z, x1, yLine, z)
        }
        for (let step = 0; step <= xCuts; step += 1) {
          const x = x0 + (step / xCuts) * X_SPAN
          lines.push(x, yLine, z0, x, yLine, z1)
        }
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW)
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
        gl.uniform4f(gl.getUniformLocation(flatProgram, "uColor"), planeColor[0], planeColor[1], planeColor[2], 0.45)
        gl.drawArrays(gl.LINES, 0, lines.length / 3)
        gl.disable(gl.POLYGON_OFFSET_FILL)
        gl.depthMask(true)
        gl.disable(gl.BLEND)
      }

      if (hoverCell) {
        gl.disableVertexAttribArray(1)
        gl.disableVertexAttribArray(2)
        gl.disableVertexAttribArray(3)
        const west = cellCorner(hoverCell.column, hoverCell.slot, -1, 0)
        const north = cellCorner(hoverCell.column, hoverCell.slot, 0, 1)
        const east = cellCorner(hoverCell.column, hoverCell.slot, 1, 0)
        const south = cellCorner(hoverCell.column, hoverCell.slot, 0, -1)
        const patch = new Float32Array([
          ...west, ...north, ...east,
          ...west, ...east, ...south,
        ])
        gl.enable(gl.POLYGON_OFFSET_FILL)
        gl.polygonOffset(-3, -3)
        gl.bindBuffer(gl.ARRAY_BUFFER, markBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, patch, gl.DYNAMIC_DRAW)
        gl.enableVertexAttribArray(0)
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
        gl.uniform4f(gl.getUniformLocation(flatProgram, "uColor"), mark[0], mark[1], mark[2], 1)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
        gl.disable(gl.POLYGON_OFFSET_FILL)
        const center = (hoverCell.column * zCount + hoverCell.slot) * 3
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([positions[center], positions[center + 1] + 0.045, positions[center + 2]]),
          gl.DYNAMIC_DRAW
        )
        gl.uniform1f(gl.getUniformLocation(flatProgram, "uPointSize"), 16)
        gl.drawArrays(gl.POINTS, 0, 1)
      }
    }
    drawRef.current = draw

    let sizedW = 0
    let sizedH = 0
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const width = Math.max(1, Math.round(rect.width * dpr))
      const heightPx = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width !== width || canvas.height !== heightPx || sizedW !== width || sizedH !== heightPx) {
        canvas.width = width
        canvas.height = heightPx
        resizeTargets(width, heightPx)
        sizedW = width
        sizedH = heightPx
      }
      draw()
    }

    const readHit = (event: PointerEvent) => {
      if (!pickProgram || canvas.width < 2) return null
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor(((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width)
      const y = Math.floor(((rect.bottom - event.clientY) / Math.max(1, rect.height)) * canvas.height)
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null
      gl.bindFramebuffer(gl.FRAMEBUFFER, pickFbo)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.enable(gl.DEPTH_TEST)
      gl.disable(gl.BLEND)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.useProgram(pickProgram)
      bindSurface()
      gl.uniformMatrix4fv(gl.getUniformLocation(pickProgram, "uMvp"), false, mvpOf())
      gl.uniform1f(gl.getUniformLocation(pickProgram, "uYGain"), Y_GAIN)
      gl.uniform1f(gl.getUniformLocation(pickProgram, "uColumns"), tCount)
      gl.uniform1f(gl.getUniformLocation(pickProgram, "uSlots"), zCount)
      gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0)
      const pixel = new Uint8Array(4)
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      if (pixel[3] === 0) return null
      const column = pixel[0] + pixel[1] * 256
      const slot = pixel[2]
      if (column >= tCount || slot >= zCount) return null
      return { column, slot }
    }

    let dragging = false
    let moved = 0
    let originX = 0
    let originY = 0
    let originYaw = 0
    let originPitch = 0

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      dragging = true
      moved = 0
      originX = event.clientX
      originY = event.clientY
      originYaw = cameraRef.current.yaw
      originPitch = cameraRef.current.pitch
      canvas.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) {
        const hit = readHit(event)
        if (!hit || !wrapRef.current) {
          if (hoverCell) {
            hoverCell = null
            draw()
          }
          setHover(null)
          return
        }
        if (!hoverCell || hoverCell.column !== hit.column || hoverCell.slot !== hit.slot) {
          hoverCell = { column: hit.column, slot: hit.slot }
          draw()
        }
        const cell = map.columns[hit.column][hit.slot]
        const wrap = wrapRef.current.getBoundingClientRect()
        const left = Math.min(event.clientX - wrap.left + 14, wrap.width - 280)
        const top = Math.min(event.clientY - wrap.top + 14, wrap.height - 72)
        const text = mapPhrase({
          kind: map.kind,
          ball: cell.ball,
          date: map.dates[hit.column] ?? "",
          slot: hit.slot,
          slots: zCount,
          charge: cell.charge,
          cost: cell.cost,
          neighbors: cell.neighbors,
          placement: map.placement,
        })
        setHover({ left: Math.max(8, left), top: Math.max(8, top), phrase: text })
        setPhrase(text)
        return
      }
      const dx = event.clientX - originX
      const dy = event.clientY - originY
      moved = Math.hypot(dx, dy)
      cameraRef.current.yaw = originYaw + dx * 0.008
      cameraRef.current.pitch = Math.max(-1.05, Math.min(1.2, originPitch + dy * 0.008))
      hoverCell = null
      setHover(null)
      draw()
    }
    const onPointerUp = (event: PointerEvent) => {
      if (!dragging) return
      dragging = false
      if (moved >= 5) return
      const hit = readHit(event)
      if (!hit) return
      onPinRef.current(map.kind, map.columns[hit.column][hit.slot].ball)
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const camera = cameraRef.current
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1
      camera.dist = Math.max(
        MIN_DIST,
        Math.min(MAX_DIST, camera.dist * Math.exp(event.deltaY * unit * ZOOM_WHEEL))
      )
      draw()
    }

    const clearHover = () => {
      if (!hoverCell) return
      hoverCell = null
      setHover(null)
      draw()
    }
    const onPointerCancel = () => {
      dragging = false
      clearHover()
    }
    const onPointerLeave = () => {
      if (dragging) return
      clearHover()
    }
    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointercancel", onPointerCancel)
    canvas.addEventListener("pointerleave", onPointerLeave)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    const observer = new ResizeObserver(() => resize())
    observer.observe(canvas)
    resize()

    return () => {
      cancelled = true
      observer.disconnect()
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointercancel", onPointerCancel)
      canvas.removeEventListener("pointerleave", onPointerLeave)
      canvas.removeEventListener("wheel", onWheel)
      drawRef.current = () => {}
      gl.deleteBuffer(positionBuffer)
      gl.deleteBuffer(normalBuffer)
      gl.deleteBuffer(pinBuffer)
      gl.deleteBuffer(indexAttr)
      gl.deleteBuffer(elementBuffer)
      gl.deleteBuffer(planeBuffer)
      gl.deleteBuffer(markBuffer)
      gl.deleteTexture(colorTex)
      gl.deleteRenderbuffer(depthRb)
      gl.deleteFramebuffer(pickFbo)
      if (surfaceProgram) gl.deleteProgram(surfaceProgram)
      if (pickProgram) gl.deleteProgram(pickProgram)
      if (flatProgram) gl.deleteProgram(flatProgram)
    }
  }, [map, pinBall])

  const series = pinBall != null ? map.series[pinBall - 1] ?? [] : []
  const noun = map.kind === "number" ? "numéro" : "étoile"

  if (map.kind === "star" && map.starsHidden) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Étoiles</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{map.starNote}</p>
        </CardContent>
      </Card>
    )
  }

  if (map.columns.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Carte</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Moins de deux tirages : le relief n’a pas de surface.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {map.kind === "number" ? "Numéros" : "Étoiles"} · {MAP_SCALE_LABELS[map.scale]}
        </CardTitle>
        <CardAction>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => {
              cameraRef.current = { ...frameRef.current }
              drawRef.current()
            }}
          >
            Vue 3/4
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex min-w-0 max-w-md flex-col gap-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1">
              Plancher
              <HelpTip {...PROBA_DYNAMIC_HELP.plancher} />
            </span>
            <span className="tabular-nums text-foreground">
              {floorShown == null
                ? "effacé"
                : `${floorShown} absence${floorShown > 1 ? "s" : ""} · ${formatFr(floorShown / map.pool, 2)}`}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={PROBA_FLOOR_OFF}
            step={1}
            value={resolvedFloor}
            aria-label="Hauteur du plancher, en absences"
            aria-valuetext={floorShown == null ? "effacé" : `${floorShown} absences`}
            onChange={(event) => onFloor(Number(event.target.value))}
            className="accent-primary"
          />
        </label>
        <div ref={wrapRef} className="relative">
          <canvas
            ref={canvasRef}
            className="h-[min(70vh,40rem)] w-full cursor-grab touch-none rounded-lg bg-canvas active:cursor-grabbing"
            role="img"
            aria-label={`Carte du compteur, ${map.dates.length} tirages, ${map.pool} cases`}
          />
          {hover ? (
            <p
              className="pointer-events-none absolute z-10 max-w-xs rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10"
              style={{ left: hover.left, top: hover.top }}
            >
              {hover.phrase}
            </p>
          ) : null}
        </div>
        {failed ? <p className="text-sm text-destructive">{failed}</p> : null}
        <p className="text-xs text-muted-foreground">
          {phrase}
        </p>
        <p className="text-xs text-muted-foreground">
          X : {formatMapDate(map.dates[0])} → {formatMapDate(map.dates[map.dates.length - 1])},{" "}
          {map.dates.length} tirages, un pas chacun. Y : compteur. Z : {map.pool} cases,{" "}
          {map.placement === "brut"
            ? "du plus petit compteur devant au plus grand, chaque tirage."
            : "du plus petit compteur devant au premier tirage."}{" "}
          {floorShown == null
            ? "Le plancher est effacé."
            : `Le plancher est à ${floorShown} absence${floorShown > 1 ? "s" : ""}.`}
        </p>
        <FractalReadout columns={map.columns} />
        <div>
          <p className="text-xs text-muted-foreground">
            {pinBall != null
              ? `Dent de scie brute, ${noun} ${pinBall}.`
              : "Le curseur ou un clic épingle la dent de scie brute."}
          </p>
          {series.length > 0 ? (
            <Saw series={series} expected={floorShown == null ? null : floorShown / map.pool} tone={map.kind} />
          ) : null}
          {series.length > 0 && floorShown != null ? (
            <p className="text-xs text-muted-foreground">Trait {formatFr(floorShown / map.pool, 2)}.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
