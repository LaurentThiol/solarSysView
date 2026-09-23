"use client"

import { useEffect, useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"

import { Disclaimer, OverlayToggle } from "@/components/analysis/shared"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { DrawBalls } from "@/components/draw-balls"
import { HelpTip, HelpWrap, LabelHelp, TitleHelp, type HelpCopy } from "@/components/help"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCompactCount } from "@/lib/gains"
import { formatCount } from "@/lib/jeux"
import {
  DEFAULT_HISTORIC_LAYERS,
  DEFAULT_MARGIN,
  HISTORIC_AUTO,
  HISTORIC_HORIZON,
  HISTORIC_LOOKBACKS,
  MARGIN_STEPS,
  chooseAutoMargin,
  committeeApiDown,
  committeeHeads,
  committeeLookback,
  committeeRequestDraws,
  formatMargin,
  formatRequired,
  historicAutoRows,
  parseCommitteePayload,
  playHistoric,
  playedSummary,
  prepareHistoric,
  proposalSummary,
  scoreCommittee,
  summarizeAt,
  type CommitteePayload,
  type HistoricGameRow,
  type HistoricLayers,
  type HistoricLookback,
  type HistoricLookbackChoice,
  type LearnConfig,
  type MarginStep,
  type StackState,
} from "@/lib/pronostic"
import { weekdayScopeLabel, type WeekdayScope } from "@/lib/weekday-scope"

import {
  HistoricCommittee,
  committeeErrorMessage,
  type CommitteePhase,
} from "@/components/pronostic/historic-committee"
import { HistoricPlane } from "@/components/pronostic/historic-plane"

const RANK_HELP = {
  z: {
    title: "|z| médian",
    body: "Médiane de |réel − moyenne| / σ, sur les tirages où σ est positif. Si σ vaut 0 et que la valeur diffère, il n’y a pas de z : cet écart n’entre pas dans la médiane, et aucune marge finie ne le couvre.",
  },
  binding: {
    title: "Fois décisif",
    body: "Tirages où cet axe a exigé la plus grande marge. À marge égale, le plus grand |z| l’emporte. C’est l’axe affiché à côté de chaque tirage noté, avec son écart à la moyenne.",
  },
  outside: {
    title: "Hors marge",
    body: "L’axe sort de la marge en cours, ou aucune marge jusqu’à 3 σ ne le contient.",
  },
} as const satisfies Record<string, HelpCopy>

