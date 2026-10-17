"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { JournalTimeline } from "@/components/journal/journal-timeline"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  areasIn,
  filterJournal,
  formatJournalDay,
  journalPoints,
  lanesFor,
  timelinePoints,
  type JournalEntry,
} from "@/lib/journal"

type Draft = { area: string; title: string; body: string; prNumber: string; prUrl: string }

const EMPTY_DRAFT: Draft = { area: "", title: "", body: "", prNumber: "", prUrl: "" }

export function JournalPanel() {
  const [items, setItems] = useState<JournalEntry[]>([])
  const [readonly, setReadonly] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [area, setArea] = useState("Toutes")
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    const response = await fetch("/api/journal", { cache: "no-store" })
    const payload = (await response.json()) as {
      items?: JournalEntry[]
      readonly?: boolean
      error?: string
    }
    if (!response.ok) {
      throw new Error(payload.error || "Journal indisponible")
    }
    setItems(payload.items ?? [])
    setReadonly(Boolean(payload.readonly))
    setNotice(
      payload.readonly
        ? "Lecture des fichiers du dépôt. L’API locale ne répond pas : les éditions déjà enregistrées dans Neon ne s’affichent pas."
        : null
    )
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "échec")
        })
        .finally(() => setLoading(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const visible = useMemo(() => filterJournal(items, query, area), [items, query, area])
  const lanes = useMemo(() => lanesFor(visible), [visible])
  const points = useMemo(() => timelinePoints(visible, lanes), [visible, lanes])
  const zoneOptions = useMemo(() => areasIn(items), [items])

  function select(slug: string) {
    setSelected(slug)
    window.setTimeout(() => {
      document.getElementById(`journal-${slug}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 0)
  }

  function startEdit(entry: JournalEntry) {
    setCreating(false)
    setEditing(entry.slug)
    setDraft({
      area: entry.area,
      title: entry.title,
      body: entry.body,
      prNumber: "",
      prUrl: "",
    })
  }

  async function saveEdit(entry: JournalEntry) {
    if (entry.id == null) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/journal/${entry.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          area: draft.area,
          title: draft.title,
          body: draft.body,
        }),
      })
      const payload = (await response.json()) as { item?: JournalEntry; error?: string }
      const saved = payload.item
      if (!response.ok || !saved) throw new Error(payload.error || "Enregistrement refusé")
      setItems((current) => current.map((item) => (item.id === saved.id ? saved : item)))
      setEditing(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "échec")
    } finally {
      setBusy(false)
    }
  }

  async function hide(entry: JournalEntry) {
    if (entry.id == null) return
    if (!window.confirm("Masquer cette fiche ? Elle ne reviendra pas au prochain import.")) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/journal/${entry.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hidden: true }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error || "Masquage refusé")
      setItems((current) => current.filter((item) => item.id !== entry.id))
      if (selected === entry.slug) setSelected(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "échec")
    } finally {
      setBusy(false)
    }
  }

  async function createEntry() {
    setBusy(true)
    setError(null)
    const prNumber = draft.prNumber.trim() ? Number(draft.prNumber) : null
    try {
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          area: draft.area,
          title: draft.title,
          body: draft.body,
          happened_on: new Date().toLocaleDateString("en-CA"),
          pr_number: prNumber != null && Number.isInteger(prNumber) ? prNumber : null,
          pr_url: draft.prUrl.trim() || null,
        }),
      })
      const payload = (await response.json()) as { item?: JournalEntry; error?: string }
      const created = payload.item
      if (!response.ok || !created) throw new Error(payload.error || "Création refusée")
      setItems((current) => [created, ...current])
      setCreating(false)
      setDraft(EMPTY_DRAFT)
      select(created.slug)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "échec")
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Chargement du journal…</p>

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <JournalTimeline points={points} lanes={lanes} selectedSlug={selected} onSelect={select} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Zone, titre, texte ou n° de PR"
          aria-label="Rechercher dans le journal"
          className="sm:max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Zone
          <select
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground"
            value={area}
            onChange={(event) => setArea(event.target.value)}
          >
            <option value="Toutes">Toutes</option>
            {zoneOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-muted-foreground">
          {visible.length} fiche{visible.length > 1 ? "s" : ""}
        </p>
        <div className="sm:ml-auto">
          <Button
            type="button"
            variant="outline"
            disabled={readonly}
            onClick={() => {
              setEditing(null)
              setCreating((open) => !open)
              setDraft(EMPTY_DRAFT)
            }}
          >
            Nouvelle entrée
          </Button>
        </div>
      </div>

      {creating ? (
        <Card>
          <CardHeader>
            <CardTitle>Nouvelle fiche</CardTitle>
          </CardHeader>
          <CardContent>
            <EntryForm
              draft={draft}
              setDraft={setDraft}
              busy={busy}
              showPr
              onCancel={() => setCreating(false)}
              onSave={() => void createEntry()}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3">
        {visible.map((entry) => {
          const prs = journalPoints(entry)
          const marked = selected === entry.slug
          return (
            <Card
              key={entry.slug}
              id={`journal-${entry.slug}`}
              className={marked ? "ring-2 ring-primary" : undefined}
            >
              <CardHeader>
                <CardTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span>{entry.title}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {entry.area} · {formatJournalDay(entry.happened_on)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {editing === entry.slug ? (
                  <EntryForm
                    draft={draft}
                    setDraft={setDraft}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSave={() => void saveEdit(entry)}
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-6">{entry.body}</p>
                )}
                {prs.length > 0 ? (
                  <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {prs.map((pr) =>
                      pr.url ? (
                        <a
                          key={pr.number}
                          className="underline underline-offset-2 hover:text-foreground"
                          href={pr.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          #{pr.number}
                        </a>
                      ) : (
                        <span key={pr.number}>#{pr.number}</span>
                      )
                    )}
                  </p>
                ) : null}
                {editing !== entry.slug ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={readonly || entry.id == null}
                      onClick={() => startEdit(entry)}
                    >
                      Modifier
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={readonly || entry.id == null || busy}
                      onClick={() => void hide(entry)}
                    >
                      Masquer
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )
        })}
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune fiche.</p>
        ) : null}
      </div>
    </div>
  )
}

function EntryForm({
  draft,
  setDraft,
  busy,
  showPr = false,
  onCancel,
  onSave,
}: {
  draft: Draft
  setDraft: (draft: Draft) => void
  busy: boolean
  showPr?: boolean
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
    >
          <Input
            aria-label="Zone de la fiche"
            placeholder="Zone"
        value={draft.area}
        onChange={(event) => setDraft({ ...draft, area: event.target.value })}
      />
      <Input
        aria-label="Titre"
        placeholder="Titre"
        value={draft.title}
        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
      />
      <textarea
        aria-label="Texte"
        className="min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        value={draft.body}
        onChange={(event) => setDraft({ ...draft, body: event.target.value })}
      />
      {showPr ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Numéro de PR"
            placeholder="N° de PR"
            inputMode="numeric"
            value={draft.prNumber}
            onChange={(event) => setDraft({ ...draft, prNumber: event.target.value })}
          />
          <Input
            aria-label="Lien de la PR"
            placeholder="Lien de la PR"
            value={draft.prUrl}
            onChange={(event) => setDraft({ ...draft, prUrl: event.target.value })}
          />
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          Enregistrer
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  )
}
