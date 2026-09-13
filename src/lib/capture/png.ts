const MAX_WIDTH = 1400
const MAX_HEIGHT = 1600

function backgroundOf(node: HTMLElement) {
  const fromNode = getComputedStyle(node).backgroundColor
  if (fromNode && fromNode !== "rgba(0, 0, 0, 0)" && fromNode !== "transparent") {
    return fromNode
  }
  return getComputedStyle(document.body).backgroundColor || "#1b2030"
}

function skipCaptureUi(node: HTMLElement) {
  return !node.closest("[data-capture-ui]")
}

export async function captureNodePng(node: HTMLElement): Promise<string | null> {
  const { toPng, toJpeg } = await import("html-to-image")
  const rect = node.getBoundingClientRect()
  const width = Math.min(Math.max(node.clientWidth, 320), MAX_WIDTH)
  const visible = Math.max(240, window.innerHeight - Math.max(rect.top, 0))
  const height = Math.min(visible, MAX_HEIGHT, Math.max(node.scrollHeight, node.clientHeight))
  const pixelRatio = height > 900 ? 1 : 1.25
  const options = {
    cacheBust: true,
    pixelRatio,
    width,
    height,
    backgroundColor: backgroundOf(node),
    skipFonts: true,
    filter: skipCaptureUi,
  }
  try {
    const png = await toPng(node, options)
    if (png && png.startsWith("data:image")) return png
  } catch {
    // oklch / webfonts cassent parfois le PNG ; JPEG puis échec silencieux.
  }
  try {
    const jpeg = await toJpeg(node, { ...options, quality: 0.82 })
    if (jpeg && jpeg.startsWith("data:image")) return jpeg
  } catch {
    return null
  }
  return null
}
