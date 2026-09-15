"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { LogOut } from "lucide-react"

import { CaptureButton } from "@/components/capture"
import { HelpModeToggle, HelpWrap, WithHelp } from "@/components/help"
import { Button } from "@/components/ui/button"
import { isLocalHost } from "@/lib/api-base"
import { formatSyncStamp } from "@/lib/draws"
import { FIRING_EVENT, readLastFiring, type StoredFiring } from "@/lib/morpho/store"

type GitPayload = {
  ok: boolean
  status?: "up_to_date" | "behind" | "ahead" | "diverged" | "unavailable"
  sha?: string | null
  current_short?: string | null
  branch?: string | null
  dirty?: boolean
  ahead?: number
  behind?: number
  error?: string
}

type StartupPayload = {
  frontend: { ok: boolean }
  backend: { ok: boolean; url?: string; error?: string }
  neon: {
    ok?: boolean
    connected?: boolean
    configured?: boolean
    latency_ms?: number
    host?: string
    waking?: boolean
    error?: string
  }
  git: GitPayload
  draws: number | null
  latest: { draw_date?: string } | null
  last_sync?: { finished_at?: string; status?: string } | null
  stale?: boolean | null
  expected_draw_date?: string | null
  quitAvailable?: boolean
}

type Tone = "ok" | "warn" | "err" | "off" | "load"

