"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import { WindowBar } from "@/components/analysis/window-bar"
import { useRegisterCapture } from "@/components/capture"
import { HelpTip, LabelHelp, TitleHelp, WithHelp, type HelpCopy } from "@/components/help"
import { SiteHeaderSlot } from "@/components/site-header-slot"
import { WeekdayScopeControl } from "@/components/weekday-scope-control"
import {
  AttentionChart,
  CycleOverlayChart,
  RibbonChart,
  WeightChart,
  channelTitle,
  clockRows,
  moduleLabel,
  pastReadingRows,
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
  type CycleChannel,
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

const WINDOW_HELP = {
  title: "Warmup",
  body: `Tirages juste avant la fenêtre (défaut ${DEFAULT_WARMUP}). Ils nourrissent l’encodeur du TFT. La perte de test et les phases affichées restent sur la fenêtre.`,
} as const

const WINDOW_FOOTNOTE = `Le registre et le TFT lisent ce jeu de tirages. Le warmup (défaut ${DEFAULT_WARMUP}) nourrit l’encodeur et reste hors de la perte de test.`

const COUNTS_HELP = {
  title: "Effectif de la fenêtre",
  body: "Nombre de tirages sur lesquels les phases et les scores sont lus. Le warmup, juste avant, nourrit l’encodeur et n’entre pas dans cet effectif.",
} as const

const TORCH_HELP = {
  title: "torch",
  body: "PyTorch calcule le TFT (poids, attention, ablation, nuls). Sans lui, le registre des horloges et le passé observé restent lisibles.",
} as const

const READ_HELP = {
  title: "Lire le TFT",
  body: "Walk-forward sur la fenêtre : quels canaux pèsent, où l’attention se pose, et si retirer une horloge augmente la perte pinball. Inactif sans torch. Le registre se charge sans ce bouton.",
} as const

const KNOWN_HELP: HelpCopy = {
  title: "Futur connu",
  body: "Horloges dont la phase est connue avant le tirage : calendrier, Réf, raie Harmo, cycle court.",
  items: [
    {
      label: "Phase",
      text: "Valeur au dernier tirage de la fenêtre. 0 ouvre le cycle, 1 le referme.",
    },
    {
      label: "Jours",
      text: "Période calendaire, quand l’horloge est fixée en jours (Lune, Carrington, année).",
    },
    {
      label: "Tirages",
      text: "Période comptée en tirages : raie Harmo, cycle court, arches.",
    },
  ],
}

const PAST_HELP: HelpCopy = {
  title: "Passé observé",
  body: "Canaux connus une fois le tirage archivé. Le module est l’étiquette de provenance.",
  items: [
    {
      label: "Analyse",
      text: "Séries sœurs au même index (somme, rangs, écarts). Elles sont repliées, toutes présentes.",
    },
    {
      label: "Chartisme",
      text: "Activité, occupation d’une arche de 9 à 120 tirages, cycle court, étendue courte.",
    },
    {
      label: "Morpho",
      text: "Étendue des trous g1–g4, forme du glyphe.",
    },
    {
      label: "Relief",
      text: "Centroïde du profil, de n1 vers n5.",
    },
    {
      label: "Pronostic",
      text: "Résidu de la cible contre la médiane des 8 tirages précédents.",
    },
  ],
}

const CHANNEL_HELP: Record<string, string> = {
  lunar: "Fraction du mois synodique (~29,53 j), lue dans Réf.",
  carrington: "Fraction de la rotation solaire de Carrington (~27,3 j).",
  schwabe: "Place dans le cycle de taches (~11 ans). Lent face à une fenêtre courte.",
  tropical: "Saison : jour de l’année tropique (~365,24 j).",
  anomalistique: "Mois anomalistique (~27,55 j). Période connue, phase posée sans série téléchargée.",
  draconitique: "Mois draconitique (~27,21 j). Période connue, phase posée sans série téléchargée.",
  saros: "Saros (~18 ans). Période connue, très lente sur une fenêtre de tirages.",
  harmo: "Phase de la raie FFT dominante. La période est estimée sur le passé, puis tenue fixe.",
  "harmo:court":
    "Phase de l’arche de 4 à 8 tirages. La période est la médiane de ces arches. La raie dominante reste le canal lent.",
  "chartisme:activity": "Valeur absolue de la variation de la cible, d’un tirage au précédent.",
  "chartisme:occupancy": "1 si le tirage est dans une arche de 9 à 120 tirages. Plafond de lecture.",
  "chartisme:court": "1 si l’arche de pivots dure de 4 à 8 tirages.",
  "chartisme:etendue": "Écart max − min de l’arche courte qui contient le tirage. 0 hors de cette arche.",
  "morpho:gap_span": "Écart max − min des trous g1–g4 : forme du glyphe.",
  "relief:centroid": "Hauteur moyenne du profil n1 vers n5.",
  "pronostic:z":
    "Écart de la cible à la médiane des 8 tirages précédents, divisé par la demi-étendue. Étendue nulle : résidu nul.",
}

const FIT_HELP = {
  train: {
    title: "Perte d’entraînement",
    body: "Perte pinball (quantiles 10 %, 50 %, 90 %) sur les fenêtres d’apprentissage, environ 70 % les plus anciennes. Elle dit si le réseau a bougé.",
  },
  test: {
    title: "Perte de test",
    body: "Même pinball sur les tirages tenus hors de l’apprentissage. C’est le chiffre à comparer à la base.",
  },
  base: {
    title: "Base",
    body: "Quantiles empiriques de l’apprentissage, constants sur l’horizon. Le TFT ne décrit un gain que s’il passe sous cette perte.",
  },
  ratio: {
    title: "Rapport",
    body: "Perte de test divisée par la base. Sous 1, le TFT bat les quantiles empiriques.",
  },
  coverage: {
    title: "Couverture",
    body: "Part des tirages de test dont la valeur archivée tombe entre les quantiles 10 % et 90 % annoncés avant ce tirage. Un intervalle 10–90 vise environ 80 %.",
  },
  harmo: {
    title: "Raie Harmo",
    body: "Période dominante lue sur l’apprentissage, en tirages. Elle devient une horloge du futur connu.",
  },
} as const satisfies Record<string, HelpCopy>

const COSINE_HELP: HelpCopy = {
  title: "Cosinus des poids",
  body: "1 si les deux courbes s’appuient sur les mêmes canaux, 0 si leurs poids n’ont rien en commun.",
  items: [
    { label: "Horloges", text: "Futur connu, sinus et cosinus d’une même horloge déjà groupés." },
    { label: "Séries", text: "Passé observé, une fois la cible retirée." },
  ],
}

const NULL_HELP: HelpCopy = {
  title: "Trois nuls",
  body: "Delta contre le tracé réel. Positif et « réel meilleur » : le modèle utilise l’ordre ou les phases, au-delà de la marge des valeurs.",
  items: [
    {
      label: "Remaniement de l’ordre",
      text: "Les pas du passé sont permutés. L’ordre des tirages ne porte plus.",
    },
    {
      label: "Permutation des phases",
      text: "Les horloges sont décalées d’une demi-fenêtre. Le calage de phase est cassé.",
    },
    {
      label: "Entrées i.i.d.",
      text: "Chaque canal est retiré au hasard dans ses propres valeurs. La structure conjointe disparaît.",
    },
  ],
}

function channelHelp(row: CycleChannel): HelpCopy | null {
  const key = row.id.replace(/:(sin|cos)$/, "")
  if (key.startsWith("series:")) {
    const target = row.note?.includes("Cible")
    return {
      title: channelTitle(row),
      body: target
        ? "Valeur déjà observée de la courbe cible. Elle entre dans le passé du TFT."
        : "Série sœur au même index de tirage que la cible.",
    }
  }
  const body = CHANNEL_HELP[key] ?? row.note
  if (!body) return null
  return { title: channelTitle(row), body }
}

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
          known: cosine(
            (fit.signature.vsn_known_grouped ?? []).map((row) => row.value).length
              ? fit.signature.vsn_known_grouped!.map((row) => row.value)
              : fit.signature.vsn_known,
            (otherFit.signature.vsn_known_grouped ?? []).map((row) => row.value).length
              ? otherFit.signature.vsn_known_grouped!.map((row) => row.value)
              : otherFit.signature.vsn_known
          ),
          past: cosine(
            fit.signature.vsn_past_without_target ?? fit.signature.vsn_past,
            otherFit.signature.vsn_past_without_target ?? otherFit.signature.vsn_past
          ),
        }
      : null

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {dayBar}
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        {work.length} tirage{work.length > 1 ? "s" : ""} dans la fenêtre (source{" "}
        {source === "neon" ? "Neon" : "JSON local"}). Le warmup nourrit l’encodeur et n’entre pas dans les scores.
        <HelpTip {...COUNTS_HELP} />
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1">
          {status?.torch ? (
            <Badge variant="secondary">torch {status.torch_version}</Badge>
          ) : (
            <Badge variant="outline">torch absent — registre seulement</Badge>
          )}
          <HelpTip {...TORCH_HELP} />
        </span>
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
        warmupHelp={WINDOW_HELP}
        footnote={WINDOW_FOOTNOTE}
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
          <WithHelp help={READ_HELP} className="self-end">
            <Button type="button" disabled={fitting || !status?.torch} onClick={() => void loadFit()}>
              {fitting ? "Lecture…" : "Lire le TFT"}
            </Button>
          </WithHelp>
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
                <h2 className="text-sm font-medium">
                  <TitleHelp help={KNOWN_HELP}>Futur connu — les horloges</TitleHelp>
                </h2>
                <p className="text-xs leading-5 text-muted-foreground">
                  Phase au dernier tirage de la fenêtre. 0 ouvre le cycle, 1 le referme.
                </p>
                <ul className="flex flex-col gap-2 text-sm">
                  {known.map((row) => (
                    <li key={row.id} className="rounded-lg border border-border px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <ChannelName row={row} />
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
                <h2 className="text-sm font-medium">
                  <TitleHelp help={PAST_HELP}>Passé observé — par module</TitleHelp>
                </h2>
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
                        <li key={row.id} className="flex items-center justify-between gap-2 border-b border-border/60 py-1">
                          <ChannelName row={row} />
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
              <div className="flex flex-col gap-4">
                {fit.signature.beats_baseline === false ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Le TFT ne bat pas les quantiles empiriques de la fenêtre (rapport{" "}
                    {fit.signature.loss_ratio?.toFixed(2) ?? "—"}). Ces poids ne décrivent pas un gain.
                  </p>
                ) : null}
                <div className="grid gap-6 lg:grid-cols-2">
                  <WeightChart
                    title="Horloges"
                    caption="Poids du futur connu, sinus et cosinus d’une même horloge additionnés. Une barre haute veut dire que cette phase entre dans la lecture."
                    rows={clockRows(fit.signature)}
                  />
                  <WeightChart
                    title="Séries et figures"
                    caption="Poids du passé une fois la cible retirée, pour que les autres modules parlent. « Copie du pas précédent » est le poids qu’avait la cible elle-même."
                    rows={pastReadingRows(fit.signature)}
                  />
                </div>
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
                      massNext={row.mass_next}
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
                  <HelpTip {...COSINE_HELP} />
                </p>
                <WeightChart
                  title="Écart de poids des horloges"
                  caption="Positif : la première courbe s’appuie plus sur ce canal. Négatif : c’est la seconde. Sinus et cosinus sont déjà groupés."
                  rows={clockRows(fit.signature).map((row) => ({
                    id: row.id,
                    label: row.label,
                    value: row.value - (clockRows(otherFit.signature!).find((other) => other.id === row.id)?.value ?? 0),
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
                    fit.signature.beats_baseline
                      ? fit.signature.beats_nulls
                        ? "Ablation — bat la base et les nuls"
                        : "Ablation — bat la base"
                      : "Ablation — ne bat pas la base"
                  }
                  caption="Delta de perte quand on retire l’horloge. Elle gagne si le delta est positif et si le TFT bat les quantiles empiriques. Battre les trois nuls est un second verdict."
                  rows={fit.signature.ablation.map((row) => ({
                    id: row.id,
                    label: row.wins ? `${weightTitle(row.id)} · gagne` : weightTitle(row.id),
                    value: row.delta,
                  }))}
                />
                <WeightChart
                  title="Trois nuls"
                  caption={NULL_HELP.body}
                  help={NULL_HELP}
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

function ChannelName({ row }: { row: CycleChannel }) {
  const help = channelHelp(row)
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="min-w-0">{channelTitle(row)}</span>
      {help ? <HelpTip {...help} /> : null}
    </span>
  )
}

function FitMetric({ label, value, help }: { label: string; value: string; help: HelpCopy }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label} {value}
      <HelpTip {...help} />
    </span>
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
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {fit.train_loss != null ? (
          <FitMetric label="Perte d’entraînement" value={fit.train_loss.toFixed(4)} help={FIT_HELP.train} />
        ) : null}
        {fit.test_loss != null ? (
          <FitMetric label="Test" value={fit.test_loss.toFixed(4)} help={FIT_HELP.test} />
        ) : null}
        {fit.baseline_loss != null ? (
          <FitMetric label="Base" value={fit.baseline_loss.toFixed(4)} help={FIT_HELP.base} />
        ) : null}
        {fit.loss_ratio != null ? (
          <FitMetric label="Rapport" value={fit.loss_ratio.toFixed(2)} help={FIT_HELP.ratio} />
        ) : null}
        {fit.coverage != null ? (
          <FitMetric
            label="Couverture"
            value={`${(fit.coverage * 100).toFixed(0)} %`}
            help={FIT_HELP.coverage}
          />
        ) : null}
        {fit.harmo_period_draws ? (
          <FitMetric
            label="Raie Harmo"
            value={`${fit.harmo_period_draws.toFixed(1)} tirages`}
            help={FIT_HELP.harmo}
          />
        ) : null}
        {fit.disclaimer ? <span>{fit.disclaimer}</span> : null}
      </p>
      {children}
    </div>
  )
}
