"use client"

import { Fragment, useLayoutEffect } from "react"
import {
  Area,
  Line,
  ReferenceDot,
  ReferenceLine,
  useXAxisScale,
  useYAxisScale,
} from "recharts"

import {
  DRAFT_KEY,
  channelLabel,
  isFreeFigure,
  sketchDataKey,
  type AxisScales,
  type ChartSketch,
  type LiveCursor,
  type SketchHandle,
} from "@/lib/chart-draw"

import { scaleInvertY } from "./use-sketch-chart"

export function MagnetHalo({
  live,
  plotted,
  onScales,
  yAxisId,
}: {
  live: LiveCursor | null
  plotted: number | null
  onScales: (scales: AxisScales) => void
  yAxisId?: string | number
}) {
  const xScale = useXAxisScale()
  const yScale = useYAxisScale(yAxisId)
  useLayoutEffect(() => {
    onScales({
      x: xScale ? (value) => xScale(value, { position: "middle" }) ?? Number.NaN : null,
      y: yScale ? (value) => yScale(value) ?? Number.NaN : null,
      invertY: yScale ? (pixel) => scaleInvertY(yScale, pixel) ?? Number.NaN : null,
    })
  }, [xScale, yScale, onScales])
  if (!live || plotted == null || !xScale || !yScale) return null
  const mx = xScale(live.date, { position: "middle" })
  const my = yScale(plotted)
  if (mx == null || my == null || !Number.isFinite(mx) || !Number.isFinite(my)) return null
  return (
    <g pointerEvents="none">
      <circle
        cx={mx}
        cy={my}
        r={live.snapped ? 8 : 5}
        fill="none"
        stroke="var(--chart-4)"
        strokeWidth={live.snapped ? 2 : 1}
        strokeDasharray={live.snapped ? undefined : "3 2"}
      />
    </g>
  )
}