function Pill({
  label,
  detail,
  tone,
  onClick,
  title,
}: {
  label: string
  detail?: string
  tone: Tone
  onClick: () => void
  title?: string
}) {
  const tones: Record<Tone, string> = {
    ok: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
    warn: "border-amber-400/40 bg-amber-400/15 text-amber-200",
    err: "border-red-500/40 bg-red-500/15 text-red-200",
    off: "border-border bg-muted/40 text-muted-foreground",
    load: "border-border bg-muted/20 text-muted-foreground",
  }
  const dots: Record<Tone, string> = {
    ok: "bg-emerald-400",
    warn: "bg-amber-400",
    err: "bg-red-400",
    off: "bg-muted-foreground/50",
    load: "bg-muted-foreground/40 animate-pulse",
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || "Retester"}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide ${tones[tone]}`}
    >
      <span className={`size-1.5 rounded-full ${dots[tone]}`} />
      <span>{label}</span>
      {detail ? <span className="font-normal opacity-80">{detail}</span> : null}
    </button>
  )
}

export function StartupStatus() {
  const router = useRouter()
  const pathname = usePathname()
  const [data, setData] = useState<StartupPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [quitting, setQuitting] = useState(false)
  const [quitDone, setQuitDone] = useState(false)
  const [localApp, setLocalApp] = useState(false)
  const [ensuring, setEnsuring] = useState(false)

  useEffect(() => {
    setLocalApp(isLocalHost(window.location.hostname))
  }, [])

  const refresh = useCallback(async (opts?: { git?: boolean; silent?: boolean }) => {
    try {
      const query = opts?.git ? "?refresh=1" : ""
      const response = await fetch(`/api/startup${query}`, { cache: "no-store" })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      setData((await response.json()) as StartupPayload)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "échec")
      if (!opts?.silent) setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refresh()
    }, 0)
    const neonId = window.setInterval(() => {
      void refresh({ silent: true })
    }, 20_000)
    const gitId = window.setInterval(() => {
      void refresh({ git: true, silent: true })
    }, 300_000)
    const onFocus = () => {
      void refresh({ silent: true })
    }
    window.addEventListener("focus", onFocus)
    return () => {
      window.clearTimeout(t)
      window.clearInterval(neonId)
      window.clearInterval(gitId)
      window.removeEventListener("focus", onFocus)
    }
  }, [refresh])

  const onNeon = useCallback(async () => {
    if (ensuring) return
    const stale = Boolean(data?.stale)
    if (localApp && stale) {
      setEnsuring(true)
      try {
        await fetch("/api/sync/ensure", { method: "POST", cache: "no-store" })
        window.dispatchEvent(new Event("synchro:sync-ensure"))
      } catch {
        // le rattrapage peut échouer si FDJ/Neon sont lents
      } finally {
        setEnsuring(false)
      }
    }
    await refresh({ silent: true })
  }, [data?.stale, ensuring, localApp, refresh])

  const quit = useCallback(async () => {
    if (quitting) return
    const confirmed = window.confirm(
      "Quitter Synchro ? L’API et l’interface vont s’arrêter."
    )
    if (!confirmed) return
    setQuitting(true)
    try {
      await fetch("/api/shutdown", { method: "POST", cache: "no-store" })
    } catch {
      // le serveur peut déjà être coupé
    } finally {
      setQuitDone(true)
    }
  }, [quitting])

  const showQuit =
    localApp && !quitDone && data?.quitAvailable !== false

  const quitButton =
    showQuit ? (
      <WithHelp
        help={{
          title: "Quitter",
          body: "Arrête l’API et l’interface Synchro. Disponible seulement en local. Une confirmation est demandée.",
        }}
      >
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={quitting}
          onClick={() => void quit()}
          title="Quitter le programme"
          aria-label="Quitter le programme"
          className="h-[26px] rounded-full px-2.5 text-[11px] font-medium tracking-wide"
        >
          <LogOut data-icon="inline-start" />
          {quitting ? "Arrêt…" : "Quitter"}
        </Button>
      </WithHelp>
    ) : null

  const overlay = quitDone ? (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-6">
      <div className="max-w-sm text-center">
        <p className="text-lg font-medium tracking-tight">Synchro est arrêté</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Vous pouvez fermer cet onglet.
        </p>
      </div>
    </div>
  ) : null

  if (loading && !data) {
    return (
      <>
        {overlay}
        <div className="flex flex-wrap items-center gap-2">
          <HelpWrap
            help={{
              title: "API",
              body: "Cliquez pour retester l’API. Vert = backend joignable et tirages chargés.",
            }}
          >
            <Pill label="API" tone="load" onClick={() => void refresh()} />
          </HelpWrap>
          <HelpWrap
            help={{
              title: "Neon",
              body: "Cliquez pour retester PostgreSQL Neon. En local, si les tirages sont en retard, un clic lance aussi le rattrapage.",
            }}
          >
            <Pill label="Neon" tone="load" onClick={() => void refresh()} />
          </HelpWrap>
          <HelpWrap
            help={{
              title: "GitHub",
              body: "Compare le clone local à origin. Si une mise à jour est disponible, ouvre Admin.",
            }}
          >
            <Pill
              label="GitHub"
              tone="load"
              onClick={() => void refresh({ git: true })}
            />
          </HelpWrap>
          {quitButton}
        </div>
      </>
    )
  }

  if (error || !data) {
    return (
      <>
        {overlay}
        <div className="flex flex-wrap items-center gap-2">
          <HelpWrap
            help={{
              title: "Statut",
              body: "L’API de statut est injoignable. Cliquez pour réessayer.",
            }}
          >
            <Pill
              label="Statut"
              detail={error || "injoignable"}
              tone="err"
              onClick={() => void refresh()}
            />
          </HelpWrap>
          {quitButton}
        </div>
      </>
    )
  }

  const apiTone: Tone = data.backend.ok ? "ok" : "err"
  const apiDetail = data.backend.ok
    ? data.draws != null
      ? `${data.draws} tirages`
      : "vivante"
    : data.backend.error || "arrêtée"

  const neonOk = Boolean(data.neon.ok || data.neon.connected)
  const maj = formatSyncStamp(data.last_sync?.finished_at)
  let neonTone: Tone = "off"
  let neonDetail = "non configuré"
  if (neonOk && data.neon.waking) {
    neonTone = "warn"
    neonDetail = ensuring ? "rattrapage…" : "réveil"
  } else if (neonOk && data.stale) {
    neonTone = "warn"
    neonDetail = ensuring ? "rattrapage…" : maj ? `en retard · ${maj}` : "en retard"
  } else if (neonOk) {
    neonTone = "ok"
    neonDetail = maj
      ? `MAJ ${maj}`
      : data.neon.latency_ms != null
        ? `${data.neon.latency_ms} ms`
        : data.latest?.draw_date || "en ligne"
  } else if (data.neon.configured) {
    neonTone = "err"
    neonDetail = "hors ligne"
  }

  const neonTitle = [
    neonOk ? "Neon en ligne" : data.neon.error || "Neon",
    data.neon.host ? data.neon.host : null,
    data.latest?.draw_date ? `dernier tirage ${data.latest.draw_date}` : null,
    data.neon.latency_ms != null ? `${data.neon.latency_ms} ms` : null,
    data.stale && data.expected_draw_date
      ? `attendu ${data.expected_draw_date}`
      : null,
    localApp && data.stale
      ? "cliquer pour rattraper les tirages"
      : "cliquer pour retester",
  ]
    .filter(Boolean)
    .join(" · ")

  let gitTone: Tone = "off"
  let gitDetail = "inconnu"
  const git = data.git
  if (git.ok) {
    if (git.status === "behind" || (git.behind ?? 0) > 0) {
      gitTone = "warn"
      gitDetail =
        (git.behind ?? 0) > 0
          ? `${git.behind} à tirer`
          : "mise à jour"
    } else if (git.status === "ahead" || git.status === "diverged") {
      gitTone = "warn"
      gitDetail = git.status === "ahead" ? "commits locaux" : "divergé"
    } else if (git.dirty) {
      gitTone = "warn"
      gitDetail = "modifs locales"
    } else if (git.status === "unavailable") {
      gitTone = "off"
      gitDetail = "hors ligne"
    } else {
      gitTone = "ok"
      gitDetail = `${git.current_short || git.sha || "ok"}${git.branch ? ` · ${git.branch}` : ""}`
    }
  }

  const onGithub = () => {
    void refresh({ git: true })
    const behind = git.status === "behind" || git.status === "diverged" || (git.behind ?? 0) > 0
    if (behind && pathname !== "/admin") {
      router.push("/admin#github")
    }
  }

  return (
    <>
      {overlay}
      <div className="flex flex-wrap items-center gap-2">
        <HelpWrap
          help={{
            title: "API",
            body: "Cliquez pour retester l’API. Vert = backend joignable. Le détail indique le nombre de tirages chargés.",
          }}
        >
          <Pill
            label="API"
            detail={apiDetail}
            tone={apiTone}
            onClick={() => void refresh()}
          />
        </HelpWrap>
        <HelpWrap
          help={{
            title: "Neon",
            body: `${neonTitle}. En local, un clic sur un indicateur « en retard » rattrape les tirages FDJ.`,
          }}
        >
          <Pill
            label="Neon"
            detail={neonDetail}
            tone={neonTone}
            title={neonTitle}
            onClick={() => void onNeon()}
          />
        </HelpWrap>
        <HelpWrap
          help={{
            title: "GitHub",
            body: "Compare le clone à origin (retest au focus et toutes les 5 min). En retard : cliquez pour ouvrir Admin et tirer la mise à jour.",
          }}
        >
          <Pill
            label="GitHub"
            detail={gitDetail}
            tone={gitTone}
            title="Contrôler origin (Admin si une mise à jour est disponible)"
            onClick={onGithub}
          />
        </HelpWrap>
        <MorphoFiringPill />
        <LocalLlmPill />
        {quitButton}
      </div>
    </>
  )
}

function MorphoFiringPill() {
  const router = useRouter()
  const [firing, setFiring] = useState<StoredFiring | null>(() =>
    typeof window === "undefined" ? null : readLastFiring()
  )
  useEffect(() => {
    const onFire = (event: Event) => {
      const detail = (event as CustomEvent<StoredFiring>).detail
      setFiring(detail ?? readLastFiring())
    }
    window.addEventListener(FIRING_EVENT, onFire)
    return () => window.removeEventListener(FIRING_EVENT, onFire)
  }, [])
  if (!firing) return null
  return (
    <HelpWrap
      help={{
        title: "Alerte Morpho",
        body: `La règle « ${firing.name} » s’est déclenchée${firing.draw_date ? ` sur le tirage ${firing.draw_date}` : ""}. Cliquez pour ouvrir Morpho.`,
      }}
    >
      <Pill
        label="Morpho"
        detail={firing.name}
        tone="warn"
        title={`${firing.name} · ${firing.draw_date ?? ""}`}
        onClick={() => router.push("/morpho")}
      />
    </HelpWrap>
  )
}

function LocalLlmPill() {
  const router = useRouter()
  const [local, setLocal] = useState<"ok" | "off" | "load">("load")
  const [host, setHost] = useState("Ollama")
  const [detail, setDetail] = useState("off")

  useEffect(() => {
    let cancelled = false

    const pingBases = async (bases: string[]): Promise<{ ok: true; host: string } | null> => {
      const unique = [...new Set(bases.filter(Boolean))]
      for (const base of unique) {
        const normalized = base.replace(/\/$/, "")
        const origin = /^https?:\/\//i.test(normalized) ? normalized : `http://${normalized}`
        for (const path of ["/api/tags", "/v1/models", "/api/version"]) {
          try {
            const response = await fetch(`${origin}${path}`, {
              cache: "no-store",
              signal: AbortSignal.timeout(1_200),
            })
            if (response.ok) return { ok: true, host: origin.replace(/^https?:\/\//, "") }
          } catch {
            /* CORS or down */
          }
        }
      }
      return null
    }

    const jsonPing = async (
      url: string
    ): Promise<{ ok: boolean; host?: string; error?: string } | null> => {
      try {
        const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) })
        const payload = (await response.json()) as {
          local?: boolean
          ollama?: { ok?: boolean; host?: string; error?: string }
          localHost?: string
          error?: string
          ok?: boolean
        }
        if (payload.ollama?.ok) {
          return { ok: true, host: payload.ollama.host }
        }
        if (payload.local) {
          return { ok: true, host: payload.localHost }
        }
        return {
          ok: false,
          host: payload.ollama?.host || payload.localHost,
          error: payload.ollama?.error || payload.error,
        }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "injoignable" }
      }
    }

    const ping = async () => {
      const [browser, iaLocal, brain] = await Promise.all([
        pingBases(["http://127.0.0.1:11434", "http://localhost:11434"]),
        jsonPing("/api/ia/local"),
        jsonPing("/api/brain/status"),
      ])
      if (cancelled) return
      let hit = browser ?? (iaLocal?.ok ? iaLocal : null) ?? (brain?.ok ? brain : null)
      if (!hit?.ok) {
        const advertised = iaLocal?.host || brain?.host
        if (advertised && !/11434/.test(advertised)) {
          const extra = await pingBases([advertised])
          if (extra) hit = extra
        }
      }
      if (hit?.ok) {
        setLocal("ok")
        if (hit.host) setHost(hit.host.replace(/^https?:\/\//, ""))
        setDetail(hit.host ? hit.host.replace(/^https?:\/\//, "") : "ok")
        return
      }
      setLocal("off")
      const err = iaLocal?.error || brain?.error
      setDetail("off")
      setHost(err ? err.slice(0, 80) : "Ollama")
    }
    void ping()
    const id = window.setInterval(() => void ping(), 15_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  return (
    <HelpWrap
      help={{
        title: "LLM local",
        body: "Ollama (ou llama-server) sur cette machine. Brain l’utilise par défaut. Un 404 Ollama ne bascule jamais sur Gemini / OpenAI. Sur Netlify la pastille reste éteinte.",
      }}
    >
      <Pill
        label="LLM local"
        detail={local === "ok" ? detail : "off"}
        tone={local === "load" ? "load" : local === "ok" ? "ok" : "off"}
        title={
          local === "ok"
            ? `Joignable · ${host}`
            : host && host !== "Ollama"
              ? `Injoignable — ${host}`
              : "Injoignable — pas de bascule cloud"
        }
        onClick={() => router.push("/brain")}
      />
    </HelpWrap>
  )
}

const NAV_ITEMS = [
  {
    href: "/tirage",
    label: "Tirage",
    help: {
      title: "Tirage",
      body: "Archives EuroMillions : filtrer par mois ou par numéros, puis exporter en CSV.",
    },
  },
  {
    href: "/evolution",
    label: "Évolution",
    help: {
      title: "Évolution",
      body: "Courbes dans le temps, suivi pair/impair, forme de la grille (décennies, étendue, consécutifs), classements. Accès protégé par mot de passe admin.",
    },
  },
  {
    href: "/analyse",
    label: "Analyse",
    help: {
      title: "Analyse",
      body: "Laboratoire : indicateurs, numéros, hasard, probabilités. Tous les onglets lisent la même fenêtre de tirages.",
    },
  },
  {
    href: "/combinaisons",
    label: "Combinaisons",
    help: {
      title: "Combinaisons",
      body: "Composer, proposer et comparer des grilles EuroMillions. Retards et totaux pour choisir ; score = proba de gain (loi officielle + rétro-test), pas un pronostic.",
    },
  },
  {
    href: "/jeux",
    label: "Jeux",
    help: {
      title: "Jeux",
      body: "Compteur combinatoire : somme, parité, étendue, consécutifs, décennies et chances. Intersection avec les propositions de Combinaisons. Ce n’est pas un pronostic.",
    },
  },
  {
    href: "/morpho",
    label: "Morpho",
    help: {
      title: "Morpho",
      body: "Glyphes 5×10, lexique de formes, voisins visuels, Moondream, règles QUAND/ALORS et anticipation.",
    },
  },
  {
    href: "/relief",
    label: "Relief",
    help: {
      title: "Relief",
      body: "Une ligne n1→n5 par tirage. Boule ou point. Zoom plus serré à 100/200. Calque rangs dans le temps. Tiges masquables. Le glyphe 5×10 reste Morpho.",
    },
  },
  {
    href: "/chartisme",
    label: "Chartisme",
    help: {
      title: "Chartisme",
      body: "Figures chartistes sur les courbes du logiciel : détection, annotation dessinée, atelier d'étiquetage, règles descriptives et rétro-test contre le hasard. Ne touche pas aux grilles.",
    },
  },
  {
    href: "/harmo",
    label: "Harmo",
    help: {
      title: "Harmo",
      body: "Étude harmonique des séries de tirages : mélange réseau / mécanique / acoustique, FFT, STFT, Hilbert. Unités en cycles/tirage, pas des hertz. Décrit le tracé, pas le prochain tirage.",
    },
  },
  {
    href: "/brain",
    label: "Brain",
    help: {
      title: "Brain",
      body: "Catalog nommé (@rsi, @ete…), journal daté, mémoire locale et agent manuel. LLM local (Ollama) par défaut ; Gemini / OpenAI seulement si tu escalades. L’onglet IA reste la lecture de captures.",
    },
  },
  {
    href: "/ia",
    label: "IA",
    help: {
      title: "IA",
      body: "Lecture d’une capture : visuel du laboratoire plus les données de la fenêtre. Gemini ou OpenAI, puis le modèle. Historique local : renommer, épingler, exporter (Markdown / JSON / PDF) ou supprimer. Décrit l’archive, ne pronostique pas.",
    },
  },
  {
    href: "/admin",
    label: "Admin",
    help: {
      title: "Admin",
      body: "Secrets Neon / API, tests de connexion, mises à jour GitHub et synchro FDJ → Postgres.",
    },
  },
] as const

export function SiteHeader() {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-4">
          <HelpWrap
            help={{
              title: "Synchro",
              body: "Retour à l’accueil : page Tirage, archives FDJ filtrables et export CSV.",
            }}
          >
            <Link
              href="/tirage"
              className="text-xs font-medium tracking-[0.2em] text-primary uppercase"
            >
              Synchro
            </Link>
          </HelpWrap>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Sections">
            {NAV_ITEMS.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <HelpWrap key={item.href} help={item.help}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`text-xs ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {item.label}
                  </Link>
                </HelpWrap>
              )
            })}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CaptureButton />
          <HelpModeToggle />
          <StartupStatus />
        </div>
      </div>
    </header>
  )
}
