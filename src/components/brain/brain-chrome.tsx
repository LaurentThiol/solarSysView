"use client"

import type { BrainLab } from "@/lib/brain/catalog"
import type { WalkerJobStatus, WorkingKind } from "@/lib/brain/types"
import { cn } from "@/lib/utils"

export const BRAIN_FAMILY_LABELS: Record<string, string> = {
  momentum: "Momentum",
  tendance: "Tendance",
  volatilite: "Volatilité",
  moyennes: "Moyennes",
  niveaux: "Niveaux",
  flux: "Flux",
  variable: "Séries",
  figure: "Figures",
  tf: "Spectres",
  acoustique: "Peigne",
  motif: "Motifs",
  grille: "Grille",
  specialiste: "Spécialistes",
}

export const KIND_LABELS: Record<WorkingKind, string> = {
  pin: "épinglé",
  current: "en cours",
  lot: "lot",
  memory: "souvenir",
  shortlist: "sélection",
}

export const JOB_STATUS_LABELS: Record<WalkerJobStatus, string> = {
  queued: "en file",
  running: "lit…",
  resolved: "lu",
  skipped: "passé",
  flagged: "à relire",
  error: "souci",
}

export const WALKER_STATUS_LABELS: Record<string, string> = {
  idle: "prêt",
  running: "en train de lire",
  paused: "en pause",
  done: "terminé",
  error: "souci",
}

export const STARTER_QUESTIONS = [
  "Que disent @rsi et @adx sur cette fenêtre ?",
  "Lis @ete : figure complète, ou juste une ressemblance ?",
  "@fft : quelle raie est lisible, laquelle est un artefact de fenêtre ?",
  "Cite la prévision du spécialiste épinglé : valeur, σ, score vs hasard 20/50/100. Une grille 5+2, si vous en proposez une, est une hypothèse séparée.",
]

export const LAB_TONE: Record<BrainLab, string> = {
  analyse: "border-chart-1/40 bg-chart-1/15 text-foreground",
  chartisme: "border-chart-2/40 bg-chart-2/15 text-foreground",
  harmo: "border-chart-3/40 bg-chart-3/15 text-foreground",
  morpho: "border-chart-5/40 bg-chart-5/15 text-foreground",
  combinaisons: "border-chart-4/40 bg-chart-4/15 text-foreground",
  specialist: "border-primary/40 bg-primary/15 text-foreground",
}

export const KIND_TONE: Record<WorkingKind, string> = {
  pin: "border-primary/45 bg-primary/12",
  memory: "border-chart-5/45 bg-chart-5/12",
  current: "border-chart-2/45 bg-chart-2/12",
  lot: "border-chart-4/45 bg-chart-4/12",
  shortlist: "border-chart-3/45 bg-chart-3/12",
}

export function familyLabel(family: string) {
  return BRAIN_FAMILY_LABELS[family] ?? family
}

export function LabChip({ lab, className }: { lab: BrainLab; className?: string }) {
  const labels: Record<BrainLab, string> = {
    analyse: "Analyse",
    chartisme: "Chartisme",
    harmo: "Harmo",
    morpho: "Morpho",
    combinaisons: "Combinaisons",
    specialist: "Spécialistes",
  }
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium",
        LAB_TONE[lab],
        className
      )}
    >
      {labels[lab]}
    </span>
  )
}

export function StatusDot({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
        ok
          ? "border-chart-3/40 bg-chart-3/15 text-foreground"
          : "border-border bg-muted/40 text-muted-foreground"
      )}
      title={hint}
    >
      <span className={cn("size-1.5 rounded-full", ok ? "bg-chart-3" : "bg-muted-foreground/60")} />
      {label}
    </span>
  )
}
