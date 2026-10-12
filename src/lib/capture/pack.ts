import { macd, rsi, VARIABLE_LABELS, type VariableName } from "@/lib/analysis"
import type { BounceCapture } from "@/lib/bouncing"
import { compactSketch, drawingSummaryLines, type ChartSketch, type EvolutionChartMeta } from "@/lib/chart-draw"
import {
  formatWindowBanner,
  WINDOW_PRESET_LABELS,
  type ResolvedWindow,
  type WindowPreset,
} from "@/lib/analysis-window"
import type { BaseRate } from "@/lib/chartisme/base-rate"
import type { ScanHit } from "@/lib/chartisme/scan"
import type { HarmoPeak, HarmoReport } from "@/lib/harmo"
import {
  downsampleSeries,
  lastFinite,
  lastFlag,
  roundish,
  seriesStats,
  withinBudget,
  INDEPENDENCE_DISCLAIMER,
  type CaptureContext,
  type SeriesPoint,
} from "@/lib/capture/snapshot"

function lastRounded(values: Array<number | null | undefined>, digits = 4) {
  return roundish(lastFinite(values), digits)
}

export function packAnalyse(input: {
  tab: string
  era: string
  source: string
  variable: VariableName
  ball: number
  star: number
  query: string
  windowSize: number
  preset: WindowPreset
  resolved: ResolvedWindow<{ date: string }>
  warmupCount: number
  points: SeriesPoint[]
  values: number[]
  last: Record<string, number | null>
  adxRegime: string
  structure: unknown
  squeeze: Array<boolean | null>
  disclaimer: string
}): CaptureContext {
  const { resolved, points, values } = input
  const macdPack = macd(values)
  const series = downsampleSeries(points)
  const last = {
    value: lastRounded(values),
    rsi: lastRounded(rsi(values, 14), 2),
    macd: lastRounded(macdPack.line),
    macdSignal: lastRounded(macdPack.signal),
    macdHist: lastRounded(macdPack.histogram),
    squeeze: lastFlag(input.squeeze),
    wma: roundish(input.last.wma),
    hma: roundish(input.last.hma),
    adx: roundish(input.last.adx, 2),
    cci: roundish(input.last.cci, 2),
    stochK: roundish(input.last.stochK, 2),
    mfi: roundish(input.last.mfi, 2),
    vwap: roundish(input.last.vwap),
    percentB: roundish(input.last.percentB, 3),
    atr: roundish(input.last.atr),
  }
  const banner = formatWindowBanner(resolved)
  const variableLabel = VARIABLE_LABELS[input.variable]
  const summary = [
    `Analyse · ${input.tab} · ${variableLabel}`,
    banner,
    `Période indicateurs X = ${input.windowSize} · warmup ${input.warmupCount} · archive ${input.era} (${input.source})`,
    last.value != null ? `Dernière valeur ${last.value}` : "Série vide",
    last.rsi != null ? `RSI ${last.rsi} · ADX ${last.adx ?? "—"} (${input.adxRegime})` : `ADX ${last.adx ?? "—"} (${input.adxRegime})`,
  ]
  return {
    lab: "analyse",
    tab: input.tab,
    archive: {
      n: resolved.drawCount,
      from: resolved.fromDate,
      to: resolved.toDate,
      source: input.source,
    },
    summary,
    tech: withinBudget({
      lab: "analyse",
      tab: input.tab,
      era: input.era,
      source: input.source,
      variable: input.variable,
      variableLabel,
      ball: input.ball,
      star: input.star,
      query: input.query || null,
      periodX: input.windowSize,
      preset: input.preset,
      presetLabel: WINDOW_PRESET_LABELS[input.preset],
      window: {
        from: resolved.fromDate,
        to: resolved.toDate,
        n: resolved.drawCount,
        warmup: input.warmupCount,
        banner,
      },
      seriesStats: seriesStats(points),
      series,
      last,
      adxRegime: input.adxRegime,
      structure: input.structure,
      disclaimer: input.disclaimer,
    }),
  }
}

function compactHit(hit: ScanHit) {
  return {
    figure: hit.figure,
    label: hit.label,
    kind: hit.kind,
    signal: hit.signal,
    confidence: roundish(hit.confidence, 3),
    scale: hit.scale,
    from: hit.from,
    to: hit.to,
    outcome: hit.outcome,
    breakout: hit.breakout
      ? {
          date: hit.breakout.date,
          direction: hit.breakout.direction,
          confirmed: hit.breakout.confirmed,
          fake: hit.breakout.fake,
          holds: hit.breakout.holds,
          activity_ratio: roundish(hit.breakout.activity_ratio, 3),
        }
      : null,
    target: hit.target,
    pivots: hit.pivots.map((pivot) => ({
      role: pivot.role,
      date: pivot.date,
      value: roundish(pivot.value),
    })),
  }
}

