"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import { WindowBar } from "@/components/analysis/window-bar"
import { useRegisterCapture } from "@/components/capture"
import { HelpTip, LabelHelp, TitleHelp } from "@/components/help"
import { SiteHeaderSlot } from "@/components/site-header-slot"
import { WeekdayScopeControl } from "@/components/weekday-scope-control"
import {
  AttentionChart,
  CycleOverlayChart,
  RibbonChart,
  WeightChart,
  channelTitle,
  moduleLabel,
  signatureRows,
  weightTitle,
} from "@/components/cycles/cycle-charts"
import { WeekdaySynthesisCard } from "@/components/weekday-synthesis-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PillTabPanel, PillTabs } from "@/components/ui/pill-tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  VARIABLE_LABELS,
  seriesIndex,
  variableNeedsBall,
  variableNeedsStar,
  type VariableName,
} from "@/lib/analysis"
import { DEFAULT_WARMUP, resolveWindow, type WindowPreset } from "@/lib/analysis-window"
import { ERA_LABELS } from "@/lib/copy"
import { asPositiveInt, asVariableName, asWindowPreset, readLabSearch } from "@/lib/lab-search"
import { useLabTab } from "@/lib/use-lab-tab"
import { useDraws } from "@/lib/use-draws"
import { useWeekdayScope } from "@/lib/use-weekday-scope"
import { weekdayApiValue, type WeekdayScope } from "@/lib/weekday-scope"
import {
  cosine,
  cyclesQuery,
  fetchCycles,
  type CycleFit,
  type CyclePanel,
  type CycleRegistry,
  type CycleStatus,
} from "@/lib/cycles"

const TABS = [
  {
    id: "registre",
    label: "Registre",
    help: {
      title: "Registre",
      body: "Un canal par horloge ou par série. La phase est celle du dernier tirage de la fenêtre.",
    },
  },
  {
    id: "atlas",
    label: "Atlas",
    help: {
      title: "Atlas",
      body: "Poids moyens du réseau de sélection sur le walk-forward. Un poids élevé dit que le canal entre dans la lecture de la courbe.",
    },
  },
  {
    id: "attention",
    label: "Attention",
    help: {
      title: "Attention",
      body: "Le ruban est la couverture passée (quantiles 0,1 / 0,5 / 0,9). L’attention repliée dit si une phase verrouille le regard.",
    },
  },
  {
    id: "comparaison",
    label: "Comparaison",
    help: {
      title: "Comparaison",
      body: "Deux courbes, mêmes dates. Le cosinus compare leurs régimes temporels, pas leurs valeurs.",
    },
  },
  {
    id: "nuls",
    label: "Nuls",
    help: {
      title: "Nuls",
      body: "Une horloge ne gagne que si la retirer augmente la perte et que le tracé réel bat les trois nuls.",
    },
  },
] as const

type TabId = (typeof TABS)[number]["id"]
const TAB_IDS = TABS.map((item) => item.id) as TabId[]

const TARGETS: VariableName[] = [
  "sum",
  "spread",
  "parity",
  "centroid",
  "n1",
  "n3",
  "n5",
  "g1",
  "star_sum",
  "e1",
  "delay",
]

const DAY_BAR_HELP = {
  title: "Jour sous le bandeau",
  body: "Même choix qu’Évolution et Harmo : Tous, Mardi, Vendredi ou Synthèse. Mardi ou Vendredi isole ce jour avant la fenêtre.",
} as const

const PAST_ORDER = ["chartisme", "morpho", "relief", "pronostic", "harmo", "analyse"] as const

