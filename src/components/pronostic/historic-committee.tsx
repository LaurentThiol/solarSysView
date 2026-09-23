"use client"

import { useEffect, useState } from "react"

import { HelpTip, HelpWrap, TitleHelp, type HelpCopy } from "@/components/help"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCompactCount } from "@/lib/gains"
import { formatCount } from "@/lib/jeux"
import {
  COMMITTEE_LOADING,
  COMMITTEE_MEAN_BANNER,
  COMMITTEE_SCOPE_LABEL,
  COMMITTEE_SCOPES,
  ERROR_AXES,
  PYTHON_ABSENT,
  baselineSummary,
  committeeErrorMessage,
  committeeLookback,
  committeeWindowSentence,
  confrontationSentence,
  mixWindowSentence,
  proposalSummary,
  summarizeAt,
  type CommitteeHeadLine,
  type CommitteeScopeId,
  type ScoredCommittee,
  type HistoricLookbackChoice,
  type LearnConfig,
  type MarginStep,
  type RateSummary,
  type ScoredForecast,
  type StackState,
} from "@/lib/pronostic"
import type { WeekdayScope } from "@/lib/weekday-scope"

const HEAD_DECISION =
  "« Réseau » : la porte a gardé la tête pour le prochain tirage. « Moyenne » : elle reprend la moyenne de fenêtre."

const HEAD_KEPT =
  "Tirages déjà notés où la porte a laissé le réseau, sur le nombre de tirages notés. Ce n’est pas le nombre de fois où le réseau a été plus près du tirage après coup."