function compactRate(rate: BaseRate) {
  return {
    length: rate.length,
    trials: rate.trials,
    carrying: roundish(rate.carrying, 3),
    interval: [roundish(rate.interval[0], 3), roundish(rate.interval[1], 3)] as const,
    medianBest: roundish(rate.medianBest, 3),
    figures: rate.figures.slice(0, 8).map((item) => ({
      figure: item.figure,
      label: item.label,
      rate: roundish(item.rate, 3),
    })),
  }
}

export function packChartisme(input: {
  curveId: string
  curveLabel: string
  era: string
  source: string
  preset: string
  presetLabel: string
  scaleChoice: string
  scales: number[]
  banner: string
  caveat: string | null
  measured: string | null
  minConfidence: number
  drawCount: number
  contextCount: number
  from: string | null
  to: string | null
  dates: string[]
  values: number[]
  hits: ScanHit[]
  baseRates: BaseRate[]
}): CaptureContext {
  const offset = input.contextCount
  const studyPoints: SeriesPoint[] = input.dates.slice(offset).map((date, index) => ({
    date,
    value: input.values[offset + index] ?? 0,
  }))
  const series = downsampleSeries(studyPoints)
  const hits = input.hits.slice(0, 12).map(compactHit)
  const summary = [
    `Chartisme · ${input.curveId} · ${input.curveLabel}`,
    input.banner,
    `${input.hits.length} lecture(s) géométrique(s) dans la fenêtre`,
    hits[0]
      ? `Lecture principale : ${hits[0].label} (${hits[0].confidence ?? "—"})`
      : "Aucune lecture géométrique dans cette fenêtre",
  ]
  if (input.caveat) summary.push(input.caveat)
  return {
    lab: "chartisme",
    tab: input.curveId,
    archive: {
      n: input.drawCount,
      from: input.from,
      to: input.to,
      source: input.source,
    },
    summary,
    tech: withinBudget({
      lab: "chartisme",
      curveId: input.curveId,
      curveLabel: input.curveLabel,
      era: input.era,
      source: input.source,
      preset: input.preset,
      presetLabel: input.presetLabel,
      scaleChoice: input.scaleChoice,
      scales: input.scales,
      window: {
        from: input.from,
        to: input.to,
        n: input.drawCount,
        context: input.contextCount,
        banner: input.banner,
      },
      minConfidence: input.minConfidence,
      caveat: input.caveat,
      baseRateNote: input.measured,
      baseRates: input.baseRates.map(compactRate),
      hits,
      seriesStats: seriesStats(studyPoints),
      series,
    }),
  }
}

function compactPeaks(peaks: HarmoPeak[] | undefined, limit = 8) {
  return (peaks ?? []).slice(0, limit).map((peak) => ({
    kind: peak.kind,
    source: peak.source,
    cycles_per_draw: roundish(peak.cycles_per_draw ?? null, 5),
    cycles_per_year: roundish(peak.cycles_per_year ?? null, 4),
    period_draws: roundish(peak.period_draws ?? null, 3),
    amp: roundish(peak.amp ?? null),
    power: roundish(peak.power ?? null),
    q: roundish(peak.q ?? null, 3),
    prominence: roundish(peak.prominence ?? null),
  }))
}

function pickPeaks(payload: HarmoReport | null): HarmoPeak[] {
  if (!payload) return []
  return (
    payload.fft?.peaks ??
    payload.welch?.peaks ??
    payload.spectrum?.peaks ??
    payload.peaks ??
    payload.fft_peaks ??
    payload.lombscargle?.peaks ??
    []
  )
}

