"use client"

import { useEffect, useMemo, useState } from "react"

import { HelpTip, HelpWrap, TitleHelp } from "@/components/help"
import { WeekdayScopeControl } from "@/components/weekday-scope-control"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { CaptureContext } from "@/lib/capture/snapshot"
import { DECADE_LABELS } from "@/lib/grid-shape"
import { PRONOSTIC_NEXT_HELP } from "@/lib/next/pronostic-help"
import {
  BALL_MAX,
  DECADE_PER_MAX,
  DECADE_PER_MIN,
  EVEN_MAX,
  EVEN_MIN,
  NUMBER_DRAW,
  SUM_MAX,
  SUM_MIN,
  buildReverseModel,
  canonicalizeFilters,
  describeFilters,
  formatChance,
  formatCount,
  formatLift,
  modelSignature,
  slotBounds,
  solvePronostic,
  type HorizonObservation,
  type PronosticFilters,
  type PronosticResult,
  type ReverseDraw,
  type ReverseModel,
} from "@/lib/next/pronostic"
import type { DrawSource } from "@/lib/use-draws"
import type { WeekdayScope } from "@/lib/weekday-scope"
import { cn } from "@/lib/utils"

type FormState = {
  sumMin: number
  sumMax: number
  evenMin: number
  evenMax: number
  decadeMin: number[]
  decadeMax: number[]
  slotMin: number[]
  slotMax: number[]
}

function initialForm(): FormState {
  const slots = Array.from({ length: NUMBER_DRAW }, (_, index) => slotBounds(index))
  return {
    sumMin: SUM_MIN,
    sumMax: SUM_MAX,
    evenMin: EVEN_MIN,
    evenMax: EVEN_MAX,
    decadeMin: Array.from({ length: DECADE_LABELS.length }, () => DECADE_PER_MIN),
    decadeMax: Array.from({ length: DECADE_LABELS.length }, () => DECADE_PER_MAX),
    slotMin: slots.map((band) => band.min),
    slotMax: slots.map((band) => band.max),
  }
}

function formFilters(form: FormState): PronosticFilters {
  return canonicalizeFilters({
    sum: { min: form.sumMin, max: form.sumMax },
    even: { min: form.evenMin, max: form.evenMax },
    decades: form.decadeMin.map((min, index) => ({ min, max: form.decadeMax[index] ?? DECADE_PER_MAX })),
    slots: form.slotMin.map((min, index) => ({ min, max: form.slotMax[index] ?? BALL_MAX })),
  })
}

function formatMean(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })
}

function formatMarginal(chance: number) {
  if (!Number.isFinite(chance) || chance <= 0) return "0 %"
  return chance.toLocaleString("fr-FR", {
    style: "percent",
    maximumFractionDigits: 1,
  })
}

