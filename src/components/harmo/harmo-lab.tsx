"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { AcousticPanel } from "@/components/harmo/acoustic-panel"
import { GridPanel } from "@/components/harmo/grid-panel"
import { MechPanel } from "@/components/harmo/mech-panel"
import { MixPanel } from "@/components/harmo/mix-panel"
import { TestsPanel } from "@/components/harmo/tests-panel"
import { TfPanel } from "@/components/harmo/tf-panel"
import { WindowBar } from "@/components/analysis/window-bar"
import { CurveName } from "@/components/chartisme/curve-thumb"
import { useRegisterCapture } from "@/components/capture"
import { HelpTip, LabelHelp, TitleHelp } from "@/components/help"
import { SiteHeaderSlot } from "@/components/site-header-slot"
import { WeekdayScopeControl } from "@/components/weekday-scope-control"
import { PillTabPanel, PillTabs } from "@/components/ui/pill-tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select"
import {
  NUMBER_VARIABLE_NAMES,
  STAR_VARIABLE_NAMES,
  VARIABLE_LABELS,
  seriesIndex,
  variableNeedsBall,
  variableNeedsStar,
  type VariableName,
} from "@/lib/analysis"
import { DEFAULT_WARMUP, resolveWindow, type WindowPreset } from "@/lib/analysis-window"
import { useWeekdayScope } from "@/lib/use-weekday-scope"
import { weekdayApiValue, weekdayFilterDay, type WeekdayScope } from "@/lib/weekday-scope"
import { WeekdaySynthesisCard } from "@/components/weekday-synthesis-card"
import { parseQueryNumbers, drawMatchesQuery } from "@/lib/draws"
import { packHarmo } from "@/lib/capture/pack"
import {
  fetchHarmo,
  harmoQuery,
  type HarmoReport,
  type HarmoStatus,
} from "@/lib/harmo"
import {
  asPositiveInt,
  asVariableName,
  asWindowPreset,
  readLabSearch,
} from "@/lib/lab-search"
import { ERA_LABELS } from "@/lib/copy"
import { useLabTab } from "@/lib/use-lab-tab"
import { useDraws } from "@/lib/use-draws"

const TABS = [
  {
    id: "melange",
    label: "Mélange",
    help: {
      title: "Mélange",
      body: "Trois dictionnaires sur la même série : raies fixes, crêtes à IF variable, continuum. Analogie physique, pas une cause.",
    },
  },
  {
    id: "reseau",
    label: "Réseau",
    help: {
      title: "Réseau",
      body: "Peigne de raies verrouillé (calendrier, scan de f0, THD, Lomb-Scargle). L’analogue d’un réseau à raies fixes, en cycles/tirage.",
    },
  },
  {
    id: "mecanique",
    label: "Mécanique",
    help: {
      title: "Mécanique",
      body: "Enveloppe de Hilbert, spectre de modulation, order tracking tacholess sur une crête STFT.",
    },
  },
  {
    id: "acoustique",
    label: "Acoustique",
    help: {
      title: "Acoustique",
      body: "Welch / multitaper et HPSS (médianes) pour le continuum et les bosses larges.",
    },
  },
  {
    id: "tf",
    label: "Temps-fréquence",
    help: {
      title: "Temps-fréquence",
      body: "ShortTimeFFT : droites horizontales vs trajectoires obliques. Synchrosqueezing maison en option.",
    },
  },
  {
    id: "tests",
    label: "Tests",
    help: {
      title: "Tests",
      body: "Pics et THD contre des tirages uniformes aux mêmes dates. Garde-fous retard / Nyquist.",
    },
  },
] as const

type TabId = (typeof TABS)[number]["id"]
const HARMO_TAB_IDS = TABS.map((item) => item.id) as TabId[]

const DAY_BAR_HELP = {
  title: "Jour sous le bandeau",
  body: "Même choix qu’Évolution : Tous, Mardi, Vendredi ou Synthèse. La barre reste sous le bandeau pour changer de jour sans remonter. Mardi ou Vendredi isole ce jour avant les N derniers et le warmup. Synthèse garde le jeu mixte.",
} as const

function HarmoDayBar({
  weekday,
  onWeekday,
  drawCount,
}: {
  weekday: WeekdayScope
  onWeekday: (value: WeekdayScope) => void
  drawCount: number
}) {
  return (
    <SiteHeaderSlot>
      <div
        data-harmo-window
        className="border-t border-border/80"
        role="region"
        aria-label="Jour des tirages"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-[max(1rem,env(safe-area-inset-left))] py-2 pr-[max(1rem,env(safe-area-inset-right))] sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6">
          <WeekdayScopeControl value={weekday} onChange={onWeekday} compact />
          <p className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
            {drawCount} tirage{drawCount > 1 ? "s" : ""}
            <HelpTip {...DAY_BAR_HELP} />
          </p>
        </div>
      </div>
    </SiteHeaderSlot>
  )
}

