const MAX_WIDTH = 1400
const MAX_HEIGHT = 2200

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
  const width = Math.min(Math.max(node.scrollWidth, node.clientWidth), MAX_WIDTH)
  const height = Math.min(Math.max(node.scrollHeight, node.clientHeight), MAX_HEIGHT)
  const pixelRatio = Math.min(1.4, MAX_WIDTH / Math.max(width, 1))
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
