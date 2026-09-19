"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { isRailFigure } from "@/lib/chartisme/catalog"
import {
  DRAFT_KEY,
  anchorsAfterMove,
  buildSketchGeometry,
  canFreeMoveHandle,
  canFreePlaceArrival,
  extremaIndices,
  invertLinear,
  isDemagnetizeModifier,
  isMagneted,
  liveToAnchor,
  magnetKindAt,
  magnetOnCurve,
  magnetOnTouches,
  moveSketchHandle,
  nearestSampleByX,
  nearestSketchHandle,
  newSketchId,
  pixelDistance,
  placementHint,
  readTooltipIndex,
  readWindow,
  remapSketch,
  resolveSketchBand,
  sketchDataKey,
  sketchSpan,
  sketchWithMovedHandle,
  swingTouches,
  valueFromPixelY,
  windowTooShort,
  type AxisScales,
  type ChartAnchor,
  type ChartSketch,
  type LiveCursor,
  type PixelSample,
  type SketchHandle,
  type SketchHandleSample,
} from "@/lib/chart-draw"
import type { MouseHandlerDataParam } from "recharts"

import { useChartDrawOptional } from "./chart-draw-context"

type ChartPointerState = MouseHandlerDataParam

export type PointerLike = {
  clientX: number
  clientY: number
  currentTarget: EventTarget | null
  altKey?: boolean
}

export type SketchablePoint = { date: string } & Record<string, number | string | null>

export function pointerPixel(state: ChartPointerState, event?: PointerLike) {
  if (event) return { x: event.clientX, y: event.clientY }
  const at = state.activeCoordinate
  if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
    return { x: at.x, y: at.y }
  }
  return null
}

export function chartSvg(event: PointerLike): SVGSVGElement | null {
  const node = event.currentTarget
  if (node instanceof SVGSVGElement) return node
  if (node instanceof SVGElement) return node.ownerSVGElement
  if (node instanceof Element) return node.querySelector("svg")
  return null
}

export function svgToClient(svg: SVGSVGElement, x: number, y: number) {
  if (typeof svg.createSVGPoint !== "function") return { x, y }
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x, y }
  const pt = svg.createSVGPoint()
  pt.x = x
  pt.y = y
  const screen = pt.matrixTransform(ctm)
  return { x: screen.x, y: screen.y }
}

export function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  if (typeof svg.createSVGPoint !== "function") return { x: clientX, y: clientY }
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: clientX, y: clientY }
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const local = pt.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
}

export function scaleInvertY(
  yScale: ((value: number) => number | undefined) | null | undefined,
  pixel: number
): number | null {
  if (!yScale) return null
  const scale = yScale as unknown as {
    invert?: (n: number) => unknown
    domain?: () => unknown[]
  }
  if (typeof scale.invert === "function") {
    const value = Number(scale.invert(pixel))
    if (Number.isFinite(value)) return value
  }
  const domain = typeof scale.domain === "function" ? scale.domain() : null
  const lo = domain && Number.isFinite(Number(domain[0])) ? Number(domain[0]) : null
  const hi = domain && Number.isFinite(Number(domain[1])) ? Number(domain[1]) : null
  if (lo == null || hi == null) return null
  return invertLinear((value) => yScale(value) ?? Number.NaN, pixel, lo, hi)
}

function writeBandFields(
  extra: Record<string, number | null>,
  prefix: string,
  date: string,
  upperAt: Map<string, number>,
  lowerAt: Map<string, number>
) {
  const u = upperAt.get(date)
  const l = lowerAt.get(date)
  if (u == null || l == null) return
  extra[`${prefix}_upper`] = u
  extra[`${prefix}_lower`] = l
  extra[`${prefix}_base`] = Math.min(u, l)
  extra[`${prefix}_span`] = Math.abs(u - l)
}

