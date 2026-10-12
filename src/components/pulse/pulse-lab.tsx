"use client"

import { useMemo, useRef, useState } from "react"

import { PulseChart } from "@/components/pulse/pulse-chart"
import { WeekdayScopeControl } from "@/components/weekday-scope-control"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PillTabPanel, PillTabs } from "@/components/ui/pill-tabs"
import { formatDrawDate } from "@/lib/draws"
import { useLabTab } from "@/lib/use-lab-tab"
import { useWeekdayScope } from "@/lib/use-weekday-scope"
import {
  PULSE_FAMILIES,
  PULSE_FAMILY_LABELS,
  PULSE_PRESETS,
  PULSE_PRESET_LABELS,
  fetchPulseDetail,
  pulseChannelLabel,
  pulseGeneratorLabel,
  pulseDrawCount,
  pulsePercent,
  scanPulse,
  type PulseDetail,
  type PulseFamily,
  type PulseGroup,
  type PulseKind,
  type PulseNumber,
  type PulsePreset,
  type PulseScan,
  type PulseSlice,
} from "@/lib/pulse"

const TABS = [
  { id: "synthese", label: "Synthèse" },
  { id: "fiche", label: "Fiche" },
  { id: "groupes", label: "Groupes" },
] as const

type TabId = (typeof TABS)[number]["id"]

function toggle<T extends string>(current: readonly T[], value: T): T[] {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
}

function concordanceStyle(value: number) {
  const mix = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return {
    background: `color-mix(in oklch, var(--chart-2) ${mix}%, var(--muted))`,
  }
}

