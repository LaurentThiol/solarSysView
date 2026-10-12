"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { HelpTip, HelpWrap, TitleHelp } from "@/components/help"
import { PulseChart } from "@/components/pulse/pulse-chart"
import { PulseGroupTable, PulseSliceTable } from "@/components/pulse/pulse-table"
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
  fetchGroupWave,
  fetchPulseDetail,
  pulseChannelLabel,
  pulseGeneratorLabel,
  pulseDrawCount,
  pulsePLabel,
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
  type PulseTrace,
} from "@/lib/pulse"
import { PULSE_HELP } from "@/lib/pulse-help"

const TABS = [
  { id: "synthese", label: "Synthèse", help: PULSE_HELP.synthese },
  { id: "fiche", label: "Fiche", help: PULSE_HELP.fiche },
  { id: "groupes", label: "Groupes", help: PULSE_HELP.groupes },
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

function Metric({
  label,
  help,
}: {
  label: string
  help: (typeof PULSE_HELP)[keyof typeof PULSE_HELP]
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <HelpTip {...help} />
    </span>
  )
}

function ChannelGrid({
  title,
  help,
  kind,
  numbers,
  selected,
  onSelect,
}: {
  title: string
  help: (typeof PULSE_HELP)[keyof typeof PULSE_HELP]
  kind: PulseKind
  numbers: PulseNumber[]
  selected: string | null
  onSelect: (item: PulseNumber) => void
}) {
  const rows = numbers.filter((item) => item.kind === kind)
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">
        <TitleHelp help={help}>{title}</TitleHelp>
      </h3>
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

function presetLabel(preset: string) {
  return PULSE_PRESET_LABELS[preset as PulsePreset] ?? preset
}

function rotationLabel(group: PulseGroup) {
  if (group.period2 && group.period2 !== group.period) return `rotation ${group.period2}`
  return `rotation sur ${group.period}`
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
  const [groupId, setGroupId] = useState<string | null>(null)
  const [groupSeries, setGroupSeries] = useState<PulseTrace[]>([])
  const [groupError, setGroupError] = useState<string | null>(null)
  const detailToken = useRef(0)

  const numbers = useMemo(() => scan?.numbers ?? [], [scan])
  const groups = useMemo(() => scan?.groups ?? [], [scan])
  const selected = useMemo(
    () => numbers.find((item) => `${item.kind}-${item.n}` === selectedKey) ?? null,
    [numbers, selectedKey]
  )
  const activeSlice =
    selected?.slices.find((item) => item.id === sliceId) ?? selected?.slices[0] ?? null
  const selectedGroup = useMemo(
    () => groups.find((item) => item.id === groupId) ?? groups[0] ?? null,
    [groupId, groups]
  )
  const tracedFamilies = useMemo(() => {
    const picked = (scan?.families ?? []).filter((name): name is PulseFamily =>
      (PULSE_FAMILIES as readonly string[]).includes(name)
    )
    return picked.length > 0 ? picked : families
  }, [families, scan])
  const waveKey =
    tab === "groupes" && selectedGroup && scan?.ok
      ? `${selectedGroup.id}\n${tracedFamilies.join(",")}\n${weekday}`
      : ""
  const [seenWaveKey, setSeenWaveKey] = useState(waveKey)
  if (waveKey !== seenWaveKey) {
    setSeenWaveKey(waveKey)
    setGroupSeries([])
    setGroupError(null)
  }

  useEffect(() => {
    if (!waveKey || !selectedGroup || !scan?.ok) return
    let cancelled = false
    void fetchGroupWave(selectedGroup, scan.numbers ?? [], tracedFamilies, weekday)
      .then((result) => {
        if (cancelled) return
        setGroupSeries(result.series)
        setGroupError(result.error)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setGroupSeries([])
        setGroupError(cause instanceof Error ? cause.message : "Tracé impossible")
      })
    return () => {
      cancelled = true
    }
  }, [scan, selectedGroup, tracedFamilies, waveKey, weekday])

  async function run() {
    setLoading(true)
    setError(null)
    setDetail(null)
    setGroupId(null)
    setGroupSeries([])
    setGroupError(null)
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
    const slice = [...item.slices].sort(
      (a, b) => b.concordance - a.concordance || b.draws - a.draws
    )[0]
    if (!slice) {
      setSelectedKey(`${item.kind}-${item.n}`)
      setSliceId(null)
      setDetail(null)
      setTab("fiche")
      return
    }
    void openSlice(item, slice)
  }

  function chooseGroup(group: PulseGroup) {
    if (group.id === selectedGroup?.id) return
    setGroupId(group.id)
    setGroupSeries([])
    setGroupError(null)
  }

  const ready = families.length > 0 && presets.length > 0 && !loading

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            <TitleHelp help={PULSE_HELP.reglages}>Générateurs et fenêtres</TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <WeekdayScopeControl value={weekday} onChange={setWeekday} help={PULSE_HELP.jour} />
          <div className="space-y-2">
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              Générateurs
              <HelpTip {...PULSE_HELP.generateurs} />
            </p>
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
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              Échantillons
              <HelpTip {...PULSE_HELP.echantillons} />
            </p>
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
          <HelpWrap help={PULSE_HELP.lancer}>
            <Button type="button" disabled={!ready} onClick={() => void run()}>
              {loading ? "Syntonisation…" : "Lancer la syntonisation"}
            </Button>
          </HelpWrap>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {scan?.disclaimer ? (
            <p className="text-xs text-muted-foreground">
              {scan.disclaimer} <HelpTip {...PULSE_HELP.avertissement} />
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Périodes de 2 à 60 tirages. Le taux vaut 0 % quand la moitié des sorties seulement
            tombe dans le demi-cycle, et 100 % quand elles y sont toutes.{" "}
            <HelpTip {...PULSE_HELP.concordance} />
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
            items={TABS.map((item) => ({ id: item.id, label: item.label, help: item.help }))}
          />
          <PillTabPanel idPrefix="pulse" tab={tab}>
            {tab === "synthese" ? (
              <div className="space-y-6">
                <ChannelGrid
                  title="Boules"
                  help={PULSE_HELP.boules}
                  kind="ball"
                  numbers={numbers}
                  selected={selectedKey}
                  onSelect={chooseNumber}
                />
                <ChannelGrid
                  title="Étoiles"
                  help={PULSE_HELP.etoiles}
                  kind="star"
                  numbers={numbers}
                  selected={selectedKey}
                  onSelect={chooseNumber}
                />
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    <Metric label="Fenêtres lues" help={PULSE_HELP.fenetres} />
                  </p>
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
              </div>
            ) : null}
            {tab === "fiche" && selected ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-medium">
                    <TitleHelp help={PULSE_HELP.numero}>
                      {pulseChannelLabel(selected.kind, selected.n)}
                    </TitleHelp>
                  </h2>
                  <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <Metric
                      label={pulseGeneratorLabel(selected.generator)}
                      help={PULSE_HELP.generateur}
                    />
                    <Metric
                      label={selected.period ? `période ${selected.period}` : "pas de période"}
                      help={PULSE_HELP.periode}
                    />
                    <Metric
                      label={`concordance ${pulsePercent(selected.concordance)}`}
                      help={PULSE_HELP.concordance}
                    />
                    <Metric label={`R ${selected.r.toFixed(2)}`} help={PULSE_HELP.rayon} />
                    <Metric label={`p ${pulsePLabel(selected.p)}`} help={PULSE_HELP.p} />
                  </p>
                  {selected.group_ids.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      <Metric
                        label={`Groupes : ${selected.group_ids.join(", ")}`}
                        help={PULSE_HELP.liens}
                      />
                    </p>
                  ) : null}
                </div>
                {activeSlice ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">
                        <TitleHelp help={PULSE_HELP.onde}>
                          Onde et sorties
                          {activeSlice.period ? ` · période ${activeSlice.period}` : ""}
                          {` · ${pulsePercent(activeSlice.concordance)}`}
                        </TitleHelp>
                      </CardTitle>
                      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <Metric
                          label={pulseGeneratorLabel(activeSlice.generator)}
                          help={PULSE_HELP.generateur}
                        />
                        <Metric label={`R ${activeSlice.r.toFixed(2)}`} help={PULSE_HELP.rayon} />
                        <Metric label={`p ${pulsePLabel(activeSlice.p)}`} help={PULSE_HELP.p} />
                        {pulseDrawCount(activeSlice.hits) ? (
                          <Metric
                            label={pulseDrawCount(activeSlice.hits) ?? ""}
                            help={PULSE_HELP.sorties}
                          />
                        ) : null}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {detailError ? <p className="text-sm text-destructive">{detailError}</p> : null}
                      {detail?.points && detail.points.length > 0 ? (
                        <PulseChart points={detail.points} />
                      ) : detailError ? null : (
                        <p className="text-sm text-muted-foreground">Tracé…</p>
                      )}
                    </CardContent>
                  </Card>
                ) : null}
                <PulseSliceTable
                  slices={selected.slices}
                  activeId={activeSlice?.id ?? null}
                  help={PULSE_HELP.tranches}
                  onSelect={(slice) => void openSlice(selected, slice)}
                />
              </div>
            ) : null}
            {tab === "fiche" && !selected ? (
              <p className="text-sm text-muted-foreground">
                Choisir une boule ou une étoile dans la synthèse.
              </p>
            ) : null}
            {tab === "groupes" ? (
              groups.length === 0 || !selectedGroup ? (
                <p className="text-sm text-muted-foreground">
                  Aucune paire ni triplet pour les générateurs cochés.
                </p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-base font-medium">
                      {pulseGeneratorLabel(selectedGroup.generator)} ·{" "}
                      {selectedGroup.members
                        .map((member) => pulseChannelLabel(member.kind, member.n))
                        .join(" · ")}
                    </h2>
                    <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span>{presetLabel(selectedGroup.preset)}</span>
                      <Metric
                        label={`période ${selectedGroup.period}`}
                        help={PULSE_HELP.periode}
                      />
                      <Metric label={rotationLabel(selectedGroup)} help={PULSE_HELP.rotation} />
                      <Metric
                        label={`concordance ${pulsePercent(selectedGroup.concordance)}`}
                        help={PULSE_HELP.concordance}
                      />
                      {selectedGroup.p != null ? (
                        <Metric label={`p ${pulsePLabel(selectedGroup.p)}`} help={PULSE_HELP.p} />
                      ) : null}
                      {pulseDrawCount(selectedGroup.hits) ? (
                        <Metric
                          label={pulseDrawCount(selectedGroup.hits) ?? ""}
                          help={PULSE_HELP.sorties}
                        />
                      ) : null}
                    </p>
                    {selectedGroup.from && selectedGroup.to ? (
                      <p className="text-sm text-muted-foreground">
                        {formatDrawDate(selectedGroup.from)} → {formatDrawDate(selectedGroup.to)}
                      </p>
                    ) : null}
                    <p className="text-sm text-muted-foreground">
                      <Metric
                        label={`Phases ${selectedGroup.members
                          .map((member) => (member.phase == null ? "—" : member.phase.toFixed(2)))
                          .join(" · ")}`}
                        help={PULSE_HELP.phases}
                      />
                    </p>
                  </div>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">
                        <TitleHelp help={PULSE_HELP.onde}>
                          Onde et sorties · période {selectedGroup.period} ·{" "}
                          {pulsePercent(selectedGroup.concordance)}
                        </TitleHelp>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Chaque courbe est l’onde d’un membre, chaque barre une sortie, sur la tranche la
                        plus longue de l’échantillon.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {groupSeries.length > 0 ? <PulseChart series={groupSeries} /> : null}
                      {groupError ? (
                        <p
                          className={
                            groupSeries.length > 0
                              ? "text-sm text-muted-foreground"
                              : "text-sm text-destructive"
                          }
                        >
                          {groupError}
                        </p>
                      ) : null}
                      {groupSeries.length === 0 && !groupError ? (
                        <p className="text-sm text-muted-foreground">Tracé…</p>
                      ) : null}
                    </CardContent>
                  </Card>
                  <PulseGroupTable
                    groups={groups}
                    activeId={selectedGroup.id}
                    help={PULSE_HELP.groupes}
                    onSelect={chooseGroup}
                  />
                </div>
              )
            ) : null}
          </PillTabPanel>
        </>
      ) : null}
    </div>
  )
}
