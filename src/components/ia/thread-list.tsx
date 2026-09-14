"use client"

import { useMemo, useRef, useState } from "react"
import {
  Download,
  FileJson,
  FileText,
  Pencil,
  Pin,
  PinOff,
  Search,
  Trash2,
  Upload,
} from "lucide-react"

import { HelpTip } from "@/components/help"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { snapshotThumb } from "@/lib/capture/images"
import { formatCapturedAt, labLabel } from "@/lib/capture/snapshot"
import { filterThreads, type IaThread } from "@/lib/capture/store"
import { modelLabel, providerLabel, type IaModelOption } from "@/lib/ia/models"

export function IaThreadList({
  threads,
  activeId,
  models,
  onOpen,
  onRename,
  onDelete,
  onPin,
  onExportMarkdown,
  onExportJson,
  onExportAll,
  onImportFile,
  onClearAll,
}: {
  threads: IaThread[]
  activeId: string | null
  models: IaModelOption[]
  onOpen: (thread: IaThread) => void
  onRename: (id: string, title: string) => boolean
  onDelete: (id: string) => void
  onPin: (id: string) => void
  onExportMarkdown: (thread: IaThread) => void
  onExportJson: (thread: IaThread) => void
  onExportAll: () => void
  onImportFile: (file: File) => void
  onClearAll: () => void
}) {
  const [query, setQuery] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  const skipBlur = useRef(false)
  const filtered = useMemo(() => filterThreads(threads, query), [threads, query])

  function startRename(thread: IaThread) {
    setEditingId(thread.id)
    setDraftTitle(thread.title)
  }

  function commitRename() {
    if (skipBlur.current) {
      skipBlur.current = false
      return
    }
    if (!editingId) return
    if (!draftTitle.trim()) {
      setEditingId(null)
      setDraftTitle("")
      return
    }
    const ok = onRename(editingId, draftTitle)
    if (ok) {
      setEditingId(null)
      setDraftTitle("")
    }
  }

  function cancelRename() {
    skipBlur.current = true
    setEditingId(null)
    setDraftTitle("")
  }

  return (
    <aside className="flex flex-col gap-2">
      <p className="inline-flex items-center gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Captures
        <HelpTip
          title="Historique"
          body="Les lectures restent dans ce navigateur. Tu peux les renommer, les épingler (elles ne tombent pas de la liste), les exporter (Markdown, JSON, PDF) ou les supprimer. Un JSON réimporte le fil, y compris sur une autre machine."
          items={[
            {
              label: "Plafond",
              text: "Huit lectures non épinglées. Les épinglées s’ajoutent par-dessus.",
            },
            {
              label: "Export",
              text: "Markdown pour relire, JSON pour sauvegarder / réimporter. Le PDF du fil inclut la conversation.",
            },
          ]}
        />
      </p>

      {threads.length ? (
        <label className="relative block">
          <Search className="pointer-events-none absolute top-2 left-2 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrer…"
            aria-label="Filtrer les lectures"
            className="h-7 pl-7 text-xs"
          />
        </label>
      ) : null}

      {threads.length === 0 ? (
        <p className="text-xs text-muted-foreground">Pas encore d’historique.</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun fil pour « {query.trim()} ».</p>
      ) : (
        filtered.map((thread) => {
          const thumb = snapshotThumb(thread.snapshot)
          const editing = editingId === thread.id
          return (
            <article
              key={thread.id}
              className={`rounded-lg border px-2 py-2 ${
                activeId === thread.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              <button
                type="button"
                onClick={() => onOpen(thread)}
                disabled={editing}
                className="flex w-full items-start gap-2 text-left text-xs leading-4 hover:text-foreground disabled:opacity-80"
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    className="h-12 w-16 shrink-0 rounded border border-border object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded border border-dashed border-border text-[10px]">
                    —
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-start gap-1">
                    {thread.pinned ? (
                      <Pin className="mt-0.5 size-3 shrink-0 text-foreground" aria-hidden />
                    ) : null}
                    <span className="block font-medium text-foreground">{thread.title}</span>
                  </span>
                  <span className="mt-0.5 block opacity-80">
                    {labLabel(thread.snapshot.lab)}
                    {thread.snapshot.tab ? ` · ${thread.snapshot.tab}` : ""}
                    {" · "}
                    {providerLabel(thread.provider)}
                    {thread.model ? ` · ${modelLabel(thread.model, models)}` : ""}
                  </span>
                  <span className="mt-0.5 block opacity-70">
                    {formatCapturedAt(thread.updatedAt)}
                    {thread.messages.length
                      ? ` · ${thread.messages.filter((item) => item.role === "user").length} question${
                          thread.messages.filter((item) => item.role === "user").length > 1 ? "s" : ""
                        }`
                      : ""}
                  </span>
                </span>
              </button>

              {editing ? (
                <Input
                  value={draftTitle}
                  autoFocus
                  aria-label="Nouveau titre"
                  className="mt-2 h-7 text-xs"
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      commitRename()
                    }
                    if (event.key === "Escape") cancelRename()
                  }}
                  onBlur={commitRename}
                />
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title={thread.pinned ? "Désépingler" : "Épingler"}
                    aria-label={thread.pinned ? "Désépingler" : "Épingler"}
                    onClick={() => onPin(thread.id)}
                  >
                    {thread.pinned ? <PinOff /> : <Pin />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title="Renommer"
                    aria-label="Renommer"
                    onClick={() => startRename(thread)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title="Exporter en Markdown"
                    aria-label="Exporter en Markdown"
                    onClick={() => onExportMarkdown(thread)}
                  >
                    <FileText />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title="Exporter en JSON"
                    aria-label="Exporter en JSON"
                    onClick={() => onExportJson(thread)}
                  >
                    <FileJson />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title="Supprimer"
                    aria-label="Supprimer"
                    onClick={() => onDelete(thread.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </article>
          )
        })
      )}

      <div className="mt-1 flex flex-col gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) onImportFile(file)
          }}
        />
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => fileRef.current?.click()}
          >
            <Upload data-icon="inline-start" />
            Importer
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!threads.length}
            onClick={onExportAll}
          >
            <Download data-icon="inline-start" />
            Tout exporter
          </Button>
        </div>
        {threads.length ? (
          <button
            type="button"
            className="text-left text-[11px] text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
            onClick={onClearAll}
          >
            Tout effacer
          </button>
        ) : null}
      </div>
    </aside>
  )
}
