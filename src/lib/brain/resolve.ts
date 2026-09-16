import {
  macd,
  rsi,
  series,
  seriesIndex,
  VARIABLE_LABELS,
  variableNeedsBall,
  variableNeedsStar,
  type VariableName,
} from "@/lib/analysis"
import { INDEPENDENCE_DISCLAIMER, lastFinite, lastFlag, roundish } from "@/lib/capture/snapshot"
import { numberFrequencyTable, starFrequencyTable, type Draw } from "@/lib/draws"
import { profileGrid, type CombinationGrid } from "@/lib/combinations"
import { formatWindowBanner, type ResolvedWindow } from "@/lib/analysis-window"
import { buildCurve, curveId as makeCurveId, parseCurveId } from "@/lib/chartisme/curves"
import { GEOMETRIC_FLOOR, scanCurve } from "@/lib/chartisme/scan"
import { harmoQuery } from "@/lib/harmo"
import { detect } from "@/lib/morpho/geometry"
import { techPack } from "@/lib/ta"
import type { CatalogEntry } from "@/lib/brain/catalog"
import { inferSpecialist, specialistByHandle } from "@/lib/brain/specialists"
import type { BrainFiche, ResolveContext } from "@/lib/brain/types"
import { flagFiche } from "@/lib/brain/flag"

function lastRounded(values: Array<number | null | undefined>, digits = 4) {
  return roundish(lastFinite(values), digits)
}

function ficheBase(entry: CatalogEntry, ctx: ResolveContext, variable: VariableName, n: number | null): Omit<BrainFiche, "last" | "flags" | "flagged" | "summary"> {
  return {
    id: entry.id,
    handle: entry.handle,
    lab: entry.lab,
    label: entry.label,
    units: entry.units,
    reading: entry.reading,
    params: {
      variable,
      n,
      periodX: ctx.periodX,
      curveId: ctx.curveId,
    },
    window: ctx.window,
    disclaimer: INDEPENDENCE_DISCLAIMER,
    error: null,
  }
}

function finish(partial: Omit<BrainFiche, "flags" | "flagged" | "summary"> & { summary?: string }): BrainFiche {
  const flagged = flagFiche(partial)
  const summary =
    partial.summary ||
    (partial.error
      ? `${partial.label} : ${partial.error}`
      : `${partial.label} · ${Object.entries(partial.last)
          .filter(([, value]) => value != null && value !== "")
          .slice(0, 4)
          .map(([key, value]) => `${key} ${value}`)
          .join(" · ") || "pas de valeur"}`)
  return { ...partial, ...flagged, summary }
}

function techFor(ctx: ResolveContext, variable: VariableName, n: number | null) {
  const index = n ?? seriesIndex(variable, ctx.ball, ctx.star)
  const full = series(ctx.withWarmup, variable, index ?? undefined)
  const pack = techPack(
    full.values,
    [],
    full.points.map((point) => point.date),
    { smaPeriod: ctx.periodX, warmupCount: ctx.warmupCount }
  )
  const work = series(ctx.work, variable, index ?? undefined)
  const macdPack = macd(full.values)
  return { pack, work, full, macdPack, rsi: rsi(full.values, 14) }
}