function formatSigned(value: number) {
  if (!Number.isFinite(value)) return "—"
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function horizonMeans(model: ReverseModel, pick: (item: HorizonObservation) => number | null | undefined) {
  const line = model.horizons
    .filter((item) => item.drawCount > 0)
    .map((item) => `${item.horizon}${item.blended ? "" : "*"} ${formatMean(pick(item))}`)
    .join(" · ")
  return line || "—"
}

function RangePair({
  min,
  max,
  absMin,
  absMax,
  onMin,
  onMax,
  minLabel,
  maxLabel,
}: {
  min: number
  max: number
  absMin: number
  absMax: number
  onMin: (value: number) => void
  onMax: (value: number) => void
  minLabel: string
  maxLabel: string
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
        Mini
        <span className="flex items-center gap-2">
          <input
            type="range"
            min={absMin}
            max={absMax}
            value={min}
            onChange={(event) => onMin(Number(event.target.value))}
            className="jeux-range min-w-0 flex-1"
            aria-label={minLabel}
            aria-valuetext={min <= absMin ? "OFF" : String(min)}
          />
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-foreground">{min}</span>
        </span>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
        Maxi
        <span className="flex items-center gap-2">
          <input
            type="range"
            min={absMin}
            max={absMax}
            value={max}
            onChange={(event) => onMax(Number(event.target.value))}
            className="jeux-range min-w-0 flex-1"
            aria-label={maxLabel}
            aria-valuetext={max >= absMax ? "OFF" : String(max)}
          />
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-foreground">{max}</span>
        </span>
      </label>
    </div>
  )
}

function FieldBadge({ off, text }: { off: boolean; text: string }) {
  return (
    <Badge variant={off ? "outline" : "default"} data-state={off ? "off" : "on"}>
      {off ? "OFF" : text}
    </Badge>
  )
}

export function PronosticNextPanel({
  active,
  draws,
  source,
  weekday,
  onWeekday,
  onCapture,
}: {
  active: boolean
  draws: readonly ReverseDraw[]
  source: DrawSource
  weekday: WeekdayScope
  onWeekday: (value: WeekdayScope) => void
  onCapture?: (context: CaptureContext) => void
}) {
  const [form, setForm] = useState<FormState>(initialForm)
  const [solved, setSolved] = useState<{ key: string; value: PronosticResult } | null>(null)

  const model = useMemo(() => buildReverseModel(draws), [draws])
  const filters = useMemo(() => formFilters(form), [form])
  const activeLabels = describeFilters(filters)
  const specKey = `${modelSignature(model)}::${JSON.stringify(filters)}`
  const result = solved?.value ?? null
  const pending = active && solved?.key !== specKey

  useEffect(() => {
    if (!active || solved?.key === specKey) return
    let cancel = false
    const timer = window.setTimeout(() => {
      if (cancel) return
      setSolved({ key: specKey, value: solvePronostic(filters, model) })
    }, 120)
    return () => {
      cancel = true
      window.clearTimeout(timer)
    }
  }, [active, filters, model, solved, specKey])

  useEffect(() => {
    if (!onCapture) return
    const head = result?.listed[0]
    onCapture({
      lab: "next",
      tab: "pronosticNext",
      summary: [
        activeLabels.length ? activeLabels.join(" · ") : "Tous les champs sont OFF.",
        result ? `${formatCount(result.count)} solutions` : pending ? "Calcul en cours." : "Pas encore de calcul.",
        head ? `Tête ${head.numbers.join(" ")} · ${formatChance(head.chance)}` : "",
        result?.uniform ? "Horizons vides : chances égales." : "Chances reverse 20/50/100/200, couples et triples.",
      ].filter((line) => line.length > 0),
      tech: {
        weekday,
        active: activeLabels,
        count: result?.count ?? null,
        pending,
        horizons: model.horizons.map((item) => ({
          horizon: item.horizon,
          drawCount: item.drawCount,
          blended: item.blended,
          newest: item.newest,
          oldest: item.oldest,
          meanSum: item.meanSum,
          meanEven: item.meanEven,
        })),
        head: head
          ? {
              numbers: head.numbers,
              chance: head.chance,
              lift: head.lift,
              ball: head.ball,
              couple: head.couple,
              triple: head.triple,
            }
          : null,
      },
      archive: {
        n: model.horizons.reduce((max, item) => Math.max(max, item.drawCount), 0),
        from: model.horizons.find((item) => item.blended)?.oldest ?? null,
        to: model.horizons.find((item) => item.drawCount > 0)?.newest ?? null,
        source,
      },
    })
  }, [activeLabels, model, onCapture, pending, result, source, weekday])

  function patch(partial: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...partial }))
  }

  function setBand(
    minKey: "sumMin" | "evenMin",
    maxKey: "sumMax" | "evenMax",
    side: "min" | "max",
    value: number
  ) {
    setForm((prev) => {
      const min = side === "min" ? value : prev[minKey]
      const max = side === "max" ? value : prev[maxKey]
      if (min <= max) return { ...prev, [minKey]: min, [maxKey]: max }
      return side === "min"
        ? { ...prev, [minKey]: max, [maxKey]: max }
        : { ...prev, [minKey]: min, [maxKey]: min }
    })
  }

  function setListBand(
    minKey: "decadeMin" | "slotMin",
    maxKey: "decadeMax" | "slotMax",
    index: number,
    side: "min" | "max",
    value: number
  ) {
    setForm((prev) => {
      const mins = [...prev[minKey]]
      const maxs = [...prev[maxKey]]
      if (side === "min") mins[index] = value
      else maxs[index] = value
      if (mins[index] > maxs[index]) {
        if (side === "min") mins[index] = maxs[index]
        else maxs[index] = mins[index]
      }
      return { ...prev, [minKey]: mins, [maxKey]: maxs }
    })
  }

  const sumOff = filters.sum == null
  const evenOff = filters.even == null
  const decadesOff = filters.decades.every((band) => band == null)
  const slotsOff = filters.slots.every((band) => band == null)
  const stale = pending && result != null

  return (
    <div className="flex flex-col gap-4" data-pronostic-next>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          <WeekdayScopeControl value={weekday} onChange={onWeekday} help={PRONOSTIC_NEXT_HELP.jour} />
          <HelpWrap help={PRONOSTIC_NEXT_HELP.release}>
            <Button type="button" variant="outline" size="sm" onClick={() => setForm(initialForm())}>
              Tout relâcher
            </Button>
          </HelpWrap>
        </div>
        <p className="text-sm text-foreground">
          <span className="font-medium">{activeLabels.length ? activeLabels.join(" · ") : "Tous les champs sont OFF."}</span>
        </p>
        <p className="inline-flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          Les chances lisent 20, 50, 100 et 200 tirages, du plus récent au plus ancien, puis les couples et les triples.
          <HelpTip {...PRONOSTIC_NEXT_HELP.horizons} />
        </p>
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground" aria-label="Horizons reverse">
          {model.horizons.map((item) => (
            <li key={item.horizon} data-horizon={item.horizon} data-blended={item.blended ? "yes" : "no"}>
              <span className="tabular-nums text-foreground">{item.horizon}</span>
              {" · "}
              {item.drawCount
                ? `${formatCount(item.drawCount)} tirage${item.drawCount > 1 ? "s" : ""} · du ${item.newest} vers ${item.oldest}`
                : "aucun tirage"}
              {item.drawCount ? (item.blended ? " · dans la moyenne" : " · même échantillon, non repondéré") : ""}
            </li>
          ))}
        </ul>
      </div>

      <section className="rounded-xl border border-border bg-card/40 p-3" data-field="sum" data-state={sumOff ? "off" : "on"}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">
            <TitleHelp help={PRONOSTIC_NEXT_HELP.total}>Total</TitleHelp>
          </h2>
          <div className="flex items-center gap-2">
            <FieldBadge off={sumOff} text={`${form.sumMin}–${form.sumMax}`} />
            <Button type="button" size="xs" variant="outline" disabled={sumOff} onClick={() => patch({ sumMin: SUM_MIN, sumMax: SUM_MAX })}>
              Relâcher
            </Button>
          </div>
        </div>
        <RangePair
          min={form.sumMin}
          max={form.sumMax}
          absMin={SUM_MIN}
          absMax={SUM_MAX}
          onMin={(value) => setBand("sumMin", "sumMax", "min", value)}
          onMax={(value) => setBand("sumMin", "sumMax", "max", value)}
          minLabel="Total minimum"
          maxLabel="Total maximum"
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Moyenne reverse · {horizonMeans(model, (item) => item.meanSum)}
        </p>
      </section>

      <section
        className="rounded-xl border border-border bg-card/40 p-3"
        data-field="even"
        data-state={evenOff ? "off" : "on"}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">
            <TitleHelp help={PRONOSTIC_NEXT_HELP.parity}>Pairs / impairs</TitleHelp>
          </h2>
          <div className="flex items-center gap-2">
            <FieldBadge
              off={evenOff}
              text={
                form.evenMin === form.evenMax
                  ? `${form.evenMin} pairs · ${NUMBER_DRAW - form.evenMin} impairs`
                  : `${form.evenMin}–${form.evenMax} pairs`
              }
            />
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={evenOff}
              onClick={() => patch({ evenMin: EVEN_MIN, evenMax: EVEN_MAX })}
            >
              Relâcher
            </Button>
          </div>
        </div>
        <RangePair
          min={form.evenMin}
          max={form.evenMax}
          absMin={EVEN_MIN}
          absMax={EVEN_MAX}
          onMin={(value) => setBand("evenMin", "evenMax", "min", value)}
          onMax={(value) => setBand("evenMin", "evenMax", "max", value)}
          minLabel="Nombre minimum de pairs"
          maxLabel="Nombre maximum de pairs"
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Pairs moyens · {horizonMeans(model, (item) => item.meanEven)}
        </p>
      </section>

      <section data-field="decades" data-state={decadesOff ? "off" : "on"}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">
            <TitleHelp help={PRONOSTIC_NEXT_HELP.decade}>Décennie</TitleHelp>
          </h2>
          <div className="flex items-center gap-2">
            <FieldBadge off={decadesOff} text="bornes actives" />
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={decadesOff}
              onClick={() =>
                patch({
                  decadeMin: Array.from({ length: DECADE_LABELS.length }, () => DECADE_PER_MIN),
                  decadeMax: Array.from({ length: DECADE_LABELS.length }, () => DECADE_PER_MAX),
                })
              }
            >
              Relâcher
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {DECADE_LABELS.map((label, index) => {
            const off = filters.decades[index] == null
            return (
              <div
                key={label}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card/40 p-3"
                data-decade={index}
                data-state={off ? "off" : "on"}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium tabular-nums">{label}</p>
                  <FieldBadge
                    off={off}
                    text={`${form.decadeMin[index]}–${form.decadeMax[index]}`}
                  />
                </div>
                <RangePair
                  min={form.decadeMin[index] ?? 0}
                  max={form.decadeMax[index] ?? DECADE_PER_MAX}
                  absMin={DECADE_PER_MIN}
                  absMax={DECADE_PER_MAX}
                  onMin={(value) => setListBand("decadeMin", "decadeMax", index, "min", value)}
                  onMax={(value) => setListBand("decadeMin", "decadeMax", index, "max", value)}
                  minLabel={`Minimum de numéros dans ${label}`}
                  maxLabel={`Maximum de numéros dans ${label}`}
                />
                <p className="text-[11px] text-muted-foreground">
                  {horizonMeans(model, (item) => item.meanDecade?.[index])}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      <section data-field="slots" data-state={slotsOff ? "off" : "on"}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">
            <TitleHelp help={PRONOSTIC_NEXT_HELP.slot}>n1 à n5</TitleHelp>
          </h2>
          <div className="flex items-center gap-2">
            <FieldBadge off={slotsOff} text="rangs actifs" />
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={slotsOff}
              onClick={() => {
                const slots = Array.from({ length: NUMBER_DRAW }, (_, index) => slotBounds(index))
                patch({
                  slotMin: slots.map((band) => band.min),
                  slotMax: slots.map((band) => band.max),
                })
              }}
            >
              Relâcher
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: NUMBER_DRAW }, (_, index) => {
            const theo = slotBounds(index)
            const off = filters.slots[index] == null
            const title = index === 0 ? "plus petit" : index === NUMBER_DRAW - 1 ? "plus grand" : `${index + 1}ᵉ trié`
            return (
              <div
                key={index}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card/40 p-3"
                data-rank={index}
                data-state={off ? "off" : "on"}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium">
                    n{index + 1}
                    <span className="ml-1 font-normal text-muted-foreground">{title}</span>
                  </p>
                  <FieldBadge off={off} text={`${form.slotMin[index]}–${form.slotMax[index]}`} />
                </div>
                <RangePair
                  min={form.slotMin[index] ?? theo.min}
                  max={form.slotMax[index] ?? theo.max}
                  absMin={theo.min}
                  absMax={theo.max}
                  onMin={(value) => setListBand("slotMin", "slotMax", index, "min", value)}
                  onMax={(value) => setListBand("slotMin", "slotMax", index, "max", value)}
                  minLabel={`n${index + 1} minimum`}
                  maxLabel={`n${index + 1} maximum`}
                />
                <p className="text-[11px] text-muted-foreground">
                  {horizonMeans(model, (item) => item.meanSlot?.[index])}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      <section
        className={cn("rounded-xl border border-border bg-card/40 p-3", stale && "opacity-70")}
        data-pronostic-result
        data-count={result?.count ?? ""}
        aria-busy={pending}
        aria-live="polite"
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">
            <TitleHelp help={PRONOSTIC_NEXT_HELP.chance}>Solutions</TitleHelp>
          </h2>
          {pending ? (
            <p className="text-xs text-muted-foreground" data-calculating>
              Calcul des chances…
            </p>
          ) : null}
        </div>
        {result == null ? (
          <p className="text-sm text-muted-foreground">
            {pending ? "Calcul des chances…" : "Le calcul part des curseurs affichés."}
          </p>
        ) : result.count === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune grille ne passe ces curseurs.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm tabular-nums">
              <span className="font-medium text-foreground">{formatCount(result.count)}</span>
              <span className="text-muted-foreground">
                {" "}
                solution{result.count > 1 ? "s" : ""}
                {result.count === result.universe
                  ? ` · univers entier`
                  : ` · 1 sur ${formatCount(result.universe / result.count)} de l’univers ${formatCount(result.universe)}`}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {result.uniform
                ? "Aucun tirage dans les horizons : chaque solution a la même chance."
                : "La chance est la part de la grille dans les solutions retenues. Le tirage FDJ reste uniforme."}
              {result.listed.length < result.count
                ? ` Les ${formatCount(result.listed.length)} premières portent ${formatChance(result.chanceMassListed)} de la chance.`
                : " Toute la chance est dans cette liste."}
            </p>
            <div>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                <TitleHelp help={PRONOSTIC_NEXT_HELP.marginal}>Chance d’un numéro</TitleHelp>
              </h3>
              <div className="euromillions-ball-grid" aria-label="Chance de chaque numéro">
                {Array.from({ length: BALL_MAX }, (_, index) => {
                  const ball = index + 1
                  const chance = result.marginal[ball] ?? 0
                  return (
                    <div
                      key={ball}
                      data-marginal={ball}
                      className={cn(
                        "flex min-w-0 flex-col items-center rounded-md px-0.5 py-1",
                        chance >= 0.12 && "bg-primary/15"
                      )}
                      title={`${ball} · ${formatChance(chance)}`}
                    >
                      <span className="flex size-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground tabular-nums">
                        {ball}
                      </span>
                      <span className="mt-0.5 text-[9px] tabular-nums text-muted-foreground sm:text-[10px]">
                        {formatMarginal(chance)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-1 pr-3 font-medium" scope="col">
                      Grille
                    </th>
                    <th className="py-1 pr-3 font-medium" scope="col">
                      Chance
                    </th>
                    <th className="py-1 pr-3 font-medium" scope="col">
                      × égal
                    </th>
                    <th className="py-1 pr-3 font-medium" scope="col">
                      <TitleHelp help={PRONOSTIC_NEXT_HELP.parts}>Boules</TitleHelp>
                    </th>
                    <th className="py-1 pr-3 font-medium" scope="col">
                      Couples
                    </th>
                    <th className="py-1 font-medium" scope="col">
                      Triples
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.listed.map((item, index) => (
                    <tr key={item.numbers.join("-")} className="border-t border-border" data-solution={item.numbers.join("-")}>
                      <td className="py-1.5 pr-3">
                        <span className="mr-2 text-xs tabular-nums text-muted-foreground">{index + 1}.</span>
                        <span className="tabular-nums">{item.numbers.join(" ")}</span>
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums">{formatChance(item.chance)}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{formatLift(item.lift)}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{formatSigned(item.ball)}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{formatSigned(item.couple)}</td>
                      <td className="py-1.5 tabular-nums">{formatSigned(item.triple)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
