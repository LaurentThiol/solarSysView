"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { AcousticPanel } from "@/components/harmo/acoustic-panel"
import { GridPanel } from "@/components/harmo/grid-panel"
import { MechPanel } from "@/components/harmo/mech-panel"
import { MixPanel } from "@/components/harmo/mix-panel"
import { TestsPanel } from "@/components/harmo/tests-panel"
import { TfPanel } from "@/components/harmo/tf-panel"
import { WindowBar } from "@/components/analysis/window-bar"
import { HelpTip, LabelHelp, TitleHelp, type HelpCopy } from "@/components/help"
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
import { parseQueryNumbers, drawMatchesQuery } from "@/lib/draws"
import {
  fetchHarmo,
  harmoQuery,
  type HarmoReport,
  type HarmoStatus,
} from "@/lib/harmo"
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
      body: "Peigne de raies verrouillé (calendrier, scan de f0, THD, Lomb-Scargle). L’analogue du 50 Hz, pas des hertz.",
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

export function HarmoLab() {
  const [era, setEra] = useState<"current" | "all">("current")
  const { draws, source, loading: drawsLoading } = useDraws(era)
  const [tab, setTab] = useState<TabId>("melange")
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
    })
  }, [archive, preset, customFrom, customTo, lastN, warmup])
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
    })
  }, [variable, variableN, era, preset, resolved.fromDate, resolved.toDate, lastN, warmup, fftWindow])

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/harmo/status", { cache: "no-store" })
        if (response.ok) setStatus((await response.json()) as HarmoStatus)
      } catch {
        setStatus({ ok: false, error: "API injoignable" })
      }
    })()
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

  useEffect(() => {
    if (drawsLoading) return
    if (tab === "tests") return
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

  if (drawsLoading) {
    return <p className="text-sm text-muted-foreground">Chargement des tirages…</p>
  }

  const displayFrom = preset === "custom" ? customFrom : resolved.fromDate ?? customFrom
  const displayTo = preset === "custom" ? customTo : resolved.toDate ?? customTo

  return (
    <div className="flex min-w-0 flex-col gap-6">
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
            <Select value={era} onValueChange={(v) => setEra(v as "current" | "all")}>
              <SelectTrigger className="w-full sm:w-56" aria-label="Ère">
                <span className="flex flex-1 text-left">
                  {era === "all" ? "Archive : tout l’historique" : "Archive : formule actuelle (12 ★)"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Archive : formule actuelle (12 ★)</SelectItem>
                <SelectItem value="all">Archive : tout l’historique</SelectItem>
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
            <Select value={variable} onValueChange={(v) => setVariable(v as VariableName)}>
              <SelectTrigger className="w-full sm:w-56" aria-label="Variable">
                <span className="flex flex-1 text-left">{VARIABLE_LABELS[variable]}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Numéros</SelectLabel>
                  {NUMBER_VARIABLE_NAMES.map((name) => (
                    <SelectItem key={name} value={name}>
                      {VARIABLE_LABELS[name]}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Étoiles</SelectLabel>
                  {STAR_VARIABLE_NAMES.map((name) => (
                    <SelectItem key={name} value={name}>
                      {VARIABLE_LABELS[name]}
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
                className="w-24"
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
                className="w-24"
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
              className="sm:w-56"
            />
          </LabelHelp>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Harmo">
        {TABS.map((item) => (
          <span key={item.id} className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-full border px-3 py-1 text-xs ${
                tab === item.id
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
            <HelpTip {...(item.help as HelpCopy)} />
          </span>
        ))}
      </nav>

      {tab === "tf" ? (
        <div>
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
    </div>
  )
}