function resolveAnalyse(ctx: ResolveContext, entry: CatalogEntry): BrainFiche {
  const variable = ctx.variableOverride ?? entry.defaults.variable ?? ctx.variable
  const n =
    ctx.nOverride ??
    (variableNeedsBall(variable) ? ctx.ball : variableNeedsStar(variable) ? ctx.star : null)
  const base = ficheBase(entry, ctx, variable, n)
  if (!ctx.work.length) {
    return finish({ ...base, last: {}, error: "fenêtre vide" })
  }
  const { pack, work, macdPack } = techFor(ctx, variable, n)
  const lastValue = lastRounded(work.values)
  if (entry.kind === "variable") {
    return finish({
      ...base,
      last: { value: lastValue, n: work.values.length },
      stats: { n: work.values.length },
      summary: `${VARIABLE_LABELS[variable]} · dernière ${lastValue ?? "—"} · ${ctx.window.banner}`,
    })
  }
  const last: Record<string, number | string | boolean | null> = {
    value: lastValue,
    rsi: lastRounded(rsi(work.values, 14), 2),
    macd: lastRounded(macdPack.line),
    macdSignal: lastRounded(macdPack.signal),
    macdHist: lastRounded(macdPack.histogram),
    adx: roundish(pack.last.adx, 2),
    adxRegime: pack.adxRegime,
    stochK: roundish(pack.last.stochK, 2),
    cci: roundish(pack.last.cci, 2),
    percentB: roundish(pack.last.percentB, 3),
    atr: roundish(pack.last.atr),
    wma: roundish(pack.last.wma),
    hma: roundish(pack.last.hma),
    mfi: roundish(pack.last.mfi, 2),
    vwap: roundish(pack.last.vwap),
    squeeze: lastFlag(pack.squeeze),
  }
  const key = entry.handle
  const pick: Record<string, number | string | boolean | null> = { value: last.value }
  if (key === "rsi") pick.rsi = last.rsi
  else if (key === "macd") {
    pick.macd = last.macd
    pick.signal = last.macdSignal
    pick.hist = last.macdHist
  } else if (key === "adx") {
    pick.adx = last.adx
    pick.regime = last.adxRegime
  } else if (key === "stoch") pick.stochK = last.stochK
  else if (key === "cci") pick.cci = last.cci
  else if (key === "atr") pick.atr = last.atr
  else if (key === "bollinger") pick.percentB = last.percentB
  else if (key === "squeeze") pick.squeeze = last.squeeze
  else if (key === "wma") pick.wma = last.wma
  else if (key === "hma") pick.hma = last.hma
  else if (key === "mfi") pick.mfi = last.mfi
  else if (key === "vwap") pick.vwap = last.vwap
  else pick[key] = last[key] ?? last.value
  return finish({
    ...base,
    last: pick,
    summary: `${entry.label} sur ${VARIABLE_LABELS[variable]} · ${Object.entries(pick)
      .filter(([name, value]) => name !== "value" && value != null)
      .map(([name, value]) => `${name} ${value}`)
      .join(" · ") || `valeur ${lastValue ?? "—"}`}`,
  })
}

function resolveChartisme(ctx: ResolveContext, entry: CatalogEntry): BrainFiche {
  const spec = parseCurveId(ctx.curveId || "sum")
  const variable = (ctx.variableOverride ?? spec.variable) as VariableName
  const n = ctx.nOverride ?? spec.n
  const curve = buildCurve(ctx.withWarmup, variable, n)
  const hits = scanCurve(curve, { minConfidence: GEOMETRIC_FLOOR }).filter(
    (hit) => hit.figure === entry.handle
  )
  const best = hits[0]
  const last = {
    hits: hits.length,
    confidence: best ? roundish(best.confidence, 3) : null,
    signal: best?.signal ?? null,
    confirmed: best?.breakout?.confirmed ?? null,
    fake: best?.breakout?.fake ?? null,
    from: best?.from ?? null,
    to: best?.to ?? null,
    curve: curve.id,
  }
  return finish({
    ...ficheBase(entry, ctx, variable, n),
    params: { ...ficheBase(entry, ctx, variable, n).params, curveId: curve.id },
    last,
    summary: hits.length
      ? `${entry.label} sur ${curve.label} · ${hits.length} lecture(s) · confiance ${last.confidence ?? "—"}`
      : `${entry.label} : aucune lecture géométrique sur ${curve.label}`,
  })
}

