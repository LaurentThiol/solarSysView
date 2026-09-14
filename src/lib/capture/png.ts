import { IMAGE_MAX_CHARS } from "@/lib/capture/snapshot"

const MAX_WIDTH = 1280
const MAX_HEIGHT = 1400
const THUMB_WIDTH = 360
const THUMB_HEIGHT = 220
const UNSAFE_COLOR = /oklch|oklab|lab\(|lch\(|color\(/i

function backgroundOf(node: HTMLElement) {
  const fromNode = getComputedStyle(node).backgroundColor
  if (fromNode && fromNode !== "rgba(0, 0, 0, 0)" && fromNode !== "transparent") {
    return fromNode
  }
  return getComputedStyle(document.body).backgroundColor || "#1b2030"
}

function skipCaptureUi(node: HTMLElement) {
  if (typeof node.closest !== "function") return true
  return !node.closest("[data-capture-ui]")
}

function isPainted(node: Element): node is HTMLElement | SVGElement {
  return node instanceof HTMLElement || node instanceof SVGElement
}

/** html-to-image sérialise le computed style : oklch y casse le canvas. On force du rgb le temps du rendu. */
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
    const fallback = cs.backgroundColor.startsWith("rgb") ? cs.backgroundColor : "#1b2030"
    node.style.color = cs.color
    node.style.backgroundColor = cs.backgroundColor
    node.style.borderColor = cs.borderColor
    node.style.outlineColor = cs.outlineColor
    node.style.boxShadow = "none"
    node.style.filter = "none"
    node.style.setProperty("fill", cs.fill)
    node.style.setProperty("stroke", cs.stroke)
    for (const name of Array.from(cs)) {
      const value = cs.getPropertyValue(name)
      if (!UNSAFE_COLOR.test(value)) continue
      if (name.startsWith("--")) {
        node.style.setProperty(name, fallback)
        continue
      }
      const camel = name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
      const used = (cs as unknown as Record<string, string>)[camel]
      node.style.setProperty(name, used && !UNSAFE_COLOR.test(used) ? used : fallback)
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

export async function fitImageDataUrl(
  dataUrl: string,
  maxChars = IMAGE_MAX_CHARS
): Promise<string> {
  let width = MAX_WIDTH
  let height = MAX_HEIGHT
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

async function rasterizeNode(
  node: HTMLElement,
  options: {
    cacheBust: boolean
    pixelRatio: 1
    width: number
    height: number
    backgroundColor: string
    skipFonts: boolean
    filter: (node: HTMLElement) => boolean
  }
): Promise<string | null> {
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
  const rect = node.getBoundingClientRect()
  const width = Math.min(Math.max(node.clientWidth, 320), MAX_WIDTH)
  const visible = Math.max(240, window.innerHeight - Math.max(rect.top, 0))
  const height = Math.min(visible, MAX_HEIGHT, Math.max(node.scrollHeight, node.clientHeight))
  const options = {
    cacheBust: true,
    pixelRatio: 1 as const,
    width,
    height,
    backgroundColor: backgroundOf(node),
    skipFonts: true,
    filter: skipCaptureUi,
  }
  let raw = await rasterizeNode(node, options)
  if (!raw) {
    const restore = neutralizeOklch(node)
    try {
      raw = await rasterizeNode(node, options)
    } finally {
      restore()
    }
  }
  if (!raw) return null
  return fitImageDataUrl(raw)
}
