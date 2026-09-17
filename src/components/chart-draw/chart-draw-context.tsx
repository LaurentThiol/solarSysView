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
  setDrawing: (value: boolean) => void
  setFigure: (figure: string) => void
  setDraft: (draft: DraftPlacement | null) => void
  setLive: (live: LiveCursor | null) => void
  setChartMeta: (meta: EvolutionChartMeta | null) => void
  addSketch: (sketch: ChartSketch) => void
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
    setDraft((current) => (current ? { ...current, figure: next } : current))
  }, [])

  const addSketch = useCallback(
    (sketch: ChartSketch) => {
      setSketches((current) => {
        const next = [sketch, ...current.filter((item) => item.id !== sketch.id)]
        persistHostSketches(host, next)
        return next
      })
      setDraft({
        figure: sketch.figure,
        seriesKey: sketch.seriesKey,
        seriesLabel: sketch.seriesLabel,
        start: null,
      })
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
    setDraft((current) => (current ? { ...current, start: null } : current))
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
      setDrawing,
      setFigure,
      setDraft,
      setLive,
      setChartMeta,
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
      setDrawing,
      setFigure,
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