async function resolveHarmo(ctx: ResolveContext, entry: CatalogEntry): Promise<BrainFiche> {
  const variable = ctx.variableOverride ?? ctx.variable
  const n =
    ctx.nOverride ??
    (variableNeedsBall(variable) ? ctx.ball : variableNeedsStar(variable) ? ctx.star : null)
  const base = ficheBase(entry, ctx, variable, n)
  if (!ctx.fetchHarmo) {
    return finish({ ...base, last: {}, error: "API Harmo non branchée" })
  }
  const path =
    entry.handle === "welch"
      ? "welch"
      : entry.handle === "stft" || entry.handle === "ridges"
        ? "stft"
        : entry.handle === "comb"
          ? "spectrum"
          : "spectrum"
  try {
    const payload = await ctx.fetchHarmo(
      path,
      harmoQuery({
        variable,
        n,
        era: ctx.era,
        preset: ctx.window.preset,
        warmup: ctx.window.warmup,
      })
    )
    const peaks =
      payload.fft?.peaks ??
      payload.welch?.peaks ??
      payload.spectrum?.peaks ??
      payload.peaks ??
      payload.fft_peaks ??
      []
    const peak = peaks[0]
    const last: Record<string, number | string | boolean | null> = {
      ok: payload.ok !== false,
      cycles_per_draw: peak?.cycles_per_draw ?? null,
      period_draws: peak?.period_draws ?? null,
      peaks: peaks.length,
    }
    if (entry.handle === "comb" && payload.comb) {
      last.thd = payload.comb.thd ?? null
      last.hnr = payload.comb.hnr ?? null
    }
    if (entry.handle === "ridges") {
      last.ridges = payload.ridges?.length ?? 0
      last.mean_freq = payload.ridges?.[0]?.cycles_per_draw ?? null
    }
    return finish({
      ...base,
      last,
      error: payload.ok === false ? payload.error || "Harmo indisponible" : null,
      summary: peak?.cycles_per_draw != null
        ? `${entry.label} · pic ≈ ${roundish(peak.cycles_per_draw, 5)} cycles/tirage`
        : `${entry.label} · pas de pic listé`,
    })
  } catch (error) {
    return finish({
      ...base,
      last: {},
      error: error instanceof Error ? error.message : "Harmo injoignable",
    })
  }
}

function resolveMorpho(ctx: ResolveContext, entry: CatalogEntry): BrainFiche {
  const draw = ctx.work.at(-1)
  const base = ficheBase(entry, ctx, ctx.variable, null)
  if (!draw) return finish({ ...base, last: {}, error: "aucun tirage dans la fenêtre" })
  const portrait = detect(draw.numbers, draw.stars)
  const present = portrait.motifs.includes(entry.handle as (typeof portrait.motifs)[number])
  return finish({
    ...base,
    last: {
      present,
      date: draw.date,
      motifs: portrait.motifs.join(", "),
    },
    summary: present
      ? `${entry.label} présent sur ${draw.date}`
      : `${entry.label} absent sur ${draw.date}`,
  })
}

function resolveCombinaisons(ctx: ResolveContext, entry: CatalogEntry): BrainFiche {
  const base = ficheBase(entry, ctx, ctx.variable, null)
  const grid: CombinationGrid | null = ctx.grid
  if (!grid) {
    return finish({ ...base, last: {}, error: "aucune grille épinglée" })
  }
  const numbers = numberFrequencyTable(ctx.work as Draw[])
  const stars = starFrequencyTable(ctx.work as Draw[])
  const profile = profileGrid(grid, ctx.work as Draw[], numbers, stars)
  if (entry.handle === "score") {
    return finish({
      ...base,
      last: {
        pOfficial: roundish(profile.official.pWin, 6),
        pEmpirical: roundish(profile.empirical.p, 4),
        wins: profile.empirical.wins,
        n: profile.empirical.n,
        grid: `${grid.numbers.join(",")} + ${grid.stars.join(",")}`,
      },
      summary: `Loi ${roundish(profile.official.pWin, 6)} · P̂ ${roundish(profile.empirical.p, 4)} sur ${profile.empirical.n} tirages`,
    })
  }
  if (entry.handle === "retard") {
    return finish({
      ...base,
      last: {
        numberDelayMean: roundish(profile.numberDelayMean, 2),
        starDelayMean: roundish(profile.starDelayMean, 2),
        delays: profile.numberDelays.join(","),
      },
      summary: `Retards boules moy. ${roundish(profile.numberDelayMean, 2)} · étoiles ${roundish(profile.starDelayMean, 2)}`,
    })
  }
  return finish({
    ...base,
    last: {
      sum: profile.sum,
      starSum: profile.starSum,
      sumPercentile: roundish(profile.sumPercentile, 3),
      even: profile.even,
    },
    summary: `Somme ${profile.sum} (p${roundish(profile.sumPercentile, 3)}) · étoiles ${profile.starSum}`,
  })
}