const HELP = {
  zone: {
    title: "Comité",
    wide: true,
    body: "Onze têtes lisent la fenêtre d’avant, une par axe : somme, pairs, n1 à n5, somme des étoiles, pairs des étoiles, e1 et e2. Chacune s’ajuste seulement sur les situations de cette fenêtre, pas sur toute l’archive, et propose un centre et un écart type.\n\nUne porte compare ensuite le réseau à la moyenne de fenêtre. Le global réécrit les onze centres dès qu’une tête reste en réseau. Si toutes reprennent la moyenne, il n’écrit rien. Les rangs sont remis dans l’ordre, et la somme est ramenée près de la somme des rangs. σ est recalée pour que le centre ± 1 σ couvre environ 68 % des tirages d’avant, dès qu’il y a au moins cinq écarts. La marge k est appliquée ensuite, dans le navigateur. Le tirage noté n’entre pas dans l’ajustement.",
    items: [
      {
        label: "Porte",
        text: "Sur au plus dix essais d’avant où le réseau a déjà été ajusté, on compare les erreurs absolues médianes. Si celle du réseau est plus grande, la tête reprend la moyenne. À égalité, le réseau reste. Le premier ajustement, sans essai antérieur, est gardé. Une série trop plate, ou moins de quatre situations, reste la moyenne.",
      },
      {
        label: "Global",
        text: "Il attend huit situations déjà vues. Avant cela, les têtes gardées passent telles quelles, puis les rangs sont remis dans l’ordre. Il réécrit aussi les axes revenus à la moyenne, tant qu’au moins une tête est restée en réseau.",
      },
      {
        label: "Repli",
        text: "Si toutes les têtes reprennent la moyenne, le bandeau le dit. Préparer le comité ne propose pas une autre prévision.",
      },
      {
        label: "Python absent",
        text: "Le comité n’est pas calculé. La marge et la mise du haut restent celles de la moyenne des tirages d’avant. Un délai d’API n’est pas une absence de Python : le bandeau le dit à part.",
      },
      {
        label: "Fenêtre",
        text: "20 ou 50 tirages d’avant. Choisi avant et la fenêtre 100 sont lus comme 20. Mardi, vendredi et mardi + vendredi sont calculés à part. Ils tournent en parallèle quand la machine a plusieurs cœurs et qu’au moins deux séries ont assez de tirages.",
      },
    ],
  },
  heads: {
    title: "Têtes",
    wide: true,
    body: "Lecture du prochain tirage, axe par axe. μ et σ du comité sont ceux qui serviront aux bandes, après le global et le recalage. La moyenne est celle de la fenêtre d’avant, avant le réseau.",
    items: [
      {
        label: "Décision",
        text: HEAD_DECISION,
      },
      {
        label: "μ et σ",
        text: "Centre et écart type du comité pour cet axe. La marge k élargit ensuite μ ± k·σ, comme pour la moyenne.",
      },
      {
        label: "Moyenne μ et σ",
        text: "Moyenne et écart type des tirages d’avant, avant que le réseau et le global n’interviennent.",
      },
      {
        label: "Gardée",
        text: HEAD_KEPT,
      },
    ],
  },
  rates: {
    title: "Deux taux",
    wide: true,
    body: "Les deux cartes comptent les tirages contenus et la mise moyenne en grilles. Elles ne choisissent pas la marge de la même façon. Sans Python, le même choix est fait sur la moyenne de fenêtre.",
    items: [
      {
        label: "Choisie après ces tirages",
        text: "Une seule marge, retenue une fois toute la série notée. C’est la marge du prochain tirage. Elle n’était pas annoncée avant les tirages déjà notés. Moins de trois contenus : on reste à 1 σ.",
      },
      {
        label: "Partie jouée",
        text: "Pour chaque tirage, la marge est choisie seulement sur les tirages d’avant, puis gelée. Les premiers, sans trois contenus derrière eux, restent à 1 σ.",
      },
    ],
  },
  inMargin: {
    title: "Comité dans la marge",
    body: "Tirages de la série affichée dont les bandes du comité, à la marge en cours, contiennent numéros et étoiles. La ligne du dessous est le même compte pour la moyenne de fenêtre, à la même marge.",
  },
  stake: {
    title: "Mise moyenne du comité",
    body: "Nombre moyen de grilles 5+2 qu’il aurait fallu jouer avec les bandes du comité. La ligne du dessous est la mise de la moyenne de fenêtre, à la même marge. Les tirages hors marge restent dans cette moyenne.",
  },
  days: {
    title: "Mardi, vendredi, mixte",
    wide: true,
    body: "EuroMillions tire le mardi et le vendredi. Mardi + vendredi mélange les deux soirs : ce n’est pas une troisième série. Le filtre du bandeau choisit la série lue par la moyenne ; ce tableau confronte les trois colonnes à la marge affichée. Les trois séries sont calculées à part.",
    items: [
      {
        label: "Tirages notés",
        text: "Tirages de la colonne qui ont une fenêtre entière avant eux.",
      },
      {
        label: "Comité et moyenne dans la marge",
        text: "Même marge, deux prévisions : les centres du comité, et la moyenne de fenêtre.",
      },
      {
        label: "Mise",
        text: "Nombre moyen de grilles 5+2 à cette marge. La phrase sous le tableau dit si le comité baisse cette mise sous la moyenne, mardi et vendredi séparément.",
      },
      {
        label: "Partie jouée",
        text: "Tirages contenus quand la marge a été gelée avant chacun d’eux.",
      },
      {
        label: "Après coup",
        text: "Marge unique choisie une fois la colonne notée. Elle sert au prochain tirage de cette série. Elle n’était pas annoncée avant.",
      },
    ],
  },
  prepare: {
    title: "Préparer le comité",
    wide: true,
    body: "Recopie dans l’atelier les bandes du prochain tirage, à la marge affichée. Ce tirage n’entre pas dans le calcul. Si le comité reprend la moyenne, le bouton reste inactif : il n’y a pas une autre prévision à recopier.\n\nLes bandes sont μ ± k·σ après le global, le recalage de σ et la remise en ordre des rangs. k est celui du curseur, ou la marge choisie après ces tirages quand le mode est automatique.",
  },
} satisfies Record<string, HelpCopy>

export type CommitteePhase = "loading" | "ready" | "absent" | "error"

function readySentence(run: { draws?: number; trainCap?: number; elapsedMs?: number; workers?: number } | null) {
  const parts = ["Le comité est calculé sur les tirages d’avant seulement."]
  if (run?.draws == null) return parts[0]
  const detail = [`${run.draws.toLocaleString("fr-FR")} tirages lus`]
  if (run.trainCap != null) detail.push(`ajustement sur ${run.trainCap.toLocaleString("fr-FR")} situations`)
  if (run.elapsedMs != null) {
    detail.push(`${(run.elapsedMs / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`)
  }
  if (run.workers != null && run.workers > 1) detail.push("en parallèle")
  return `${parts[0]} ${detail.join(", ")}.`
}

function formatMoment(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })
}

function formatPct(value: number) {
  return value.toLocaleString("fr-FR", { style: "percent", maximumFractionDigits: 1 })
}