export function SketchPlotLayers({
  sketches,
  draftBand,
  hasDraftLine,
  targetAxisId,
  axisId,
  drawing,
  moving,
  hoveredHandle,
  live,
  draftStart,
  draftMid,
  draftFigure,
  showMedian,
  onScales,
}: {
  sketches: ChartSketch[]
  draftBand: ChartSketch["band"] | null | undefined
  hasDraftLine: boolean
  targetAxisId: string | number
  axisId: (key: string) => string | number
  drawing: boolean
  moving: { sketchId: string; handle: SketchHandle } | null
  hoveredHandle: { sketchId: string; handle: SketchHandle } | null
  live: LiveCursor | null
  draftStart: ChartSketch["start"] | null
  draftMid: ChartSketch["mid"] | null | undefined
  draftFigure: string
  showMedian: boolean
  onScales: (scales: AxisScales) => void
}) {
  return (
    <>
      {sketches.map((sketch) => {
        const yId = axisId(sketch.seriesKey)
        const band = sketch.band
        const prefix = sketchDataKey(sketch.id)
        if (band) {
          return (
            <Fragment key={sketch.id}>
              <Area
                type="linear"
                dataKey={`${prefix}_base`}
                yAxisId={yId}
                stackId={`canal-${sketch.id}`}
                fill="transparent"
                stroke="none"
                legendType="none"
                tooltipType="none"
                isAnimationActive={false}
              />
              <Area
                type="linear"
                dataKey={`${prefix}_span`}
                yAxisId={yId}
                stackId={`canal-${sketch.id}`}
                fill="var(--chart-5)"
                fillOpacity={0.16}
                stroke="none"
                legendType="none"
                tooltipType="none"
                isAnimationActive={false}
              />
              <Line
                dataKey={`${prefix}_upper`}
                yAxisId={yId}
                type="linear"
                stroke="var(--chart-5)"
                strokeWidth={2}
                dot={false}
                connectNulls
                legendType="none"
                tooltipType="none"
                isAnimationActive={false}
                name={`${channelLabel(sketch.figure, band)} +`}
              />
              <Line
                dataKey={`${prefix}_lower`}
                yAxisId={yId}
                type="linear"
                stroke="var(--chart-5)"
                strokeWidth={2}
                dot={false}
                connectNulls
                legendType="none"
                tooltipType="none"
                isAnimationActive={false}
                name={`${channelLabel(sketch.figure, band)} −`}
              />
              {sketch.showMedian ?? showMedian ? (
                <Line
                  dataKey={`${prefix}_median`}
                  yAxisId={yId}
                  type="linear"
                  stroke="var(--chart-5)"
                  strokeWidth={1.25}
                  strokeDasharray="4 3"
                  strokeOpacity={0.85}
                  dot={false}
                  connectNulls
                  legendType="none"
                  tooltipType="none"
                  isAnimationActive={false}
                  name="Médiane"
                />
              ) : null}
              {band.target != null ? (
                <ReferenceLine
                  y={band.target}
                  yAxisId={yId}
                  stroke="var(--chart-3)"
                  strokeDasharray="2 4"
                  strokeOpacity={0.8}
                  label={{
                    value: "objectif",
                    fill: "var(--chart-3)",
                    fontSize: 10,
                    position: "insideTopRight",
                  }}
                />
              ) : null}
            </Fragment>
          )
        }
        return (
          <Line
            key={sketch.id}
            dataKey={sketchDataKey(sketch.id)}
            yAxisId={yId}
            type={isFreeFigure(sketch.figure) ? "linear" : "monotone"}
            stroke="var(--chart-4)"
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            connectNulls
            legendType="none"
            tooltipType="none"
            isAnimationActive={false}
            name={sketch.seriesLabel}
          />
        )
      })}
      {draftBand ? (
        <Fragment>
          <Area
            type="linear"
            dataKey={`${DRAFT_KEY}_base`}
            yAxisId={targetAxisId}
            stackId="canal-draft"
            fill="transparent"
            stroke="none"
            legendType="none"
            tooltipType="none"
            isAnimationActive={false}
          />
          <Area
            type="linear"
            dataKey={`${DRAFT_KEY}_span`}
            yAxisId={targetAxisId}
            stackId="canal-draft"
            fill="var(--chart-5)"
            fillOpacity={0.1}
            stroke="none"
            legendType="none"
            tooltipType="none"
            isAnimationActive={false}
          />
          <Line
            dataKey={`${DRAFT_KEY}_upper`}
            yAxisId={targetAxisId}
            type="linear"
            stroke="var(--chart-5)"
            strokeWidth={2}
            strokeOpacity={0.9}
            dot={false}
            connectNulls
            legendType="none"
            tooltipType="none"
            isAnimationActive={false}
          />
          <Line
            dataKey={`${DRAFT_KEY}_lower`}
            yAxisId={targetAxisId}
            type="linear"
            stroke="var(--chart-5)"
            strokeWidth={2}
            strokeOpacity={0.9}
            dot={false}
            connectNulls
            legendType="none"
            tooltipType="none"
            isAnimationActive={false}
          />
          {showMedian ? (
            <Line
              dataKey={`${DRAFT_KEY}_median`}
              yAxisId={targetAxisId}
              type="linear"
              stroke="var(--chart-5)"
              strokeWidth={1.25}
              strokeDasharray="4 3"
              strokeOpacity={0.75}
              dot={false}
              connectNulls
              legendType="none"
              tooltipType="none"
              isAnimationActive={false}
            />
          ) : null}
          {draftBand.target != null ? (
            <ReferenceLine
              y={draftBand.target}
              yAxisId={targetAxisId}
              stroke="var(--chart-3)"
              strokeDasharray="2 4"
              strokeOpacity={0.7}
            />
          ) : null}
        </Fragment>
      ) : hasDraftLine ? (
        <Line
          dataKey={DRAFT_KEY}
          yAxisId={targetAxisId}
          type={isFreeFigure(draftFigure) ? "linear" : "monotone"}
          stroke="var(--chart-4)"
          strokeWidth={2}
          strokeDasharray="2 3"
          strokeOpacity={0.9}
          dot={false}
          connectNulls
          legendType="none"
          tooltipType="none"
          isAnimationActive={false}
        />
      ) : null}
      {draftStart ? (
        <>
          <ReferenceLine
            x={draftStart.date}
            stroke="var(--chart-4)"
            strokeDasharray="3 3"
            strokeOpacity={0.55}
          />
          <ReferenceDot
            x={draftStart.date}
            y={draftStart.actual}
            yAxisId={axisId(draftStart.seriesKey)}
            r={5}
            fill="var(--chart-4)"
            stroke="var(--background)"
          />
        </>
      ) : null}
      {draftMid ? (
        <ReferenceDot
          x={draftMid.date}
          y={draftMid.actual}
          yAxisId={axisId(draftMid.seriesKey)}
          r={5}
          fill="var(--chart-5)"
          stroke="var(--background)"
        />
      ) : null}
      {drawing && live ? (
        <>
          <ReferenceLine
            x={live.date}
            stroke="var(--chart-4)"
            strokeDasharray="3 3"
            strokeOpacity={0.35}
          />
          <ReferenceDot
            x={live.date}
            y={live.actual}
            yAxisId={axisId(live.seriesKey)}
            r={4}
            fill={live.snapped ? "var(--chart-4)" : "transparent"}
            stroke="var(--chart-4)"
          />
        </>
      ) : null}
      {sketches.map((sketch) => {
        const yId = axisId(sketch.seriesKey)
        const handleActive = (handle: SketchHandle) =>
          (moving?.sketchId === sketch.id && moving.handle === handle) ||
          (hoveredHandle?.sketchId === sketch.id && hoveredHandle.handle === handle)
        return (
          <Fragment key={`${sketch.id}-anchors`}>
            <ReferenceDot
              x={sketch.start.date}
              y={sketch.start.actual}
              yAxisId={yId}
              r={handleActive("start") ? 7 : drawing ? 5.5 : 4}
              fill="var(--chart-4)"
              stroke={handleActive("start") ? "var(--foreground)" : "var(--background)"}
            />
            <ReferenceDot
              x={sketch.end.date}
              y={sketch.end.actual}
              yAxisId={yId}
              r={handleActive("end") ? 7 : drawing ? 5.5 : 4}
              fill="var(--chart-4)"
              stroke={handleActive("end") ? "var(--foreground)" : "var(--background)"}
            />
            {sketch.mid ? (
              <ReferenceDot
                x={sketch.mid.date}
                y={sketch.mid.actual}
                yAxisId={yId}
                r={handleActive("mid") ? 7 : drawing ? 5.5 : 4}
                fill="var(--chart-5)"
                stroke={handleActive("mid") ? "var(--foreground)" : "var(--background)"}
              />
            ) : null}
          </Fragment>
        )
      })}
      <MagnetHalo
        live={drawing ? live : null}
        plotted={live?.actual ?? null}
        onScales={onScales}
        yAxisId={live ? axisId(live.seriesKey) : targetAxisId}
      />
    </>
  )
}