export function HarmoLab() {
  const [era, setEra] = useState<"current" | "all">("current")
  const [weekday, setWeekday] = useWeekdayScope()
  const { draws, source, loading: drawsLoading } = useDraws(era, weekday)
  const [tab, setTab] = useLabTab(HARMO_TAB_IDS, "melange")
  const [variable, setVariable] = useState<VariableName>("sum")
  const [ball, setBall] = useState(7)
  const [star, setStar] = useState(1)
  const [query, setQuery] = useState("")
  const [preset, setPreset] = useState<WindowPreset>("last_100")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [lastN, setLastN] = useState("")
  const [warmup, setWarmup] = useState(DEFAULT_WARMUP)
  const [fftWindow, setFftWindow] = useState("blackmanharris")
  const [showSst, setShowSst] = useState(true)
  const [status, setStatus] = useState<HarmoStatus | null>(null)
  const [payload, setPayload] = useState<HarmoReport | null>(null)
  const [orders, setOrders] = useState<HarmoReport | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = readLabSearch()
    const nextVariable = asVariableName(params.get("variable"))
    if (nextVariable) setVariable(nextVariable)
    const nextPreset = asWindowPreset(params.get("preset"))
    if (nextPreset) setPreset(nextPreset)
    const n = asPositiveInt(params.get("n"), 1, 50)
    if (n != null) {
      const target = nextVariable ?? "sum"
      if (variableNeedsStar(target)) setStar(Math.min(12, n))
      else if (variableNeedsBall(target)) setBall(n)
    }
  }, [])

  const archive = useMemo(
    () => [...draws].sort((a, b) => a.date.localeCompare(b.date)),
    [draws]
  )
  const resolved = useMemo(() => {
    const parsedN = Number.parseInt(lastN, 10)
    return resolveWindow(archive, {
      preset,
      fromDate: customFrom || undefined,
      toDate: customTo || undefined,
      lastN: Number.isFinite(parsedN) && parsedN > 0 ? parsedN : undefined,
      warmup,
      weekday: weekdayFilterDay(weekday),
    })
  }, [archive, preset, customFrom, customTo, lastN, warmup, weekday])
  const wanted = useMemo(() => parseQueryNumbers(query), [query])
  const work = useMemo(
    () => resolved.work.filter((draw) => drawMatchesQuery(draw, wanted)),
    [resolved.work, wanted]
  )
  const variableN = seriesIndex(variable, ball, star)

  const params = useMemo(() => {
    const parsedN = Number.parseInt(lastN, 10)
    return harmoQuery({
      variable,
      n: variableNeedsBall(variable) || variableNeedsStar(variable) ? variableN : undefined,
      era,
      preset,
      from_date: resolved.fromDate,
      to_date: resolved.toDate,
      last_n: Number.isFinite(parsedN) && parsedN > 0 ? parsedN : undefined,
      warmup,
      window: fftWindow,
      weekday: weekdayApiValue(weekday),
    })
  }, [variable, variableN, era, preset, resolved.fromDate, resolved.toDate, lastN, warmup, fftWindow, weekday])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (const waitMs of [0, 500]) {
        if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs))
        try {
          const response = await fetch("/api/harmo/status", { cache: "no-store" })
          if (cancelled) return
          if (response.ok) {
            setStatus((await response.json()) as HarmoStatus)
            return
          }
        } catch {
          if (!cancelled) setStatus({ ok: false, error: "API injoignable" })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadTab = useCallback(
    async (next: TabId) => {
      setLoading(true)
      setPayload(null)
      setOrders(null)
      try {
        if (next === "melange") {
          setPayload(await fetchHarmo("unmix", params))
        } else if (next === "reseau") {
          setPayload(await fetchHarmo("spectrum", params))
        } else if (next === "mecanique") {
          const [env, ord] = await Promise.all([
            fetchHarmo("envelope", params),
            fetchHarmo("orders", params),
          ])
          setPayload(env)
          setOrders(ord)
        } else if (next === "acoustique") {
          setPayload(await fetchHarmo("welch", params))
        } else if (next === "tf") {
          const search = new URLSearchParams(params)
          search.set("sst", showSst ? "true" : "false")
          setPayload(await fetchHarmo("stft", search))
        }
      } catch (error) {
        setPayload({
          ok: false,
          error: error instanceof Error ? error.message : "API injoignable",
        })
      } finally {
        setLoading(false)
      }
    },
    [params, showSst]
  )

  useRegisterCapture(() =>
    packHarmo({
      tab,
      era,
      source,
      variable,
      ball,
      star,
      query,
      preset,
      resolved: { ...resolved, work, drawCount: work.length },
      fftWindow,
      payload,
      scipy: status?.scipy_version ?? null,
    })
  )

  useEffect(() => {
    if (drawsLoading) return
    if (tab === "tests") {
      setPayload(null)
      setOrders(null)
      return
    }
    void loadTab(tab)
  }, [tab, loadTab, drawsLoading])

  async function loadNull() {
    setLoading(true)
    try {
      const search = new URLSearchParams(params)
      search.set("n_sim", "40")
      search.set("seed", "0")
      setPayload(await fetchHarmo("null", search))
    } catch (error) {
      setPayload({
        ok: false,
        error: error instanceof Error ? error.message : "API injoignable",
      })
    } finally {
      setLoading(false)
    }
  }

  function handleFrom(value: string) {
    if (preset !== "custom") setCustomTo(resolved.toDate ?? "")
    setCustomFrom(value)
    setPreset("custom")
  }

  function handleTo(value: string) {
    if (preset !== "custom") setCustomFrom(resolved.fromDate ?? "")
    setCustomTo(value)
    setPreset("custom")
  }

  const dayBar = (
    <HarmoDayBar weekday={weekday} onWeekday={setWeekday} drawCount={work.length} />
  )

  if (drawsLoading) {
    return (
      <>
        {dayBar}
        <p className="text-sm text-muted-foreground">Chargement des tirages…</p>
      </>
    )
  }

  const displayFrom = preset === "custom" ? customFrom : resolved.fromDate ?? customFrom
  const displayTo = preset === "custom" ? customTo : resolved.toDate ?? customTo

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {dayBar}
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        Série de {work.length} tirages (source {source === "neon" ? "Neon" : "JSON local"}).
        Unités : <strong>cycles/tirage</strong> et <strong>cycles/an</strong>. Le warmup
        n’entre pas dans la FFT : il sert de contexte aux retards.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {status?.ok ? (
          <Badge variant="secondary">scipy {status.scipy_version}</Badge>
        ) : (
          <Badge variant="outline">scipy indisponible</Badge>
        )}
        {status?.pywt ? <Badge variant="secondary">pywt</Badge> : <Badge variant="outline">pywt</Badge>}
        {status?.librosa ? (
          <Badge variant="secondary">librosa</Badge>
        ) : (
          <Badge variant="outline">librosa</Badge>
        )}
        {status?.ssqueezepy ? (
          <Badge variant="secondary">ssqueezepy</Badge>
        ) : (
          <Badge variant="outline">ssqueezepy</Badge>
        )}
      </div>

      <WindowBar
        window={{ ...resolved, work, drawCount: work.length }}
        preset={preset}
        fromDate={displayFrom}
        toDate={displayTo}
        lastN={lastN}
        warmup={warmup}
        compareOn={false}
        showCompare={false}
        showWeekday={false}
        onPreset={(v) => {
          setPreset(v)
          if (v !== "custom") {
            setCustomFrom("")
            setCustomTo("")
            setLastN("")
          }
        }}
        onFrom={handleFrom}
        onTo={handleTo}
        onLastN={setLastN}
        onWarmup={setWarmup}
        onCompare={() => undefined}
      />
      {weekday === "synthese" ? <WeekdaySynthesisCard draws={work} /> : null}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-3">
        <p className="text-sm font-medium text-foreground">
          <TitleHelp
            help={{
              title: "Mesure",
              body: "Même fenêtre que Analyse. Harmo envoie cette série à scipy ; le navigateur ne calcule pas de FFT.",
            }}
          >
            Mesure
          </TitleHelp>
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <LabelHelp
            label="Archive"
            help={{
              title: "Ère",
              body: "Formule actuelle = pool de 12 étoiles. Tout l’historique mélange les anciennes formules.",
            }}
          >
            <Select value={era} onValueChange={(v) => v && setEra(v as "current" | "all")}>
              <SelectTrigger className="w-full sm:w-56" aria-label="Ère">
                <span className="flex flex-1 text-left">
                  {era === "all" ? `Archive : ${ERA_LABELS.all}` : `Archive : ${ERA_LABELS.current}`}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Archive : {ERA_LABELS.current}</SelectItem>
                <SelectItem value="all">Archive : {ERA_LABELS.all}</SelectItem>
              </SelectContent>
            </Select>
          </LabelHelp>
          <LabelHelp
            label="Variable"
            help={{
              title: "Variable",
              body: "Série envoyée à scipy. Le retard a des harmoniques par construction ; la présence est un train d’impulsions.",
            }}
          >
            <Select value={variable} onValueChange={(v) => v && setVariable(v as VariableName)}>
              <SelectTrigger className="w-full sm:w-56" aria-label="Variable">
                <span className="flex flex-1 text-left">
                  <CurveName kind={variable} label={VARIABLE_LABELS[variable]} />
                </span>
              </SelectTrigger>
              <SelectContent className="min-w-56">
                <SelectGroup>
                  <SelectLabel>Numéros</SelectLabel>
                  {NUMBER_VARIABLE_NAMES.map((name) => (
                    <SelectItem key={name} value={name}>
                      <CurveName kind={name} label={VARIABLE_LABELS[name]} />
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Étoiles</SelectLabel>
                  {STAR_VARIABLE_NAMES.map((name) => (
                    <SelectItem key={name} value={name}>
                      <CurveName kind={name} label={VARIABLE_LABELS[name]} />
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </LabelHelp>
          {variableNeedsBall(variable) ? (
            <LabelHelp
              label="Boule"
              help={{ title: "Boule", body: "Numéro 1–50 pour retard ou présence." }}
            >
              <Input
                type="number"
                min={1}
                max={50}
                value={ball}
                onChange={(e) => setBall(Number(e.target.value) || 7)}
                className="w-full min-w-0 sm:w-24"
              />
            </LabelHelp>
          ) : null}
          {variableNeedsStar(variable) ? (
            <LabelHelp
              label="Étoile"
              help={{ title: "Étoile", body: "Étoile 1–12 pour retard ou présence." }}
            >
              <Input
                type="number"
                min={1}
                max={12}
                value={star}
                onChange={(e) => setStar(Number(e.target.value) || 1)}
                className="w-full min-w-0 sm:w-24"
              />
            </LabelHelp>
          ) : null}
          <LabelHelp
            label="Fenêtre FFT"
            help={{
              title: "Fenêtre FFT",
              body: "Blackman-Harris : leakage faible. Flattop : amplitude des raies plus fidèle. Hann : compromis.",
            }}
          >
            <Select value={fftWindow} onValueChange={(v) => v && setFftWindow(v)}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Fenêtre FFT">
                <span className="flex flex-1 text-left">
                  {fftWindow === "flattop" ? "Flattop" : fftWindow === "hann" ? "Hann" : "Blackman-Harris"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blackmanharris">Blackman-Harris</SelectItem>
                <SelectItem value="flattop">Flattop</SelectItem>
                <SelectItem value="hann">Hann</SelectItem>
              </SelectContent>
            </Select>
          </LabelHelp>
          <LabelHelp
            label="Filtre"
            help={{
              title: "Filtrer",
              body: "Restreint la fenêtre côté UI. L’API Harmo lit les dates de la fenêtre, pas ce filtre de numéros.",
            }}
          >
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrer par numéros"
              className="w-full min-w-0 sm:w-56"
            />
          </LabelHelp>
        </div>
      </div>

      <PillTabs idPrefix="harmo" label="Harmo" value={tab} onValueChange={setTab} items={TABS} />

      <PillTabPanel idPrefix="harmo" tab={tab}>
      {tab === "tf" ? (
        <div className="mb-3">
          <Button
            type="button"
            variant={showSst ? "secondary" : "outline"}
            size="xs"
            onClick={() => setShowSst((v) => !v)}
          >
            {showSst ? "SST affichée" : "STFT brute"}
          </Button>
        </div>
      ) : null}

      {tab === "melange" ? <MixPanel data={payload} loading={loading} /> : null}
      {tab === "reseau" ? <GridPanel data={payload} loading={loading} /> : null}
      {tab === "mecanique" ? (
        <MechPanel envelope={payload} orders={orders} loading={loading} />
      ) : null}
      {tab === "acoustique" ? <AcousticPanel data={payload} loading={loading} /> : null}
      {tab === "tf" ? <TfPanel data={payload} loading={loading} showSst={showSst} /> : null}
      {tab === "tests" ? <TestsPanel data={payload} loading={loading} onRun={() => void loadNull()} /> : null}
      </PillTabPanel>
    </div>
  )
}
