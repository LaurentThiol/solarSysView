"use client"

import { Loader2, Pin, RefreshCw, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { VARIABLE_LABELS } from "@/lib/analysis"
import { formatSpecialistHandle, type SpecialistRecord } from "@/lib/brain/specialists"
import {
  formatForecast,
  skillWindows,
  targetGlyph,
  verdictTone,
  type TargetGlyphKind,
} from "@/lib/brain/specialist-view"
import { cn } from "@/lib/utils"

function targetLabel(target: string) {
  return (VARIABLE_LABELS as Record<string, string>)[target] ?? target
}

export function SpecialistGlyph({ kind, className }: { kind: TargetGlyphKind; className?: string }) {
  const ink = "currentColor"
  return (
    <svg viewBox="0 0 32 32" className={cn("size-10 shrink-0", className)} aria-hidden>
      <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="oklch(0.82 0.12 85 / 0.12)" stroke="oklch(0.82 0.12 85 / 0.45)" />
      {kind === "parity" ? (
        <>
          <circle cx="11.5" cy="16" r="4.2" fill="none" stroke={ink} strokeWidth="1.6" />
          <circle cx="20.5" cy="16" r="4.2" fill={ink} />
        </>
      ) : kind === "sum" ? (
        <>
          <path d="M9 22V10h3.2L16 16.2 19.8 10H23v12h-2.4V13.2L16.6 20h-1.2L11.4 13.2V22H9Z" fill={ink} />
        </>
      ) : kind === "spread" ? (
        <>
          <path d="M7 16h18" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M7 12v8M25 12v8" stroke={ink} strokeWidth="1.7" strokeLinecap="round" />
        </>
      ) : kind === "consecutive" ? (
        <>
          <circle cx="9" cy="16" r="2.4" fill={ink} />
          <circle cx="16" cy="16" r="2.4" fill={ink} />
          <circle cx="23" cy="16" r="2.4" fill={ink} />
          <path d="M11.4 16h2.2M18.4 16h2.2" stroke={ink} strokeWidth="1.4" />
        </>
      ) : kind === "high_low" ? (
        <>
          <path d="M10 20V12M22 20v-5" stroke={ink} strokeWidth="2" strokeLinecap="round" />
          <path d="M8 12h4M20 15h4" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
        </>
      ) : kind === "centroid" ? (
        <>
          <circle cx="16" cy="16" r="7" fill="none" stroke={ink} strokeWidth="1.5" />
          <circle cx="16" cy="16" r="2.1" fill={ink} />
        </>
      ) : kind === "rank" ? (
        <>
          {[8, 12, 16, 20, 24].map((x, i) => (
            <circle key={x} cx={x} cy="16" r={i === 2 ? 2.6 : 1.7} fill={ink} opacity={i === 2 ? 1 : 0.45} />
          ))}
        </>
      ) : kind === "gap" ? (
        <>
          <rect x="7" y="12" width="6" height="8" rx="1.4" fill={ink} />
          <rect x="19" y="12" width="6" height="8" rx="1.4" fill={ink} />
        </>
      ) : kind === "star" ? (
        <path
          d="M16 8.2 17.7 13h5.1l-4.1 3 1.6 4.8L16 17.8 11.7 20.8 13.3 16l-4.1-3h5.1L16 8.2Z"
          fill={ink}
        />
      ) : (
        <>
          <circle cx="11" cy="13" r="2" fill={ink} />
          <circle cx="21" cy="13" r="2" fill={ink} />
          <circle cx="16" cy="21" r="2" fill={ink} />
          <path d="M12.8 14.2 14.6 19.2M19.2 14.2 17.4 19.2M13 13h6" stroke={ink} strokeWidth="1.3" />
        </>
      )}
    </svg>
  )
}

function SkillMeters({ record }: { record: SpecialistRecord }) {
  const rows = skillWindows(record)
  return (
    <div className="flex flex-col gap-1.5" aria-label="Score vs hasard, fenêtres 20 50 100">
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Score vs hasard</p>
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[1.6rem_1fr_2.6rem] items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">{row.key}</span>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/25" />
            {row.bar.side !== "empty" && row.bar.side !== "zero" ? (
              <div
                className={cn(
                  "absolute inset-y-0 rounded-full",
                  row.bar.side === "pos" ? "bg-chart-3" : "bg-destructive/80"
                )}
                style={{ left: `${row.bar.leftPct}%`, width: `${row.bar.widthPct}%` }}
              />
            ) : null}
          </div>
          <span className="text-right font-mono text-[10px] text-muted-foreground">{row.bar.display}</span>
        </div>
      ))}
    </div>
  )
}

