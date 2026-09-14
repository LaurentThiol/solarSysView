import { IMAGE_MAX_CHARS } from "@/lib/capture/snapshot"
import { isUnsafeColor, resolvePaintColor } from "@/lib/capture/colors"
import {
  CAPTURE_MAX_HEIGHT,
  CAPTURE_MAX_WIDTH,
  intersectViewport,
  preferredCrop,
  relativeRect,
  type Rect,
} from "@/lib/capture/crop"

const THUMB_WIDTH = 360
const THUMB_HEIGHT = 220

const SVG_PAINT = [
  "fill",
  "stroke",
  "color",
  "opacity",
  "stroke-width",
  "stroke-dasharray",
  "stroke-opacity",
  "fill-opacity",
  "font-size",
  "font-family",
  "font-weight",
  "stop-color",
  "stop-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "text-anchor",
  "dominant-baseline",
] as const

type RasterOptions = {
  cacheBust: boolean
  pixelRatio: number
  width: number
  height: number
  backgroundColor: string
  skipFonts: boolean
  filter: (node: HTMLElement) => boolean
  style?: Record<string, string>
}

let paintCtx: CanvasRenderingContext2D | null | undefined

function toRgb(css: string): string | null {
  try {
    if (paintCtx === undefined) {
      paintCtx = document.createElement("canvas").getContext("2d")
    }
    if (!paintCtx) return null
    paintCtx.fillStyle = "#010203"
    paintCtx.fillStyle = css
    const out = String(paintCtx.fillStyle || "")
    if (!out || isUnsafeColor(out)) return null
    return out
  } catch {
    return null
  }
}

function backgroundOf(node: HTMLElement) {
  const fromNode = getComputedStyle(node).backgroundColor
  const candidate =
    fromNode && fromNode !== "rgba(0, 0, 0, 0)" && fromNode !== "transparent"
      ? fromNode
      : getComputedStyle(document.body).backgroundColor
  return resolvePaintColor(candidate || "#1b2030", candidate, toRgb) || "#1b2030"
}

function skipCaptureUi(node: HTMLElement) {
  if (typeof node.closest !== "function") return true
  return !node.closest("[data-capture-ui]")
}

function isPainted(node: Element): node is HTMLElement | SVGElement {
  return node instanceof HTMLElement || node instanceof SVGElement
}

function usedOf(cs: CSSStyleDeclaration, prop: string) {
  const camel = prop.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
  return (cs as unknown as Record<string, string>)[camel]
}

/**
 * html-to-image serialises computed CSS. oklch() often becomes transparent.
 * Convert paints to rgb. Do not replace chart tokens with the card background
 * — that used to erase Recharts strokes.
 */
function neutralizeOklch(root: HTMLElement): () => void {
  const restores: Array<() => void> = []
  const nodes = [root, ...Array.from(root.querySelectorAll("*"))]
  for (const node of nodes) {
    if (!isPainted(node)) continue
    const previous = node.getAttribute("style")
    restores.push(() => {
      if (previous == null) node.removeAttribute("style")
      else node.setAttribute("style", previous)
    })
    const cs = getComputedStyle(node)
    const color = resolvePaintColor(cs.color, cs.color, toRgb)
    const background = resolvePaintColor(cs.backgroundColor, cs.backgroundColor, toRgb)
    const border = resolvePaintColor(cs.borderColor, cs.borderColor, toRgb)
    const fill = resolvePaintColor(cs.fill, cs.fill, toRgb)
    const stroke = resolvePaintColor(cs.stroke, cs.stroke, toRgb)
    if (color) node.style.color = color
    if (background) node.style.backgroundColor = background
    if (border) node.style.borderColor = border
    node.style.boxShadow = "none"
    node.style.filter = "none"
    if (fill) node.style.setProperty("fill", fill)
    if (stroke) node.style.setProperty("stroke", stroke)
    for (const name of Array.from(cs)) {
      const value = cs.getPropertyValue(name)
      if (!isUnsafeColor(value) && !value.includes("var(")) continue
      const resolved = resolvePaintColor(value, name.startsWith("--") ? undefined : usedOf(cs, name), toRgb)
      if (resolved) node.style.setProperty(name, resolved)
    }
  }
  return () => {
    for (let i = restores.length - 1; i >= 0; i -= 1) restores[i]()
  }
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("image"))
    img.src = dataUrl
  })
}

