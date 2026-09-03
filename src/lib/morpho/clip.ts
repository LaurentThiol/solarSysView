import { canvasSize, cellRect, numbersOrigin, starsOrigin, N_COLS, N_ROWS, STAR_COLS, STAR_ROWS, cellNumber, cellStar } from "./board"

type EmbedFn = (numbers: number[], stars: number[]) => Promise<number[]>

let embedImpl: EmbedFn | null = null
let loadError: string | null = null

function paintGlyph(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, numbers: number[], stars: number[]) {
  const [w, h] = canvasSize()
  ctx.fillStyle = "#08080a"
  ctx.fillRect(0, 0, w, h)
  const fill = new Set(numbers)
  const starsSet = new Set(stars)
  const paint = (
    origin: [number, number],
    rows: number,
    cols: number,
    on: Set<number>,
    idFn: (r: number, c: number) => number
  ) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const [x, y, cw, ch] = cellRect(origin, r, c)
        const cx = x + cw / 2
        const cy = y + ch / 2
        const radius = Math.min(cw, ch) / 2 - 2
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        if (on.has(idFn(r, c))) {
          ctx.fillStyle = "#f0f0f5"
          ctx.fill()
        } else {
          ctx.strokeStyle = "#323238"
          ctx.stroke()
        }
      }
    }
  }
  paint(numbersOrigin(), N_ROWS, N_COLS, fill, cellNumber)
  paint(starsOrigin(), STAR_ROWS, STAR_COLS, starsSet, cellStar)
}

async function canvasImage(numbers: number[], stars: number[]) {
  const [w, h] = canvasSize()
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("canvas 2d indisponible")
  paintGlyph(ctx, numbers, stars)
  return canvas
}

export async function loadClip(): Promise<{ ok: boolean; error?: string }> {
  if (embedImpl) return { ok: true }
  try {
    const transformers = await import("@huggingface/transformers")
    const { AutoProcessor, CLIPVisionModelWithProjection, RawImage } = transformers
    const processor = await AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch32")
    const model = await CLIPVisionModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch32")
    embedImpl = async (numbers, stars) => {
      const canvas = await canvasImage(numbers, stars)
      const dataUrl = canvas.toDataURL("image/png")
      const image = await RawImage.fromURL(dataUrl)
      const inputs = await processor(image)
      const out = await model(inputs)
      const data = Array.from(out.image_embeds.data as Float32Array)
      return data
    }
    loadError = null
    return { ok: true }
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error)
    return { ok: false, error: loadError }
  }
}

export function clipStatus() {
  return { loaded: embedImpl != null, error: loadError }
}

export async function embedGlyph(numbers: number[], stars: number[]) {
  if (!embedImpl) {
    const loaded = await loadClip()
    if (!loaded.ok) throw new Error(loaded.error || "CLIP indisponible")
  }
  return embedImpl!(numbers, stars)
}

export function cosine(a: number[], b: number[]) {
  let num = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    num += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (!na || !nb) return 0
  return num / (Math.sqrt(na) * Math.sqrt(nb))
}
