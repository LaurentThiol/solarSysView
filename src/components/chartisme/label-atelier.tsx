"use client"

import { useEffect, useMemo, useState } from "react"

import { CurveCanvas, type CurveSelection } from "@/components/chartisme/curve-canvas"
import { FigureName } from "@/components/chartisme/figure-thumb"
import { LabelHelp, TitleHelp } from "@/components/help"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  FIGURE_IDS,
  PIVOT_ROLES,
  PIVOT_ROLE_LABELS,
  labelOf,
  type PivotRole,
} from "@/lib/chartisme/catalog"
import { bestFigure, type FigureHit } from "@/lib/chartisme/figures"
import { buildIndex, classifyByNeighbours } from "@/lib/chartisme/retrieval"
import { MIN_WINDOW, windowsOf } from "@/lib/chartisme/scan"
import type { Curve } from "@/lib/chartisme/curves"
import {
  loadClasses,
  loadLabels,
  saveClasses,
  saveLabels,
  syncLabel,
  type LabelRole,
  type StoredLabel,
} from "@/lib/chartisme/store"

const FREE_CLASS = "__free__"

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return `label-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function LabelAtelier({
  curve,
  selection,
  onSelect,
  contextCount = 0,
}: {
  curve: Curve | null
  selection: CurveSelection | null
  onSelect: (selection: CurveSelection | null) => void
  /** Tirages de tête hors fenêtre de travail : on n'y propose rien à étiqueter. */
  contextCount?: number
}) {
  const [figure, setFigure] = useState<string>("ete")
  const [freeClass, setFreeClass] = useState("")
  const [classes, setClasses] = useState<string[]>([])
  const [labels, setLabels] = useState<StoredLabel[]>([])
  const [roles, setRoles] = useState<LabelRole[]>([])
  const [pendingRole, setPendingRole] = useState<PivotRole>("head")
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    // `localStorage` n'existe pas au rendu serveur : la lecture ne peut se
    // faire qu'après hydratation, sans quoi le serveur et le navigateur
    // rendraient deux listes différentes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClasses(loadClasses())
    setLabels(loadLabels())
  }, [])

  // Les rôles sont placés sur des index de la fenêtre : en changer les bornes
  // les ferait pointer ailleurs sur la courbe.
  const windowKey = `${curve?.id ?? ""}|${selection?.fromIndex ?? ""}|${selection?.toIndex ?? ""}`
  const [lastWindowKey, setLastWindowKey] = useState(windowKey)
  if (windowKey !== lastWindowKey) {
    setLastWindowKey(windowKey)
    setRoles([])
  }

  const window = useMemo(() => {
    if (!curve || !selection) return null
    const from = Math.min(selection.fromIndex, selection.toIndex)
    const to = Math.max(selection.fromIndex, selection.toIndex)
    if (to - from < 7) return null
    return {
      from,
      to,
      values: curve.values.slice(from, to + 1),
      dates: curve.dates.slice(from, to + 1),
      activity: curve.activity.slice(from, to + 1),
    }
  }, [curve, selection])

  // Ce que le détecteur géométrique lit dans la sélection : le point de
  // départ de l'étiquetage, à confirmer ou à corriger.
  const guess = useMemo<FigureHit | null>(() => {
    if (!window) return null
    return bestFigure(window.values, window.dates, window.activity)
  }, [window])

  // Ce que les étiquettes déjà posées suggèrent, par plus proche voisin. Pas
  // de modèle, pas d'entraînement : le vote des formes que tu as déjà nommées.
  const neighbourGuess = useMemo(() => {
    if (!window || labels.length < 3) return null
    const index = buildIndex(
      labels.map((label) => ({ values: label.values, figure: label.figure, id: label.id }))
    )
    return classifyByNeighbours(window.values, index, { k: 5 })
  }, [window, labels])

  // Apprentissage actif : les fenêtres où le détecteur hésite le plus sont
  // celles où une étiquette humaine rapporte le plus. La taille suit la courbe :
  // sur une fenêtre de travail courte, 60 tirages ne rentrent pas et la liste
  // resterait vide sans qu'on sache pourquoi.
  const uncertain = useMemo(() => {
    if (!curve) return []
    const size = Math.min(60, curve.values.length)
    if (size < MIN_WINDOW) return []
    const windows = windowsOf([curve], {
      size,
      stride: Math.max(4, Math.trunc(size / 3)),
      limit: 200,
    }).filter((entry) => entry.to_index >= contextCount)
    const scored = windows
      .map((entry) => {
        const hit = bestFigure(entry.values)
        return {
          ...entry,
          figure: hit?.label ?? "aucune",
          confidence: hit?.confidence ?? 0,
          gap: Math.abs((hit?.confidence ?? 0) - 0.6),
        }
      })
      .sort((a, b) => a.gap - b.gap)
    return scored.slice(0, 6)
  }, [curve, contextCount])

  const allClasses = useMemo(() => [...FIGURE_IDS, ...classes], [classes])

  const effectiveFigure = figure === FREE_CLASS ? freeClass.trim() : figure

  function placeRole(index: number) {
    if (!curve) return
    setRoles((current) => [
      ...current.filter((role) => role.role !== pendingRole),
      { role: pendingRole, index, value: curve.values[index] },
    ])
  }

  async function save() {
    if (!curve || !window || !effectiveFigure) return
    const isFree = !FIGURE_IDS.includes(effectiveFigure as (typeof FIGURE_IDS)[number])
    if (isFree && !classes.includes(effectiveFigure)) {
      const next = [...classes, effectiveFigure]
      setClasses(next)
      saveClasses(next)
    }
    const label: StoredLabel = {
      id: newId(),
      curve_id: curve.id,
      variable: curve.variable,
      figure: isFree ? "none" : effectiveFigure,
      custom_label: isFree ? effectiveFigure : null,
      from_index: window.from,
      to_index: window.to,
      from: window.dates[0] ?? null,
      to: window.dates[window.dates.length - 1] ?? null,
      values: window.values,
      activity: window.activity,
      roles,
      at: new Date().toISOString(),
      synced: false,
    }
    const next = [label, ...labels]
    setLabels(next)
    saveLabels(next)
    setSaved(`« ${effectiveFigure} » enregistrée sur ${window.to - window.from + 1} tirages.`)
    onSelect(null)
    // Neon au mieux : la copie locale suffit à entraîner.
    if (await syncLabel(label)) {
      label.synced = true
      saveLabels(next)
    }
  }

  function remove(id: string) {
    const next = labels.filter((label) => label.id !== id)
    setLabels(next)
    saveLabels(next)
  }

  const counts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const label of labels) {
      const key = label.custom_label ?? label.figure
      out[key] = (out[key] ?? 0) + 1
    }
    return Object.entries(out).sort((a, b) => b[1] - a[1])
  }, [labels])

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <TitleHelp
            help={{
              title: "Atelier d’étiquetage",
              body: "Sélectionnez une portion de la courbe au pinceau, nommez la forme que vous y voyez, puis placez les rôles de pivots — tête, épaule gauche, ligne de cou. C'est ainsi qu'on apprend à l'outil des formes que la table de référence ne nomme pas.",
            }}
          >
            Atelier d’étiquetage
          </TitleHelp>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!curve ? (
          <p className="text-sm text-muted-foreground">
            Choisis une courbe ci-dessus pour commencer à étiqueter.
          </p>
        ) : !window ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Fais glisser le curseur sur la courbe ci-dessus pour sélectionner
              une fenêtre (8 tirages minimum).
            </p>
            {uncertain.length ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium">
                  Là où le détecteur hésite — étiqueter ici rapporte le plus
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {uncertain.map((entry) => (
                    <Button
                      key={`${entry.from_index}-${entry.to_index}`}
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        onSelect({ fromIndex: entry.from_index, toIndex: entry.to_index })
                      }
                    >
                      {entry.from} · {entry.figure} {entry.confidence.toFixed(2)}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <CurveCanvas
              values={window.values}
              dates={window.dates}
              activity={window.activity}
              hit={guess}
              label={`${curve.label} — sélection`}
            />

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">
                {window.from} → {window.to} · {window.values.length} tirages
              </Badge>
              {guess ? (
                <Badge variant="secondary">
                  détecteur : {guess.label} ({guess.confidence.toFixed(2)})
                </Badge>
              ) : (
                <Badge variant="outline">détecteur : rien de net</Badge>
              )}
              {neighbourGuess?.figure ? (
                <Badge variant="secondary">
                  vos étiquettes : {labelOf(neighbourGuess.figure)} (
                  {neighbourGuess.confidence.toFixed(2)})
                </Badge>
              ) : null}
              {guess ? (
                <Button size="xs" variant="ghost" onClick={() => setFigure(guess.figure)}>
                  reprendre la lecture du détecteur
                </Button>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <LabelHelp
                label="Classe"
                help={{
                  title: "Classe",
                  body: "Les 18 figures de la table, plus vos propres classes. Une classe libre est stockée à part : elle sert la recherche par ressemblance et le regroupement, sans polluer les détecteurs géométriques.",
                }}
              >
                <Select value={figure} onValueChange={(v) => setFigure(v ?? figure)}>
                  <SelectTrigger className="w-full" aria-label="Classe">
                    <span className="flex flex-1 text-left">
                      {figure === FREE_CLASS ? (
                        "+ nouvelle classe libre…"
                      ) : FIGURE_IDS.includes(figure as (typeof FIGURE_IDS)[number]) ? (
                        <FigureName figure={figure} label={labelOf(figure)} />
                      ) : (
                        `${figure} (classe libre)`
                      )}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="min-w-56">
                    {allClasses.map((id) => (
                      <SelectItem key={id} value={id}>
                        {FIGURE_IDS.includes(id as (typeof FIGURE_IDS)[number]) ? (
                          <FigureName figure={id} label={labelOf(id)} />
                        ) : (
                          `${id} (classe libre)`
                        )}
                      </SelectItem>
                    ))}
                    <SelectItem value={FREE_CLASS}>+ nouvelle classe libre…</SelectItem>
                  </SelectContent>
                </Select>
              </LabelHelp>

              {figure === FREE_CLASS ? (
                <LabelHelp
                  label="Nom de la classe"
                  help={{
                    title: "Classe libre",
                    body: "Donnez un nom à la forme que vous voyez et qui n'existe pas dans la table. Elle rejoint le vocabulaire de l'atelier et devient cherchable.",
                  }}
                >
                  <Input
                    value={freeClass}
                    placeholder="escalier descendant, plateau long…"
                    onChange={(event) => setFreeClass(event.target.value)}
                  />
                </LabelHelp>
              ) : null}
            </div>

            <div className="space-y-2">
              <LabelHelp
                label="Rôle à placer"
                help={{
                  title: "Rôles de pivots",
                  body: "Choisis un rôle puis clique sur un tirage de la liste pour l'y attacher. C'est ce qui rend l'étiquette exploitable : la tête d'une épaule-tête-épaule et sa ligne de cou ne se devinent pas d'une simple fenêtre.",
                }}
              >
                <Select
                  value={pendingRole}
                  onValueChange={(value) => setPendingRole(value as PivotRole)}
                >
                  <SelectTrigger className="w-full" aria-label="Rôle à placer">
                    <span className="flex flex-1 text-left">
                      {PIVOT_ROLE_LABELS[pendingRole]}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {PIVOT_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {PIVOT_ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </LabelHelp>

              <div className="flex flex-wrap gap-1">
                {window.values.map((value, offset) => {
                  const index = window.from + offset
                  const taken = roles.find((role) => role.index === index)
                  return (
                    <Button
                      key={index}
                      size="icon-xs"
                      variant={taken ? "default" : "ghost"}
                      title={`${window.dates[offset]} · ${value.toFixed(1)}`}
                      onClick={() => placeRole(index)}
                    >
                      {taken ? "•" : ""}
                    </Button>
                  )
                })}
              </div>

              {roles.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {roles.map((role) => (
                    <Badge key={role.role} variant="secondary">
                      {PIVOT_ROLE_LABELS[role.role as PivotRole] ?? role.role} @{" "}
                      {curve.dates[role.index]}
                    </Badge>
                  ))}
                  <Button size="xs" variant="ghost" onClick={() => setRoles([])}>
                    effacer les rôles
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void save()} disabled={!effectiveFigure}>
                Enregistrer l’étiquette
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onSelect(null)}>
                Annuler la sélection
              </Button>
              {saved ? (
                <span className="text-xs text-muted-foreground">{saved}</span>
              ) : null}
            </div>
          </div>
        )}

        {labels.length ? (
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium">{labels.length} étiquettes</span>
              {counts.slice(0, 8).map(([name, count]) => (
                <Badge key={name} variant="outline">
                  {name} × {count}
                </Badge>
              ))}
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {labels.slice(0, 12).map((label) => (
                <li key={label.id} className="flex items-center gap-2">
                  <Badge variant={label.synced ? "default" : "outline"}>
                    {label.synced ? "Neon" : "local"}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">
                    {label.custom_label ?? labelOf(label.figure)} · {label.curve_id} ·{" "}
                    {label.from} → {label.to}
                  </span>
                  <Button size="xs" variant="ghost" onClick={() => remove(label.id)}>
                    retirer
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Les étiquettes pèsent trois fois plus que le synthétique à
              l’entraînement et partent d’abord en validation : c’est ton
              jugement qui sert de vérité.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
