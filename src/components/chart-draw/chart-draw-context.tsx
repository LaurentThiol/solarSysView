"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import {
  persistHostSketches,
  loadSketches,
  type ChartDrawHost,
  type ChartSketch,
  type DraftPlacement,
  type EvolutionChartMeta,
  type LiveCursor,
} from "@/lib/chart-draw"

type ChartDrawContextValue = {
  host: ChartDrawHost
  sketches: ChartSketch[]
  drawing: boolean
  figure: string
  draft: DraftPlacement | null
  live: LiveCursor | null
  chartMeta: EvolutionChartMeta | null
  showMedian: boolean
  setDrawing: (value: boolean) => void
  setFigure: (figure: string) => void
  setDraft: (draft: DraftPlacement | null) => void
  setLive: (live: LiveCursor | null) => void
  setChartMeta: (meta: EvolutionChartMeta | null) => void
  setShowMedian: (value: boolean) => void
  addSketch: (sketch: ChartSketch, nextDraft?: DraftPlacement) => void
  removeSketch: (id: string) => void
  clearSketches: () => void
  cancelDraft: () => void
}

const ChartDrawContext = createContext<ChartDrawContextValue | null>(null)

export function ChartDrawProvider({
  host,
  children,
}: {
  host: ChartDrawHost
  children: ReactNode
}) {
  const [sketches, setSketches] = useState<ChartSketch[]>([])
  const [drawing, setDrawingState] = useState(false)
  const [figure, setFigureState] = useState("ete")
  const [draft, setDraft] = useState<DraftPlacement | null>(null)
  const [live, setLive] = useState<LiveCursor | null>(null)
  const [chartMeta, setChartMeta] = useState<EvolutionChartMeta | null>(null)
  const [showMedian, setShowMedian] = useState(true)

  useEffect(() => {
    // localStorage n'existe pas au rendu serveur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSketches(loadSketches().filter((item) => item.host === host))
  }, [host])

  const setDrawing = useCallback((value: boolean) => {
    setDrawingState(value)
    if (!value) {
      setDraft(null)
      setLive(null)
    }
  }, [])

  const setFigure = useCallback((next: string) => {
    setFigureState(next)
    setDraft((current) => {
      if (!current) return current
      if (current.parallelOf) {
        return {
          figure: next,
          seriesKey: current.seriesKey,
          seriesLabel: current.seriesLabel,
          start: null,
          mid: null,
          parallelOf: null,
        }
      }
      return { ...current, figure: next }
    })
  }, [])

  const addSketch = useCallback(
    (sketch: ChartSketch, nextDraft?: DraftPlacement) => {
      setSketches((current) => {
        const next = [sketch, ...current.filter((item) => item.id !== sketch.id)]
        persistHostSketches(host, next)
        return next
      })
      setDraft(
        nextDraft ?? {
          figure: sketch.figure,
          seriesKey: sketch.seriesKey,
          seriesLabel: sketch.seriesLabel,
          start: null,
          mid: null,
          parallelOf: null,
        }
      )
    },
    [host]
  )

  const removeSketch = useCallback(
    (id: string) => {
      setSketches((current) => {
        const next = current.filter((item) => item.id !== id)
        persistHostSketches(host, next)
        return next
      })
    },
    [host]
  )

  const clearSketches = useCallback(() => {
    setSketches([])
    persistHostSketches(host, [])
    setDraft(null)
  }, [host])

  const cancelDraft = useCallback(() => {
    setDraft((current) => {
      if (!current) return current
      if (current.parallelOf) {
        return {
          figure: current.figure,
          seriesKey: current.seriesKey,
          seriesLabel: current.seriesLabel,
          start: null,
          mid: null,
          parallelOf: null,
        }
      }
      if (current.mid) return { ...current, mid: null }
      return { ...current, start: null, mid: null }
    })
    setLive(null)
  }, [])

  const value = useMemo<ChartDrawContextValue>(
    () => ({
      host,
      sketches,
      drawing,
      figure,
      draft,
      live,
      chartMeta,
      showMedian,
      setDrawing,
      setFigure,
      setDraft,
      setLive,
      setChartMeta,
      setShowMedian,
      addSketch,
      removeSketch,
      clearSketches,
      cancelDraft,
    }),
    [
      host,
      sketches,
      drawing,
      figure,
      draft,
      live,
      chartMeta,
      showMedian,
      setDrawing,
      setFigure,
      setShowMedian,
      addSketch,
      removeSketch,
      clearSketches,
      cancelDraft,
    ]
  )

  return <ChartDrawContext.Provider value={value}>{children}</ChartDrawContext.Provider>
}

export function useChartDraw() {
  const ctx = useContext(ChartDrawContext)
  if (!ctx) throw new Error("useChartDraw must be used within ChartDrawProvider")
  return ctx
}

export function useChartDrawOptional() {
  return useContext(ChartDrawContext)
}