export function packHarmo(input: {
  tab: string
  era: string
  source: string
  variable: VariableName
  ball: number
  star: number
  query: string
  preset: WindowPreset
  resolved: ResolvedWindow<{ date: string }>
  fftWindow: string
  payload: HarmoReport | null
  scipy?: string | null
}): CaptureContext {
  const { resolved, payload } = input
  const banner = formatWindowBanner(resolved)
  const peaks = compactPeaks(pickPeaks(payload))
  const summary = [
    `Harmo · ${input.tab} · ${VARIABLE_LABELS[input.variable]}`,
    banner,
    `Fenêtre FFT ${input.fftWindow} · unités cycles/tirage`,
    payload?.ok === false
      ? `API : ${payload.error || "indisponible"}`
      : peaks[0]?.cycles_per_draw != null
        ? `Pic principal ≈ ${peaks[0].cycles_per_draw} cycles/tirage`
        : "Pas de pic listé dans le payload courant",
  ]
  return {
    lab: "harmo",
    tab: input.tab,
    archive: {
      n: resolved.drawCount,
      from: resolved.fromDate,
      to: resolved.toDate,
      source: input.source,
    },
    summary,
    tech: withinBudget({
      lab: "harmo",
      tab: input.tab,
      units: "cycles/tirage",
      era: input.era,
      source: input.source,
      variable: input.variable,
      variableLabel: VARIABLE_LABELS[input.variable],
      ball: input.ball,
      star: input.star,
      query: input.query || null,
      preset: input.preset,
      presetLabel: WINDOW_PRESET_LABELS[input.preset],
      fftWindow: input.fftWindow,
      scipy: input.scipy ?? null,
      window: {
        from: resolved.fromDate,
        to: resolved.toDate,
        n: resolved.drawCount,
        warmup: resolved.warmupCount,
        banner,
      },
      ok: payload?.ok ?? null,
      error: payload?.error ?? null,
      sampling: payload?.sampling ?? null,
      notes: payload?.notes ?? null,
      shares: payload?.shares ?? null,
      components: payload?.components ?? null,
      comb: payload?.comb
        ? {
            cycles_per_draw: payload.comb.cycles_per_draw,
            thd: payload.comb.thd,
            hnr: payload.comb.hnr,
            score: payload.comb.score,
          }
        : null,
      thd: payload?.thd
        ? {
            thd: payload.thd.thd,
            hnr: payload.thd.hnr,
            f0: payload.thd.f0,
            p_ge_observed: payload.thd.p_ge_observed,
          }
        : null,
      peaks,
      ridges: (payload?.ridges ?? []).slice(0, 6).map((ridge) => ({
        kind: ridge.kind,
        slope: roundish(ridge.slope),
        mean_freq: roundish(ridge.mean_freq, 5),
        cycles_per_draw: roundish(ridge.cycles_per_draw ?? null, 5),
        period_draws: roundish(ridge.period_draws ?? null, 3),
        energy_fraction: roundish(ridge.energy_fraction ?? null, 3),
      })),
      observed_peak: payload?.observed_peak ?? null,
      peak_null: payload?.peak ?? null,
      disclaimer: payload?.disclaimer ?? null,
    }),
  }
}

export function packRelief(input: {
  source: string
  sample: number
  drawn: number
  from: string | null
  to: string | null
  style: string
  offset: string
  height: string
  fusion: number
  yScale: number
  stars: boolean
  rankTime?: boolean
  rankFill?: boolean
  stems?: boolean
  marker?: string
  maxH: number
  recommended: string
}): CaptureContext {
  const summary = [
    `Relief · profils n1→n5 · ${input.style} · ${input.offset}`,
    `${input.drawn} tirages (échantillon ${input.sample}) · ${input.from ?? "?"} → ${input.to ?? "?"}`,
    `Hauteur = ${input.height} · écart ${input.fusion.toFixed(2)} · max ${roundish(input.maxH, 2)}`,
    `Marqueur : ${input.marker ?? "boule"} · calque rangs dans le temps : ${input.rankTime ? "oui" : "non"}${
      input.rankTime && input.rankFill ? " · surfaces" : ""
    } · tiges : ${input.stems === false ? "off" : "on"}`,
    `Décalage recommandé pour cette taille : ${input.recommended}`,
  ]
  return {
    lab: "relief",
    tab: input.style,
    archive: {
      n: input.drawn,
      from: input.from,
      to: input.to,
      source: input.source,
    },
    summary,
    tech: withinBudget({
      lab: "relief",
      source: input.source,
      sample: input.sample,
      drawn: input.drawn,
      style: input.style,
      offset: input.offset,
      height: input.height,
      fusion: roundish(input.fusion, 3),
      yScale: roundish(input.yScale, 3),
      stars: input.stars,
      rankTime: input.rankTime ?? false,
      rankFill: Boolean(input.rankTime && input.rankFill),
      stems: input.stems !== false,
      marker: input.marker ?? "boule",
      maxH: roundish(input.maxH, 3),
      recommended: input.recommended,
      disclaimer: INDEPENDENCE_DISCLAIMER,
    }),
  }
}

