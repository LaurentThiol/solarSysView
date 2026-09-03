"use client"

import { useEffect, useMemo, useState } from "react"

import { GlyphBoard, GlyphThumb } from "@/components/morpho/glyph-board"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { anticipateLocal } from "@/lib/morpho/anticipation"
import { clipStatus, cosine, embedGlyph, loadClip } from "@/lib/morpho/clip"
import { analyzeDraw, neighborsOf, type Portrait } from "@/lib/morpho/geometry"
import { MOTIF_IDS, labelOf } from "@/lib/morpho/lexicon"
import {
  draftRuleFromState,
  normalizeRule,
  type MorphoRule,
} from "@/lib/morpho/rules"
import {
  loadFirings,
  loadRules,
  persistFirings,
  runRulesAgainst,
  saveRules,
  type StoredFiring,
} from "@/lib/morpho/store"
import { formatShortDate, type Draw } from "@/lib/draws"
import { useDraws } from "@/lib/use-draws"

type Anticipate = ReturnType<typeof anticipateLocal>

async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(`/api/morpho/${path}`, {
      cache: "no-store",
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
    })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

export function MorphoLab() {
  const [era, setEra] = useState<"current" | "all">("current")
  const { draws, source, loading } = useDraws(era)
  const chrono = useMemo(
    () => [...draws].sort((a, b) => a.date.localeCompare(b.date)),
    [draws]
  )
  const latest = chrono[chrono.length - 1]
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const selected =
    chrono.find((d) => d.date === selectedDate) ?? latest ?? null

  const portrait = useMemo(
    () => (selected ? analyzeDraw(selected) : null),
    [selected]
  )
  const film = useMemo(() => chrono.slice(-16).reverse(), [chrono])
  const geoNeighbors = useMemo(() => {
    if (!portrait) return []
    return neighborsOf(portrait, chrono, 6)
  }, [portrait, chrono])

  const [rules, setRules] = useState<MorphoRule[]>(() => loadRules())
  const [firings, setFirings] = useState<StoredFiring[]>(() => loadFirings())
  const [ruleName, setRuleName] = useState("Persistance")
  const [ruleMotifs, setRuleMotifs] = useState<string[]>([])
  const [anticipation, setAnticipation] = useState<Anticipate | null>(null)
  const [vlm, setVlm] = useState<{
    caption?: string
    queries?: Record<string, string>
    grounding_score?: number | null
    residual?: string | null
    loaded?: boolean
    error?: string
    sequence?: { drift?: string | null; cluster_move?: string | null }
    contrast?: { difference?: string | null }
  } | null>(null)
  const [vlmBusy, setVlmBusy] = useState(false)
  const [clipBusy, setClipBusy] = useState(false)
  const [clipNeighbors, setClipNeighbors] = useState<{ date: string; score: number; numbers: number[]; stars: number[] }[]>(
    []
  )
  const [clipNote, setClipNote] = useState<string | null>(null)

  useEffect(() => {
    void api<{ items: MorphoRule[] }>("rules").then((body) => {
      if (body?.items?.length) {
        const incoming = body.items.map((r) => normalizeRule(r))
        setRules(incoming)
        saveRules(incoming)
      }
    })
  }, [])

  useEffect(() => {
    if (!portrait) return
    const frame = window.requestAnimationFrame(() => {
      const hits = runRulesAgainst(
        {
          date: portrait.date,
          weekday: portrait.weekday,
          motifs: portrait.motifs,
          caption: vlm?.caption ?? portrait.caption,
          queries: vlm?.queries,
          grounding_score: vlm?.grounding_score,
          numbers: portrait.numbers,
          stars: portrait.stars,
        },
        rules
      )
      if (hits.length) setFirings(loadFirings())
    })
    return () => window.cancelAnimationFrame(frame)
  }, [portrait, rules, vlm?.caption, vlm?.queries, vlm?.grounding_score])

  useEffect(() => {
    if (chrono.length < 2) return
    let cancelled = false
    void (async () => {
      const remote = await api<Anticipate>(`anticipate?era=${era}&n=400`)
      if (cancelled) return
      if (remote && remote.ok) setAnticipation(remote)
      else setAnticipation(anticipateLocal(chrono, { nSim: 200 }))
    })()
    return () => {
      cancelled = true
    }
  }, [chrono, era])

  function persistRules(next: MorphoRule[]) {
    setRules(next)
    saveRules(next)
    for (const rule of next) {
      void api("rules", { method: "POST", body: JSON.stringify(rule) })
    }
  }

  function addRule() {
    const rule = normalizeRule({
      name: ruleName,
      condition: {
        motifs: ruleMotifs,
        any_motifs: [],
        query_labels: {},
        weekday: null,
        caption_contains: null,
        min_grounding: null,
      },
      actions: [
        {
          type: "hypothesize",
          payload: { motifs: ruleMotifs, constraint: "same_motifs" },
        },
        { type: "alert", payload: {} },
      ],
      active: true,
    })
    persistRules([rule, ...rules])
  }

  function draftFromCurrent() {
    if (!portrait) return
    const draft = draftRuleFromState(portrait)
    persistRules([draft, ...rules])
  }

  function removeRule(id: string) {
    persistRules(rules.filter((r) => r.id !== id))
    void api(`rules/${id}`, { method: "DELETE" })
  }

  async function runVlm() {
    if (!selected) return
    setVlmBusy(true)
    setVlm(null)
    const loaded = await api<{ ok: boolean; error?: string; loaded?: boolean }>("vlm/load", {
      method: "POST",
      body: "{}",
    })
    const body = await api<{
      ok: boolean
      state?: Portrait & {
        queries?: Record<string, string>
        residual?: string | null
        grounding_score?: number | null
        vlm?: boolean
      }
      sequence?: { drift?: string | null; cluster_move?: string | null }
      contrast?: { difference?: string | null }
      error?: string
    }>("vlm", {
      method: "POST",
      body: JSON.stringify({
        numbers: selected.numbers,
        stars: selected.stars,
        date: selected.date,
        era,
        sequence: 5,
        persist: true,
      }),
    })
    setVlmBusy(false)
    if (!body) {
      setVlm({
        caption: portrait?.caption,
        queries: undefined,
        error: loaded?.error || "API VLM injoignable — caption géométrique seule",
        loaded: false,
      })
      return
    }
    setVlm({
      caption: body.state?.caption,
      queries: body.state?.queries,
      grounding_score: body.state?.grounding_score,
      residual: body.state?.residual,
      loaded: body.state?.vlm,
      error: body.error || loaded?.error,
      sequence: body.sequence,
      contrast: body.contrast,
    })
  }

  async function runClip() {
    if (!portrait) return
    setClipBusy(true)
    setClipNote(null)
    const loaded = await loadClip()
    if (!loaded.ok) {
      setClipBusy(false)
      setClipNote(loaded.error || "CLIP indisponible")
      return
    }
    try {
      const query = await embedGlyph(portrait.numbers, portrait.stars)
      const sample = chrono.slice(-40)
      const scored: { date: string; score: number; numbers: number[]; stars: number[] }[] = []
      for (const draw of sample) {
        if (draw.date === portrait.date) continue
        const vec = await embedGlyph(draw.numbers, draw.stars)
        scored.push({
          date: draw.date,
          score: Math.round(cosine(query, vec) * 10000) / 10000,
          numbers: draw.numbers,
          stars: draw.stars,
        })
      }
      scored.sort((a, b) => b.score - a.score)
      setClipNeighbors(scored.slice(0, 6))
      setClipNote(`CLIP chargé (${clipStatus().loaded ? "ok" : "?"}) · ${sample.length} glyphes`)
    } catch (error) {
      setClipNote(error instanceof Error ? error.message : String(error))
    } finally {
      setClipBusy(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Chargement des tirages…</p>
  }
  if (!selected || !portrait) {
    return <p className="text-sm text-muted-foreground">Aucun tirage.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <Select value={era} onValueChange={(v) => setEra(v as "current" | "all")}>
          <SelectTrigger className="w-full sm:w-56" aria-label="Ère">
            <span className="flex flex-1 text-left">
              {era === "all" ? "Tout l’historique" : "Formule actuelle (12 ★)"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Formule actuelle (12 ★)</SelectItem>
            <SelectItem value="all">Tout l’historique</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {chrono.length} tirages · source {source === "neon" ? "Neon" : "JSON"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>
              {selected.weekday} {formatShortDate(selected.date)} · {selected.date}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <GlyphBoard
              numbers={selected.numbers}
              stars={selected.stars}
              title={`Glyphe ${selected.date}`}
            />
            <p className="mt-3 font-mono text-sm">
              {selected.numbers.join(" · ")}{" "}
              <span className="text-muted-foreground">★ {selected.stars.join(" · ")}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Motifs</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {portrait.motifs.length ? (
                portrait.motifs.map((id) => (
                  <span
                    key={id}
                    className="rounded-full border border-border px-2 py-0.5 text-xs"
                  >
                    {labelOf(id)}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">aucun motif du lexique</span>
              )}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{portrait.caption}</p>
            <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>centroïde {portrait.descriptors.centroid_row.toFixed(2)} / {portrait.descriptors.centroid_col.toFixed(2)}</div>
              <div>compacité {portrait.descriptors.compactness.toFixed(2)}</div>
              <div>bbox {portrait.descriptors.bbox_w}×{portrait.descriptors.bbox_h}</div>
              <div>étoiles Δ {portrait.descriptors.star_chebyshev}</div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pellicule</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2 overflow-x-auto pb-1">
          {film.map((draw: Draw) => (
            <GlyphThumb
              key={draw.date}
              numbers={draw.numbers}
              stars={draw.stars}
              selected={draw.date === selected.date}
              onClick={() => setSelectedDate(draw.date)}
              label={formatShortDate(draw.date)}
            />
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Voisins (signature géométrique)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {geoNeighbors.map((n) => (
              <button
                key={n.date}
                type="button"
                className="flex items-center gap-3 text-left"
                onClick={() => n.date && setSelectedDate(n.date)}
              >
                <div className="w-20 shrink-0">
                  <GlyphBoard numbers={n.numbers} stars={n.stars} labels={false} />
                </div>
                <div>
                  <p className="text-sm">{n.date}</p>
                  <p className="text-xs text-muted-foreground">
                    score {n.score.toFixed(3)} · {n.motifs.map(labelOf).join(", ") || "—"}
                  </p>
                </div>
              </button>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => void runClip()} disabled={clipBusy}>
                {clipBusy ? "CLIP…" : "Œil local CLIP"}
              </Button>
              {clipNote ? <span className="text-xs text-muted-foreground">{clipNote}</span> : null}
            </div>
            {clipNeighbors.length ? (
              <div className="flex gap-2 overflow-x-auto">
                {clipNeighbors.map((n) => (
                  <GlyphThumb
                    key={`clip-${n.date}`}
                    numbers={n.numbers}
                    stars={n.stars}
                    onClick={() => setSelectedDate(n.date)}
                    label={`${formatShortDate(n.date)} · ${n.score.toFixed(2)}`}
                  />
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Moondream</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button type="button" onClick={() => void runVlm()} disabled={vlmBusy}>
              {vlmBusy ? "Analyse VLM…" : "Charger / interroger"}
            </Button>
            {vlm?.error ? <p className="text-xs text-muted-foreground">{vlm.error}</p> : null}
            {vlm?.caption ? <p className="text-sm leading-6">{vlm.caption}</p> : null}
            {vlm?.queries ? (
              <dl className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                {Object.entries(vlm.queries).map(([k, v]) => (
                  <div key={k}>
                    {k}: {v}
                  </div>
                ))}
              </dl>
            ) : null}
            {vlm?.grounding_score != null ? (
              <p className="text-xs text-muted-foreground">ancrage {vlm.grounding_score.toFixed(2)}</p>
            ) : null}
            {vlm?.sequence?.drift ? (
              <p className="text-sm text-muted-foreground">{vlm.sequence.drift}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Règles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              aria-label="Nom de la règle"
              className="sm:w-56"
            />
            <Button type="button" onClick={addRule} disabled={!ruleMotifs.length}>
              Ajouter
            </Button>
            <Button type="button" variant="outline" onClick={draftFromCurrent}>
              Brouillon depuis le glyphe
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MOTIF_IDS.map((id) => {
              const on = ruleMotifs.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    setRuleMotifs((cur) => (on ? cur.filter((x) => x !== id) : [...cur, id]))
                  }
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    on ? "border-primary text-foreground" : "border-border text-muted-foreground"
                  }`}
                >
                  {labelOf(id)}
                </button>
              )
            })}
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <div>
                  <p>{rule.name}</p>
                  <p className="text-xs text-muted-foreground">
                    QUAND {rule.condition.motifs.map(labelOf).join(" ∧ ") || "—"} ALORS{" "}
                    {rule.actions.map((a) => a.type).join(", ")}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeRule(rule.id)}>
                  Retirer
                </Button>
              </li>
            ))}
          </ul>
          {firings.length ? (
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Déclenchements</p>
              <ul className="text-xs text-muted-foreground">
                {firings.slice(0, 8).map((f, i) => (
                  <li key={`${f.rule_id}-${f.at}-${i}`}>
                    {f.name} · {f.draw_date} · {f.actions.map((a) => a.type).join(", ")}
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1"
                onClick={() => {
                  persistFirings([])
                  setFirings([])
                }}
              >
                Vider le journal
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anticipation</CardTitle>
        </CardHeader>
        <CardContent>
          {anticipation && anticipation.ok ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {anticipation.matches} précédents à Jaccard ≥ {anticipation.min_jaccard} · null {anticipation.n_sim} tirages
                {"chi2_p" in anticipation && anticipation.chi2_p != null
                  ? ` · χ² p=${anticipation.chi2_p}`
                  : null}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-1 font-medium">Classe</th>
                      <th className="py-1 font-medium">Empirique</th>
                      <th className="py-1 font-medium">Null</th>
                      <th className="py-1 font-medium">n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anticipation.classes.slice(0, 10).map((row) => (
                      <tr key={row.id} className={row.current ? "text-foreground" : "text-muted-foreground"}>
                        <td className="py-1">{row.label}</td>
                        <td className="py-1 tabular-nums">
                          {row.empirical == null ? "—" : row.empirical.toFixed(3)}
                        </td>
                        <td className="py-1 tabular-nums">{row.null.toFixed(3)}</td>
                        <td className="py-1 tabular-nums">{row.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Pas assez de tirages.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
