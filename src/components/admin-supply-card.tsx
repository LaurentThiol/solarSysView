"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Copy, RefreshCw } from "lucide-react"

import { HelpTip, WithHelp } from "@/components/help"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const PAGE = 40

const INSTALL = [
  {
    name: "syft",
    command: "curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin",
  },
  {
    name: "grype",
    command: "curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin",
  },
] as const

const SEVERITIES = [
  { id: "critical", label: "Critique", bar: "bg-err text-primary-foreground", dot: "bg-err", text: "text-err" },
  { id: "high", label: "Haute", bar: "bg-star text-primary-foreground", dot: "bg-star", text: "text-star" },
  { id: "medium", label: "Moyenne", bar: "bg-warn text-primary-foreground", dot: "bg-warn", text: "text-warn" },
  { id: "low", label: "Basse", bar: "bg-info text-primary-foreground", dot: "bg-info", text: "text-info" },
  { id: "negligible", label: "Négligeable", bar: "bg-muted text-foreground", dot: "bg-muted-foreground", text: "text-muted-foreground" },
  { id: "unknown", label: "Inconnue", bar: "bg-background text-foreground", dot: "bg-foreground/40", text: "text-muted-foreground" },
] as const

type SeverityId = (typeof SEVERITIES)[number]["id"]
type EcosystemId = "all" | "npm" | "python" | "autre"

type Finding = {
  id: string
  severity: SeverityId | string
  package: string
  version: string
  ecosystem: string
  fix_state: string
  fix_version: string | null
  url: string | null
  summary: string
}

type SupplyReport = {
  generated_at: string
  tools: { syft: string | null; grype: string | null; db_built: string | null }
  counts: Record<string, number>
  sbom: { components: number; by_type: { npm?: number; python?: number; autre?: number } }
  findings: Finding[]
  python_note: string | null
  errors: string[]
}

type Payload = {
  ok: boolean
  cached?: boolean
  stale?: boolean
  netlify?: boolean
  report: SupplyReport | null
  tools_missing?: string[]
  message?: string
  error?: string
}

type Group = {
  key: string
  package: string
  version: string
  ecosystem: string
  findings: Finding[]
  severity: string
  fixLabel: string | null
}

const RANK: Record<string, number> = Object.fromEntries(SEVERITIES.map((item, index) => [item.id, index]))

function severityMeta(id: string) {
  return SEVERITIES.find((item) => item.id === id) ?? SEVERITIES[SEVERITIES.length - 1]
}

function ecosystemLabel(id: string) {
  if (id === "npm") return "npm"
  if (id === "python") return "Python"
  if (id === "autre") return "Autre"
  return id
}

function worstSeverity(findings: Finding[]) {
  return findings.reduce((top, item) => ((RANK[item.severity] ?? 99) < (RANK[top] ?? 99) ? item.severity : top), findings[0]?.severity ?? "unknown")
}

function groupFindings(findings: Finding[]): Group[] {
  const groups = new Map<string, Finding[]>()
  for (const finding of findings) {
    const key = `${finding.ecosystem}:${finding.package}@${finding.version}`
    const current = groups.get(key)
    if (current) current.push(finding)
    else groups.set(key, [finding])
  }
  const rows: Group[] = []
  for (const [key, items] of groups) {
    const first = items[0]
    const versions = items.map((item) => item.fix_version)
    const unique = [...new Set(versions.filter((item): item is string => Boolean(item)))]
    const allShareOne = unique.length === 1 && versions.every((item) => item === unique[0])
    rows.push({
      key,
      package: first.package,
      version: first.version,
      ecosystem: first.ecosystem,
      findings: [...items].sort((a, b) => (RANK[a.severity] ?? 99) - (RANK[b.severity] ?? 99) || a.id.localeCompare(b.id)),
      severity: worstSeverity(items),
      fixLabel: allShareOne ? unique[0] : unique.length > 0 ? "correctifs" : null,
    })
  }
  rows.sort(
    (a, b) =>
      (RANK[a.severity] ?? 99) - (RANK[b.severity] ?? 99) ||
      a.package.localeCompare(b.package) ||
      a.version.localeCompare(b.version),
  )
  return rows
}