function CyclesDayBar({
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
      <div data-cycles-window className="border-t border-border/80" role="region" aria-label="Jour des tirages">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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

export function CyclesLab() {
  const [era, setEra] = useState<"current" | "all">("current")
  const [weekday, setWeekday] = useWeekdayScope()
  const { draws, source, loading: drawsLoading } = useDraws(era, weekday)
  const [tab, setTab] = useLabTab(TAB_IDS, "registre")
  const [preset, setPreset] = useState<WindowPreset>("last_100")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [lastN, setLastN] = useState("")
  const [warmup, setWarmup] = useState(DEFAULT_WARMUP)
  const [variable, setVariable] = useState<VariableName>("sum")
  const [other, setOther] = useState<VariableName>("spread")
  const [ball, setBall] = useState(7)
  const [status, setStatus] = useState<CycleStatus | null>(null)
  const [registry, setRegistry] = useState<CycleRegistry | null>(null)
  const [panel, setPanel] = useState<CyclePanel | null>(null)
  const [fit, setFit] = useState<CycleFit | null>(null)
  const [otherFit, setOtherFit] = useState<CycleFit | null>(null)
  const [loading, setLoading] = useState(false)
  const [fitting, setFitting] = useState(false)

  useEffect(() => {
    const params = readLabSearch()
    const nextVariable = asVariableName(params.get("variable"))
    const nextPreset = asWindowPreset(params.get("preset"))
    const n = asPositiveInt(params.get("n"), 1, 50)
    /* eslint-disable react-hooks/set-state-in-effect -- recopie l'URL au montage */
    if (nextVariable) setVariable(nextVariable)
    if (nextPreset) setPreset(nextPreset)
    if (n != null && variableNeedsBall(nextVariable ?? "sum")) setBall(n)
    /* eslint-enable react-hooks/set-state-in-effect */
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
      weekday: weekday === "mardi" || weekday === "vendredi" ? weekday : null,
    })
  }, [archive, preset, customFrom, customTo, lastN, warmup, weekday])
  const work = resolved.work
  const variableN = seriesIndex(variable, ball, 1)

  const params = useMemo(() => {
    const parsedN = Number.parseInt(lastN, 10)
    return cyclesQuery({
      variable,
      n: variableNeedsBall(variable) || variableNeedsStar(variable) ? variableN : undefined,
      era,
      preset,
      from_date: resolved.fromDate,
      to_date: resolved.toDate,
      last_n: Number.isFinite(parsedN) && parsedN > 0 ? parsedN : undefined,
      warmup,
      weekday: weekdayApiValue(weekday),
      encoder: 32,
      horizon: 4,
      hidden: 32,
      epochs: 8,
    })
  }, [variable, variableN, era, preset, resolved.fromDate, resolved.toDate, lastN, warmup, weekday])

  useRegisterCapture(() => ({
    lab: "cycles",
    tab,
    summary: [
      `${VARIABLE_LABELS[variable]}, ${work.length} tirages`,
      fit?.ok ? `perte test ${fit.test_loss}` : "TFT non lu",
    ],
    tech: { variable, other, tab, fit: fit?.signature ?? null },
  }))

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const body = await fetchCycles<CycleStatus>("status", new URLSearchParams())
        if (!cancelled) setStatus(body)
      } catch {
        if (!cancelled) setStatus({ ok: false, error: "API injoignable" })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadRegistry = useCallback(async () => {
    setLoading(true)
    try {
      const [reg, view] = await Promise.all([
        fetchCycles<CycleRegistry>("registry", params),
        fetchCycles<CyclePanel>("panel", params),
      ])
      setRegistry(reg)
      setPanel(view)
    } catch (error) {
      setRegistry({
        ok: false,
        error: error instanceof Error ? error.message : "API injoignable",
      })
    } finally {
      setLoading(false)
    }
  }, [params])

  useEffect(() => {
    if (drawsLoading) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- charge le registre quand la fenêtre change
    void loadRegistry()
  }, [drawsLoading, loadRegistry])

  async function runFit(target: VariableName, ballIndex: number) {
    const search = new URLSearchParams(params)
    search.set("variable", target)
    if (variableNeedsBall(target)) search.set("n", String(ballIndex))
    else search.delete("n")
    return fetchCycles<CycleFit>("fit", search, "POST")
  }

  async function loadFit() {
    setFitting(true)
    setFit(null)
    setOtherFit(null)
    try {
      const main = await runFit(variable, ball)
      setFit(main)
      if (tab === "comparaison" && other !== variable) {
        setOtherFit(await runFit(other, ball))
      }
    } catch (error) {
      setFit({ ok: false, error: error instanceof Error ? error.message : "API injoignable" })
    } finally {
      setFitting(false)
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

  const dayBar = <CyclesDayBar weekday={weekday} onWeekday={setWeekday} drawCount={work.length} />

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
  const known = (registry?.channels ?? []).filter((row) => row.role === "known" && row.id.endsWith(":sin"))
  const past = (registry?.channels ?? []).filter((row) => row.role === "past")
  const comparison =
    fit?.signature && otherFit?.signature
      ? {
          known: cosine(fit.signature.vsn_known, otherFit.signature.vsn_known),
          past: cosine(fit.signature.vsn_past, otherFit.signature.vsn_past),
        }
      : null

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {dayBar}
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        {work.length} tirages dans la fenêtre (source {source === "neon" ? "Neon" : "JSON local"}).
        Le warmup nourrit l’encodeur et n’entre pas dans les scores.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {status?.torch ? (
          <Badge variant="secondary">torch {status.torch_version}</Badge>
        ) : (
          <Badge variant="outline">torch absent — registre seulement</Badge>
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
        onPreset={(value) => {
          setPreset(value)
          if (value !== "custom") {
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
        <p className="text-sm font-medium">
          <TitleHelp
            help={{
              title: "Cible",
              body: "La courbe dont on lit les cycles. Les autres séries restent des canaux observés.",
            }}
          >
            Cible
          </TitleHelp>
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <LabelHelp label="Archive" help={{ title: "Ère", body: "Formule actuelle ou tout l’historique." }}>
            <Select value={era} onValueChange={(value) => value && setEra(value as "current" | "all")}>
              <SelectTrigger className="w-44">{ERA_LABELS[era]}</SelectTrigger>
              <SelectContent>
                <SelectItem value="current">{ERA_LABELS.current}</SelectItem>
                <SelectItem value="all">{ERA_LABELS.all}</SelectItem>
              </SelectContent>
            </Select>
          </LabelHelp>
          <LabelHelp label="Courbe" help={{ title: "Courbe", body: "Agrégats d’abord. Retard et présence gardent l’avertissement dents de scie." }}>
            <Select value={variable} onValueChange={(value) => value && setVariable(value as VariableName)}>
              <SelectTrigger className="w-56">{VARIABLE_LABELS[variable]}</SelectTrigger>
              <SelectContent>
                {TARGETS.map((name) => (
                  <SelectItem key={name} value={name}>
                    {VARIABLE_LABELS[name]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabelHelp>
          {variableNeedsBall(variable) ? (
            <LabelHelp label="Boule" help={{ title: "Boule", body: "Index 1–50 du retard ou de la présence." }}>
              <Input
                className="w-20"
                inputMode="numeric"
                value={String(ball)}
                onChange={(event) => setBall(Math.min(50, Math.max(1, Number(event.target.value) || 1)))}
              />
            </LabelHelp>
          ) : null}
          <LabelHelp
            label="Comparer à"
            help={{ title: "Seconde courbe", body: "Même fenêtre. Le cosinus se lit dans l’onglet Comparaison." }}
          >
            <Select value={other} onValueChange={(value) => value && setOther(value as VariableName)}>
              <SelectTrigger className="w-56">{VARIABLE_LABELS[other]}</SelectTrigger>
              <SelectContent>
                {TARGETS.map((name) => (
                  <SelectItem key={name} value={name}>
                    {VARIABLE_LABELS[name]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabelHelp>
          <Button type="button" disabled={fitting || !status?.torch} onClick={() => void loadFit()}>
            {fitting ? "Lecture…" : "Lire le TFT"}
          </Button>
        </div>
      </div>

      {(registry?.notes ?? fit?.notes ?? []).map((note) => (
        <p
          key={note.id}
          className={note.level === "warn" ? "text-sm text-amber-700 dark:text-amber-300" : "text-sm text-muted-foreground"}
        >
          {note.text}
        </p>
      ))}

      <PillTabs idPrefix="cycles" label="Cycles" value={tab} onValueChange={setTab} items={TABS} />
      <PillTabPanel idPrefix="cycles" tab={tab}>
        {loading ? <p className="text-sm text-muted-foreground">Alignement des canaux…</p> : null}
        {registry && !registry.ok ? <p className="text-sm text-destructive">{registry.error}</p> : null}

        {tab === "registre" && registry?.ok ? (
          <div className="flex flex-col gap-6">
            {panel?.ok && panel.dates?.length ? (
              <CycleOverlayChart panel={panel} targetLabel={VARIABLE_LABELS[variable]} />
            ) : null}
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">Futur connu — les horloges</h2>
                <p className="text-xs leading-5 text-muted-foreground">
                  Phase au dernier tirage de la fenêtre. 0 ouvre le cycle, 1 le referme.
                </p>
                <ul className="flex flex-col gap-2 text-sm">
                  {known.map((row) => (
                    <li key={row.id} className="rounded-lg border border-border px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span>{channelTitle(row)}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          phase {row.phase == null ? "—" : row.phase.toFixed(3)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {moduleLabel(row.module)}
                        {row.period_days ? ` · ${row.period_days.toFixed(1)} j` : ""}
                        {row.period_draws ? ` · ${row.period_draws.toFixed(1)} tirages` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-medium">Passé observé — par module</h2>
                <p className="text-xs leading-5 text-muted-foreground">
                  Le module n’est pas un filtre. Dix-huit canaux viennent d’Analyse : ce sont les séries sœurs
                  (somme, rangs, écarts), toutes étiquetées Analyse. Chartisme, Morpho, Relief et Pronostic sont des
                  canaux à part, listés en premier.
                </p>
                {PAST_ORDER.map((module) => {
                  const rows = past.filter((row) => row.module === module)
                  if (!rows.length) return null
                  const body = (
                    <ul className="flex flex-col gap-1 text-sm">
                      {rows.map((row) => (
                        <li key={row.id} className="flex justify-between gap-2 border-b border-border/60 py-1">
                          <span>{channelTitle(row)}</span>
                          <span className="text-xs text-muted-foreground">{moduleLabel(row.module)}</span>
                        </li>
                      ))}
                    </ul>
                  )
                  if (module === "analyse") {
                    return (
                      <details key={module} className="rounded-lg border border-border px-3 py-2">
                        <summary className="cursor-pointer text-sm">
                          Analyse · {rows.length} séries sœurs
                        </summary>
                        <div className="mt-2 max-h-64 overflow-auto">{body}</div>
                      </details>
                    )
                  }
                  return (
                    <div key={module} className="rounded-lg border border-border px-3 py-2">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">{moduleLabel(module)}</p>
                      {body}
                    </div>
                  )
                })}
              </section>
            </div>
          </div>
        ) : null}

        {tab === "atlas" ? (
          <FitBlock fit={fit} fitting={fitting}>
            {fit?.signature ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <WeightChart
                  title="Horloges"
                  caption="Poids du futur connu. Une barre haute veut dire que cette phase entre dans la lecture de la courbe."
                  rows={signatureRows(fit.signature, "known")}
                />
                <WeightChart
                  title="Séries et figures"
                  caption="Poids du passé. Les noms disent le module : Chartisme, Morpho, Relief, Pronostic, ou une série d’Analyse."
                  rows={signatureRows(fit.signature, "past")}
                />
              </div>
            ) : null}
          </FitBlock>
        ) : null}

        {tab === "attention" ? (
          <FitBlock fit={fit} fitting={fitting}>
            <div className="flex flex-col gap-4">
              <RibbonChart fit={fit ?? { ok: false }} />
              {fit?.signature
                ? Object.entries(fit.signature.attention).map(([name, row]) => (
                    <AttentionChart
                      key={name}
                      name={name}
                      mass={row.mass}
                      locked={row.locked}
                      flatness={row.flatness}
                    />
                  ))
                : null}
            </div>
          </FitBlock>
        ) : null}

        {tab === "comparaison" ? (
          <FitBlock fit={fit} fitting={fitting}>
            {comparison && fit?.signature && otherFit?.signature ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm leading-6">
                  Même fenêtre, deux courbes. Le cosinus vaut 1 quand les deux courbes s’appuient sur les mêmes
                  canaux, 0 quand leurs poids n’ont rien en commun. Horloges {comparison.known.toFixed(3)}, séries{" "}
                  {comparison.past.toFixed(3)}, entre {VARIABLE_LABELS[variable]} et {VARIABLE_LABELS[other]}.
                </p>
                <WeightChart
                  title="Écart de poids des horloges"
                  caption="Positif : la première courbe s’appuie plus sur ce canal. Négatif : c’est la seconde."
                  rows={fit.signature.known_ids.map((id, index) => ({
                    id,
                    label: weightTitle(id),
                    value: (fit.signature?.vsn_known[index] ?? 0) - (otherFit.signature?.vsn_known[index] ?? 0),
                  }))}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Deux lectures, même fenêtre. Choisis la seconde courbe puis lis le TFT.</p>
            )}
          </FitBlock>
        ) : null}

        {tab === "nuls" ? (
          <FitBlock fit={fit} fitting={fitting}>
            {fit?.signature ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <WeightChart
                  title={
                    fit.signature.beats_nulls
                      ? "Ablation — le tracé bat les nuls"
                      : "Ablation — les nuls ne sont pas battus"
                  }
                  caption="Delta de perte quand on retire l’horloge. Positif : elle servait. Elle ne gagne que si le tracé réel bat aussi les trois nuls."
                  rows={fit.signature.ablation.map((row) => ({
                    id: row.id,
                    label: row.wins ? `${row.label} · gagne` : row.label,
                    value: row.delta,
                  }))}
                />
                <WeightChart
                  title="Trois nuls"
                  caption="Delta contre le tracé réel. Positif et « réel meilleur » : le modèle utilise l’ordre ou les phases, pas seulement la marge des valeurs."
                  rows={fit.signature.nulls.map((row) => ({
                    id: row.id,
                    label: row.better ? `${row.label} · réel meilleur` : row.label,
                    value: row.delta,
                  }))}
                />
              </div>
            ) : null}
          </FitBlock>
        ) : null}
      </PillTabPanel>
    </div>
  )
}

function FitBlock({
  fit,
  fitting,
  children,
}: {
  fit: CycleFit | null
  fitting: boolean
  children: ReactNode
}) {
  if (fitting) return <p className="text-sm text-muted-foreground">Walk-forward en cours…</p>
  if (!fit) return <p className="text-sm text-muted-foreground">Lire le TFT pour cette fenêtre.</p>
  if (!fit.ok) return <p className="text-sm text-destructive">{fit.error}</p>
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Perte d’entraînement {fit.train_loss?.toFixed(4)} · test {fit.test_loss?.toFixed(4)}
        {fit.harmo_period_draws ? ` · raie Harmo ${fit.harmo_period_draws.toFixed(1)} tirages` : ""}
        . {fit.disclaimer}
      </p>
      {children}
    </div>
  )
}
