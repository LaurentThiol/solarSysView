"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react"

import { HelpTip, WithHelp } from "@/components/help"
import { AdminLlmCard } from "@/components/admin-llm-card"
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
import { formatSyncStamp } from "@/lib/draws"

type GitCommit = {
  sha: string
  short: string
  message: string
  html_url: string | null
}

type GitStatus = {
  ok: boolean
  status: "up_to_date" | "behind" | "ahead" | "diverged" | "unavailable"
  sha: string | null
  current_short: string | null
  current_message: string | null
  branch: string | null
  dirty: boolean
  ahead: number
  behind: number
  remote_short: string | null
  remote_url: string | null
  html_url: string | null
  commits: GitCommit[]
  can_apply: boolean
  apply_hint: string
  error?: string
}

type ServiceId = "neon" | "google" | "openai" | "brave"

type ServiceSnap = {
  id: ServiceId
  label: string
  envKey: string
  consoleUrl: string
  consoleLabel: string
  docsUrl: string
  description: string
  placeholder: string
  configured: boolean
  hint: string
  host: string | null
  user: string | null
  database: string | null
  pooled: boolean
  value: string
  password: string
}

type AdminPayload = {
  authenticated: boolean
  needsPassword: boolean
  local: boolean
  writable: boolean
  netlify: boolean
  services: ServiceSnap[]
  github: GitStatus
  neon: {
    ok?: boolean
    connected?: boolean
    configured?: boolean
    latency_ms?: number
    host?: string
    error?: string
  }
  draws: number | null
  latest?: { draw_date?: string } | null
  last_sync?: { finished_at?: string; status?: string } | null
  stale?: boolean | null
  expected_draw_date?: string | null
}

type TestResult = { ok: boolean; detail: string }

function StatusDot({ ok, configured }: { ok: boolean; configured: boolean }) {
  const tone = ok
    ? "bg-ok"
    : configured
      ? "bg-err"
      : "bg-muted-foreground/50"
  return <span className={`inline-block size-2 rounded-full ${tone}`} />
}

function SecretRow({
  label,
  value,
  placeholder,
  disabled,
  onChange,
  help,
}: {
  label: string
  value: string
  placeholder: string
  disabled: boolean
  onChange: (value: string) => void
  help: { title: string; body: string }
}) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        <HelpTip {...help} />
      </label>
      <div className="flex min-w-0 gap-2">
        <Input
          type={visible ? "text" : "password"}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          data-1p-ignore="true"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="font-mono text-xs"
        />
        <WithHelp
          help={{
            title: visible ? "Masquer" : "Afficher",
            body: visible
              ? "Repasse le champ en puces pour éviter qu’un regard indiscret lise le secret."
              : "Affiche le secret en clair dans ce champ uniquement (il n’est pas recopié ailleurs).",
          }}
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            title={visible ? "Masquer" : "Afficher"}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <EyeOff /> : <Eye />}
          </Button>
        </WithHelp>
        <WithHelp
          help={{
            title: "Copier",
            body: "Copie la valeur actuelle du champ dans le presse-papiers de ce navigateur.",
          }}
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="Copier"
            disabled={!value}
            onClick={() => void copy()}
          >
            <Copy />
          </Button>
        </WithHelp>
      </div>
      {copied ? <p className="text-xs text-ok">Copié</p> : null}
    </div>
  )
}

