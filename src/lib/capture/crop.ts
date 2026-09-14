export type Rect = { x: number; y: number; width: number; height: number }

export const CAPTURE_MAX_WIDTH = 1280
export const CAPTURE_MAX_HEIGHT = 1400
export const CAPTURE_MIN_WIDTH = 320
export const CAPTURE_MIN_HEIGHT = 240
export const CHART_PAD = 28

export function rectsIntersect(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

export function padRect(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 }
}

/** Portion of `node` currently on screen, in the node's local coordinates. */
export function intersectViewport(
  node: { top: number; left: number; right: number; bottom: number },
  viewport: { width: number; height: number }
): Rect {
  const visLeft = Math.max(node.left, 0)
  const visTop = Math.max(node.top, 0)
  const visRight = Math.min(node.right, viewport.width)
  const visBottom = Math.min(node.bottom, viewport.height)
  return {
    x: visLeft - node.left,
    y: visTop - node.top,
    width: Math.max(0, visRight - visLeft),
    height: Math.max(0, visBottom - visTop),
  }
}

export function relativeRect(
  node: { top: number; left: number },
  el: { top: number; left: number; width: number; height: number }
): Rect {
  return { x: el.left - node.left, y: el.top - node.top, width: el.width, height: el.height }
}

function clampPos(value: number, size: number, max: number) {
  if (size >= max) return 0
  return Math.max(0, Math.min(value, max - size))
}

/**
 * Capture window: the visible slice, expanded to include nearby charts
 * (the curve the reader is looking at), without exceeding maxWidth × maxHeight.
 *
 * If no chart intersects the viewport, jump to the first chart rather than
 * sending the page chrome (title + form) without the graph.
 */
export function preferredCrop(input: {
  visible: Rect
  visuals: Rect[]
  nodeSize: { width: number; height: number }
  maxWidth?: number
  maxHeight?: number
}): Rect {
  const maxW = input.maxWidth ?? CAPTURE_MAX_WIDTH
  const maxH = input.maxHeight ?? CAPTURE_MAX_HEIGHT
  const { nodeSize, visuals } = input
  let crop = input.visible
  if (crop.width < 1 || crop.height < 1) {
    crop = {
      x: 0,
      y: 0,
      width: Math.min(nodeSize.width, maxW),
      height: Math.min(nodeSize.height, maxH),
    }
  }

  const visTop = crop.y
  const nearby = visuals.filter((v) => v.y + v.height >= visTop - 80 && v.y <= visTop + maxH)

  if (nearby.length) {
    for (const visual of nearby) crop = unionRect(crop, padRect(visual, CHART_PAD))
  } else if (visuals.length) {
    const first = visuals.reduce((best, item) => (item.y < best.y ? item : best))
    crop = unionRect(padRect(first, CHART_PAD), {
      x: first.x,
      y: Math.max(0, first.y - 72),
      width: first.width,
      height: first.height + 72,
    })
  }

  const width = Math.min(Math.max(Math.round(crop.width), CAPTURE_MIN_WIDTH), maxW, Math.max(1, nodeSize.width))
  const height = Math.min(
    Math.max(Math.round(crop.height), CAPTURE_MIN_HEIGHT),
    maxH,
    Math.max(1, nodeSize.height)
  )

  let x = crop.x
  let y = crop.y
  if (crop.height > height) {
    const keep = visuals.filter((visual) => rectsIntersect(crop, visual))
    if (keep.length) {
      const topV = Math.min(...keep.map((visual) => visual.y))
      const botV = Math.max(...keep.map((visual) => visual.y + visual.height))
      y = botV - topV <= height ? Math.min(topV - CHART_PAD, botV - height) : topV - CHART_PAD
    }
  }

  x = clampPos(Math.round(x), width, nodeSize.width)
  y = clampPos(Math.round(y), height, nodeSize.height)
  return { x, y, width, height }
}