function rateLine(summary: RateSummary) {
  if (summary.n === 0) return "aucun tirage noté"
  return `${summary.hits}/${summary.n} · ${formatPct(summary.rate)} · ${
    summary.meanGrids == null ? "—" : formatCount(summary.meanGrids)
  } grilles`
}

export { committeeErrorMessage }

export function HistoricCommittee({
  weekday,
  lookbackChoice,
  margin,
  mode,
  phase,
  message,
  requestedDraws,
  heads,
  run,
  scored,
  meanRates,
  onApply,
}: {
  weekday: WeekdayScope
  lookbackChoice: HistoricLookbackChoice
  margin: MarginStep
  mode: "manual" | "auto"
  phase: CommitteePhase
  message: string | null
  requestedDraws: number
  heads: CommitteeHeadLine[]
  run: { draws?: number; trainCap?: number; elapsedMs?: number; workers?: number } | null
  scored: ScoredCommittee | null
  meanRates: { postHocSummary: RateSummary; played: RateSummary; fallback: boolean } | null
  onApply: (next: {
    numbers: StackState
    stars: StackState
    learn: LearnConfig
    lookback: 20 | 50
  }) => void
}) {
  const lookback = committeeLookback(lookbackChoice)
  const scopeId: CommitteeScopeId = weekday === "mardi" || weekday === "vendredi" ? weekday : "mixte"
  const [clock, setClock] = useState<{ stamp: string; sec: number } | null>(null)
  const clockStamp = `${phase}|${requestedDraws}|${lookback}`
  useEffect(() => {
    if (phase !== "loading") return
    const origin = Date.now()
    const stamp = clockStamp
    const id = window.setInterval(() => {
      setClock({ stamp, sec: Math.max(1, Math.round((Date.now() - origin) / 1000)) })
    }, 1000)
    return () => window.clearInterval(id)
  }, [clockStamp, phase])
  const waited = phase === "loading" && clock?.stamp === clockStamp ? clock.sec : 0
  const display = scored?.scopes[scopeId] ?? null

  const forecast: ScoredForecast | null = display?.forecasts.find((item) => item.margin === margin) ?? null
  const repeatsMean = Boolean(display?.next?.fellBackAll)
  const mixesDays = weekday === "all" || weekday === "synthese"
  const forcedWindow = lookbackChoice !== 20 && lookbackChoice !== 50
  const atMargin = display ? summarizeAt(display.rows, margin) : null
  const atBaseline = display ? baselineSummary(display, margin) : null

  function apply() {
    if (!forecast || repeatsMean) return
    onApply({
      numbers: forecast.numberState,
      stars: forecast.starState,
      learn: { method: "mean_std", k: margin, percentile: 5 },
      lookback,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <TitleHelp help={HELP.zone}>Comité</TitleHelp>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm" role="status">
          {phase === "loading" ? (
            <div className="flex flex-col gap-2">
              <p>
                {COMMITTEE_LOADING}
                {waited > 0 ? ` · ${waited.toLocaleString("fr-FR")} s` : null}
              </p>
              <p className="text-muted-foreground">
                {requestedDraws.toLocaleString("fr-FR")} tirages envoyés, fenêtre {lookback}. Onze têtes, puis un
                global, sur mardi, vendredi et les deux ensemble.
              </p>
              <ul className="grid grid-cols-2 gap-x-3 text-muted-foreground sm:grid-cols-3">
                {ERROR_AXES.map((axis) => (
                  <li key={axis.id}>{axis.label}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {phase === "absent" ? <p>{PYTHON_ABSENT}</p> : null}
          {phase === "error" ? (
            <div className="flex flex-col gap-2">
              <p>{message}</p>
              <p className="text-muted-foreground">
                Demande : {requestedDraws.toLocaleString("fr-FR")} tirages, fenêtre {lookback}. Les têtes n’ont pas
                renvoyé leurs prévisions.
              </p>
            </div>
          ) : null}
          {phase === "ready" ? <p>{readySentence(run)}</p> : null}
        </div>
        {mixesDays ? <p className="text-sm text-muted-foreground">{mixWindowSentence(lookback)}</p> : null}
        {forcedWindow ? <p className="text-sm text-muted-foreground">{committeeWindowSentence()}</p> : null}
        {phase === "ready" && repeatsMean ? (
          <p className="text-sm text-muted-foreground">{COMMITTEE_MEAN_BANNER}</p>
        ) : null}

        {phase === "absent" && mode === "auto" && meanRates ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <RateCard
              title="Choisie après ces tirages"
              help={HELP.rates}
              body={rateLine(meanRates.postHocSummary)}
              note={
                meanRates.fallback
                  ? "Moins de trois tirages contenus : la marge reste 1 σ. Calcul sur la moyenne de fenêtre."
                  : "Calcul sur la moyenne de fenêtre. Ce n’est pas une règle annoncée avant les tirages."
              }
            />
            <RateCard
              title="Partie jouée"
              help={HELP.rates}
              body={rateLine(meanRates.played)}
              note="Pour chaque tirage, la marge est gelée sur les tirages d’avant. Moyenne de fenêtre."
            />
          </div>
        ) : null}

        {phase === "ready" && scored && display ? (
          <>
            {heads.length > 0 ? (
              <div className="overflow-x-auto">
                <p className="mb-2 inline-flex items-center gap-1 text-sm">
                  <TitleHelp help={HELP.heads}>Têtes</TitleHelp>
                </p>
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs tracking-wide text-muted-foreground uppercase">
                      <th className="py-2 pr-3 font-medium">Tête</th>
                      <th className="py-2 pr-3 font-medium">
                        <span className="inline-flex items-center gap-1">
                          Décision
                          <HelpTip title="Décision" body={HEAD_DECISION} />
                        </span>
                      </th>
                      <th className="py-2 pr-3 font-medium">μ</th>
                      <th className="py-2 pr-3 font-medium">σ</th>
                      <th className="py-2 pr-3 font-medium">Moyenne μ</th>
                      <th className="py-2 pr-3 font-medium">Moyenne σ</th>
                      <th className="py-2 pr-3 font-medium">
                        <span className="inline-flex items-center gap-1">
                          Gardée
                          <HelpTip title="Gardée" body={HEAD_KEPT} />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {heads.map((head) => (
                      <tr key={head.id} className="border-b border-border/60">
                        <td className="py-1.5 pr-3">{head.label}</td>
                        <td className="py-1.5 pr-3">{head.fellBack ? "moyenne" : "réseau"}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{formatMoment(head.mu)}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{formatMoment(head.sigma)}</td>
                        <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{formatMoment(head.baselineMu)}</td>
                        <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">
                          {formatMoment(head.baselineSigma)}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {head.scored > 0 ? `${head.kept}/${head.scored}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  « Gardée » compte les tirages notés où la porte a laissé le réseau. Le global réécrit les onze
                  centres dès qu’une tête reste en réseau, puis les rangs sont remis dans l’ordre.
                </p>
              </div>
            ) : null}
            {display.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Pas assez de tirages dans cette série pour une fenêtre de {lookback}.
              </p>
            ) : (
              <section className="grid gap-3 sm:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <p className="inline-flex flex-wrap items-center gap-1 text-xs tracking-wide text-muted-foreground uppercase">
                      Comité dans la marge
                      <HelpTip {...HELP.inMargin} />
                    </p>
                    <CardTitle className="text-lg tabular-nums">
                      {atMargin ? `${atMargin.hits}/${atMargin.n}` : "—"}
                      {atMargin ? (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">{formatPct(atMargin.rate)}</span>
                      ) : null}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    Moyenne de fenêtre {atBaseline ? `${atBaseline.hits}/${atBaseline.n}` : "—"}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <p className="inline-flex flex-wrap items-center gap-1 text-xs tracking-wide text-muted-foreground uppercase">
                      Mise moyenne du comité
                      <HelpTip {...HELP.stake} />
                    </p>
                    <CardTitle className="text-lg tabular-nums">
                      {atMargin?.meanGrids == null ? "—" : formatCount(atMargin.meanGrids)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground tabular-nums">
                    Moyenne de fenêtre{" "}
                    {atBaseline?.meanGrids == null ? "—" : formatCount(atBaseline.meanGrids)}
                  </CardContent>
                </Card>
              </section>
            )}

            {mode === "auto" && display.rows.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <RateCard
                  title="Choisie après ces tirages"
                  help={HELP.rates}
                  body={`${display.postHoc.margin.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} σ · ${rateLine(display.postHocSummary)}`}
                  note={
                    display.postHoc.fallback
                      ? "Moins de trois tirages contenus : la marge reste 1 σ."
                      : "Marge du prochain tirage. Elle a été choisie après les tirages déjà notés."
                  }
                />
                <RateCard
                  title="Partie jouée"
                  help={HELP.rates}
                  body={rateLine(display.played)}
                  note="Pour chaque tirage noté, la marge est choisie seulement sur les tirages d’avant, puis gelée."
                />
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <p className="mb-2 inline-flex items-center gap-1 text-sm">
                <TitleHelp help={HELP.days}>Confrontation</TitleHelp>
              </p>
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs tracking-wide text-muted-foreground uppercase">
                    <th className="py-2 pr-3 font-medium"> </th>
                    {COMMITTEE_SCOPES.map((id) => (
                      <th key={id} className="py-2 pr-3 font-medium">
                        {COMMITTEE_SCOPE_LABEL[id]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <ScopeRow label="Tirages notés" scored={scored} render={(scope) => String(scope.rows.length)} />
                  <ScopeRow
                    label="Comité dans la marge"
                    scored={scored}
                    render={(scope) => {
                      if (scope.rows.length === 0) return "—"
                      const summary = summarizeAt(scope.rows, margin)
                      return `${summary.hits}/${summary.n}`
                    }}
                  />
                  <ScopeRow
                    label="Moyenne dans la marge"
                    scored={scored}
                    render={(scope) => {
                      if (scope.rows.length === 0) return "—"
                      const summary = baselineSummary(scope, margin)
                      return `${summary.hits}/${summary.n}`
                    }}
                  />
                  <ScopeRow
                    label="Mise du comité"
                    scored={scored}
                    render={(scope) => {
                      if (scope.rows.length === 0) return "—"
                      const summary = summarizeAt(scope.rows, margin)
                      return summary.meanGrids == null ? "—" : formatCompactCount(summary.meanGrids)
                    }}
                  />
                  <ScopeRow
                    label="Mise de la moyenne"
                    scored={scored}
                    render={(scope) => {
                      if (scope.rows.length === 0) return "—"
                      const summary = baselineSummary(scope, margin)
                      return summary.meanGrids == null ? "—" : formatCompactCount(summary.meanGrids)
                    }}
                  />
                  <ScopeRow
                    label="Partie jouée"
                    scored={scored}
                    render={(scope) => (scope.rows.length === 0 ? "—" : `${scope.played.hits}/${scope.played.n}`)}
                  />
                  <ScopeRow
                    label="Après coup"
                    scored={scored}
                    render={(scope) =>
                      scope.rows.length === 0
                        ? "—"
                        : `${scope.postHoc.margin.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} σ`
                    }
                  />
                </tbody>
              </table>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{confrontationSentence(scored, margin)}</p>

            <div className="flex flex-col gap-2">
              {forecast ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Prochain tirage · fenêtre {lookback}, marge{" "}
                    {margin.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} σ. Ce tirage n’entre pas dans le
                    calcul.
                  </p>
                  <p className="text-sm text-muted-foreground">Numéros · {proposalSummary("numbers", forecast.numbers)}</p>
                  <p className="text-sm text-muted-foreground">Étoiles · {proposalSummary("stars", forecast.stars)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{formatCount(forecast.grids)} grilles à cette marge.</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pas assez de tirages antérieurs pour préparer le prochain tirage du comité.
                </p>
              )}
              <HelpWrap help={HELP.prepare}>
                <Button type="button" disabled={!forecast || repeatsMean} onClick={apply}>
                  Préparer le comité
                </Button>
              </HelpWrap>
            </div>
          </>
        ) : null}
        {phase === "ready" ? null : (
          <HelpWrap help={HELP.prepare}>
            <Button type="button" disabled>
              Préparer le comité
            </Button>
          </HelpWrap>
        )}
      </CardContent>
    </Card>
  )
}

function RateCard({
  title,
  body,
  note,
  help,
}: {
  title: string
  body: string
  note: string
  help?: HelpCopy
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          {help ? <TitleHelp help={help}>{title}</TitleHelp> : title}
        </p>
        <CardTitle className="text-lg tabular-nums">{body}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{note}</CardContent>
    </Card>
  )
}

function ScopeRow({
  label,
  scored,
  render,
}: {
  label: string
  scored: ScoredCommittee
  render: (scope: ScoredCommittee["scopes"][CommitteeScopeId]) => string
}) {
  return (
    <tr className="border-b border-border/60">
      <td className="py-2 pr-3">{label}</td>
      {COMMITTEE_SCOPES.map((id) => (
        <td key={id} className="py-2 pr-3 tabular-nums">
          {render(scored.scopes[id])}
        </td>
      ))}
    </tr>
  )
}