function Tile({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "err" | "muted" }) {
  const color =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "err" ? "text-err" : "text-foreground"
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

function SeverityBar({
  counts,
  active,
  onToggle,
}: {
  counts: Record<string, number>
  active: string | null
  onToggle: (id: string) => void
}) {
  const legend = SEVERITIES.filter((item) => item.id !== "unknown" || (counts.unknown ?? 0) > 0)
  const segments = legend.filter((item) => (counts[item.id] ?? 0) > 0)
  const total = segments.reduce((sum, item) => sum + (counts[item.id] ?? 0), 0)
  return (
    <div className="flex flex-col gap-2">
      {total === 0 ? (
        <div className="flex h-9 items-center justify-center rounded-lg bg-ok/20 px-3 text-center text-sm text-ok">
          Aucune faille connue sur cet inventaire.
        </div>
      ) : (
        <div className="flex h-9 overflow-x-auto rounded-lg">
          {segments.map((item) => {
            const count = counts[item.id] ?? 0
            const pressed = active === item.id
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={pressed}
                aria-label={`${item.label} : ${count}`}
                title={`${item.label} : ${count}`}
                style={{ flexGrow: count, flexBasis: 0, minWidth: "2.75rem" }}
                className={`min-w-0 px-1 text-xs font-medium transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${item.bar} ${
                  active && !pressed ? "opacity-35" : ""
                } ${pressed ? "ring-2 ring-inset ring-foreground/40" : ""}`}
                onClick={() => onToggle(item.id)}
              >
                <span className="truncate">
                  <span className="hidden md:inline">{item.label} </span>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {legend.map((item) => {
          const count = counts[item.id] ?? 0
          const pressed = active === item.id
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={pressed}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                pressed ? "border-foreground/50 bg-muted" : "border-border text-muted-foreground"
              }`}
              onClick={() => onToggle(item.id)}
            >
              <span className={`size-2 rounded-full ${item.dot}`} />
              {item.label}
              <span className="tabular-nums text-foreground">{count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function EcosystemBar({
  byType,
  active,
  onToggle,
}: {
  byType: { npm?: number; python?: number; autre?: number }
  active: EcosystemId
  onToggle: (id: EcosystemId) => void
}) {
  const parts = [
    { id: "npm" as const, label: "npm", count: byType.npm ?? 0, bar: "bg-info" },
    { id: "python" as const, label: "Python", count: byType.python ?? 0, bar: "bg-ok" },
    { id: "autre" as const, label: "Autre", count: byType.autre ?? 0, bar: "bg-muted-foreground/50" },
  ].filter((item) => item.count > 0)
  const total = parts.reduce((sum, item) => sum + item.count, 0)
  if (total === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {parts.map((item) => {
          const pressed = active === item.id
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={pressed}
              aria-label={`${item.label} : ${item.count} composant${item.count > 1 ? "s" : ""}`}
              title={`${item.label} : ${item.count}`}
              style={{ flexGrow: item.count, flexBasis: 0 }}
              className={`h-full min-w-2 ${item.bar} ${active !== "all" && !pressed ? "opacity-35" : ""} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
              onClick={() => onToggle(item.id)}
            />
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {parts.map((item) => `${item.label} ${item.count}`).join(" · ")}
      </p>
    </div>
  )
}

function InstallPanel({ missing }: { missing: string[] }) {
  const [copied, setCopied] = useState<string | null>(null)
  const label = missing.length === 1 ? `Il manque ${missing[0]}.` : `Il manque ${missing.join(" et ")}.`

  async function copy(name: string, command: string) {
    await navigator.clipboard.writeText(command)
    setCopied(name)
    window.setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="rounded-lg border border-info/40 bg-info/10 px-3 py-3">
      <p className="text-sm">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Installe les deux binaires, puis relance Scanner. Rien n’est téléchargé depuis cette page. Si
        /usr/local/bin refuse l’écriture, ajoute sudo devant sh.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {INSTALL.map((item) => (
          <li key={item.name} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-background px-2 py-1 text-xs">
              {item.command}
            </code>
            <Button type="button" variant="outline" size="xs" onClick={() => void copy(item.name, item.command)}>
              <Copy />
              {copied === item.name ? "Copié" : "Copier"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AdminSupplyCard() {
  const [report, setReport] = useState<SupplyReport | null>(null)
  const [cached, setCached] = useState(false)
  const [stale, setStale] = useState(false)
  const [netlify, setNetlify] = useState(false)
  const [toolsMissing, setToolsMissing] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<"load" | "scan" | "idle">("load")
  const [severity, setSeverity] = useState<string | null>(null)
  const [ecosystem, setEcosystem] = useState<EcosystemId>("all")
  const [fixesOnly, setFixesOnly] = useState(false)
  const [query, setQuery] = useState("")
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<string | null>(null)
  const alive = useRef(true)

  const load = useCallback(async (refresh: boolean) => {
    const response = await fetch(`/api/admin/supply-chain${refresh ? "?refresh=1" : ""}`, {
      cache: "no-store",
    })
    const payload = (await response.json()) as Payload
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Scan impossible")
    }
    return payload
  }, [])

  const apply = useCallback((payload: Payload) => {
    setReport(payload.report)
    setCached(Boolean(payload.cached))
    setStale(Boolean(payload.stale))
    setNetlify(Boolean(payload.netlify))
    setToolsMissing(payload.tools_missing ?? [])
    setMessage(payload.message ?? null)
  }, [])

  const scan = useCallback(async () => {
    setPhase("scan")
    setError(null)
    try {
      apply(await load(true))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scan impossible")
    } finally {
      setPhase("idle")
    }
  }, [apply, load])

  useEffect(() => {
    alive.current = true
    async function first() {
      setPhase("load")
      setError(null)
      try {
        const payload = await load(false)
        if (!alive.current) return
        apply(payload)
      } catch (caught) {
        if (alive.current) setError(caught instanceof Error ? caught.message : "Scan impossible")
      } finally {
        if (alive.current) setPhase("idle")
      }
    }
    void first()
    return () => {
      alive.current = false
    }
  }, [apply, load])

  const groups = useMemo(() => {
    if (!report) return []
    const needle = query.trim().toLowerCase()
    const filtered = report.findings.filter((finding) => {
      if (severity && finding.severity !== severity) return false
      if (ecosystem !== "all" && finding.ecosystem !== ecosystem) return false
      if (fixesOnly && !finding.fix_version) return false
      if (!needle) return true
      const hay = `${finding.package} ${finding.version} ${finding.id} ${finding.summary}`.toLowerCase()
      return hay.includes(needle)
    })
    return groupFindings(filtered)
  }, [ecosystem, fixesOnly, query, report, severity])

  const visible = groups.slice(0, limit)
  const hidden = groups.length - visible.length
  const critical = report?.counts.critical ?? 0
  const withFix = report?.findings.filter((item) => item.fix_version).length ?? 0
  const touched = report ? new Set(report.findings.map((item) => `${item.ecosystem}:${item.package}@${item.version}`)).size : 0
  const showAutre =
    ecosystem === "autre" ||
    (report?.sbom.by_type.autre ?? 0) > 0 ||
    Boolean(report?.findings.some((item) => item.ecosystem === "autre"))
  const ecosystems: { id: EcosystemId; label: string }[] = [
    { id: "all", label: "Tout" },
    { id: "npm", label: "npm" },
    { id: "python", label: "Python" },
    ...(showAutre ? [{ id: "autre" as const, label: "Autre" }] : []),
  ]

  function toggleSeverity(id: string) {
    setSeverity((current) => (current === id ? null : id))
    setLimit(PAGE)
  }

  function toggleEcosystem(id: EcosystemId) {
    setEcosystem((current) => (current === id ? "all" : id))
    setLimit(PAGE)
  }

  const tools = [
    report?.tools.syft ? `Syft ${report.tools.syft}` : null,
    report?.tools.grype ? `Grype ${report.tools.grype}` : null,
    report?.tools.db_built ? `base ${report.tools.db_built.replace("T", " ").slice(0, 16)}` : null,
  ].filter(Boolean)

  return (
    <Card id="failles" className="scroll-mt-24">
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="inline-flex items-center gap-1">
              Failles
              <HelpTip
                title="Inventaire et failles"
                body="Syft lit le lockfile npm et, s’il est là, le .venv. Grype rapproche cet inventaire des avis connus. La barre filtre par sévérité. Le ruban du dessous filtre npm ou Python. Rien n’est lancé à l’ouverture : Scanner relance les deux binaires en local."
              />
            </CardTitle>
            <CardDescription>
              {report
                ? `Relevé ${report.generated_at}${cached ? " · en cache" : ""}${stale ? " · dépôt modifié depuis" : ""}${
                    tools.length ? ` · ${tools.join(" · ")}` : ""
                  }`
                : "Inventaire Syft et correspondances Grype. Le scan part au clic, ou le lundi sur GitHub."}
            </CardDescription>
          </div>
          <WithHelp
            help={{
              title: "Scanner",
              body: "Lance syft puis grype sur ce dépôt. La première fois, Grype télécharge sa base : compte jusqu’à trois minutes. Le résultat reste dans .run jusqu’au prochain scan.",
            }}
          >
            <Button type="button" variant="outline" disabled={phase !== "idle" || netlify} onClick={() => void scan()}>
              <RefreshCw />
              {phase === "scan" ? "Scan…" : phase === "load" ? "Lecture…" : "Scanner"}
            </Button>
          </WithHelp>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        {error ? <p className="text-sm text-err">{error}</p> : null}
        {netlify ? (
          <p className="text-sm text-muted-foreground">
            {message ||
              "Le scan se lance sur la machine locale. Le lundi, l’action GitHub met à jour l’issue Failles connues."}
          </p>
        ) : null}
        {toolsMissing.length > 0 ? <InstallPanel missing={toolsMissing} /> : null}
        {!report && phase === "load" ? <p className="text-sm text-muted-foreground">Lecture du relevé…</p> : null}
        {!report && phase === "idle" && !error && toolsMissing.length === 0 && !netlify ? (
          <p className="text-sm text-muted-foreground">Pas encore de relevé.</p>
        ) : null}
        {report ? (
          <>
            <SeverityBar counts={report.counts} active={severity} onToggle={toggleSeverity} />
            <EcosystemBar byType={report.sbom.by_type} active={ecosystem} onToggle={toggleEcosystem} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Critiques" value={String(critical)} tone={critical > 0 ? "err" : "ok"} />
              <Tile label="Avec correctif" value={String(withFix)} tone={withFix > 0 ? "warn" : "ok"} />
              <Tile label="Paquets touchés" value={String(touched)} tone={touched > 0 ? "warn" : "ok"} />
              <Tile label="Composants" value={String(report.sbom.components)} tone="muted" />
            </div>
            {report.python_note ? (
              <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">{report.python_note}</p>
            ) : null}
            {report.findings.length > 0 ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setLimit(PAGE)
                  }}
                  placeholder="Paquet ou avis"
                  aria-label="Filtrer les paquets"
                  className="sm:max-w-xs"
                />
                <div className="flex flex-wrap gap-1.5">
                  {ecosystems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={ecosystem === item.id}
                      className={`rounded-full border px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        ecosystem === item.id ? "border-foreground/50 bg-muted text-foreground" : "border-border text-muted-foreground"
                      }`}
                      onClick={() => toggleEcosystem(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-pressed={fixesOnly}
                    className={`rounded-full border px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      fixesOnly ? "border-ok/50 text-ok" : "border-border text-muted-foreground"
                    }`}
                    onClick={() => {
                      setFixesOnly((current) => !current)
                      setLimit(PAGE)
                    }}
                  >
                    Correctif disponible
                  </button>
                </div>
              </div>
            ) : null}
            {report.findings.length > 0 && groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun paquet ne correspond.</p>
            ) : null}
            {visible.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {visible.map((group) => {
                  const meta = severityMeta(group.severity)
                  const expanded = open === group.key
                  return (
                    <li key={group.key} className="overflow-hidden rounded-lg border">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        className="flex w-full items-stretch text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setOpen(expanded ? null : group.key)}
                      >
                        <span className={`w-1.5 shrink-0 ${meta.dot}`} />
                        <span className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center">
                          <span className="flex min-w-0 items-baseline gap-2">
                            <code className="truncate">{group.package}</code>
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">{group.version || "—"}</span>
                          </span>
                          <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
                            <Badge variant="outline">{ecosystemLabel(group.ecosystem)}</Badge>
                            {group.fixLabel ? (
                              <span className="rounded-full border border-ok/40 px-2 py-0.5 text-xs text-ok">
                                {group.fixLabel === "correctifs" ? "correctifs" : `→ ${group.fixLabel}`}
                              </span>
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                              {group.findings.length} avis
                            </span>
                            <ChevronDown className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                          </span>
                        </span>
                      </button>
                      {expanded ? (
                        <ul>
                          {group.findings.map((finding) => {
                            const tone = severityMeta(finding.severity)
                            return (
                              <li key={`${finding.id}:${finding.severity}`} className="border-t px-3 py-2 pl-5">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                  <span className={`text-xs font-medium ${tone.text}`}>{tone.label}</span>
                                  {finding.url ? (
                                    <a
                                      className="font-mono text-sm underline underline-offset-2"
                                      href={finding.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {finding.id}
                                    </a>
                                  ) : (
                                    <span className="font-mono text-sm">{finding.id}</span>
                                  )}
                                  {finding.fix_version ? (
                                    <span className="text-xs text-ok">Correctif {finding.fix_version}</span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">Pas de correctif publié</span>
                                  )}
                                </div>
                                {finding.summary ? (
                                  <p className="mt-1 text-sm text-muted-foreground">{finding.summary}</p>
                                ) : null}
                              </li>
                            )
                          })}
                        </ul>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : null}
            {hidden > 0 ? (
              <Button type="button" variant="outline" onClick={() => setLimit((current) => current + PAGE)}>
                Afficher la suite
              </Button>
            ) : null}
            {report.errors.length > 0 ? (
              <ul className="space-y-1 text-sm text-err">
                {report.errors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