function bounceSummary(bounce: BounceCapture) {
  const restitution = bounce.restitution.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const derivative = bounce.derivative.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `Bouncing · ${bounce.series} · e ${restitution} · dérivée ${derivative} · ${bounce.bounces} rebonds · ${bounce.from ?? "?"} → ${bounce.to ?? "?"}`
}

export function packEvolution(input: {
  period: string
  periodLabel: string
  month: string
  source: string
  from: string | null
  to: string | null
  drawCount: number
  sketches: ChartSketch[]
  chartMeta?: EvolutionChartMeta | null
  bounce?: BounceCapture | null
  tab?: string | null
  reading?: string | null
}): CaptureContext {
  const drawings = input.sketches.map(compactSketch)
  const summary = [
    `Évolution · ${input.periodLabel}`,
    `${input.drawCount} tirages · ${input.from ?? "?"} → ${input.to ?? "?"}${
      input.month !== "all" ? ` · mois ${input.month}` : ""
    }`,
    input.bounce
      ? bounceSummary(input.bounce)
      : input.reading
        ? input.reading
        : input.chartMeta
          ? `Série ${input.chartMeta.modeLabel}${
              input.chartMeta.showSma ? ` · SMA ${input.chartMeta.smaPeriod}` : ""
            }${input.chartMeta.showBb ? " · Bollinger" : ""}`
          : "Courbe d’évolution",
  ]
  if (drawings.length) {
    summary.push(...drawingSummaryLines(input.sketches))
  } else if (!input.reading) {
    summary.push("Aucune annotation chartiste posée sur la courbe.")
  }
  return {
    lab: "evolution",
    tab: input.tab ?? (input.bounce ? "bouncing" : (input.chartMeta?.mode ?? input.period)),
    archive: {
      n: input.drawCount,
      from: input.from,
      to: input.to,
      source: input.source,
    },
    summary,
    tech: withinBudget({
      lab: "evolution",
      period: input.period,
      periodLabel: input.periodLabel,
      month: input.month === "all" ? null : input.month,
      source: input.source,
      window: {
        from: input.from,
        to: input.to,
        n: input.drawCount,
      },
      chart: input.chartMeta ?? null,
      bounce: input.bounce ?? null,
      drawings,
      disclaimer: INDEPENDENCE_DISCLAIMER,
    }),
  }
}

export function packPronostic(input: {
  pool: string
  source: string
  preset: WindowPreset
  resolved: ResolvedWindow<{ date: string }>
  grids: number
  numberCount: number
  starCount: number
  cascade: Array<{ id: string; label: string; count: number }>
  coverage: { n: number; hits: number; rate: number; meanVolume: number | null }
  learn: { method: string; k: number; percentile: number }
  diagnostics: string[]
  numbers: {
    minSum: number
    maxSum: number
    minEven: number
    maxEven: number
    slots: Array<{ lo: number; hi: number }>
  }
  stars: {
    minSum: number
    maxSum: number
    minEven: number
    maxEven: number
    slots: Array<{ lo: number; hi: number }>
  }
}): CaptureContext {
  const banner = formatWindowBanner(input.resolved)
  const cascade = input.cascade.map((step) => `${step.label} ${step.count}`).join(" → ")
  const summary = [
    `Pronostic · ${input.pool === "stars" ? "étoiles" : "numéros"}`,
    banner,
    `${input.grids.toLocaleString("fr-FR")} grilles 5+2 · ${input.numberCount.toLocaleString("fr-FR")} × ${input.starCount.toLocaleString("fr-FR")}`,
    cascade,
    input.diagnostics[0] ?? `enveloppe ${input.learn.method} k=${input.learn.k}`,
  ]
  return {
    lab: "pronostic",
    tab: input.pool,
    archive: {
      n: input.resolved.drawCount,
      from: input.resolved.fromDate,
      to: input.resolved.toDate,
      source: input.source,
    },
    summary,
    tech: withinBudget({
      lab: "pronostic",
      preset: input.preset,
      pool: input.pool,
      grids: input.grids,
      numbers: input.numberCount,
      stars: input.starCount,
      cascade: input.cascade,
      coverage: input.coverage,
      learn: input.learn,
      diagnostics: input.diagnostics,
      numberStack: input.numbers,
      starStack: input.stars,
      disclaimer: INDEPENDENCE_DISCLAIMER,
    }),
  }
}