function writeMedianField(
  extra: Record<string, number | null>,
  prefix: string,
  date: string,
  medianAt: Map<string, number> | null
) {
  if (!medianAt) return
  const mid = medianAt.get(date)
  if (mid == null) return
  extra[`${prefix}_median`] = mid
}

function pixelSamples(
  dates: string[],
  values: number[],
  scales: AxisScales
): PixelSample[] {
  const { x, y } = scales
  if (!x || !y) return []
  const out: PixelSample[] = []
  for (let i = 0; i < dates.length; i += 1) {
    const value = values[i]
    if (value == null || !Number.isFinite(value)) continue
    const px = x(dates[i])
    const py = y(value)
    if (Number.isFinite(px) && Number.isFinite(py)) out.push({ index: i, px, py })
  }
  return out
}

export function useSketchChart<K extends string>({
  enabled = true,
  points,
  keys,
  targetKey,
  seriesLabel,
  seriesValues,
  axisId,
}: {
  enabled?: boolean
  points: SketchablePoint[]
  keys: readonly K[]
  targetKey: K
  seriesLabel: (key: K) => string
  seriesValues: (key: K) => number[]
  axisId: (key: K) => string | number
}) {
  const draw = useChartDrawOptional()
  const drawRef = useRef(draw)
  useLayoutEffect(() => {
    drawRef.current = draw
  })
  const scalesRef = useRef<AxisScales>({ x: null, y: null, invertY: null })
  const onScales = useCallback((scales: AxisScales) => {
    scalesRef.current = scales
  }, [])
  const lastPointerRef = useRef<{ state: ChartPointerState; event: PointerLike } | null>(
    null
  )
  const pointerLogicRef = useRef<{
    liveFromPointer: (
      state: ChartPointerState,
      event: PointerLike,
      demagnetizeOverride?: boolean
    ) => LiveCursor | null
    publishLive: (live: LiveCursor | null) => void
    hitHandle: (event: PointerLike) => {
      sketchId: string
      handle: SketchHandle
      distance: number
    } | null
    commitMove: (state: ChartPointerState, event: PointerLike) => boolean
    clearMove: () => void
  } | null>(null)
  const [altHeld, setAltHeld] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [moving, setMoving] = useState<{ sketchId: string; handle: SketchHandle } | null>(
    null
  )
  const [hoveredHandle, setHoveredHandle] = useState<{
    sketchId: string
    handle: SketchHandle
  } | null>(null)
  const movingRef = useRef<{ sketchId: string; handle: SketchHandle } | null>(null)
  const ignoreClickRef = useRef(false)
  const dragRef = useRef<{ startX: number; startY: number; dragged: boolean } | null>(
    null
  )

  const dates = useMemo(() => points.map((point) => String(point.date)), [points])
  const storedSketches = draw?.sketches
  const visibleSketches = useMemo(() => {
    if (!storedSketches) return []
    return storedSketches
      .map((sketch) => remapSketch(sketch, dates))
      .filter((sketch): sketch is NonNullable<typeof sketch> => sketch != null)
      .filter((sketch) => keys.includes(sketch.seriesKey as K))
  }, [storedSketches, dates, keys])

  const draftStart = draw?.draft?.start ?? null
  const draftMid = draw?.draft?.mid ?? null
  const draftLive = draw?.live ?? null
  const draftFigure = draw?.figure ?? "ete"
  const drawing = Boolean(enabled && draw?.drawing)
  const movingSketch =
    moving != null
      ? visibleSketches.find((item) => item.id === moving.sketchId) ?? null
      : null
  const displaySketches = useMemo(() => {
    if (!moving || !movingSketch || !draftLive) return visibleSketches
    const values = seriesValues(movingSketch.seriesKey as K)
    const preview = sketchWithMovedHandle(
      movingSketch,
      moving.handle,
      liveToAnchor(draftLive),
      values,
      dates
    )
    return visibleSketches.map((item) => (item.id === preview.id ? preview : item))
  }, [visibleSketches, moving, movingSketch, draftLive, seriesValues, dates])

  const draftGeometry = useMemo(() => {
    if (!drawing || moving || !draftStart || !draftLive) return null
    const values = seriesValues(targetKey)
    if (draftMid && isRailFigure(draftFigure)) {
      return buildSketchGeometry({
        figure: draftFigure,
        values,
        dates,
        from: draftStart.index,
        to: draftMid.index,
        fromActual: draftStart.actual,
        toActual: draftMid.actual,
        via: draftLive.index,
        viaActual: draftLive.actual,
      })
    }
    return buildSketchGeometry({
      figure: draftFigure,
      values,
      dates,
      from: draftStart.index,
      to: draftLive.index,
      fromActual: draftStart.actual,
      toActual: draftLive.actual,
    })
  }, [drawing, moving, draftStart, draftMid, draftLive, draftFigure, seriesValues, dates, targetKey])

  const draftPoints = draftGeometry?.points ?? []
  const draftBand = draftGeometry?.band
  const previewBand = movingSketch
    ? displaySketches.find((item) => item.id === movingSketch.id)?.band
    : draftBand
  const lastSketch = visibleSketches[0] ?? null
  const hudStart =
    moving && movingSketch
      ? moving.handle === "start"
        ? draftLive
          ? liveToAnchor(draftLive)
          : movingSketch.start
        : movingSketch.start
      : draftStart ?? lastSketch?.start ?? null
  const hudMid =
    moving && movingSketch
      ? moving.handle === "mid"
        ? draftLive
          ? liveToAnchor(draftLive)
          : movingSketch.mid ?? null
        : movingSketch.mid ?? null
      : draftMid
  const hudEnd =
    moving && movingSketch
      ? moving.handle === "end"
        ? draftLive
          ? liveToAnchor(draftLive)
          : movingSketch.end
        : movingSketch.end
      : draftStart
        ? null
        : lastSketch?.end ?? null

  const draftReading = useMemo(() => {
    if (moving && movingSketch && draftLive) {
      const { start, mid, end } = anchorsAfterMove(
        movingSketch,
        moving.handle,
        liveToAnchor(draftLive)
      )
      const { left, right } = sketchSpan(start, end, mid)
      if (windowTooShort(left, right)) return null
      const values = seriesValues(movingSketch.seriesKey as K)
      return readWindow(values, dates, left, right, previewBand)
    }
    if (draftStart && draftLive && draftLive.index !== draftStart.index) {
      if (windowTooShort(draftStart.index, draftLive.index)) return null
      const values = seriesValues(targetKey)
      return readWindow(values, dates, draftStart.index, draftLive.index, draftBand)
    }
    return lastSketch?.reading ?? null
  }, [
    moving,
    movingSketch,
    draftStart,
    draftLive,
    draftBand,
    previewBand,
    seriesValues,
    dates,
    targetKey,
    lastSketch,
  ])

  const mergeSketchFields = useCallback(
    (chartData: SketchablePoint[]) => {
      if (!displaySketches.length && !draftPoints.length && !draftBand) return chartData
      const bySketch = displaySketches.map((sketch) => {
        const values = seriesValues(sketch.seriesKey as K)
        const band = resolveSketchBand(sketch, values, dates)
        return {
          key: sketchDataKey(sketch.id),
          at: new Map(sketch.points.map((point) => [point.date, point.actual])),
          band,
          upperAt: band ? new Map(band.upper.map((point) => [point.date, point.actual])) : null,
          lowerAt: band ? new Map(band.lower.map((point) => [point.date, point.actual])) : null,
          medianAt:
            band?.median && (sketch.showMedian ?? draw?.showMedian)
              ? new Map(band.median.map((point) => [point.date, point.actual]))
              : null,
        }
      })
      const draftAt = new Map(draftPoints.map((point) => [point.date, point.actual]))
      const draftUpperAt = draftBand
        ? new Map(draftBand.upper.map((point) => [point.date, point.actual]))
        : null
      const draftLowerAt = draftBand
        ? new Map(draftBand.lower.map((point) => [point.date, point.actual]))
        : null
      const draftMedianAt =
        draftBand?.median && draw?.showMedian
          ? new Map(draftBand.median.map((point) => [point.date, point.actual]))
          : null
      return chartData.map((point) => {
        const extra: Record<string, number | null> = {}
        const date = String(point.date)
        for (const sketch of bySketch) {
          if (sketch.upperAt && sketch.lowerAt) {
            writeBandFields(extra, sketch.key, date, sketch.upperAt, sketch.lowerAt)
            writeMedianField(extra, sketch.key, date, sketch.medianAt)
          } else {
            extra[sketch.key] = sketch.at.get(date) ?? null
          }
        }
        if (draftUpperAt && draftLowerAt) {
          writeBandFields(extra, DRAFT_KEY, date, draftUpperAt, draftLowerAt)
          writeMedianField(extra, DRAFT_KEY, date, draftMedianAt)
        } else if (draftPoints.length) {
          extra[DRAFT_KEY] = draftAt.get(date) ?? null
        }
        return { ...point, ...extra }
      })
    },
    [displaySketches, draftPoints, draftBand, seriesValues, dates, draw?.showMedian]
  )

  useEffect(() => {
    if (!draw?.drawing) {
      setAltHeld(false)
      lastPointerRef.current = null
      return
    }
    function replay(demagnetize: boolean) {
      const snap = lastPointerRef.current
      const logic = pointerLogicRef.current
      if (!snap || !logic) return
      logic.publishLive(logic.liveFromPointer(snap.state, snap.event, demagnetize))
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const current = drawRef.current
        if (movingRef.current) {
          pointerLogicRef.current?.clearMove()
          setHint("Déplacement annulé. Clique un point pour le reprendre, ou un départ.")
          return
        }
        if (current?.draft?.start) current.cancelDraft()
        else current?.setDrawing(false)
        return
      }
      if (event.key === "Alt" || event.key === "AltGraph") {
        const current = drawRef.current
        const move = movingRef.current
        const freeEnd =
          Boolean(current?.draft?.start) ||
          (move != null && canFreeMoveHandle(move.handle, true))
        if (freeEnd) event.preventDefault()
        setAltHeld(true)
        replay(true)
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key !== "Alt" && event.key !== "AltGraph") return
      setAltHeld(false)
      replay(false)
    }
    function onBlur() {
      setAltHeld(false)
      replay(false)
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
    }
  }, [draw?.drawing])

  useEffect(() => {
    if (!drawing) {
      movingRef.current = null
      setMoving(null)
      setHoveredHandle(null)
      dragRef.current = null
    }
  }, [drawing])

  useEffect(() => {
    if (!moving) return
    function onUp(event: PointerEvent) {
      const drag = dragRef.current
      const logic = pointerLogicRef.current
      const snap = lastPointerRef.current
      if (!drag?.dragged) {
        dragRef.current = null
        return
      }
      ignoreClickRef.current = true
      if (snap && logic) {
        logic.commitMove(snap.state, {
          clientX: event.clientX,
          clientY: event.clientY,
          currentTarget: snap.event.currentTarget,
          altKey: event.altKey,
        })
      }
      dragRef.current = null
    }
    window.addEventListener("pointerup", onUp)
    return () => window.removeEventListener("pointerup", onUp)
  }, [moving])

  function rememberPointer(state: ChartPointerState, event: PointerLike) {
    lastPointerRef.current = {
      state,
      event: {
        clientX: event.clientX,
        clientY: event.clientY,
        currentTarget: event.currentTarget,
        altKey: event.altKey,
      },
    }
  }

  function movingSource(): ChartSketch | null {
    const move = movingRef.current
    if (!move) return null
    return visibleSketches.find((item) => item.id === move.sketchId) ?? null
  }

  function handleSamples(event?: PointerLike): SketchHandleSample[] {
    const svg = event ? chartSvg(event) : null
    const { x, y } = scalesRef.current
    if (!x || !y) return []
    const out: SketchHandleSample[] = []
    const targetAxis = axisId(targetKey)
    for (const sketch of visibleSketches) {
      const seriesKey = sketch.seriesKey as K
      if (axisId(seriesKey) !== targetAxis) continue
      const handles: SketchHandle[] = sketch.mid ? ["start", "mid", "end"] : ["start", "end"]
      for (const handle of handles) {
        const anchor = handle === "mid" ? sketch.mid : sketch[handle]
        if (!anchor) continue
        const px = x(anchor.date)
        const py = y(anchor.actual)
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue
        const client = svg ? svgToClient(svg, px, py) : { x: px, y: py }
        out.push({ sketchId: sketch.id, handle, px: client.x, py: client.y })
      }
    }
    return out
  }

  function hitHandle(event: PointerLike) {
    return nearestSketchHandle(handleSamples(event), {
      x: event.clientX,
      y: event.clientY,
    })
  }

  function clearMove() {
    movingRef.current = null
    setMoving(null)
    setHoveredHandle(null)
    dragRef.current = null
  }

  function beginMove(hit: { sketchId: string; handle: SketchHandle }) {
    const next = { sketchId: hit.sketchId, handle: hit.handle }
    movingRef.current = next
    setMoving(next)
    drawRef.current?.cancelDraft()
    setHint(
      hit.handle === "end"
        ? "Glisse, ou clique pour reposer le point. Alt (⌥) : hors courbe."
        : hit.handle === "mid"
          ? "Glisse, ou clique pour reposer le second point de la borne."
          : "Glisse, ou clique pour reposer le départ."
    )
  }

  function liveFromPointer(
    state: ChartPointerState,
    event: PointerLike,
    demagnetizeOverride?: boolean
  ): LiveCursor | null {
    if (!points.length) return null
    const move = movingRef.current
    const sketch = movingSource()
    const magnetKey = (sketch?.seriesKey as K | undefined) ?? targetKey
    const values = seriesValues(magnetKey)
    const pointer = pointerPixel(state, event)
    const svg = chartSvg(event)
    const rawSamples = pixelSamples(dates, values, scalesRef.current)
    const samples = svg
      ? rawSamples.map((sample) => {
          const client = svgToClient(svg, sample.px, sample.py)
          return { index: sample.index, px: client.x, py: client.y }
        })
      : rawSamples
    const current = drawRef.current
    const demagnetize = demagnetizeOverride ?? (isDemagnetizeModifier(event) || altHeld)
    const figure = sketch?.figure ?? current?.figure ?? ""
    const offCurve = move
      ? canFreeMoveHandle(move.handle, demagnetize)
      : canFreePlaceArrival(Boolean(current?.draft?.start), demagnetize)
    const extrema = extremaIndices(values)
    const touches = swingTouches(values)
    const rails = isRailFigure(figure)
    let prefer: "H" | "L" | "any" = "any"
    if (rails) {
      if (move && sketch) {
        if (move.handle === "end") {
          const atStart = touches.find((touch) => touch.index === sketch.start.index)
          prefer = atStart?.type === "H" ? "L" : atStart?.type === "L" ? "H" : "any"
        } else if (move.handle === "mid") {
          const atStart = touches.find((touch) => touch.index === sketch.start.index)
          prefer = atStart?.type ?? "any"
        } else if (sketch.mid) {
          const atMid = touches.find((touch) => touch.index === sketch.mid?.index)
          prefer = atMid?.type ?? "any"
        }
      } else {
        const startTouch = current?.draft?.start
        const midTouch = current?.draft?.mid
        if (startTouch && !midTouch) {
          const atStart = touches.find((touch) => touch.index === startTouch.index)
          prefer = atStart?.type ?? "any"
        } else if (startTouch && midTouch) {
          const atStart = touches.find((touch) => touch.index === startTouch.index)
          prefer = atStart?.type === "H" ? "L" : atStart?.type === "L" ? "H" : "any"
        }
      }
    }
    let index: number | null = null
    let distance: number | null = null
    let curveKind: LiveCursor["kind"] | null = null
    if (pointer && samples.length) {
      if (offCurve) {
        const near = nearestSampleByX(samples, pointer.x)
        if (near) {
          index = near.index
          const at = samples.find((item) => item.index === near.index)
          distance = at ? Math.hypot(pointer.x - at.px, pointer.y - at.py) : near.distanceX
        }
      } else {
        const hit = rails
          ? magnetOnTouches(samples, pointer, touches, prefer)
          : magnetOnCurve(samples, pointer, extrema)
        if (hit) {
          index = hit.index
          distance = hit.distance
          curveKind = hit.kind
        }
      }
    }
    if (index == null) {
      index = readTooltipIndex(state.activeTooltipIndex ?? state.activeIndex)
      const active = state.activeCoordinate
      if (active && svg) {
        distance = pixelDistance(pointer, svgToClient(svg, active.x, active.y))
      } else {
        distance = pixelDistance(pointer, active ?? null)
      }
    }
    if (index == null || index < 0 || index >= points.length) return null
    if (offCurve) {
      const svgLocal = svg && pointer ? clientToSvg(svg, pointer.x, pointer.y) : null
      let plotted: number | null = null
      if (svgLocal) {
        const inverted = scalesRef.current.invertY?.(svgLocal.y)
        if (inverted != null && Number.isFinite(inverted)) plotted = inverted
        if (plotted == null && rawSamples.length) {
          plotted = valueFromPixelY(rawSamples, values, svgLocal.y)
        }
      }
      if (plotted != null && Number.isFinite(plotted)) {
        const sample = samples.find((item) => item.index === index)
        if (sample && pointer) {
          distance = Math.hypot(pointer.x - sample.px, pointer.y - sample.py)
        }
        return {
          index,
          date: dates[index],
          seriesKey: magnetKey,
          seriesLabel: seriesLabel(magnetKey),
          actual: plotted,
          snapped: false,
          offCurve: true,
          kind: "free",
          distancePx: distance,
          clientX: event.clientX,
          clientY: event.clientY,
        }
      }
    }
    const snapped = isMagneted(distance)
    const kind = snapped
      ? curveKind && curveKind !== "free"
        ? curveKind
        : magnetKindAt(index, extrema)
      : "free"
    const sample = samples.find((item) => item.index === index)
    if (sample && pointer) distance = Math.hypot(pointer.x - sample.px, pointer.y - sample.py)
    const actual = values[index]
    if (actual == null || !Number.isFinite(actual)) return null
    return {
      index,
      date: dates[index],
      seriesKey: magnetKey,
      seriesLabel: seriesLabel(magnetKey),
      actual,
      snapped,
      offCurve: false,
      kind,
      distancePx: distance,
      clientX: event.clientX,
      clientY: event.clientY,
    }
  }

  function publishLive(live: LiveCursor | null) {
    const current = drawRef.current
    if (!current?.drawing) return
    current.setLive(live)
    const move = movingRef.current
    const sketch = movingSource()
    let shortWindow = false
    if (move && sketch && live) {
      const { start, mid, end } = anchorsAfterMove(sketch, move.handle, liveToAnchor(live))
      const { left, right } = sketchSpan(start, end, mid)
      shortWindow = left !== right && windowTooShort(left, right)
    }
    setHint(
      placementHint({
        live,
        startIndex: current.draft?.start?.index ?? null,
        midIndex: current.draft?.mid?.index ?? null,
        rails: isRailFigure(sketch?.figure ?? current.figure),
        moving: move?.handle ?? null,
        hoverHandle: hoveredHandle?.handle ?? null,
        shortWindow,
      })
    )
  }

  function commitMove(state: ChartPointerState, event: PointerLike) {
    const current = drawRef.current
    const move = movingRef.current
    const sketch = movingSource()
    if (!current || !move || !sketch) return false
    rememberPointer(state, event)
    const live = liveFromPointer(state, event)
    if (!live) {
      setHint("Survole la courbe.")
      return false
    }
    if ((move.handle === "start" || move.handle === "mid") && !live.snapped) {
      setHint(
        move.handle === "mid"
          ? "Approche un pivot pour reposer le second point."
          : "Approche la courbe pour reposer le départ."
      )
      return false
    }
    if (!live.snapped && !live.offCurve) {
      setHint(
        placementHint({
          live,
          startIndex: current.draft?.start?.index ?? null,
          midIndex: current.draft?.mid?.index ?? null,
          rails: isRailFigure(sketch.figure),
          moving: move.handle,
        })
      )
      return false
    }
    const values = seriesValues(sketch.seriesKey as K)
    const nextAnchor = liveToAnchor({ ...live, seriesKey: sketch.seriesKey })
    const { start, mid, end } = anchorsAfterMove(sketch, move.handle, nextAnchor)
    const { left, right } = sketchSpan(start, end, mid)
    const next = moveSketchHandle(
      sketch,
      move.handle,
      nextAnchor,
      values,
      dates,
      windowTooShort(left, right) ? null : undefined
    )
    if (!next) {
      setHint("Au moins 8 tirages pour refermer la figure.")
      return false
    }
    current.addSketch({
      ...next,
      reading: readWindow(values, dates, left, right, next.band),
    })
    clearMove()
    setHint("Point déplacé. Clique un nouveau départ, ou un point pour le reprendre.")
    return true
  }

  useLayoutEffect(() => {
    pointerLogicRef.current = {
      liveFromPointer,
      publishLive,
      hitHandle,
      commitMove,
      clearMove,
    }
  })

  function onChartMove(state: ChartPointerState, event: PointerLike) {
    const current = drawRef.current
    if (!enabled || !current?.drawing) return
    rememberPointer(state, event)
    const drafting = Boolean(current.draft?.start || current.draft?.mid)
    const hit = !drafting && !movingRef.current ? hitHandle(event) : null
    setHoveredHandle(hit ? { sketchId: hit.sketchId, handle: hit.handle } : null)
    publishLive(liveFromPointer(state, event))
    if (hit && !movingRef.current && !drafting) {
      setHint("Clique ou glisse ce point pour le déplacer.")
    }
    if (dragRef.current && movingRef.current) {
      const dx = event.clientX - dragRef.current.startX
      const dy = event.clientY - dragRef.current.startY
      if (Math.hypot(dx, dy) > 4) dragRef.current.dragged = true
    }
  }

  function onChartPointerDown(state: ChartPointerState, event: PointerLike) {
    const current = drawRef.current
    if (!enabled || !current?.drawing) return
    if (current.draft?.start || current.draft?.mid || movingRef.current) return
    rememberPointer(state, event)
    const hit = hitHandle(event)
    if (!hit) return
    beginMove(hit)
    dragRef.current = { startX: event.clientX, startY: event.clientY, dragged: false }
    ignoreClickRef.current = true
  }

  function onChartClick(state: ChartPointerState, event: PointerLike) {
    const current = drawRef.current
    if (!enabled || !current?.drawing) return
    if (ignoreClickRef.current) {
      ignoreClickRef.current = false
      return
    }
    rememberPointer(state, event)
    if (movingRef.current) {
      commitMove(state, event)
      return
    }
    const hit = !(current.draft?.start || current.draft?.mid) ? hitHandle(event) : null
    if (hit) {
      beginMove(hit)
      return
    }
    const live = liveFromPointer(state, event)
    if (!live) {
      setHint("Survole la courbe.")
      return
    }
    if (!live.snapped && !live.offCurve) {
      setHint(
        placementHint({
          live,
          startIndex: current.draft?.start?.index ?? null,
          midIndex: current.draft?.mid?.index ?? null,
          rails: isRailFigure(current.figure),
        })
      )
      return
    }
    const start = current.draft?.start
    const mid = current.draft?.mid
    const rails = isRailFigure(current.figure)
    const makeAnchor = (): ChartAnchor => ({
      index: live.index,
      date: live.date,
      seriesKey: live.seriesKey,
      actual: live.actual,
      snapped: live.snapped,
      kind: live.kind,
    })
    if (!start) {
      if (!live.snapped) {
        setHint("Approche un pivot pour ancrer la borne.")
        return
      }
      current.setDraft({
        figure: current.figure,
        seriesKey: targetKey,
        seriesLabel: seriesLabel(targetKey),
        start: makeAnchor(),
        mid: null,
      })
      setHint(
        rails
          ? "Clique le second point de la borne."
          : "Clique l’arrivée. Alt (⌥) : hors courbe."
      )
      return
    }
    if (rails && !mid) {
      if (live.index === start.index) {
        setHint("Choisis un autre point pour fermer la borne.")
        return
      }
      current.setDraft({
        figure: current.figure,
        seriesKey: targetKey,
        seriesLabel: seriesLabel(targetKey),
        start,
        mid: makeAnchor(),
      })
      setHint("Clique le contact opposé — le parallèle (ou la seconde borne).")
      return
    }
    const left = Math.min(start.index, mid?.index ?? live.index, live.index)
    const right = Math.max(start.index, mid?.index ?? live.index, live.index)
    if (windowTooShort(left, right)) {
      setHint("Au moins 8 tirages pour refermer la figure.")
      return
    }
    const values = seriesValues(targetKey)
    const end = makeAnchor()
    const geo = buildSketchGeometry({
      figure: current.figure,
      values,
      dates,
      from: start.index,
      to: rails && mid ? mid.index : end.index,
      fromActual: start.actual,
      toActual: rails && mid ? mid.actual : end.actual,
      via: rails ? end.index : undefined,
      viaActual: rails ? end.actual : undefined,
    })
    current.addSketch({
      id: newSketchId(),
      host: current.host,
      figure: current.figure,
      seriesKey: targetKey,
      seriesLabel: seriesLabel(targetKey),
      start,
      mid: rails ? mid ?? undefined : undefined,
      end,
      points: geo.points,
      band: geo.band,
      showMedian: current.showMedian,
      reading: readWindow(values, dates, left, right, geo.band),
      createdAt: new Date().toISOString(),
    })
    setHint("Annotation posée. Clique un nouveau départ, ou un point pour le reprendre.")
  }

  function onChartLeave() {
    setHoveredHandle(null)
    if (movingRef.current) return
    lastPointerRef.current = null
    if (draw?.drawing) draw.setLive(null)
  }

  function startDrawing() {
    if (!draw) return
    const next = !draw.drawing
    draw.setDrawing(next)
    clearMove()
    if (next) {
      draw.setDraft({
        figure: draw.figure,
        seriesKey: targetKey,
        seriesLabel: seriesLabel(targetKey),
        start: null,
        mid: null,
      })
      setHint(
        isRailFigure(draw.figure)
          ? "Clique le premier point de la borne, ou un point déjà posé."
          : "Clique le départ, ou un point déjà posé pour le reprendre."
      )
    } else {
      setHint(null)
    }
  }

  return {
    draw: enabled ? draw : null,
    drawing,
    dates,
    hint,
    setHint,
    moving,
    hoveredHandle,
    displaySketches,
    draftPoints,
    draftBand,
    previewBand,
    hudStart,
    hudMid,
    hudEnd,
    draftReading,
    mergeSketchFields,
    onScales,
    onChartMove,
    onChartPointerDown,
    onChartClick,
    onChartLeave,
    startDrawing,
    clearMove,
    targetAxisId: axisId(targetKey),
  }
}
