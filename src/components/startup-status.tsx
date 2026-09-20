"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { LogOut, Menu, X } from "lucide-react"

import { CaptureButton } from "@/components/capture"
import { AddressButton, GlossaryButton, HelpModeToggle, HelpWrap, WithHelp } from "@/components/help"
import { SITE_HEADER_SLOT_ID } from "@/components/site-header-slot"
import { StatusPill, worstStatusTone, type StatusTone } from "@/components/status-pill"
import { Button } from "@/components/ui/button"
import { isNavItemActive, pageTitleForPath, NAV_GROUPS } from "@/lib/nav"
import { isLocalHost } from "@/lib/api-base"
import { formatSyncStamp } from "@/lib/draws"
import { localLlmOffMessage } from "@/lib/ia/local-url"
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

type Tone = StatusTone

function HealthCluster({
  tone,
  children,
}: {
  tone: StatusTone
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  const detail =
    tone === "ok"
      ? "ok"
      : tone === "warn"
        ? "attention"
        : tone === "err"
          ? "erreur"
          : tone === "load"
            ? "…"
            : undefined

  return (
    <div className="relative shrink-0" ref={box}>
      <StatusPill
        label="Santé"
        detail={detail}
        tone={tone}
        aria-expanded={open}
        aria-haspopup="true"
        title="API, Neon, GitHub, LLM local — cliquer pour le détail"
        onClick={() => setOpen((value) => !value)}
      />
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 flex min-w-52 flex-col items-stretch gap-2 rounded-xl border border-border bg-card p-2 shadow-lg">
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function QuitButton() {
  const [quitting, setQuitting] = useState(false)
  const [quitDone, setQuitDone] = useState(false)
  const [localApp, setLocalApp] = useState(false)
  const [quitAvailable, setQuitAvailable] = useState(true)

  useEffect(() => {
    setLocalApp(isLocalHost(window.location.hostname))
  }, [])

  useEffect(() => {
    if (!localApp) return
    let cancelled = false
    void fetch("/api/startup", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: StartupPayload | null) => {
        if (cancelled || payload == null) return
        if (payload.quitAvailable === false) setQuitAvailable(false)
      })
      .catch(() => {
        // garder le bouton visible tant que l’API n’a pas dit non
      })
    return () => {
      cancelled = true
    }
  }, [localApp])

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

  const showQuit = localApp && !quitDone && quitAvailable
  if (!showQuit && !quitDone) return null

  return (
    <>
      {quitDone ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-6">
          <div className="max-w-sm text-center">
            <p className="text-lg font-medium tracking-tight">Synchro est arrêté</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Vous pouvez fermer cet onglet.
            </p>
          </div>
        </div>
      ) : null}
      {showQuit ? (
        <WithHelp
          help={{
            title: "Quitter",
            body: "Arrête l’API et l’interface Synchro. Disponible seulement en local. Une confirmation est demandée.",
          }}
          className="shrink-0"
        >
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={quitting}
            onClick={() => void quit()}
            title="Quitter le programme"
            aria-label="Quitter le programme"
            className="h-[26px] shrink-0 rounded-full px-2.5 text-[11px] font-medium tracking-wide"
          >
            <LogOut data-icon="inline-start" />
            {quitting ? "Arrêt…" : "Quitter"}
          </Button>
        </WithHelp>
      ) : null}
    </>
  )
}

export function StartupStatus() {
  const router = useRouter()
  const pathname = usePathname()
  const [data, setData] = useState<StartupPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [localApp, setLocalApp] = useState(false)
  const [ensuring, setEnsuring] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    setLocalApp(isLocalHost(window.location.hostname))
  }, [])

  const refresh = useCallback(async (opts?: { git?: boolean; silent?: boolean }) => {
    if (inFlight.current) return
    inFlight.current = true
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
      inFlight.current = false
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

  if (loading && !data) {
    return (
      <HealthCluster tone="load">
        <HelpWrap
          help={{
            title: "API",
            body: "Cliquez pour retester l’API. Vert = backend joignable et tirages chargés.",
          }}
        >
          <StatusPill label="API" tone="load" onClick={() => void refresh()} />
        </HelpWrap>
        <HelpWrap
          help={{
            title: "Neon",
            body: "Cliquez pour retester PostgreSQL Neon. En local, si les tirages sont en retard, un clic lance aussi le rattrapage.",
          }}
        >
          <StatusPill label="Neon" tone="load" onClick={() => void refresh()} />
        </HelpWrap>
        <HelpWrap
          help={{
            title: "GitHub",
            body: "Compare le clone local à origin. Si une mise à jour est disponible, ouvre Admin.",
          }}
        >
          <StatusPill
            label="GitHub"
            tone="load"
            onClick={() => void refresh({ git: true })}
          />
        </HelpWrap>
      </HealthCluster>
    )
  }

  if (error || !data) {
    return (
      <HealthCluster tone="err">
        <HelpWrap
          help={{
            title: "Statut",
            body: "L’API de statut est injoignable. Cliquez pour réessayer.",
          }}
        >
          <StatusPill
            label="Statut"
            detail={error || "injoignable"}
            tone="err"
            onClick={() => void refresh()}
          />
        </HelpWrap>
      </HealthCluster>
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

  const clusterTone = worstStatusTone([apiTone, neonTone, gitTone])

  return (
    <HealthCluster tone={clusterTone}>
      <HelpWrap
        help={{
          title: "API",
          body: "Cliquez pour retester l’API. Vert = backend joignable. Le détail indique le nombre de tirages chargés.",
        }}
      >
        <StatusPill
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
        <StatusPill
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
        <StatusPill
          label="GitHub"
          detail={gitDetail}
          tone={gitTone}
          title="Contrôler origin (Admin si une mise à jour est disponible)"
          onClick={onGithub}
        />
      </HelpWrap>
      <MorphoFiringPill />
      <LocalLlmPill />
    </HealthCluster>
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
      <StatusPill
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
      // Same-origin only. `/api/ia/local` already probes Ollama / LM Studio
      // in Node (and Python if present). Browser fetches to 11434/1234/8080
      // would log ERR_CONNECTION_REFUSED; `/api/brain/status` 503 when
      // FastAPI is down would also show in DevTools.
      const iaLocal = await jsonPing("/api/ia/local")
      if (cancelled) return
      if (iaLocal?.ok) {
        setLocal("ok")
        if (iaLocal.host) setHost(iaLocal.host.replace(/^https?:\/\//, ""))
        setDetail(iaLocal.host ? iaLocal.host.replace(/^https?:\/\//, "") : "ok")
        return
      }
      setLocal("off")
      setDetail("off")
      setHost(localLlmOffMessage(iaLocal?.error))
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
        body: "Ollama doit tourner sur cette machine (app Ollama ou « ollama serve »). Brain l’utilise par défaut. Un 404 Ollama ne bascule jamais sur Gemini / OpenAI. Sur Netlify la pastille reste éteinte.",
      }}
    >
      <StatusPill
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


function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  )
}

function FamilyLinks({
  pathname,
  onNavigate,
}: {
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <nav className="flex flex-col gap-4" aria-label="Sections">
      {NAV_GROUPS.map((family) => (
        <div key={family.id} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
            {family.label}
          </p>
          <div className="flex flex-col gap-0.5 pl-4">
            {family.items.map((entry) => {
              const current = isNavItemActive(pathname, entry.href)
              return (
                <HelpWrap key={entry.href} help={entry.help} className="w-full">
                  <Link
                    href={entry.href}
                    aria-current={current ? "page" : undefined}
                    onClick={onNavigate}
                    className={`block rounded-md px-3 py-2 text-sm ${
                      current
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    {entry.label}
                  </Link>
                </HelpWrap>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

export function SiteHeader() {
  const pathname = usePathname()
  const current = { label: pageTitleForPath(pathname) }
  const headerRef = useRef<HTMLElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const [headerH, setHeaderH] = useState(52)

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const update = () => {
      const height = Math.round(el.getBoundingClientRect().height)
      setHeaderH(height)
      document.documentElement.style.setProperty("--site-header-height", `${height}px`)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty("--site-header-height")
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false)
    }
    window.addEventListener("keydown", onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
    }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const root = document.getElementById("site-nav-drawer")
    const active = root?.querySelector<HTMLElement>("[aria-current='page']")
    ;(active ?? root?.querySelector<HTMLElement>("a"))?.focus()
  }, [menuOpen])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "g" && event.key !== "G") return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      setMenuOpen((open) => !open)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur"
    >
      <div className="relative z-10 mx-auto flex w-full min-w-0 max-w-full items-center gap-2 px-[max(1rem,env(safe-area-inset-left))] py-3 pr-[max(1rem,env(safe-area-inset-right))] sm:gap-3 sm:px-6">
        <button
          type="button"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-foreground"
          aria-expanded={menuOpen}
          aria-controls="site-nav-drawer"
          aria-haspopup="dialog"
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          title="Menu des sections — raccourci « g »"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
        <HelpWrap
          help={{
            title: "Synchro",
            body: "Retour à l’accueil : page Tirage, archives FDJ filtrables et export CSV.",
          }}
          className="shrink-0"
        >
          <Link
            href="/tirage"
            className="shrink-0 text-xs font-medium tracking-[0.2em] text-primary uppercase"
          >
            Synchro
          </Link>
        </HelpWrap>
        <span className="hidden h-4 w-px shrink-0 bg-border sm:block" aria-hidden />
        <p
          aria-current="page"
          className="min-w-0 max-w-[8.5rem] truncate text-sm font-medium text-foreground sm:max-w-[14rem]"
        >
          {current.label}
        </p>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none]">
            <CaptureButton />
            <HelpModeToggle />
            <GlossaryButton />
            <AddressButton />
          </div>
          <div className="relative z-20 flex shrink-0 items-center gap-2">
            <StartupStatus />
            <QuitButton />
          </div>
        </div>
      </div>
      <div id={SITE_HEADER_SLOT_ID} />
      {portalReady && menuOpen
        ? createPortal(
            <div
              id="site-nav-drawer"
              className="fixed inset-x-0 bottom-0 z-40"
              style={{ top: headerH }}
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Fermer le menu"
                onClick={() => setMenuOpen(false)}
              />
              <aside
                role="dialog"
                aria-modal="true"
                aria-label="Sections"
                className="relative flex h-full w-[min(20rem,calc(100vw-2.5rem))] flex-col overflow-auto border-r border-border bg-background shadow-2xl"
              >
                <div className="p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <FamilyLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
                </div>
              </aside>
            </div>,
            document.body
          )
        : null}
    </header>
  )
}
