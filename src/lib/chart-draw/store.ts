import { canonicalFigure } from "../chartisme/catalog"

import { CHART_DRAW_HOSTS, type ChartSketch } from "./types"

export const SKETCHES_KEY = "synchro.chart-draw.v1"

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota
  }
}

function isSketch(row: unknown): row is ChartSketch {
  if (!row || typeof row !== "object") return false
  const item = row as ChartSketch
  if (typeof item.id !== "string" || typeof item.figure !== "string") return false
  if (!CHART_DRAW_HOSTS.includes(item.host)) return false
  if (!item.start || !item.end || !Array.isArray(item.points)) return false
  return typeof item.start.date === "string" && typeof item.end.date === "string"
}

export function loadSketches(): ChartSketch[] {
  const raw = readJson<unknown[]>(SKETCHES_KEY, [])
  if (!Array.isArray(raw)) return []
  return raw.filter(isSketch).map((sketch) => ({
    ...sketch,
    figure: canonicalFigure(sketch.figure),
  }))
}

export function saveSketches(sketches: ChartSketch[]) {
  writeJson(SKETCHES_KEY, sketches.filter(isSketch))
}

export function persistHostSketches(host: ChartSketch["host"], sketches: ChartSketch[]) {
  const others = loadSketches().filter((item) => item.host !== host)
  saveSketches([...others, ...sketches.filter((item) => item.host === host)])
}