const HELP = {
  game: {
    title: "Partie notée",
    wide: true,
    body: "Chaque tirage des 100 derniers est noté seul. La prévision qui le juge n’utilise que les tirages strictement antérieurs. Numéros et étoiles sont notés ensemble : le tirage est dans la marge seulement si les deux le sont.\n\nÀ la marge en cours, le décompte est le nombre de grilles 5+2 encore possibles. C’est la mise. La plus petite marge dont la bande entière contient le tirage est l’erreur mesurée. Le tirage officiel reste uniforme sur 139 838 160 grilles : ces taux décrivent l’archive.",
    items: [
      {
        label: "Fenêtre notée",
        text: "Les 100 tirages les plus récents de la série affichée. Le filtre mardi / vendredi du bandeau s’applique à cette moyenne. Le comité, plus bas, confronte quand même les trois séries.",
      },
      {
        label: "Dans la marge",
        text: "Les couches allumées, numéros et étoiles, tombent dans les bandes. Une couche éteinte ne peut pas faire sortir le tirage.",
      },
      {
        label: "Mise",
        text: "Nombre de grilles numéros encore possibles, multiplié par le nombre de grilles étoiles. Seules les couches allumées réduisent ce produit.",
      },
      {
        label: "Erreur mesurée",
        text: "Plus petit pas parmi 0, 0,25, 0,5, 0,75, 1, 1,25, 1,5, 1,75, 2, 2,5 et 3 σ. Si aucun de ces pas ne contient le tirage, il est hors 3 σ.",
      },
    ],
  },
  margin: {
    title: "Marge d’erreur",
    wide: true,
    body: "Bande autour de la moyenne des tirages d’avant : moyenne ± k·σ. Les bornes sont entières, plancher en bas et plafond en haut, puis recoupées par les bornes théoriques de l’axe.\n\n0 σ suit la moyenne arrondie. Quand la moyenne tombe sur un entier, une seule valeur est gardée. Sinon la bande tient les deux entiers qui l’encadrent. Élargir k augmente la mise. En manuel, le curseur est une règle fixée à l’avance, la même pour chaque tirage noté. En automatique, il affiche la marge choisie après ces tirages et ne se règle plus à la main.",
    items: [
      {
        label: "Pas",
        text: "0, 0,25, 0,5, 0,75, 1, 1,25, 1,5, 1,75, 2, 2,5 et 3. Le défaut manuel est 1 σ.",
      },
      {
        label: "σ",
        text: "Écart type d’échantillon des tirages d’avant, diviseur n − 1. S’il vaut 0 et que le tirage diffère de la moyenne, aucune marge finie ne le couvre.",
      },
    ],
  },
  mode: {
    title: "Manuel ou automatique",
    wide: true,
    body: "Manuel : la marge est la vôtre, annoncée avant chaque tirage, et le curseur la fixe.\n\nAutomatique : parmi les marges qui contiennent au moins trois tirages, on garde celle dont la mise cumulée divisée par les tirages contenus est la plus petite. À ratio égal, la plus étroite reste. S’il n’y en a pas trois, on reste à 1 σ. Cette marge est choisie une fois toute la série notée : ce n’est pas une règle annoncée. La partie jouée, dans le comité, refait ce choix tirage par tirage sur les seuls tirages d’avant.",
  },
  lookback: {
    title: "Tirages d’avant",
    wide: true,
    body: "20, 50 ou 100 tirages strictement antérieurs. Une fenêtre incomplète n’est pas notée : il faut les 20, les 50 ou les 100 au complet. L’archive locale 2026 n’a pas encore 100 tirages antérieurs : la fenêtre 100 reste vide tant que l’archive complète n’est pas là.\n\n« Choisi avant » retient, avant le tirage, la fenêtre dont les essais précédents ont la plus petite erreur médiane. On relit jusqu’à dix essais déjà notés, et il en faut au moins trois. À médiane égale, la plus courte reste. Un tirage hors 3 σ compte comme la plus mauvaise erreur. S’il n’y a pas encore trois essais, la fenêtre est 20.",
    items: [
      {
        label: "Comité",
        text: "Le comité ne lit que 20 ou 50. Choisi avant et la fenêtre 100 sont ramenés à 20.",
      },
    ],
  },
  sum: {
    title: "Somme",
    body: "Somme des cinq numéros, entre 15 et 240, et somme des deux étoiles, entre 3 et 23. Une couche éteinte ne compte ni dans l’erreur mesurée, ni dans la mise.",
  },
  parity: {
    title: "Parité",
    body: "Nombre de numéros pairs, de 0 à 5, et d’étoiles paires, de 0 à 2. Une couche éteinte ne compte ni dans l’erreur mesurée, ni dans la mise.",
  },
  slots: {
    title: "Espaces",
    body: "n1 à n5 et e1, e2 : statistiques d’ordre. n1 est le plus petit numéro, n5 le plus grand, jamais l’ordre de sortie. Une couche éteinte ne compte ni dans l’erreur mesurée, ni dans la mise.",
  },
  hits: {
    title: "Dans la marge",
    body: "Tirages notés dont les numéros et les étoiles tombent dans la marge en cours. Le pourcentage est cette part. En dessous, les deux comptes sont séparés : un tirage peut avoir ses numéros dans la marge et ses étoiles dehors, ou l’inverse. Seul le compte du haut exige les deux.",
  },
  stake: {
    title: "Mise moyenne",
    body: "Nombre moyen de grilles 5+2 qu’il aurait fallu jouer, à cette marge, sur les tirages notés. La part de l’univers rapporte cette moyenne aux 139 838 160 grilles. Le total additionne les mises, y compris les tirages hors marge.",
  },
  perHit: {
    title: "Grilles par tirage retenu",
    body: "Mise cumulée de tous les tirages notés, divisée par le nombre de tirages contenus. Les hors marge restent dans le numérateur. C’est le quotient que le mode automatique cherche à rendre petit. Aucun tirage contenu : la case reste vide.",
  },
  median: {
    title: "Erreur médiane",
    body: "Médiane des erreurs mesurées. La moitié des tirages demandent au plus cette marge. Si le nombre de tirages est pair, c’est la moyenne des deux valeurs centrales. Quand plus de la moitié sort de 3 σ, la carte affiche « hors 3 σ ».",
  },
  curve: {
    title: "Erreur et prise",
    wide: true,
    body: "En haut, un point par tirage noté : la marge qu’il aurait fallu pour le contenir. Les points isolés au-dessus de 3 sont des tirages qu’aucune de ces marges ne contient. La ligne horizontale est la marge en cours. En manuel, elle est annoncée. En automatique, elle est choisie après ces tirages.\n\nEn bas, la part des tirages déjà notés dont l’erreur mesurée tient dans chaque pas. Cette courbe ne refait pas le décompte des grilles. La mise se recalcule à la marge choisie.",
  },
  ranks: {
    title: "Paramètres qui pèsent",
    wide: true,
    body: "Classe les axes encore allumés. L’ordre du tableau est : fois décisif, puis hors marge, puis |z| médian.",
    items: [
      { label: RANK_HELP.z.title, text: RANK_HELP.z.body },
      { label: RANK_HELP.binding.title, text: RANK_HELP.binding.body },
      { label: RANK_HELP.outside.title, text: RANK_HELP.outside.body },
    ],
  },
  next: {
    title: "Prochain tirage",
    wide: true,
    body: "Bandes de la prochaine prévision de la moyenne : la dernière fenêtre, formule moyenne ± k·σ, à la marge en cours. Le prochain tirage n’entre pas dans le calcul.\n\nPréparer le prochain tirage recopie ces bandes dans l’atelier. Le comité a son propre bouton : il recopie les siennes, quand il ne reprend pas la moyenne.",
  },
  scored: {
    title: "Tirages notés",
    wide: true,
    body: "Du plus récent au plus ancien. Chaque ligne donne la fenêtre qui a servi, l’axe décisif et son écart à la moyenne, l’erreur mesurée, et la mise à la marge en cours.",
    items: [
      {
        label: "Tous",
        text: "Les tirages qui ont une fenêtre entière avant eux.",
      },
      {
        label: "Dans la marge",
        text: "Numéros et étoiles contenus à la marge en cours.",
      },
      {
        label: "Hors marge",
        text: "Au moins une couche allumée sort de la bande. L’erreur peut encore être un pas plus large, ou « hors 3 σ ».",
      },
    ],
  },
} satisfies Record<string, HelpCopy>