function visualRects(root: HTMLElement): Rect[] {
  const nodeRect = root.getBoundingClientRect()
  const seen = new Set<Element>()
  const out: Rect[] = []
  const add = (el: Element) => {
    if (seen.has(el) || el.closest("[data-capture-ui]")) return
    const box = el.getBoundingClientRect()
    if (box.width < 48 || box.height < 48) return
    seen.add(el)
    out.push(relativeRect(nodeRect, box))
  }
  root.querySelectorAll("[data-capture-visual], [data-slot='chart']").forEach(add)
  root.querySelectorAll("svg.recharts-surface, canvas").forEach(add)
  root.querySelectorAll('svg[role="img"]').forEach(add)
  return out
}

export function cropForNode(node: HTMLElement): Rect {
  const nodeRect = node.getBoundingClientRect()
  const visible = intersectViewport(nodeRect, {
    width: window.innerWidth,
    height: window.innerHeight,
  })
  return preferredCrop({
    visible,
    visuals: visualRects(node),
    nodeSize: {
      width: Math.max(node.scrollWidth, node.clientWidth, Math.round(nodeRect.width)),
      height: Math.max(node.scrollHeight, node.clientHeight, Math.round(nodeRect.height)),
    },
    maxWidth: CAPTURE_MAX_WIDTH,
    maxHeight: CAPTURE_MAX_HEIGHT,
  })
}

function inlineSvgPaint(source: SVGElement, target: SVGElement) {
  const srcNodes = [source, ...Array.from(source.querySelectorAll("*"))]
  const dstNodes = [target, ...Array.from(target.querySelectorAll("*"))]
  const n = Math.min(srcNodes.length, dstNodes.length)
  for (let i = 0; i < n; i += 1) {
    const src = srcNodes[i]
    const dst = dstNodes[i]
    if (!(src instanceof SVGElement) || !(dst instanceof SVGElement)) continue
    const cs = getComputedStyle(src)
    for (const prop of SVG_PAINT) {
      const specified = cs.getPropertyValue(prop)
      const resolved =
        prop === "fill" || prop === "stroke" || prop === "color" || prop === "stop-color"
          ? resolvePaintColor(specified, usedOf(cs, prop), toRgb) ?? specified
          : specified
      if (resolved) dst.style.setProperty(prop, resolved)
    }
  }
}

function swapForImage(original: Element, dataUrl: string, box: DOMRect): () => void {
  const img = document.createElement("img")
  img.src = dataUrl
  img.alt = original.getAttribute("aria-label") || ""
  img.setAttribute("data-capture-flat", original.tagName.toLowerCase())
  img.setAttribute("data-capture-visual", "")
  img.style.display = "block"
  img.style.width = `${box.width}px`
  img.style.height = `${box.height}px`
  img.style.maxWidth = "100%"
  const parent = original.parentNode
  if (!parent) return () => undefined
  parent.insertBefore(img, original)
  const prevDisplay = original instanceof HTMLElement || original instanceof SVGElement ? original.style.display : ""
  if (original instanceof HTMLElement || original instanceof SVGElement) {
    original.style.display = "none"
    original.setAttribute("data-capture-hidden", "")
  }
  return () => {
    img.remove()
    if (original instanceof HTMLElement || original instanceof SVGElement) {
      original.style.display = prevDisplay
      original.removeAttribute("data-capture-hidden")
    }
  }
}

function flattenCanvas(canvas: HTMLCanvasElement): (() => void) | null {
  if (canvas.closest("[data-capture-ui]") || canvas.width < 2 || canvas.height < 2) return null
  let url: string
  try {
    url = canvas.toDataURL("image/png")
  } catch {
    return null
  }
  if (!url || url === "data:,") return null
  return swapForImage(canvas, url, canvas.getBoundingClientRect())
}

function chartSvgs(root: HTMLElement): SVGSVGElement[] {
  const found = new Set<SVGSVGElement>()
  const take = (el: Element) => {
    if (el instanceof SVGSVGElement) found.add(el)
  }
  root.querySelectorAll("[data-capture-visual] svg, [data-slot='chart'] svg, svg.recharts-surface").forEach(take)
  root.querySelectorAll('svg[role="img"]').forEach((svg) => {
    if (!(svg instanceof SVGSVGElement)) return
    const box = svg.getBoundingClientRect()
    if (box.width >= 80 && box.height >= 48) found.add(svg)
  })
  return [...found].filter((svg) => !svg.closest("[data-capture-ui]") && !svg.closest("[data-capture-hidden]"))
}

