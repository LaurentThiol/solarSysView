"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"

import { HelpTip, WithHelp } from "@/components/help"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type LibraryRow = {
  source: string
  name: string
  requested: string
  current: string
  latest: string
  status: string
}

type GatePlugin = {
  name: string
  version: string | null
  peer: string | null
  allows_10: boolean | null
  error: string | null
}

type DependencyReport = {
  generated_at: string
  watched: number
  eslint_locked: string | null
  eslint10_ready: boolean
  gate: GatePlugin[]
  decisions: LibraryRow[]
  behind: LibraryRow[]
  errors: string[]
}

type Payload = {
  ok: boolean
  cached?: boolean
  stale?: boolean
  report: DependencyReport | null
  error?: string
}

function shortPlugin(name: string) {
  return name.replace(/^eslint-plugin-/, "")
}

function statusClass(status: string) {
  if (status.includes("illisible")) return "text-err"
  if (
    status.startsWith("hors") ||
    status === "épinglée" ||
    status.includes("dépréciée") ||
    status === "majeure d'action"
  ) {
    return "text-warn"
  }
  return "text-foreground"
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "ok" | "warn" | "muted"
}) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-foreground"
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

export function AdminDependenciesCard() {
  const [report, setReport] = useState<DependencyReport | null>(null)
  const [cached, setCached] = useState(false)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const alive = useRef(true)

  const read = useCallback(async (refresh: boolean) => {
    const response = await fetch(`/api/admin/dependencies${refresh ? "?refresh=1" : ""}`, {
      cache: "no-store",
    })
    const payload = (await response.json()) as Payload
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Lecture des bibliothèques impossible")
    }
    return payload
  }, [])

  const apply = useCallback((payload: Payload) => {
    setReport(payload.report)
    setCached(Boolean(payload.cached))
    setStale(Boolean(payload.stale))
  }, [])

  const reload = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      apply(await read(true))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Lecture des bibliothèques impossible")
    } finally {
      setBusy(false)
    }
  }, [apply, read])

  useEffect(() => {
    alive.current = true
    async function first() {
      setBusy(true)
      setError(null)
      try {
        const payload = await read(false)
        if (!alive.current) return
        apply(payload)
        if (payload.report == null || payload.stale) {
          const fresh = await read(true)
          if (!alive.current) return
          apply(fresh)
        }
      } catch (caught) {
        if (alive.current) {
          setError(caught instanceof Error ? caught.message : "Lecture des bibliothèques impossible")
        }
      } finally {
        if (alive.current) setBusy(false)
      }
    }
    void first()
    return () => {
      alive.current = false
    }
  }, [apply, read])

  const decisions = report?.decisions.length ?? 0
  const behind = report?.behind.length ?? 0
  const ready = report?.eslint10_ready === true

  return (
    <Card id="bibliotheques">
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="inline-flex items-center gap-1">
              Bibliothèques
              <HelpTip
                title="Suivi des bibliothèques"
                body="Compare package.json, le verrou npm et les requirements*.txt aux registres npm, PyPI et GitHub. À décider : la contrainte bloque la dernière version, ou une action GitHub a une majeure plus récente. Verrou en retard : la contrainte l’autorise déjà. ESLint 10 reste fermé tant que les trois plugins disent non."
              />
            </CardTitle>
            <CardDescription>
              {report
                ? `Relevé ${report.generated_at}${cached ? " · en cache" : ""}${stale ? " · dépôt modifié depuis" : ""}`
                : "npm, PyPI et les actions GitHub. Le relevé complet part aussi chaque lundi."}
            </CardDescription>
          </div>
          <WithHelp
            help={{
              title: "Relire les registres",
              body: "Relance scripts/dependency_watch.py. Environ une minute la première fois, puis le résultat reste dans .run jusqu’au prochain contrôle ou jusqu’à ce que package.json ou un requirements change.",
            }}
          >
            <Button type="button" variant="outline" disabled={busy} onClick={() => void reload()}>
              <RefreshCw />
              {busy ? "Lecture…" : "Relire"}
            </Button>
          </WithHelp>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        {error ? <p className="text-sm text-err">{error}</p> : null}
        {!report && busy ? (
          <p className="text-sm text-muted-foreground">Lecture des registres…</p>
        ) : null}
        {!report && !busy && !error ? (
          <p className="text-sm text-muted-foreground">Pas encore de relevé.</p>
        ) : null}
        {report ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile
                label="À décider"
                value={String(decisions)}
                tone={decisions > 0 ? "warn" : "ok"}
              />
              <Tile label="Verrou en retard" value={String(behind)} tone={behind > 0 ? "warn" : "ok"} />
              <Tile label="ESLint 10" value={ready ? "prêt" : "pas encore"} tone={ready ? "ok" : "warn"} />
              <Tile label="Lues" value={String(report.watched)} tone="muted" />
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm">
                ESLint verrouillé <strong>{report.eslint_locked || "—"}</strong>
                {ready
                  ? " — les trois plugins acceptent ESLint 10."
                  : " — la majeure reste bloquée."}
              </p>
              <div className="flex flex-wrap gap-2">
                {report.gate.map((plugin) => (
                  <span
                    key={plugin.name}
                    title={plugin.peer || plugin.error || plugin.name}
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      plugin.allows_10 ? "border-ok/40 text-ok" : "border-warn/40 text-warn"
                    }`}
                  >
                    {shortPlugin(plugin.name)} {plugin.version || "—"} ·{" "}
                    {plugin.allows_10 ? "oui" : plugin.allows_10 === false ? "non" : "illisible"}
                  </span>
                ))}
              </div>
              {ready ? (
                <p className="text-sm text-ok">
                  Retirer l’ignore Dependabot sur eslint, passer la contrainte à ^10, puis lancer npm run lint.
                </p>
              ) : null}
            </div>

            {decisions > 0 ? (
              <>
              <ul className="flex flex-col gap-2 sm:hidden">
                {report.decisions.map((row) => (
                  <li key={`${row.source}:${row.name}`} className="rounded-lg border px-3 py-2 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <code className="truncate">{row.name}</code>
                      <span className={`shrink-0 text-right text-xs ${statusClass(row.status)}`}>{row.status}</span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {row.current} → {row.latest}
                      <span className="text-foreground/70"> · {row.requested}</span>
                    </p>
                  </li>
                ))}
              </ul>
              <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bibliothèque</TableHead>
                    <TableHead>Contrainte</TableHead>
                    <TableHead>Actuelle</TableHead>
                    <TableHead>Dernière</TableHead>
                    <TableHead>Décision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.decisions.map((row) => (
                    <TableRow key={`${row.source}:${row.name}`}>
                      <TableCell title={row.source}>
                        <code>{row.name}</code>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.requested}</TableCell>
                      <TableCell className="font-mono text-xs">{row.current}</TableCell>
                      <TableCell className="font-mono text-xs">{row.latest}</TableCell>
                      <TableCell className={statusClass(row.status)}>{row.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              </>
            ) : (
              <p className="text-sm text-ok">Rien à décider.</p>
            )}

            {behind > 0 ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  {behind} mise{behind > 1 ? "s" : ""} à jour encore dans la contrainte
                </summary>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {report.behind.map((row) => (
                    <li key={`${row.source}:${row.name}`}>
                      <code className="text-foreground">{row.name}</code> {row.current} → {row.latest}
                    </li>
                  ))}
                </ul>
              </details>
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