const errorConfig = {
  required: { label: "Marge mesurée", color: "var(--chart-1)" },
  beyond: { label: "Hors 3 σ", color: "var(--chart-5)" },
}

const catchConfig = {
  rate: { label: "Tirages contenus", color: "var(--chart-2)" },
}

const BEYOND_PLOT = 3.4

function formatPct(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return "—"
  return value.toLocaleString("fr-FR", {
    style: "percent",
    maximumFractionDigits: digits,
  })
}

function formatDrawDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function shortDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  return `${match[3]}/${match[2]}`
}

function formatDelta(value: number) {
  const text = Math.abs(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 })
  if (value > 0) return `+${text}`
  if (value < 0) return `−${text}`
  return "0"
}

function formatAbs(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })
}

function bindingCopy(row: HistoricGameRow) {
  const axis = row.axes.find((item) => item.id === row.binding)
  if (!axis) return "—"
  return `${axis.label} ${formatDelta(axis.delta)}`
}

export function HistoricPanel({
  draws,
  allDraws,
  source,
  weekday,
  onApply,
}: {
  draws: Array<{ date: string; numbers: number[]; stars: number[] }>
  allDraws: Array<{ date: string; numbers: number[]; stars: number[]; weekday?: string | null }>
  source: string
  weekday: WeekdayScope
  onApply: (next: {
    numbers: StackState
    stars: StackState
    learn: LearnConfig
    lookback: HistoricLookback
    source: "mean" | "committee"
  }) => void
}) {
  const [lookback, setLookback] = useState<HistoricLookbackChoice>(20)
  const [marginIndex, setMarginIndex] = useState(MARGIN_STEPS.indexOf(DEFAULT_MARGIN))
  const [mode, setMode] = useState<"manual" | "auto">("manual")
  const [layers, setLayers] = useState<HistoricLayers>(DEFAULT_HISTORIC_LAYERS)
  const [filter, setFilter] = useState<"all" | "hit" | "miss">("all")
  const [packet, setPacket] = useState<{
    key: string
    status: Exclude<CommitteePhase, "loading">
    payload?: CommitteePayload
    message?: string
  } | null>(null)
  const sliderMargin = MARGIN_STEPS[Math.min(MARGIN_STEPS.length - 1, Math.max(0, marginIndex))] ?? DEFAULT_MARGIN

  const prepared = useMemo(
    () =>
      prepareHistoric(draws, {
        horizon: HISTORIC_HORIZON,
        lookback,
        layers,
      }),
    [draws, lookback, layers]
  )
  const committeeWindow = committeeLookback(lookback)
  const drawKey = useMemo(
    () =>
      allDraws
        .map((draw) => `${draw.date}|${draw.weekday ?? ""}|${draw.numbers.join(".")}|${draw.stars.join(".")}`)
        .join("\n"),
    [allDraws]
  )
  const requestedDraws = useMemo(() => committeeRequestDraws(allDraws).length, [allDraws])
  const requestKey = `${committeeWindow}|${drawKey}`
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    let retryTimer = 0
    const sent = committeeRequestDraws(allDraws)
    const delays = [1_000, 2_000, 4_000]
    const run = (attempt: number) => {
      fetch("/api/pronostic/committee", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lookback: committeeWindow, draws: sent }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = await response.json().catch(() => null)
          if (cancelled) return
          if (response.status === 503 && committeeApiDown(body)) {
            if (attempt < delays.length) {
              retryTimer = window.setTimeout(() => run(attempt + 1), delays[attempt] ?? 4_000)
              return
            }
            setPacket({ key: requestKey, status: "absent" })
            return
          }
          if (!response.ok) {
            setPacket({ key: requestKey, status: "error", message: committeeErrorMessage(body) })
            return
          }
          const payload = parseCommitteePayload(body)
          if (!payload) {
            setPacket({ key: requestKey, status: "error", message: "Réponse du comité illisible." })
            return
          }
          setPacket({ key: requestKey, status: "ready", payload })
        })
        .catch((error: unknown) => {
          if (cancelled) return
          if (error instanceof DOMException && error.name === "AbortError") return
          const message = error instanceof Error ? error.message : ""
          if (/aborted due to timeout|\btimeout\b/i.test(message)) {
            setPacket({
              key: requestKey,
              status: "error",
              message: committeeErrorMessage({ error: message }),
            })
            return
          }
          if (attempt < delays.length) {
            retryTimer = window.setTimeout(() => run(attempt + 1), delays[attempt] ?? 4_000)
            return
          }
          setPacket({ key: requestKey, status: "absent" })
        })
    }
    run(0)
    return () => {
      cancelled = true
      window.clearTimeout(retryTimer)
      controller.abort()
    }
  }, [allDraws, committeeWindow, requestKey])
  const scored = useMemo(() => {
    if (!packet || packet.key !== requestKey || packet.status !== "ready" || !packet.payload) return null
    return scoreCommittee(packet.payload, layers)
  }, [layers, packet, requestKey])
  const committeePhase: CommitteePhase = packet?.key === requestKey ? packet.status : "loading"
  const scopeId = weekday === "mardi" || weekday === "vendredi" ? weekday : "mixte"
  const displayScope = scored?.scopes[scopeId]
  const heads = useMemo(() => {
    if (!packet || packet.key !== requestKey || packet.status !== "ready" || !packet.payload) return []
    return committeeHeads(packet.payload.scopes[scopeId])
  }, [packet, requestKey, scopeId])
  const committeeMargin =
    mode === "auto" && committeePhase === "ready" && displayScope && displayScope.rows.length > 0
      ? displayScope.postHoc.margin
      : null
  const meanAuto = useMemo(() => {
    if (mode !== "auto") return null
    if (committeePhase !== "absent" && committeePhase !== "error") return null
    const rows = historicAutoRows(prepared)
    const postHoc = chooseAutoMargin(rows)
    return {
      postHoc,
      postHocSummary: summarizeAt(rows, postHoc.margin),
      played: playedSummary(rows),
      fallback: postHoc.fallback,
    }
  }, [committeePhase, mode, prepared])
  const margin: MarginStep =
    mode === "auto" ? (committeeMargin ?? meanAuto?.postHoc.margin ?? sliderMargin) : sliderMargin
  const marginLabel = formatMargin(margin)
  const game = useMemo(() => playHistoric(prepared, margin), [prepared, margin])
  const rows = useMemo(() => {
    const list =
      filter === "hit" ? game.rows.filter((row) => row.hit) : filter === "miss" ? game.rows.filter((row) => !row.hit) : game.rows
    return [...list].reverse()
  }, [filter, game.rows])
  const dayLabel = weekday === "mardi" || weekday === "vendredi" ? weekdayScopeLabel(weekday) : null
  const errorData = game.rows.map((row) => ({
    label: shortDate(row.date),
    required: row.requiredMargin,
    beyond: row.requiredMargin == null ? BEYOND_PLOT : null,
  }))
  const catchData = game.curve.map((point) => ({
    label: formatMargin(point.margin),
    rate: Math.round(point.rate * 1000) / 10,
  }))

  function apply() {
    if (!game.next) return
    onApply({
      numbers: game.next.numberState,
      stars: game.next.starState,
      learn: game.next.learn,
      lookback: game.next.lookback,
      source: "mean",
    })
  }

  const summary = game.summary
  const medianLabel = summary.medianBeyond ? "hors 3 σ" : formatRequired(summary.medianRequired)

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        <TitleHelp help={HELP.game}>Les {HISTORIC_HORIZON} derniers tirages</TitleHelp>
        , notés un par un. En manuel, la marge est annoncée avant le tirage. En automatique,
        elle est choisie après. À cette marge, on compte les grilles 5+2 qui restent : c’est la mise.
        {dayLabel ? ` Filtre du bandeau : ${dayLabel}.` : ""}
      </p>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <LabelHelp
            label={`Marge d’erreur · ${marginLabel}${mode === "auto" && (committeeMargin != null || meanAuto) ? " · choisie après ces tirages" : ""}`}
            help={HELP.margin}
          >
            <input
              type="range"
              min={0}
              max={MARGIN_STEPS.length - 1}
              step={1}
              value={Math.max(0, MARGIN_STEPS.indexOf(margin))}
              onChange={(event) => setMarginIndex(Number(event.target.value))}
              disabled={mode === "auto"}
              className="jeux-range w-full disabled:opacity-60"
              aria-label="Marge d’erreur"
              aria-valuetext={marginLabel}
            />
          </LabelHelp>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              Marge
              <HelpTip {...HELP.mode} />
            </span>
            <Button type="button" size="sm" variant={mode === "manual" ? "default" : "outline"} onClick={() => setMode("manual")}>
              Manuel
            </Button>
            <Button type="button" size="sm" variant={mode === "auto" ? "default" : "outline"} onClick={() => setMode("auto")}>
              Automatique
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === "manual"
              ? "0 σ suit la moyenne arrondie. Cette marge est annoncée avant le tirage."
              : "Automatique choisit la marge après les tirages notés. À côté, la partie jouée fige la marge avant chaque tirage."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            Tirages d’avant
            <HelpTip {...HELP.lookback} />
          </span>
          {HISTORIC_LOOKBACKS.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={lookback === item ? "default" : "outline"}
              onClick={() => setLookback(item)}
            >
              {item}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={lookback === HISTORIC_AUTO ? "default" : "outline"}
            onClick={() => setLookback(HISTORIC_AUTO)}
          >
            Choisi avant
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <OverlayToggle
            label="Somme"
            on={layers.sum}
            onClick={() => setLayers((prev) => ({ ...prev, sum: !prev.sum }))}
            help={HELP.sum}
          />
          <OverlayToggle
            label="Parité"
            on={layers.parity}
            onClick={() => setLayers((prev) => ({ ...prev, parity: !prev.parity }))}
            help={HELP.parity}
          />
          <OverlayToggle
            label="Espaces"
            on={layers.slots}
            onClick={() => setLayers((prev) => ({ ...prev, slots: !prev.slots }))}
            help={HELP.slots}
          />
        </div>
      </div>

      {summary.n === 0 ? (
        <p className="text-sm text-muted-foreground">
          {lookback === 100
            ? "Aucun tirage n’a 100 tirages complets avant lui dans cette archive. Une fenêtre de 20 ou de 50 peut encore être notée."
            : lookback === 50
              ? "Aucun tirage n’a 50 tirages complets avant lui dans cette archive."
              : "Pas assez d’historique : il faut une fenêtre entière de tirages avant celui qu’on note."}
          {game.available > 0 ? ` Archive utilisable : ${game.available} tirages complets.` : ""}
        </p>
      ) : (
        <>
          <p className="sr-only" aria-live="polite">
            {marginLabel} : {summary.hits} tirages dans la marge sur {summary.n},{" "}
            {summary.meanGrids == null ? "mise inconnue" : `mise moyenne ${formatCount(summary.meanGrids)} grilles`}.
          </p>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <p className="inline-flex flex-wrap items-center gap-1 text-xs tracking-wide text-muted-foreground uppercase">
                  Dans la marge
                  <HelpTip {...HELP.hits} />
                </p>
                <CardTitle className="text-lg tabular-nums">
                  {summary.hits}/{summary.n}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{formatPct(summary.rate)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Numéros {summary.numberHits} · étoiles {summary.starHits}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <p className="inline-flex flex-wrap items-center gap-1 text-xs tracking-wide text-muted-foreground uppercase">
                  Mise moyenne
                  <HelpTip {...HELP.stake} />
                </p>
                <CardTitle className="text-lg tabular-nums">{formatCount(summary.meanGrids ?? 0)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground tabular-nums">
                Part de l’univers {formatPct(summary.meanVolume, 3)}
                {summary.totalGrids != null ? ` · total ${formatCompactCount(summary.totalGrids)}` : ""}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <p className="inline-flex flex-wrap items-center gap-1 text-xs tracking-wide text-muted-foreground uppercase">
                  Grilles par tirage retenu
                  <HelpTip {...HELP.perHit} />
                </p>
                <CardTitle className="text-lg tabular-nums">
                  {summary.gridsPerHit == null ? "—" : formatCompactCount(summary.gridsPerHit)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {summary.hits === 0 ? "Aucun tirage dans la marge." : "Mise cumulée divisée par les tirages contenus."}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <p className="inline-flex flex-wrap items-center gap-1 text-xs tracking-wide text-muted-foreground uppercase">
                  Erreur médiane
                  <HelpTip {...HELP.median} />
                </p>
                <CardTitle className="text-lg tabular-nums">{medianLabel}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {summary.medianBeyond
                  ? "Plus de la moitié des tirages sortent de 3 σ."
                  : "La moitié des tirages demandent au plus cette marge."}
              </CardContent>
            </Card>
          </section>
        </>
      )}

      <HistoricCommittee
        weekday={weekday}
        lookbackChoice={lookback}
        margin={margin}
        mode={mode}
        phase={committeePhase}
        message={packet?.key === requestKey ? (packet.message ?? null) : null}
        requestedDraws={requestedDraws}
        heads={heads}
        run={
          packet?.key === requestKey && packet.status === "ready" && packet.payload
            ? {
                draws: packet.payload.draws,
                trainCap: packet.payload.trainCap,
                elapsedMs: packet.payload.elapsedMs,
                workers: packet.payload.workers,
              }
            : null
        }
        scored={scored}
        meanRates={meanAuto}
        onApply={(next) => onApply({ ...next, source: "committee" })}
      />

      {summary.n === 0 ? null : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                <TitleHelp help={HELP.curve}>Marge mesurée, prise</TitleHelp>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-xs leading-5 text-muted-foreground">
                {game.inWindow < HISTORIC_HORIZON
                  ? `L’archive filtrée a ${game.available} tirages complets. `
                  : `${game.inWindow} tirages dans la fenêtre. `}
                {summary.n} ont une fenêtre entière avant eux
                {lookback === HISTORIC_AUTO ? ", choisie avant chaque tirage" : ` de ${lookback}`}.
                {mode === "auto"
                  ? ` La ligne horizontale est la marge choisie après ces tirages (${marginLabel}).`
                  : ` La ligne horizontale est la marge annoncée (${marginLabel}).`}
              </p>
              <ChartContainer config={errorConfig} className="aspect-[16/6] min-h-24 w-full">
                <LineChart data={errorData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={16} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    width={32}
                    domain={[0, 3.6]}
                    ticks={[0, 1, 2, 3]}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ReferenceLine y={margin} stroke="var(--foreground)" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="required"
                    stroke="var(--color-required)"
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="beyond"
                    stroke="var(--color-beyond)"
                    strokeWidth={0}
                    dot={{ r: 3 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ChartContainer>
              <ChartContainer config={catchConfig} className="aspect-[16/6] min-h-24 w-full">
                <LineChart data={catchData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} minTickGap={8} />
                  <YAxis tick={{ fontSize: 10 }} width={36} domain={[0, 100]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ReferenceLine x={marginLabel} stroke="var(--foreground)" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="rate" stroke="var(--color-rate)" dot={false} strokeWidth={1.5} />
                </LineChart>
              </ChartContainer>
              <Disclaimer>
                Les points au-dessus de 3 σ sont des tirages qu’aucune de ces marges ne contient.
                La courbe du bas se lit sur l’erreur déjà mesurée : elle ne refait pas le décompte des grilles.
              </Disclaimer>
            </CardContent>
          </Card>

          <HistoricPlane rows={game.rows} ranks={game.ranks} margin={margin} />

          <Card>
            <CardHeader>
              <CardTitle>
                <TitleHelp help={HELP.ranks}>Paramètres qui pèsent</TitleHelp>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {game.ranks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Toutes les couches sont éteintes.</p>
              ) : (
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="py-2 pr-3 font-medium">Paramètre</th>
                      <th className="py-2 pr-3 font-medium">
                        <span className="inline-flex items-center gap-1">
                          |z| médian
                          <HelpTip {...RANK_HELP.z} />
                        </span>
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        <span className="inline-flex items-center gap-1">
                          Fois décisif
                          <HelpTip {...RANK_HELP.binding} />
                        </span>
                      </th>
                      <th className="py-2 font-medium">
                        <span className="inline-flex items-center gap-1">
                          Hors marge
                          <HelpTip {...RANK_HELP.outside} />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {game.ranks.map((rank) => (
                      <tr key={rank.id} className="border-b border-border/60">
                        <td className="py-2 pr-3">{rank.label}</td>
                        <td className="py-2 pr-3 tabular-nums">{formatAbs(rank.medianAbsZ)}</td>
                        <td className="py-2 pr-3 tabular-nums">{rank.bindingCount}</td>
                        <td className="py-2 tabular-nums">{rank.outsideCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <TitleHelp help={HELP.next}>Prévision du prochain tirage</TitleHelp>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {game.next ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Fenêtre {game.next.lookback}, marge {marginLabel}. Le prochain tirage n’entre pas dans le calcul.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Numéros · {proposalSummary("numbers", game.next.numbers)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Étoiles · {proposalSummary("stars", game.next.stars)}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatCount(game.next.grids)} grilles à cette marge.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  La fenêtre demandée n’a pas assez de tirages antérieurs pour préparer le prochain.
                </p>
              )}
              <HelpWrap help={HELP.next}>
                <Button type="button" disabled={!game.next} onClick={apply}>
                  Préparer le prochain tirage
                </Button>
              </HelpWrap>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>
                <TitleHelp help={HELP.scored}>Tirages notés</TitleHelp>
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
                  Tous
                </Button>
                <Button type="button" size="sm" variant={filter === "hit" ? "default" : "outline"} onClick={() => setFilter("hit")}>
                  Dans la marge
                </Button>
                <Button type="button" size="sm" variant={filter === "miss" ? "default" : "outline"} onClick={() => setFilter("miss")}>
                  Hors marge
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun tirage dans ce filtre.</p>
              ) : (
                <ul className="flex max-h-[28rem] flex-col gap-2 overflow-auto">
                  {rows.map((row) => (
                    <li
                      key={`${row.date}-${row.numbers.join("-")}-${row.stars.join("-")}`}
                      className={`flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${
                        row.hit ? "border-border" : "border-destructive/30"
                      }`}
                    >
                      <div className="flex min-w-0 flex-col gap-2">
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatDrawDate(row.date)} · fenêtre {row.chosenLookback}
                        </p>
                        <DrawBalls numbers={row.numbers} stars={row.stars} />
                      </div>
                      <p className="text-xs text-muted-foreground tabular-nums sm:text-right">
                        {row.hit ? "dans la marge" : "hors marge"} · {bindingCopy(row)}
                        <br />
                        erreur {formatRequired(row.requiredMargin)} · {formatCount(row.grids)} grilles
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <Disclaimer>
                Source {source}. Hypothèse de lecture : le tirage officiel reste uniforme sur 139 838 160 grilles.
                Le plan des résidus et la grille lisent le vecteur z de chaque tirage noté : (réel − moyenne des
                tirages d’avant) / σ.
              </Disclaimer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
