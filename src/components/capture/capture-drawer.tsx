"use client"

import { useState } from "react"
import { Camera } from "lucide-react"

import { StatusPill } from "@/components/status-pill"
import { HelpWrap } from "@/components/help"
import { useCapture } from "@/components/capture/capture-provider"
import { suggestionsFor } from "@/lib/capture/suggestions"
import type { DiagnosticSnapshot } from "@/lib/capture/snapshot"

export function CaptureButton() {
  const { startCapture, capturing, open } = useCapture()
  return (
    <HelpWrap
      help={{
        title: "Capture",
        body: "Enregistre le graphique visible et les données de la fenêtre (série, indicateurs, figures, pics). Envoie le pack à l’onglet IA ou exporte un PDF. Raccourci « c » hors champ de saisie. Désactivé sur Admin (secrets).",
      }}
    >
      <StatusPill
        tone={open || capturing ? "info" : "off"}
        dot={false}
        aria-pressed={open}
        aria-busy={capturing}
        aria-label="Capturer la fenêtre à l’écran"
        title="Capture — visuel + données. Raccourci « c »."
        disabled={capturing}
        onClick={() => void startCapture()}
        label={
          <span className="inline-flex items-center gap-1.5">
            <Camera className="size-3.5" />
            <span className="hidden sm:inline">Capture</span>
          </span>
        }
      />
    </HelpWrap>
  )
}

export function CaptureDrawer() {
  const { open, close, draft, error, sendToIa, downloadPdf } = useCapture()

  if (!open) return null

  const blocked = draft?.blocked

  return (
    <div data-capture-ui className="fixed inset-0 z-[80] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Fermer la capture"
        onClick={close}
      />
      <aside
        role="dialog"
        aria-labelledby="capture-title"
        className="relative flex h-full w-full max-w-md flex-col gap-4 overflow-auto border-l border-border bg-background p-4 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="capture-title" className="text-sm font-semibold tracking-tight">
              Capture
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Zone visible et graphique à l’écran, plus les données de la
              fenêtre. L’IA décrit l’archive, puis peut pronostiquer
              (hypothèse, pas une certitude).
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Fermer
          </button>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        {blocked ? (
          <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs leading-5 text-warn">
            {blocked.reason}
          </p>
        ) : draft ? (
          <CaptureForm
            key={draft.id}
            draft={draft}
            onSend={sendToIa}
            onPdf={downloadPdf}
          />
        ) : (
          <p className="text-xs text-muted-foreground">Aucune capture.</p>
        )}
      </aside>
    </div>
  )
}

function CaptureForm({
  draft,
  onSend,
  onPdf,
}: {
  draft: DiagnosticSnapshot
  onSend: (question: string) => void
  onPdf: (question: string) => void
}) {
  const [question, setQuestion] = useState("")
  const suggestions = suggestionsFor(draft.lab, draft.tab)

  return (
    <>
      {draft.imageDataUrl || draft.thumbDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={draft.imageDataUrl || draft.thumbDataUrl || ""}
          alt="Aperçu de la capture"
          className="max-h-64 w-full rounded-lg border border-border bg-muted/30 object-contain"
        />
      ) : (
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Visuel indisponible (thème CSS). Les données techniques restent dans le pack.
        </p>
      )}
      <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
        {draft.summary.map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ul>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Qu’est-ce que vous ne comprenez pas ?
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={4}
          placeholder="Ex. pourquoi cette cassure, que lit-on sur le RSI, ce pic Harmo est-il un artefact…"
          className="min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
      </label>
      {suggestions.length ? (
        <div className="flex flex-col gap-1.5">
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setQuestion(item)}
              className="rounded-lg border border-border bg-muted/20 px-2.5 py-1.5 text-left text-[11px] leading-4 text-muted-foreground hover:text-foreground"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-auto flex flex-col gap-2">
        <button
          type="button"
          onClick={() => onSend(question)}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Envoyer à l’IA
        </button>
        <button
          type="button"
          onClick={() => onPdf(question)}
          className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Télécharger le PDF
        </button>
      </div>
    </>
  )
}