export function AdminPanel() {
  const [data, setData] = useState<AdminPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [drafts, setDrafts] = useState<Record<string, { value: string; password: string }>>({})
  const [tests, setTests] = useState<Record<string, TestResult | "loading">>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [gitBusy, setGitBusy] = useState(false)
  const [gitMsg, setGitMsg] = useState<string | null>(null)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const load = useCallback(async (refreshGit = false) => {
    const response = await fetch(`/api/admin${refreshGit ? "?refresh=1" : ""}`, {
      cache: "no-store",
    })
    const payload = (await response.json()) as AdminPayload
    setError(null)
    setData(payload)
    setDrafts((prev) => {
      const next = { ...prev }
      for (const service of payload.services) {
        if (!next[service.id]) {
          next[service.id] = { value: service.value, password: service.password }
        }
      }
      return next
    })
    return payload
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load().catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "échec")
      })
    }, 0)
    return () => window.clearTimeout(t)
  }, [load])

  async function login() {
    setError(null)
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
    const payload = (await response.json()) as { ok?: boolean; error?: string }
    if (!response.ok) {
      setError(payload.error || "Mot de passe incorrect")
      return
    }
    setPassword("")
    await load(true)
  }

  async function save(id: ServiceId, opts?: { clear?: boolean }) {
    setSaving(id)
    setError(null)
    try {
      const draft = drafts[id] || { value: "", password: "" }
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: id,
          value: draft.value,
          password: id === "neon" ? draft.password : undefined,
          clear: opts?.clear,
        }),
      })
      const payload = (await response.json()) as {
        ok?: boolean
        error?: string
        service?: ServiceSnap
      }
      if (!response.ok) {
        setError(payload.error || "Enregistrement impossible")
        return
      }
      if (payload.service) {
        setDrafts((prev) => ({
          ...prev,
          [id]: { value: payload.service!.value, password: payload.service!.password },
        }))
        setTests((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
      await load()
    } finally {
      setSaving(null)
    }
  }

  async function test(id: ServiceId) {
    setTests((prev) => ({ ...prev, [id]: "loading" }))
    const draft = drafts[id]
    const response = await fetch("/api/admin/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: id, value: draft?.value }),
    })
    const payload = (await response.json()) as TestResult
    setTests((prev) => ({ ...prev, [id]: payload }))
  }

  async function refreshGit() {
    setGitBusy(true)
    setGitMsg(null)
    try {
      await load(true)
    } finally {
      setGitBusy(false)
    }
  }

  async function applyGit() {
    setGitBusy(true)
    setGitMsg(null)
    try {
      const response = await fetch("/api/github", { method: "POST" })
      const payload = (await response.json()) as { ok: boolean; message: string }
      setGitMsg(payload.message)
      await load()
    } finally {
      setGitBusy(false)
    }
  }

  async function syncFdj() {
    setSyncBusy(true)
    setSyncMsg(null)
    try {
      const response = await fetch("/api/admin/sync", { method: "POST" })
      const payload = (await response.json()) as {
        ok?: boolean
        error?: string
        fetched?: number
        upserted?: number
      }
      if (!response.ok) {
        setSyncMsg(payload.error || "Synchro FDJ impossible")
        return
      }
      setSyncMsg(`${payload.fetched ?? 0} tirages lus, ${payload.upserted ?? 0} écrits.`)
      await load()
    } finally {
      setSyncBusy(false)
    }
  }

  if (error && !data) {
    return <p className="text-sm text-err">{error}</p>
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Chargement des services…</p>
  }

  if (!data.authenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Accès admin</CardTitle>
          <CardDescription>
            {data.needsPassword
              ? "Entrez ADMIN_PASSWORD pour afficher les clés."
              : "Définissez ADMIN_PASSWORD dans .env (ou ouvrez l’UI en local sur 127.0.0.1)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex max-w-md flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              Mot de passe admin
              <HelpTip
                title="Mot de passe admin"
                body="Saisissez ADMIN_PASSWORD (fichier .env). La touche Entrée ou le bouton Entrer envoie la requête. En local sur 127.0.0.1, le mot de passe peut être facultatif."
              />
            </span>
            <Input
              type="password"
              placeholder="ADMIN_PASSWORD"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void login()
              }}
            />
          </label>
          <WithHelp
            help={{
              title: "Entrer",
              body: "Vérifie le mot de passe puis affiche les clés, Neon, GitHub et la synchro FDJ.",
            }}
          >
            <Button type="button" onClick={() => void login()}>
              Entrer
            </Button>
          </WithHelp>
          {error ? <p className="text-sm text-err">{error}</p> : null}
        </CardContent>
      </Card>
    )
  }

  const github = data.github
  const gitLabel =
    github.status === "up_to_date"
      ? "à jour"
      : github.status === "behind"
        ? github.behind
          ? `${github.behind} commit${github.behind > 1 ? "s" : ""} en retard`
          : "mise à jour disponible"
        : github.status === "ahead"
          ? "commits locaux non poussés"
          : github.status === "diverged"
            ? "historique divergé"
            : "indisponible"

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {error ? <p className="text-sm text-err">{error}</p> : null}
      {!data.writable ? (
        <p className="text-sm text-warn">
          Déploiement Netlify : les secrets se lisent depuis les variables d’environnement du
          site. L’écriture dans <code>.env</code> n’est pas persistante.
        </p>
      ) : null}

      <Card id="github">
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Mises à jour GitHub</CardTitle>
              <CardDescription>
                Compare le clone local avec{" "}
                <code>origin/{github.branch || "main"}</code>
                {github.remote_url ? (
                  <>
                    {" "}
                    (
                    <a
                      className="underline underline-offset-2"
                      href={github.remote_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {github.remote_url.replace("https://github.com/", "")}
                    </a>
                    )
                  </>
                ) : null}
                . Le bandeau reteste au focus et toutes les 5 minutes.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <WithHelp
                help={{
                  title: "Contrôler",
                  body: "Relit origin/main (ou la branche suivie) et met à jour le statut : à jour, en retard, divergé, modifications locales.",
                }}
              >
                <Button
                  type="button"
                  variant="outline"
                  disabled={gitBusy}
                  onClick={() => void refreshGit()}
                >
                  <RefreshCw />
                  {gitBusy ? "Contrôle…" : "Contrôler"}
                </Button>
              </WithHelp>
              <WithHelp
                help={{
                  title: "Mettre à jour",
                  body: "Tire les commits distants sur le clone local (git pull / fast-forward). Désactivé s’il y a des commits locaux non poussés, un historique divergé, ou si l’écriture n’est pas autorisée.",
                }}
              >
                <Button
                  type="button"
                  disabled={gitBusy || !github.can_apply}
                  onClick={() => void applyGit()}
                >
                  Mettre à jour
                </Button>
              </WithHelp>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
          <p className="text-sm">
            Statut{" "}
            <strong
              className={
                github.status === "up_to_date"
                  ? "text-ok"
                  : github.status === "behind"
                    ? "text-warn"
                    : "text-err"
              }
            >
              {gitLabel}
            </strong>
          </p>
          <p className="text-sm">
            Local{" "}
            <strong>
              {github.current_short || "—"}
              {github.dirty ? " · modifié" : ""}
            </strong>
          </p>
          <p className="text-sm">
            GitHub <strong>{github.remote_short || "—"}</strong>
          </p>
          <p className="text-sm">
            Branche <strong>{github.branch || "—"}</strong>
          </p>
          {github.commits.length > 0 ? (
            <ul className="sm:col-span-2 space-y-1 text-sm text-muted-foreground">
              {github.commits.map((commit) => (
                <li key={commit.sha}>
                  {commit.html_url ? (
                    <a
                      className="font-mono text-foreground underline underline-offset-2"
                      href={commit.html_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {commit.short}
                    </a>
                  ) : (
                    <code>{commit.short}</code>
                  )}{" "}
                  {commit.message}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            {gitMsg || github.apply_hint || github.error || "Commande équivalente : ./launch update"}
          </p>
        </CardContent>
      </Card>

      <Card id="neon-status">
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Connexion Neon</CardTitle>
              <CardDescription>
                Indicateur du bandeau : vert = <code>SELECT 1</code> ok. Latence élevée =
                réveil du compute.
              </CardDescription>
            </div>
            <WithHelp
              help={{
                title: "Retester Neon",
                body: "Exécute SELECT 1 sur l’URI enregistrée et affiche latence, hôte, et éventuellement l’erreur. Ne modifie pas les données.",
              }}
            >
              <Button
                type="button"
                variant="outline"
                onClick={() => void test("neon")}
                disabled={tests.neon === "loading"}
              >
                {tests.neon === "loading" ? "Contrôle…" : "Retester Neon"}
              </Button>
            </WithHelp>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-3">
          <p className="text-sm">
            Neon{" "}
            <strong>
              {data.neon.ok || data.neon.connected
                ? "en ligne"
                : data.neon.configured
                  ? "hors ligne"
                  : "non configuré"}
            </strong>
          </p>
          <p className="text-sm">
            Hôte <strong>{data.neon.host || "—"}</strong>
          </p>
          <p className="text-sm">
            Latence{" "}
            <strong>
              {data.neon.latency_ms != null ? `${data.neon.latency_ms} ms` : "—"}
            </strong>
          </p>
          <p className="text-sm">
            Tirages <strong>{data.draws ?? "—"}</strong>
          </p>
          <p className="text-sm">
            Dernier tirage{" "}
            <strong>{data.latest?.draw_date || "—"}</strong>
          </p>
          <p className="text-sm">
            Dernière MAJ{" "}
            <strong>
              {formatSyncStamp(data.last_sync?.finished_at) || "—"}
            </strong>
          </p>
          {data.stale ? (
            <p className="sm:col-span-3 text-sm text-warn">
              En retard
              {data.expected_draw_date
                ? ` — tirage attendu ${data.expected_draw_date}`
                : "."}{" "}
              Le bouton ci-dessous importe l’historique complet ; au lancement,{" "}
              <code>./launch</code> rattrape seulement l’archive récente.
            </p>
          ) : null}
          {typeof tests.neon === "object" ? (
            <p className={`sm:col-span-3 text-sm ${tests.neon.ok ? "text-ok" : "text-err"}`}>
              {tests.neon.detail}
            </p>
          ) : data.neon.error ? (
            <p className="sm:col-span-3 text-sm text-err">{data.neon.error}</p>
          ) : null}
        </CardContent>
      </Card>

      <AdminLlmCard />

      <div className="grid gap-4 lg:grid-cols-2">
        {data.services.map((service) => {
          const draft = drafts[service.id] || { value: "", password: "" }
          const testResult = tests[service.id]
          return (
            <Card key={service.id} id={service.id}>
              <CardHeader className="border-b">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <StatusDot ok={service.configured} configured={service.configured} />
                    <CardTitle>{service.label}</CardTitle>
                  </div>
                  <Badge variant={service.configured ? "default" : "outline"}>
                    {service.configured ? "enregistré" : "manquant"}
                  </Badge>
                </div>
                <CardDescription>{service.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 pt-4">
                <div className="flex flex-wrap gap-3 text-sm">
                  <a
                    className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
                    href={service.consoleUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {service.consoleLabel}
                    <ExternalLink className="size-3" />
                  </a>
                  <a
                    className="inline-flex items-center gap-1 text-muted-foreground underline underline-offset-2"
                    href={service.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    documentation
                  </a>
                </div>
                <p className="font-mono text-xs text-muted-foreground">{service.envKey}</p>
                {service.id === "neon" && service.host ? (
                  <p className="text-xs text-muted-foreground">
                    {service.user}@{service.host}/{service.database}
                    {service.pooled ? " · pooled" : ""}
                  </p>
                ) : null}
                <SecretRow
                  label={service.id === "neon" ? "URI Neon" : "Clé / mot de passe"}
                  help={
                    service.id === "neon"
                      ? {
                          title: "URI Neon",
                          body: "Collez l’URI postgres://… (idéalement pooled). Si un mot de passe est déjà dans l’URI, le champ dédié ci-dessous peut le remplacer. Enregistrer écrit dans .env en local.",
                        }
                      : {
                          title: "Clé / mot de passe",
                          body: `Valeur de ${service.envKey}. Collez-la puis Enregistrer. Tester vérifie la clé sans l’écrire si le champ est vide (utilise la valeur déjà enregistrée).`,
                        }
                  }
                  value={draft.value}
                  placeholder={
                    service.configured
                      ? `Enregistré : ${service.hint} — coller pour remplacer`
                      : service.placeholder
                  }
                  disabled={!data.writable || saving === service.id}
                  onChange={(value) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [service.id]: { ...draft, value },
                    }))
                  }
                />
                {service.id === "neon" ? (
                  <SecretRow
                    label="Mot de passe Neon"
                    help={{
                      title: "Mot de passe Neon",
                      body: "Mot de passe npg_… extrait ou injecté dans l’URI. Utile si vous collez une URI sans mot de passe puis le secret à part.",
                    }}
                    value={draft.password}
                    placeholder={
                      service.password
                        ? "Présent dans l’URI — coller un nouveau npg_… pour le remplacer"
                        : "npg_…"
                    }
                    disabled={!data.writable || saving === service.id}
                    onChange={(value) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [service.id]: { ...draft, password: value },
                      }))
                    }
                  />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <WithHelp
                    help={{
                      title: "Enregistrer",
                      body: "Écrit la valeur dans .env (local) ou signale que Netlify ne persiste pas l’écriture. Le secret n’est jamais commité.",
                    }}
                  >
                    <Button
                      type="button"
                      disabled={!data.writable || saving === service.id}
                      onClick={() => void save(service.id)}
                    >
                      {saving === service.id ? "Enregistrement…" : "Enregistrer"}
                    </Button>
                  </WithHelp>
                  <WithHelp
                    help={{
                      title: "Tester",
                      body: "Ping le service avec le brouillon du champ (ou la valeur déjà enregistrée). N’écrit rien dans .env.",
                    }}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      disabled={testResult === "loading"}
                      onClick={() => void test(service.id)}
                    >
                      Tester
                    </Button>
                  </WithHelp>
                  {service.configured ? (
                    <WithHelp
                      help={{
                        title: "Effacer",
                        body: "Supprime la variable de .env en local. Irréversible sauf à recoller la valeur. Sur Netlify, gérez plutôt les variables du site.",
                      }}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={!data.writable || saving === service.id}
                        onClick={() => void save(service.id, { clear: true })}
                      >
                        Effacer
                      </Button>
                    </WithHelp>
                  ) : null}
                </div>
                {typeof testResult === "object" ? (
                  <p className={`text-sm ${testResult.ok ? "text-ok" : "text-err"}`}>
                    {testResult.detail}
                  </p>
                ) : service.configured ? (
                  <p className="text-xs text-ok">Enregistré et conservé : {service.hint}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Non enregistré — collez la valeur, puis Enregistrer.
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Synchro FDJ → Neon</CardTitle>
          <CardDescription>
            Télécharge les 6 archives publiques (historique complet) et les écrit
            dans PostgreSQL. Équivalent de <code>python -m synchro sync</code>.
            Au démarrage, <code>./launch</code> appelle{" "}
            <code>python -m synchro ensure</code> (archive récente seulement).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <WithHelp
            help={{
              title: "Lancer une synchro FDJ",
              body: "Télécharge les 6 archives publiques EuroMillions et les écrit dans Neon (historique complet). Plus long que le rattrapage au démarrage (./launch ensure).",
            }}
          >
            <Button type="button" variant="outline" disabled={syncBusy} onClick={() => void syncFdj()}>
              {syncBusy ? "Synchronisation…" : "Lancer une synchro FDJ"}
            </Button>
          </WithHelp>
          {syncMsg ? <p className="text-sm text-muted-foreground">{syncMsg}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
