export type HarmoShareId = "grid" | "mechanical" | "acoustic"

export type HarmoPoint = { x: number; y: number }

export type HarmoPeak = {
  cycles_per_draw?: number | null
  cycles_per_year?: number | null
  period_draws?: number | null
  amp?: number
  power?: number
  q?: number | null
  kind?: string
  source?: string
  slope?: number
  order?: number | null
  prominence?: number
}

export type HarmoHeatmap = {
  freqs: number[]
  times: number[]
  z: number[][]
  db_min: number
  db_max: number
  unit?: string
}

export type HarmoRidge = {
  kind: string
  slope: number
  energy: number
  energy_fraction?: number
  mean_freq: number
  cycles_per_draw?: number | null
  cycles_per_year?: number | null
  period_draws?: number | null
  df_span?: number
  times?: number[]
  freqs?: number[]
}

export type HarmoStatus = {
  ok?: boolean
  scipy?: boolean
  numpy?: boolean
  pywt?: boolean
  librosa?: boolean
  ssqueezepy?: boolean
  scipy_version?: string | null
  numpy_version?: string | null
  install_cmd?: string
  disclaimer?: string
  error?: string
}

export type HarmoNote = { id: string; level: string; text: string }

export type HarmoBase = {
  ok?: boolean
  error?: string
  variable?: string
  n?: number | null
  draw_count?: number
  from_date?: string | null
  to_date?: string | null
  min_samples?: number
  disclaimer?: string
  notes?: HarmoNote[]
  sampling?: {
    n?: number
    span_days?: number
    draws_per_year?: number
    delta_days?: number[]
    nyquist_cycles_per_draw?: number
    nyquist_cycles_per_year?: number
    week_near_nyquist?: boolean
  }
  window?: {
    preset?: string
    from_date?: string | null
    to_date?: string | null
    draw_count?: number
    warmup_count?: number
  }
}

export type HarmoReport = HarmoBase & {
  fft?: { points?: HarmoPoint[]; peaks?: HarmoPeak[] }
  comb?: HarmoPeak & { thd?: number | null; hnr?: number | null; fraction?: number; score?: number }
  calendar?: { fundamentals?: HarmoPeak[]; fraction?: number }
  thd?: {
    thd?: number | null
    hnr?: number | null
    f0?: number
    harmonics?: unknown[]
    mean?: number | null
    p_ge_observed?: number | null
  }
  cepstrum?: { points?: HarmoPoint[]; peaks?: HarmoPeak[] }
  lombscargle?: { points?: HarmoPoint[]; peaks?: HarmoPeak[]; calendar?: { label: string; power: number }[] }
  multitaper?: { points?: HarmoPoint[]; peaks?: HarmoPeak[]; f_test?: { freq: number; f_stat: number }[] }
  fft_window?: string
  timebase?: string
  welch?: { points?: HarmoPoint[]; peaks?: HarmoPeak[]; nperseg?: number }
  hpss?: {
    harmonic_fraction?: number
    percussive_fraction?: number
    source?: string
    librosa?: { available?: boolean; harmonic_energy?: number; percussive_energy?: number }
  }
  envelope?: HarmoPoint[]
  spectrum?: { points?: HarmoPoint[]; peaks?: HarmoPeak[] }
  inst_freq?: HarmoPoint[]
  energy?: number
  mean?: number
  snr?: number
  periodic?: boolean
  nperseg?: number
  hop?: number
  stft?: HarmoHeatmap
  sst?: HarmoHeatmap | null
  ridges?: HarmoRidge[]
  cwt?: HarmoHeatmap & { available?: boolean }
  ssq?: HarmoHeatmap & { available?: boolean }
  ok_orders?: boolean
  reason?: string
  n_revolutions?: number
  points?: HarmoPoint[]
  peaks?: HarmoPeak[]
  f_inst?: HarmoPoint[]
  ridge?: HarmoRidge
  n_sim?: number
  seed?: number
  observed_peak?: number
  observed_thd?: number | null
  peak?: { mean?: number | null; p_ge_observed?: number }
  null?: string
  fft_peaks?: HarmoPeak[]
  shares?: Record<HarmoShareId, number>
  components?: { id: HarmoShareId; label: string; share: number; hint: string }[]
  smear?: number
}

export type HarmoUnmix = HarmoReport

export function harmoQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue
    search.set(key, String(value))
  }
  return search
}

export async function fetchHarmo<T extends HarmoBase = HarmoReport>(
  path: string,
  params: URLSearchParams
): Promise<T> {
  const response = await fetch(`/api/harmo/${path}?${params}`, { cache: "no-store" })
  const body = (await response.json().catch(() => ({
    ok: false,
    error: "réponse invalide",
  }))) as T
  if (!response.ok && !body.error) {
    body.error = `HTTP ${response.status}`
    body.ok = false
  }
  return body
}

export function formatFreq(peak: HarmoPeak | null | undefined) {
  const f = peak?.cycles_per_draw
  if (f == null || Number.isNaN(f) || f <= 0) return "—"
  const period = peak?.period_draws
  const year = peak?.cycles_per_year
  const bits = [`${f.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} c/tirage`]
  if (period) bits.push(`T ≈ ${period.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} tirages`)
  if (year) bits.push(`${year.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} c/an`)
  return bits.join(" · ")
}

export function formatShare(value: number | undefined) {
  if (value == null || Number.isNaN(value)) return "—"
  return value.toLocaleString("fr-FR", { style: "percent", maximumFractionDigits: 1 })
}

export function formatStat(value: number | null | undefined, digits = 3) {
  if (value == null || Number.isNaN(value)) return "—"
  return value.toLocaleString("fr-FR", { maximumFractionDigits: digits })
}
