"use client"

import { useEffect, useState } from "react"

import { HelpTip } from "@/components/help"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PillTabPanel, PillTabs } from "@/components/ui/pill-tabs"
import {
  CYCLE_LABELS,
  CycleCloud,
  EARTH_CYCLES,
  LUNAR_CYCLES,
  SOLAR_CYCLES,
  SynthesisPlane,
} from "@/components/ref/phase-cloud"
import {
  fetchCatalog,
  fetchGoes,
  fetchLunar,
  fetchSolar,
  type CatalogReport,
  type GoesReport,
  type LunarReport,
  type SolarReport,
} from "@/lib/ref"
import { useLabTab } from "@/lib/use-lab-tab"

const TABS = [
  {
    id: "lunaire",
    label: "Lunaire",
    help: {
      title: "Cycle lunaire",
      body: "Mois synodique moyen (~29,53 j). Âge depuis la nouvelle lune, éclairement, calendrier du mois.",
    },
  },
  {
    id: "solaire",
    label: "Solaire",
    help: {
      title: "Cycle solaire",
      body: "Rotation de Carrington (~27,3 j) et cycle de Schwabe (~11 ans). Le flux X GOES se demande via SunPy, sans télécharger le TimeSeries.",
    },
  },
  {
    id: "autres",
    label: "Autres",
    help: {
      title: "Autres cycles",
      body: "Année tropique et Chandler ont une phase locale. F10.7, Kp, rayons cosmiques, ENSO et QBO restent des séries mesurées.",
    },
  },
  {
    id: "synthese",
    label: "Synthèse",
    help: {
      title: "Synthèse",
      body: "Deux phases en axes, couleur = total numéros, total étoiles, n1–n5, E1 ou E2. Fenêtres de 20, 50 et 100 tirages.",
    },
  },
] as const

type TabId = (typeof TABS)[number]["id"]
const TAB_IDS = TABS.map((item) => item.id) as TabId[]

const NEXT_LABELS: Record<string, string> = {
  nouvelle: "Nouvelle lune",
  premier_quartier: "Premier quartier",
  pleine: "Pleine lune",
  dernier_quartier: "Dernier quartier",
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgo(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

export function RefLab() {
  const [tab, setTab] = useLabTab(TAB_IDS, "lunaire")
  return (
    <div className="flex flex-col gap-4">
      <PillTabs idPrefix="ref" label="Références" value={tab} onValueChange={setTab} items={TABS} />
      <PillTabPanel idPrefix="ref" tab={tab}>
        {tab === "lunaire" ? <LunarPanel /> : null}
        {tab === "solaire" ? <SolarPanel /> : null}
        {tab === "autres" ? <AutresPanel /> : null}
        {tab === "synthese" ? <SynthesisPlane /> : null}
      </PillTabPanel>
    </div>
  )
}

function LunarPanel() {
  const [day, setDay] = useState(todayIso)
  const [report, setReport] = useState<LunarReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    fetchLunar(day)
      .then((payload) => {
        if (!cancel) {
          setReport(payload)
          setError(null)
        }
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Lune indisponible")
      })
    return () => {
      cancel = true
    }
  }, [day])

  const today = report?.today
  return (
    <div className="flex flex-col gap-4">
      <label className="flex max-w-xs flex-col gap-1 text-xs text-muted-foreground">
        Date UTC
        <Input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {today ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {today.phase_label}
              <HelpTip
                title="Mois synodique"
                body={`Période moyenne ${report?.period_days.toFixed(3)} jours. L'éclairement est (1 − cos φ) / 2, φ étant la fraction du mois.`}
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground">{report?.note}</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              <Stat label="Âge" value={`${today.age_days.toFixed(2)} j`} />
              <Stat label="Fraction" value={today.fraction.toFixed(3)} />
              <Stat label="Éclairement" value={`${Math.round(today.illumination * 100)} %`} />
              <Stat label="Période" value={`${today.synodic_days.toFixed(2)} j`} />
            </dl>
            <ul className="grid gap-1 sm:grid-cols-2">
              {Object.entries(today.next).map(([key, value]) => (
                <li key={key} className="flex justify-between gap-3 border-b border-border py-1">
                  <span className="text-muted-foreground">{NEXT_LABELS[key] ?? key}</span>
                  <span>{value}</span>
                </li>
              ))}
            </ul>
            <MonthStrip days={report?.month ?? []} selected={day} onSelect={setDay} />
          </CardContent>
        </Card>
      ) : null}
      <CycleCloud cycles={LUNAR_CYCLES} initial="lunaire" labels={CYCLE_LABELS} />
    </div>
  )
}

