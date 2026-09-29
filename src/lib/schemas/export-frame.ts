import { SCHEMA_CANVAS } from "@/lib/schemas/contrast"

export function schemaPngName(stem: string) {
  const clean = stem
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
  return `${clean || "schema"}.png`
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Le dessin n’a pas pu être relu."))
    image.src = url
  })
}

/** PNG du cadre visible : le zoom et le déplacement en cours sont ceux de l’écran. */
export async function exportFramePng(frame: HTMLElement, fileName: string) {
  const svg = frame.querySelector("svg")
  if (!(svg instanceof SVGSVGElement)) throw new Error("Pas de dessin à exporter.")
  const frameRect = frame.getBoundingClientRect()
  const svgRect = svg.getBoundingClientRect()
  if (frameRect.width < 2 || frameRect.height < 2) throw new Error("Le cadre est vide.")
  const ratio = Math.min(2, window.devicePixelRatio || 1)
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(frameRect.width * ratio))
  canvas.height = Math.max(1, Math.round(frameRect.height * ratio))
  const context = canvas.getContext("2d")
  if (!context) throw new Error("L’image n’a pas pu être préparée.")
  context.fillStyle = SCHEMA_CANVAS
  context.fillRect(0, 0, canvas.width, canvas.height)
  const markup = new XMLSerializer().serializeToString(svg)
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }))
  try {
    const image = await loadImage(url)
    context.drawImage(
      image,
      (svgRect.left - frameRect.left) * ratio,
      (svgRect.top - frameRect.top) * ratio,
      svgRect.width * ratio,
      svgRect.height * ratio
    )
  } finally {
    URL.revokeObjectURL(url)
  }
  const dataUrl = canvas.toDataURL("image/png")
  const anchor = document.createElement("a")
  anchor.href = dataUrl
  anchor.download = fileName
  anchor.click()
}