function ForecastPanel({ record }: { record: SpecialistRecord }) {
  const forecast = record.last_forecast ?? record.forecast
  const view = formatForecast(forecast)
  const proba = view.proba
  const showProba = (record.task === "classes" || record.task === "binary") && proba != null && proba.length > 1
  const maxP = showProba && proba ? Math.max(...proba, 1e-6) : 1
  return (
    <div
      className={cn(
        "rounded-xl border px-2.5 py-2",
        view.abstain ? "border-dashed border-border bg-muted/20" : "border-primary/25 bg-primary/8"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Prévision t+1</p>
        {view.abstain ? (
          <span className="rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground">s’abstient</span>
        ) : null}
      </div>
      <p className="mt-0.5 font-mono text-sm text-foreground">{view.summary}</p>
      {view.confidencePct != null ? (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${view.confidencePct}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground">{view.confidencePct}%</span>
        </div>
      ) : null}
      {showProba && proba ? (
        <div className="mt-2 flex h-10 items-end gap-0.5" aria-label="Probabilités de classes">
          {proba.map((p, i) => (
            <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5">
              <div
                className="w-full rounded-sm bg-primary/70"
                style={{ height: `${Math.max(12, (p / maxP) * 70)}%` }}
                title={`${i} · ${Math.round(p * 100)}%`}
              />
              <span className="text-[9px] leading-none text-muted-foreground">{i}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function SpecialistCard({
  record,
  highlighted,
  inferring,
  onPin,
  onInfer,
  onDelete,
}: {
  record: SpecialistRecord
  highlighted?: boolean
  inferring?: boolean
  onPin: () => void
  onInfer: () => void
  onDelete: () => void
}) {
  const tone = verdictTone(record.verdict)
  const glyph = targetGlyph(record.target)
  const handle = formatSpecialistHandle(record.slug || record.handle)

  return (
    <article
      data-specialist-card={record.slug}
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border px-3 py-2.5",
        highlighted ? "border-primary/45 bg-primary/8" : "border-border/70 bg-card/40"
      )}
    >
      <div className="flex items-start gap-2.5">
        <SpecialistGlyph kind={glyph} className="text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-medium">{record.name || record.slug}</h3>
            {record.verdict ? (
              <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium", tone.className)}>
                {record.verdict}
              </span>
            ) : null}
          </div>
          <p className="truncate font-mono text-[11px] text-primary">{handle}</p>
          <Badge variant="outline" className="mt-1">
            {targetLabel(record.target)}
          </Badge>
        </div>
      </div>

      <SkillMeters record={record} />
      <ForecastPanel record={record} />

      {record.indicators?.length ? (
        <div className="flex flex-wrap gap-1">
          {record.indicators.slice(0, 6).map((id) => (
            <span key={id} className="rounded-full border border-border/70 px-1.5 py-px text-[10px] text-muted-foreground">
              {id}
            </span>
          ))}
          {record.indicators.length > 6 ? (
            <span className="text-[10px] text-muted-foreground">+{record.indicators.length - 6}</span>
          ) : null}
        </div>
      ) : null}

      {record.instructions ? (
        <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">{record.instructions}</p>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-1">
        <Button size="xs" variant="outline" onClick={onPin}>
          <Pin />
          Épingler
        </Button>
        <Button size="xs" variant="outline" disabled={inferring} onClick={onInfer}>
          {inferring ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Réinférer
        </Button>
        <Button size="icon-xs" variant="ghost" title="Supprimer" className="ml-auto" onClick={onDelete}>
          <Trash2 />
        </Button>
      </div>
    </article>
  )
}