async function flattenSvg(svg: SVGSVGElement): Promise<(() => void) | null> {
  const box = svg.getBoundingClientRect()
  if (box.width < 48 || box.height < 48) return null
  const clone = svg.cloneNode(true) as SVGSVGElement
  inlineSvgPaint(svg, clone)
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  clone.setAttribute("width", String(Math.round(box.width)))
  clone.setAttribute("height", String(Math.round(box.height)))
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${Math.round(box.width)} ${Math.round(box.height)}`)
  }
  const xml = new XMLSerializer().serializeToString(clone)
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
  let dataUrl = svgUrl
  try {
    const img = await loadImage(svgUrl)
    const scale = box.width > 900 ? 1 : 2
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(box.width * scale))
    canvas.height = Math.max(1, Math.round(box.height * scale))
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      dataUrl = canvas.toDataURL("image/png")
    }
  } catch {
    // Keep the SVG data URL; html-to-image still prefers an <img> over nested SVG.
  }
  return swapForImage(svg, dataUrl, box)
}

async function flattenGraphics(root: HTMLElement): Promise<() => void> {
  const restores: Array<() => void> = []
  for (const canvas of Array.from(root.querySelectorAll("canvas"))) {
    const undo = flattenCanvas(canvas)
    if (undo) restores.push(undo)
  }
  for (const svg of chartSvgs(root)) {
    try {
      const undo = await flattenSvg(svg)
      if (undo) restores.push(undo)
    } catch {
      // Leave the live SVG; neutralizeOklch still inlines rgb paints.
    }
  }
  return () => {
    for (let i = restores.length - 1; i >= 0; i -= 1) restores[i]()
  }
}

export async function rasterizeJpeg(
  dataUrl: string,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<string | null> {
  try {
    const img = await loadImage(dataUrl)
    const scale = Math.min(1, maxWidth / Math.max(img.width, 1), maxHeight / Math.max(img.height, 1))
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.fillStyle = "#1b2030"
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    return canvas.toDataURL("image/jpeg", quality)
  } catch {
    return null
  }
}

export async function fitImageDataUrl(dataUrl: string, maxChars = IMAGE_MAX_CHARS): Promise<string> {
  let width = CAPTURE_MAX_WIDTH
  let height = CAPTURE_MAX_HEIGHT
  let quality = 0.78
  let current = dataUrl
  for (let i = 0; i < 7; i += 1) {
    const jpeg = current.startsWith("data:image/jpeg")
    if (current.length <= maxChars && jpeg) return current
    if (i === 0 && current.length <= maxChars * 0.45) return current
    const next = await rasterizeJpeg(current, width, height, quality)
    if (!next) return current
    current = next
    if (next.length <= maxChars) return next
    quality = Math.max(0.42, quality - 0.1)
    width = Math.round(width * 0.82)
    height = Math.round(height * 0.82)
  }
  return current
}

export async function makeThumbDataUrl(dataUrl: string): Promise<string | null> {
  return rasterizeJpeg(dataUrl, THUMB_WIDTH, THUMB_HEIGHT, 0.62)
}

async function rasterizeNode(node: HTMLElement, options: RasterOptions): Promise<string | null> {
  const { toPng, toJpeg } = await import("html-to-image")
  try {
    const jpeg = await toJpeg(node, { ...options, quality: 0.82 })
    if (jpeg && jpeg.startsWith("data:image")) return jpeg
  } catch {
    // oklch / webfonts cassent parfois le JPEG ; PNG puis repli.
  }
  try {
    const png = await toPng(node, options)
    if (png && png.startsWith("data:image")) return png
  } catch {
    return null
  }
  return null
}

export async function captureNodePng(node: HTMLElement): Promise<string | null> {
  const crop = cropForNode(node)
  const naturalW = Math.max(node.scrollWidth, node.clientWidth)
  const naturalH = Math.max(node.scrollHeight, node.clientHeight)
  const options: RasterOptions = {
    cacheBust: true,
    pixelRatio: 1,
    width: crop.width,
    height: crop.height,
    backgroundColor: backgroundOf(node),
    skipFonts: true,
    filter: skipCaptureUi,
    style: {
      transform: `translate(${-crop.x}px, ${-crop.y}px)`,
      transformOrigin: "top left",
      width: `${naturalW}px`,
      height: `${naturalH}px`,
      overflow: "visible",
    },
  }
  const restoreFlat = await flattenGraphics(node)
  const restoreColor = neutralizeOklch(node)
  try {
    const raw = await rasterizeNode(node, options)
    if (!raw) return null
    return fitImageDataUrl(raw)
  } finally {
    restoreColor()
    restoreFlat()
  }
}