async function resolveSpecialist(ctx: ResolveContext, entry: CatalogEntry): Promise<BrainFiche> {
  const variable = (entry.defaults.variable ?? ctx.variable) as VariableName
  const base = ficheBase(entry, ctx, variable, null)
  const cached = specialistByHandle(entry.handle)
  try {
    const inferred = await inferSpecialist(entry.handle, ctx.era === "all" ? "all" : "current")
    const forecast = inferred.forecast ?? inferred.last_forecast ?? null
    const last = {
      forecast: forecast?.value ?? null,
      sigma: forecast?.sigma ?? null,
      confidence: forecast?.confidence ?? null,
      abstain: forecast?.abstain ?? null,
      skill_20: inferred.skill_20 ?? null,
      skill_50: inferred.skill_50 ?? null,
      skill_100: inferred.skill_100 ?? null,
      skill: inferred.skill ?? null,
      verdict: inferred.verdict ?? null,
      target: inferred.target,
      instructions: inferred.instructions,
      as_of: forecast?.as_of ?? null,
    }
    const summary = forecast?.abstain
      ? `${entry.label} s’abstient (confiance ${last.confidence ?? "—"}) · skill ${last.skill ?? "—"}`
      : `${entry.label} forecast ${last.forecast ?? "—"} · σ ${last.sigma ?? "—"} · skill ${last.skill ?? "—"} (${last.verdict ?? "—"})`
    return finish({
      ...base,
      reading: inferred.instructions || entry.reading,
      last,
      summary,
      disclaimer:
        inferred.disclaimer ||
        "Forecast d’une série nommée, pas d’une grille 5+2. Les tirages restent indépendants.",
    })
  } catch (error) {
    const forecast = cached?.last_forecast ?? cached?.forecast ?? null
    if (forecast || cached) {
      return finish({
        ...base,
        reading: cached?.instructions || entry.reading,
        last: {
          forecast: forecast?.value ?? null,
          sigma: forecast?.sigma ?? null,
          skill: cached?.skill ?? null,
          skill_20: cached?.skill_20 ?? null,
          skill_50: cached?.skill_50 ?? null,
          skill_100: cached?.skill_100 ?? null,
          verdict: cached?.verdict ?? null,
          instructions: cached?.instructions ?? null,
        },
        summary: `${entry.label} · dernier skill ${cached?.skill ?? "—"} (inférence API : ${error instanceof Error ? error.message : "échec"})`,
      })
    }
    return finish({
      ...base,
      last: {},
      error: error instanceof Error ? error.message : "spécialiste injoignable",
    })
  }
}

export async function resolveEntry(ctx: ResolveContext): Promise<BrainFiche> {
  const entry = ctx.entry
  if (entry.lab === "analyse") return resolveAnalyse(ctx, entry)
  if (entry.lab === "chartisme") return resolveChartisme(ctx, entry)
  if (entry.lab === "harmo") return resolveHarmo(ctx, entry)
  if (entry.lab === "morpho") return resolveMorpho(ctx, entry)
  if (entry.lab === "specialist") return resolveSpecialist(ctx, entry)
  return resolveCombinaisons(ctx, entry)
}

export function windowMetaFrom(resolved: ResolvedWindow<{ date: string }>, workCount?: number) {
  return {
    preset: resolved.preset,
    from: resolved.fromDate,
    to: resolved.toDate,
    n: workCount ?? resolved.drawCount,
    warmup: resolved.warmupCount,
    banner: formatWindowBanner(resolved),
  }
}

export function curveIdFor(variable: VariableName, n: number | null) {
  return makeCurveId(variable, n)
}
