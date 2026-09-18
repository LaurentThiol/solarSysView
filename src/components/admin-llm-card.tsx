"use client"

import { useCallback, useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatSyncStamp } from "@/lib/draws"

type UsageRow = {
  surface: string
  provider: string
  surface_label: string
  provider_label: string
  status: "idle" | "ok" | "err" | string
  model: string | null
  ok: number
  err: number
  prompt_tokens: number
  completion_tokens: number
  estimated: boolean
  latency_p50_ms: number | null
  last_ok_at: string | null
  last_error: string | null
  last_at: string | null
}

type UsageEvent = {
  created_at: string
  surface: string
  provider: string
  model: string
  ok: boolean
  error?: string | null
  prompt_tokens?: number | null
  completion_tokens?: number | null
  estimated?: boolean
  latency_ms?: number | null
}

type UsagePayload = {
  ok?: boolean
  error?: string
  source?: string
  health?: {
    ollama?: { ok?: boolean; host?: string; models?: string[]; error?: string }
    envModel?: string | null
    chatModel?: string | null
    vlm?: { ok?: boolean; model?: string | null }
    embed?: { ok?: boolean; model?: string }
    lastLocalOkAt?: string | null
    localeOk?: boolean
  }
  rows?: UsageRow[]
  recent?: UsageEvent[]
}

function formatCount(value: number | null | undefined) {
  if (value == null) return "—"
  return new Intl.NumberFormat("fr-FR").format(value)
}

function statusLabel(status: string) {
  if (status === "ok") return "ok"
  if (status === "err") return "erreur"
  return "jamais"
}

function StatusDot({ status }: { status: string }) {
  const tone =
    status === "ok" ? "bg-ok" : status === "err" ? "bg-err" : "bg-muted-foreground/50"
  return <span className={`inline-block size-2 rounded-full ${tone}`} />
}

function surfaceName(surface: string) {
  if (surface === "brain") return "Brain"
  if (surface === "ia") return "IA"
  if (surface === "morpho") return "Morpho"
  if (surface === "embed") return "Embed"
  if (surface === "ping") return "Ping"
  return surface
}