function ChannelGrid({
  title,
  kind,
  numbers,
  selected,
  onSelect,
}: {
  title: string
  kind: PulseKind
  numbers: PulseNumber[]
  selected: string | null
  onSelect: (item: PulseNumber) => void
}) {
  const rows = numbers.filter((item) => item.kind === kind)
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
        {rows.map((item) => {
          const key = `${item.kind}-${item.n}`
          const active = selected === key
          return (
            <button
              key={key}
              type="button"
              className="flex h-12 flex-col items-center justify-center rounded-md border border-border text-xs"
              style={concordanceStyle(item.concordance)}
              aria-pressed={active}
              onClick={() => onSelect(item)}
            >
              <span className="font-medium">{item.n}</span>
              <span>{pulsePercent(item.concordance)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SliceButton({
  slice,
  active,
  onSelect,
}: {
  slice: PulseSlice
  active: boolean
  onSelect: () => void
}) {
  const preset = PULSE_PRESET_LABELS[slice.preset as PulsePreset] ?? slice.preset
  const range =
    slice.from && slice.to ? `${formatDrawDate(slice.from)} → ${formatDrawDate(slice.to)}` : "Dates absentes"
  return (
    <button
      type="button"
      className="rounded-lg border border-border px-3 py-2 text-left text-sm aria-pressed:bg-muted"
      aria-pressed={active}
      onClick={onSelect}
    >
      <span className="block font-medium">
        {preset}
        {slice.period ? ` · période ${slice.period}` : " · pas de période"}
      </span>
      <span className="block text-xs text-muted-foreground">
        {range} · {pulseGeneratorLabel(slice.generator)} · {pulsePercent(slice.concordance)}
      </span>
    </button>
  )
}

function GroupCard({ group }: { group: PulseGroup }) {
  const names = group.members
    .map((member) => pulseChannelLabel(member.kind, member.n))
    .join(", ")
  const preset = PULSE_PRESET_LABELS[group.preset as PulsePreset] ?? group.preset
  const rotation =
    group.period2 && group.period2 !== group.period
      ? `rotation ${group.period2}`
      : `rotation sur ${group.period}`
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {pulseGeneratorLabel(group.generator)} · {names}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        <p>
          {preset} · période {group.period} · {rotation}
        </p>
        <p>
          Concordance {pulsePercent(group.concordance)}
          {group.p != null ? ` · p ${group.p < 0.001 ? "< 0,001" : group.p.toFixed(3)}` : ""}
          {pulseDrawCount(group.hits) ? ` · ${pulseDrawCount(group.hits)}` : ""}
        </p>
        {group.from && group.to ? (
          <p>
            {formatDrawDate(group.from)} → {formatDrawDate(group.to)}
          </p>
        ) : null}
        <p>
          Phases{" "}
          {group.members
            .map((member) => (member.phase == null ? "—" : member.phase.toFixed(2)))
            .join(" · ")}
        </p>
      </CardContent>
    </Card>
  )
}

export function PulseLab() {
  const [tab, setTab] = useLabTab<TabId>(
    TABS.map((item) => item.id),
    "synthese"
  )
  const [weekday, setWeekday] = useWeekdayScope()
  const [families, setFamilies] = useState<PulseFamily[]>(["simple", "double"])
  const [presets, setPresets] = useState<PulsePreset[]>([...PULSE_PRESETS])
  const [scan, setScan] = useState<PulseScan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [sliceId, setSliceId] = useState<string | null>(null)
  const [detail, setDetail] = useState<PulseDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const detailToken = useRef(0)

  const numbers = scan?.numbers ?? []
  const selected = useMemo(
    () => numbers.find((item) => `${item.kind}-${item.n}` === selectedKey) ?? null,
    [numbers, selectedKey]
  )
  const activeSlice =
    selected?.slices.find((item) => item.id === sliceId) ?? selected?.slices[0] ?? null

  async function run() {
    setLoading(true)
    setError(null)
    setDetail(null)
    try {
      const payload = await scanPulse({ presets, families, weekday })
      if (!payload.ok) {
        setScan(null)
        setError(payload.error || "Scan impossible")
        return
      }
      setScan(payload)
      setTab("synthese")
    } catch (cause) {
      setScan(null)
      setError(cause instanceof Error ? cause.message : "Scan impossible")
    } finally {
      setLoading(false)
    }
  }

  async function openSlice(item: PulseNumber, slice: PulseSlice) {
    const token = ++detailToken.current
    setSelectedKey(`${item.kind}-${item.n}`)
    setSliceId(slice.id)
    setTab("fiche")
    setDetail(null)
    setDetailError(null)
    if (families.length === 0) {
      setDetailError("Choisir au moins un générateur.")
      return
    }
    try {
      const payload = await fetchPulseDetail({
        kind: item.kind,
        n: item.n,
        preset: String(slice.preset),
        sliceId: slice.id,
        families,
        weekday,
      })
      if (token !== detailToken.current) return
      if (!payload.ok) {
        setDetailError(payload.error || "Détail impossible")
        return
      }
      setDetail(payload)
    } catch (cause) {
      if (token !== detailToken.current) return
      setDetailError(cause instanceof Error ? cause.message : "Détail impossible")
    }
  }

  function chooseNumber(item: PulseNumber) {
    const slice = [...item.slices].sort((a, b) => b.concordance - a.concordance)[0]
    if (!slice) {
      setSelectedKey(`${item.kind}-${item.n}`)
      setSliceId(null)
      setDetail(null)
      setTab("fiche")
      return
    }
    void openSlice(item, slice)
  }

  const ready = families.length > 0 && presets.length > 0 && !loading

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Générateurs et fenêtres</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <WeekdayScopeControl value={weekday} onChange={setWeekday} />
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Générateurs</p>
            <div className="flex flex-wrap gap-1.5">
              {PULSE_FAMILIES.map((family) => (
                <Button
                  key={family}
                  type="button"
                  size="sm"
                  variant={families.includes(family) ? "default" : "outline"}
                  aria-pressed={families.includes(family)}
                  onClick={() => setFamilies(toggle(families, family))}
                >
                  {PULSE_FAMILY_LABELS[family]}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Échantillons</p>
            <div className="flex flex-wrap gap-1.5">
              {PULSE_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={presets.includes(preset) ? "default" : "outline"}
                  aria-pressed={presets.includes(preset)}
                  onClick={() => setPresets(toggle(presets, preset))}
                >
                  {PULSE_PRESET_LABELS[preset]}
                </Button>
              ))}
            </div>
          </div>
          <Button type="button" disabled={!ready} onClick={() => void run()}>
            {loading ? "Syntonisation…" : "Lancer la syntonisation"}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {scan?.disclaimer ? (
            <p className="text-xs text-muted-foreground">{scan.disclaimer}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Périodes de 2 à 60 tirages. Le taux vaut 0 % quand la moitié des sorties seulement
            tombe dans le demi-cycle, et 100 % quand elles y sont toutes.
          </p>
        </CardContent>
      </Card>

      {scan?.ok ? (
        <>
          <PillTabs
            idPrefix="pulse"
            label="Pulse"
            value={tab}
            onValueChange={setTab}
            items={TABS.map((item) => ({ id: item.id, label: item.label }))}
          />
          <PillTabPanel idPrefix="pulse" tab={tab}>
            {tab === "synthese" ? (
              <div className="space-y-6">
                <ChannelGrid
                  title="Boules"
                  kind="ball"
                  numbers={numbers}
                  selected={selectedKey}
                  onSelect={chooseNumber}
                />
                <ChannelGrid
                  title="Étoiles"
                  kind="star"
                  numbers={numbers}
                  selected={selectedKey}
                  onSelect={chooseNumber}
                />
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {(scan.windows ?? []).map((window) => (
                    <li key={window.preset}>
                      {PULSE_PRESET_LABELS[window.preset as PulsePreset] ?? window.preset} ·{" "}
                      {window.draw_count} tirages
                      {window.from && window.to ? ` · ${window.from} → ${window.to}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {tab === "fiche" && selected ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-medium">
                    {pulseChannelLabel(selected.kind, selected.n)}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {pulseGeneratorLabel(selected.generator)}
                    {selected.period ? ` · période ${selected.period}` : ""} · concordance{" "}
                    {pulsePercent(selected.concordance)} · R {selected.r.toFixed(2)} · p{" "}
                    {selected.p < 0.001 ? "< 0,001" : selected.p.toFixed(3)}
                  </p>
                  {selected.group_ids.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Groupes : {selected.group_ids.join(", ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  {selected.slices.map((slice) => (
                    <SliceButton
                      key={slice.id}
                      slice={slice}
                      active={activeSlice?.id === slice.id}
                      onSelect={() => void openSlice(selected, slice)}
                    />
                  ))}
                </div>
                {detailError ? <p className="text-sm text-destructive">{detailError}</p> : null}
                {detail?.points && detail.points.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">
                        Onde et sorties
                        {detail.slice?.period ? ` · période ${detail.slice.period}` : ""}
                        {detail.slice ? ` · ${pulsePercent(detail.slice.concordance)}` : ""}
                      </CardTitle>
                      {detail.slice ? (
                        <p className="text-xs text-muted-foreground">
                          {pulseGeneratorLabel(detail.slice.generator)} · R {detail.slice.r.toFixed(2)} · p{" "}
                          {detail.slice.p < 0.001 ? "< 0,001" : detail.slice.p.toFixed(3)}
                          {pulseDrawCount(detail.slice.hits)
                            ? ` · ${pulseDrawCount(detail.slice.hits)}`
                            : ""}
                        </p>
                      ) : null}
                    </CardHeader>
                    <CardContent>
                      <PulseChart points={detail.points} />
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            ) : null}
            {tab === "fiche" && !selected ? (
              <p className="text-sm text-muted-foreground">
                Choisir une boule ou une étoile dans la synthèse.
              </p>
            ) : null}
            {tab === "groupes" ? (
              <div className="grid gap-3 md:grid-cols-2">
                {(scan.groups ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucune paire ni triplet pour les générateurs cochés.
                  </p>
                ) : (
                  (scan.groups ?? []).map((group) => <GroupCard key={group.id} group={group} />)
                )}
              </div>
            ) : null}
          </PillTabPanel>
        </>
      ) : null}
    </div>
  )
}