function MonthStrip({
  days,
  selected,
  onSelect,
}: {
  days: LunarReport["month"]
  selected: string
  onSelect: (day: string) => void
}) {
  if (!days.length) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Mois civil — la hauteur suit l’éclairement.</p>
      <div className="flex flex-wrap gap-1">
        {days.map((item) => {
          const active = item.date === selected
          return (
            <button
              key={item.date}
              type="button"
              title={`${item.date} · ${item.phase_label}`}
              onClick={() => onSelect(item.date)}
              className={
                active
                  ? "flex h-10 w-8 flex-col items-center justify-end rounded-md border border-primary bg-primary/15"
                  : "flex h-10 w-8 flex-col items-center justify-end rounded-md border border-border"
              }
            >
              <span
                className="w-1.5 rounded-sm bg-foreground/80"
                style={{ height: `${Math.max(4, Math.round(item.illumination * 22))}px` }}
              />
              <span className="pb-0.5 text-[9px] text-muted-foreground">{item.date.slice(8)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SolarPanel() {
  const [day, setDay] = useState(todayIso)
  const [report, setReport] = useState<SolarReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [goesStart, setGoesStart] = useState(() => daysAgo(todayIso(), 7))
  const [goesEnd, setGoesEnd] = useState(todayIso)
  const [kind, setKind] = useState<"xrs" | "flares">("xrs")
  const [goes, setGoes] = useState<GoesReport | null>(null)
  const [goesError, setGoesError] = useState<string | null>(null)
  const [goesBusy, setGoesBusy] = useState(false)

  useEffect(() => {
    let cancel = false
    fetchSolar(day)
      .then((payload) => {
        if (!cancel) {
          setReport(payload)
          setError(null)
        }
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Soleil indisponible")
      })
    return () => {
      cancel = true
    }
  }, [day])

  async function queryGoes() {
    setGoesBusy(true)
    setGoesError(null)
    try {
      setGoes(await fetchGoes(goesStart, goesEnd, kind))
    } catch (reason) {
      setGoes(null)
      setGoesError(reason instanceof Error ? reason.message : "Fido injoignable")
    } finally {
      setGoesBusy(false)
    }
  }

  const carr = report?.carrington
  const cycle = report?.schwabe
  return (
    <div className="flex flex-col gap-4">
      <label className="flex max-w-xs flex-col gap-1 text-xs text-muted-foreground">
        Date UTC
        <Input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {carr && cycle ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Carrington {carr.number}
                <HelpTip
                  title="Rotation de Carrington"
                  body="Rotation synodique moyenne des longitudes solaires, ancrée au 9 novembre 1853. Les débuts observés dérivent de quelques jours."
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <Meter fraction={carr.fraction} />
              <Stat label="Fraction" value={carr.fraction.toFixed(3)} />
              <Stat label="Début" value={carr.rotation_start} />
              <Stat label="Fin" value={carr.rotation_end} />
              <Stat label="Période" value={`${carr.period_days} j`} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Schwabe {cycle.cycle ?? "—"}
                <HelpTip
                  title="Cycle de Schwabe"
                  body="Cycle des taches, compté depuis les minima SILSO. Après 2019 la fin est une moyenne de 11 ans, pas un minimum observé."
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {cycle.fraction != null ? <Meter fraction={Math.min(Math.max(cycle.fraction, 0), 1)} /> : null}
              <Stat label="Fraction" value={cycle.fraction?.toFixed(3) ?? "—"} />
              <Stat label="Minimum" value={cycle.minimum ?? "—"} />
              <Stat label="Minimum suivant" value={cycle.next_minimum_estimate ?? "—"} />
              <p className="text-xs text-muted-foreground">
                {cycle.bounded_by_observed_minimum
                  ? "Encadré par deux minima observés."
                  : "Fin estimée : 11 ans après le dernier minimum tabulé."}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}
      <CycleCloud cycles={SOLAR_CYCLES} initial="carrington" labels={CYCLE_LABELS} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            GOES via SunPy
            <HelpTip
              title="Fido"
              body="sunpy.net.Fido interroge le catalogue XRS (flux de rayons X) ou les éruptions HEK. Réf affiche la table, sans télécharger le TimeSeries."
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground">{report?.note}</p>
          <p className="text-xs text-muted-foreground">
            {report?.sunpy.available
              ? `SunPy ${report.sunpy.version ?? ""} est importable.`
              : `SunPy absent. ${report?.sunpy.hint ?? "pip install -r requirements-ref.txt"}`}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Du
              <Input type="date" value={goesStart} onChange={(event) => setGoesStart(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Au
              <Input type="date" value={goesEnd} onChange={(event) => setGoesEnd(event.target.value)} />
            </label>
            <div className="flex gap-2">
              <Button type="button" variant={kind === "xrs" ? "default" : "outline"} onClick={() => setKind("xrs")}>
                XRS
              </Button>
              <Button
                type="button"
                variant={kind === "flares" ? "default" : "outline"}
                onClick={() => setKind("flares")}
              >
                Éruptions
              </Button>
            </div>
            <Button type="button" onClick={() => void queryGoes()} disabled={goesBusy}>
              {goesBusy ? "Requête…" : "Interroger Fido"}
            </Button>
          </div>
          {goesError ? <p className="text-sm text-destructive">{goesError}</p> : null}
          {goes ? <GoesPreview report={goes} /> : null}
        </CardContent>
      </Card>
    </div>
  )
}

function GoesPreview({ report }: { report: GoesReport }) {
  const rows = report.blocks.flatMap((block) => block.preview)
  const columns = report.blocks[0]?.columns ?? []
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {report.label}
        {report.file_num != null ? ` · ${report.file_num} fichier(s)` : ""} — {report.note}
      </p>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column} className="border-b border-border px-2 py-1 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((column) => (
                    <td key={column} className="border-b border-border px-2 py-1 whitespace-nowrap">
                      {row[column] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Catalogue vide sur cet intervalle.</p>
      )}
    </div>
  )
}

function AutresPanel() {
  const [report, setReport] = useState<CatalogReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    fetchCatalog()
      .then((payload) => {
        if (!cancel) setReport(payload)
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Catalogue indisponible")
      })
    return () => {
      cancel = true
    }
  }, [])

  const kinds = [...new Set((report?.items ?? []).map((item) => item.kind))]
  return (
    <div className="flex flex-col gap-3">
      <CycleCloud cycles={EARTH_CYCLES} initial="tropique" labels={CYCLE_LABELS} />
      <p className="text-sm text-muted-foreground">
        F10.7, Kp, Ap, Dst, rayons cosmiques, ENSO et QBO se lisent sur une série du jour.
        Une phase 0–1 à la place de cette série ne dirait pas la valeur mesurée.
      </p>
      <p className="text-sm text-muted-foreground">{report?.note}</p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {kinds.map((kind) => (
        <section key={kind} className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{kind}</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {(report?.items ?? [])
              .filter((item) => item.kind === kind)
              .map((item) => (
                <Card key={item.id} size="sm">
                  <CardHeader>
                    <CardTitle>
                      {item.label}{" "}
                      <span className="font-normal text-muted-foreground">{item.period}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    <p>{item.why}</p>
                    <p className="mt-1">{item.source}</p>
                  </CardContent>
                </Card>
              ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function Meter({ fraction }: { fraction: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-primary" style={{ width: `${Math.round(fraction * 100)}%` }} />
    </div>
  )
}