export function AdminLlmCard() {
  const [data, setData] = useState<UsagePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pingBusy, setPingBusy] = useState(false)
  const [pingMsg, setPingMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const response = await fetch("/api/llm/usage", { cache: "no-store" })
      const payload = (await response.json()) as UsagePayload
      if (!response.ok) {
        setError(payload.error || "Journal LLM indisponible")
        return
      }
      setError(null)
      setData(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Journal LLM indisponible")
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function ping() {
    setPingBusy(true)
    setPingMsg(null)
    try {
      const response = await fetch("/api/llm/ping", { method: "POST", cache: "no-store" })
      const payload = (await response.json()) as {
        ok?: boolean
        error?: string
        model?: string
        latency_ms?: number
      }
      if (!payload.ok) {
        setPingMsg(payload.error || "Ping local impossible")
      } else {
        setPingMsg(
          `Generate ok${payload.model ? ` · ${payload.model}` : ""}${
            payload.latency_ms != null ? ` · ${payload.latency_ms} ms` : ""
          }`
        )
      }
      await load()
    } catch (err) {
      setPingMsg(err instanceof Error ? err.message : "Ping local impossible")
    } finally {
      setPingBusy(false)
    }
  }

  const health = data?.health
  const ollamaOk = Boolean(health?.ollama?.ok)
  const models = health?.ollama?.models ?? []
  const localeOk = Boolean(health?.localeOk)
  const rows = data?.rows ?? []
  const recent = data?.recent ?? []

  return (
    <Card id="llm-usage">
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>LLM et locales</CardTitle>
            <CardDescription>
              Santé live d’Ollama / llama-server, puis jetons et succès des 24 dernières
              heures. Un compteur à zéro signifie « jamais utilisé », pas forcément « cassé ».
              Locale OK = probe vert et au moins un generate/chat local réussi.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <WithHelp
              help={{
                title: "Actualiser",
                body: "Relit le journal (Neon ou fichier .brain/llm-usage.json) et re-ping Ollama pour la liste des modèles.",
              }}
            >
              <Button type="button" variant="outline" disabled={busy || pingBusy} onClick={() => void load()}>
                <RefreshCw />
                {busy ? "Lecture…" : "Actualiser"}
              </Button>
            </WithHelp>
            <WithHelp
              help={{
                title: "Ping generate",
                body: "Envoie un generate d’un jeton sur le modèle de chat local. C’est le vrai test : /api/tags ne suffit pas à savoir si le modèle répond.",
              }}
            >
              <Button type="button" disabled={busy || pingBusy} onClick={() => void ping()}>
                {pingBusy ? "Ping…" : "Ping generate"}
              </Button>
            </WithHelp>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 pt-4">
        {error ? <p className="text-sm text-err">{error}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <p className="text-sm">
            Ollama{" "}
            <strong className={ollamaOk ? "text-ok" : "text-err"}>
              {ollamaOk ? "en ligne" : "hors ligne"}
            </strong>
          </p>
          <p className="text-sm">
            Hôte <strong>{health?.ollama?.host || "—"}</strong>
          </p>
          <p className="text-sm">
            Chat{" "}
            <strong>
              {health?.chatModel || health?.envModel || "—"}
            </strong>
          </p>
          <p className="text-sm">
            Locale{" "}
            <strong className={localeOk ? "text-ok" : "text-warn"}>
              {localeOk ? "OK" : "à confirmer"}
            </strong>
          </p>
          <p className="text-sm">
            VLM Morpho{" "}
            <strong className={health?.vlm?.ok ? "text-ok" : "text-muted-foreground"}>
              {health?.vlm?.ok ? health.vlm.model || "prêt" : "absent"}
            </strong>
          </p>
          <p className="text-sm">
            Embeddings{" "}
            <strong className={health?.embed?.ok ? "text-ok" : "text-muted-foreground"}>
              {health?.embed?.ok ? health.embed.model : "nomic-embed-text absent"}
            </strong>
          </p>
          <p className="text-sm">
            Dernier local OK{" "}
            <strong>{formatSyncStamp(health?.lastLocalOkAt) || "—"}</strong>
          </p>
          <p className="text-sm">
            Journal <strong>{data?.source === "neon" ? "Neon" : data?.source === "file" ? "fichier local" : "—"}</strong>
          </p>
        </div>
        {health?.ollama?.error ? (
          <p className="text-sm text-err">{health.ollama.error}</p>
        ) : null}
        {models.length ? (
          <p className="text-xs text-muted-foreground">
            Modèles listés : {models.slice(0, 12).join(", ")}
            {models.length > 12 ? "…" : ""}
          </p>
        ) : null}
        {pingMsg ? (
          <p className={`text-sm ${pingMsg.startsWith("Generate ok") ? "text-ok" : "text-err"}`}>{pingMsg}</p>
        ) : null}

        <div>
          <p className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
            Usage 24 h
            <HelpTip
              title="Usage 24 h"
              body="Chaque ligne est une surface × backend. Les jetons cloud (Gemini / OpenAI) servent à comparer, pas à diagnostiquer Ollama. Les Spécialistes numpy et CLIP navigateur ne sont pas des LLM."
            />
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Surface</TableHead>
                <TableHead>Backend</TableHead>
                <TableHead>Modèle</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Ok / ko</TableHead>
                <TableHead>Jetons in / out</TableHead>
                <TableHead>Latence p50</TableHead>
                <TableHead>Dernier OK</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.surface}-${row.provider}`}>
                  <TableCell>{row.surface_label}</TableCell>
                  <TableCell>{row.provider_label}</TableCell>
                  <TableCell className="font-mono text-xs">{row.model || "—"}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      <StatusDot status={row.status} />
                      {statusLabel(row.status)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {formatCount(row.ok)} / {formatCount(row.err)}
                  </TableCell>
                  <TableCell>
                    {formatCount(row.prompt_tokens)} / {formatCount(row.completion_tokens)}
                    {row.estimated ? (
                      <Badge variant="outline" className="ml-1">
                        estimé
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {row.latency_p50_ms != null ? `${formatCount(row.latency_p50_ms)} ms` : "—"}
                  </TableCell>
                  <TableCell title={row.last_error || undefined}>
                    {formatSyncStamp(row.last_ok_at) || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div>
          <p className="mb-2 text-xs text-muted-foreground">20 derniers appels</p>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun appel enregistré pour l’instant.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quand</TableHead>
                  <TableHead>Surface</TableHead>
                  <TableHead>Modèle</TableHead>
                  <TableHead>Résultat</TableHead>
                  <TableHead>Jetons</TableHead>
                  <TableHead>ms</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((item, index) => (
                  <TableRow key={`${item.created_at}-${item.surface}-${index}`}>
                    <TableCell>{formatSyncStamp(item.created_at) || "—"}</TableCell>
                    <TableCell>{surfaceName(item.surface)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.model || item.provider}
                    </TableCell>
                    <TableCell className={item.ok ? "text-ok" : "text-err"}>
                      {item.ok ? "ok" : item.error || "erreur"}
                    </TableCell>
                    <TableCell>
                      {formatCount(item.prompt_tokens ?? 0)} / {formatCount(item.completion_tokens ?? 0)}
                    </TableCell>
                    <TableCell>{item.latency_ms != null ? formatCount(item.latency_ms) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
