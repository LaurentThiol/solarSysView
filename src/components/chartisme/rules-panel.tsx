"use client"

import { useEffect, useMemo, useState } from "react"

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
import { FIGURE_IDS, labelOf } from "@/lib/chartisme/catalog"
import type { Curve } from "@/lib/chartisme/curves"
import type { FigureHit } from "@/lib/chartisme/figures"
import {
  ACTION_TYPES,
  BREAKOUT_STATES,
  describe,
  draftRuleFromHit,
  evaluateRules,
  normalizeRule,
  stateFromHit,
  summarizeFirings,
  TRENDS,
  type ActionType,
  type BreakoutState,
  type ChartismeRule,
} from "@/lib/chartisme/rules"
import type { ScanHit } from "@/lib/chartisme/scan"
import {
  deleteRemote,
  loadFirings,
  loadRules,
  persistFirings,
  recordFirings,
  saveRules,
  syncRule,
  type StoredFiring,
} from "@/lib/chartisme/store"

const ACTION_LABELS: Record<ActionType, string> = {
  tag: "étiqueter",
  alert: "remonter en tête",
  note: "annoter",
  hypothesize: "formuler une attente",
  watch: "surveiller",
}

const BREAKOUT_LABELS: Record<BreakoutState, string> = {
  any: "toute cassure",
  confirmed: "cassure confirmée",
  fake: "fake breakout",
  pending: "en formation",
}

const TREND_LABELS: Record<string, string> = {
  any: "toute tendance",
  up: "hausse de fond",
  down: "baisse de fond",
  range: "range de fond",
}

function emptyRule(): ChartismeRule {
  return normalizeRule({ name: "Nouvelle règle" })
}

export function RulesPanel({
  hit,
  hits,
  curve,
}: {
  hit: FigureHit | null
  hits: ScanHit[]
  curve: Curve | null
}) {
  const [rules, setRules] = useState<ChartismeRule[]>([])
  const [firings, setFirings] = useState<StoredFiring[]>([])
  const [draft, setDraft] = useState<ChartismeRule>(emptyRule)
  const [evaluated, setEvaluated] = useState<number | null>(null)

  useEffect(() => {
    // `localStorage` n'existe pas au rendu serveur : la lecture ne peut se
    // faire qu'après hydratation, sans quoi le serveur et le navigateur
    // rendraient deux journaux différents.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRules(loadRules())
    setFirings(loadFirings())
  }, [])

  function persist(next: ChartismeRule[]) {
    setRules(next)
    saveRules(next)
  }

  async function add(rule: ChartismeRule) {
    const normalized = normalizeRule(rule)
    persist([normalized, ...rules.filter((r) => r.id !== normalized.id)])
    setDraft(emptyRule())
    await syncRule(normalized)
  }

  async function remove(id: string) {
    persist(rules.filter((rule) => rule.id !== id))
    await deleteRemote("rules", id)
  }

  function toggle(id: string) {
    persist(rules.map((rule) => (rule.id === id ? { ...rule, active: !rule.active } : rule)))
  }

  function evaluate() {
    if (!rules.length || !hits.length) {
      setEvaluated(0)
      return
    }
    const found = hits.flatMap((entry) => evaluateRules(rules, stateFromHit(entry, { curve })))
    recordFirings(found)
    setFirings(loadFirings())
    setEvaluated(found.length)
  }

  const summary = useMemo(
    () =>
      summarizeFirings(
        firings.map((firing) => ({
          rule_id: firing.rule_id,
          name: firing.name,
          actions: firing.actions,
          curve_id: firing.curve_id,
          figure: firing.figure,
          figure_date: firing.figure_date,
          snapshot: firing.snapshot ?? {},
        }))
      ),
    [firings]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <TitleHelp
            help={{
              title: "Espace de règles",
              body: "QUAND telle figure dans tel contexte, ALORS consigner tel constat. Délibérément descriptif : aucune règle ne touche aux grilles et rien n'est branché sur l'onglet Combinaisons. Une règle consigne une observation, le rétro-test dit ensuite si elle valait quelque chose.",
            }}
          >
            Règles descriptives
          </TitleHelp>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-muted-foreground">
          C’est ici que se construit la démarche : tu écris ce que tu observes,
          le journal accumule les déclenchements et le rétro-test mesure si la
          règle bat le hasard. Rien n’est appliqué automatiquement à une grille.
        </p>

        {hit ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
            <span className="text-xs text-muted-foreground">
              Figure affichée : <strong>{hit.label}</strong>
            </span>
            <Button size="xs" variant="outline" onClick={() => setDraft(draftRuleFromHit(hit))}>
              en faire un brouillon de règle
            </Button>
          </div>
        ) : null}

        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-xs font-medium">Nouvelle règle</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <LabelHelp
              label="Nom"
              help={{ title: "Nom", body: "Ce qui apparaîtra dans le journal des déclenchements." }}
            >
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </LabelHelp>

            <LabelHelp
              label="Figure"
              help={{
                title: "Figure",
                body: "La règle ne se déclenche que sur cette figure. Laisse « toute figure » pour une règle qui ne dépend que du contexte.",
              }}
            >
              <Select
                value={draft.condition.figures[0] ?? "any"}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    condition: {
                      ...draft.condition,
                      figures: !value || value === "any" ? [] : [value],
                    },
                  })
                }
              >
                <SelectTrigger className="w-full" aria-label="Figure">
                  <span className="flex flex-1 text-left">
                    {draft.condition.figures[0]
                      ? labelOf(draft.condition.figures[0])
                      : "toute figure"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">toute figure</SelectItem>
                  {FIGURE_IDS.filter((id) => id !== "none").map((id) => (
                    <SelectItem key={id} value={id}>
                      {labelOf(id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>

            <LabelHelp
              label="Cassure"
              help={{
                title: "Cassure",
                body: "La règle d'or : une cassure n'est validée que si l'activité dépasse sa moyenne mobile 20 et si la clôture confirme. Sinon c'est un fake breakout — et une règle sur les fakes est tout aussi instructive.",
              }}
            >
              <Select
                value={draft.condition.breakout}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    condition: { ...draft.condition, breakout: value as BreakoutState },
                  })
                }
              >
                <SelectTrigger className="w-full" aria-label="Cassure">
                  <span className="flex flex-1 text-left">
                    {BREAKOUT_LABELS[draft.condition.breakout]}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {BREAKOUT_STATES.map((state) => (
                    <SelectItem key={state} value={state}>
                      {BREAKOUT_LABELS[state]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>

            <LabelHelp
              label="Tendance de fond"
              help={{
                title: "Tendance de fond",
                body: "Contexte hors de la fenêtre de la figure. Une continuation dans une hausse de fond ne se lit pas comme la même figure dans un range.",
              }}
            >
              <Select
                value={draft.condition.trend}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    condition: {
                      ...draft.condition,
                      trend: value as (typeof TRENDS)[number],
                    },
                  })
                }
              >
                <SelectTrigger className="w-full" aria-label="Tendance de fond">
                  <span className="flex flex-1 text-left">
                    {TREND_LABELS[draft.condition.trend] ?? draft.condition.trend}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {TRENDS.map((trend) => (
                    <SelectItem key={trend} value={trend}>
                      {TREND_LABELS[trend] ?? trend}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>

            <LabelHelp
              label={`Confiance ≥ ${(draft.condition.min_confidence ?? 0).toFixed(2)}`}
              help={{
                title: "Confiance minimale",
                body: "Un seuil bas rend la règle bavarde : rappelle-toi que 85 % des marches aléatoires portent déjà une figure à 0.6.",
              }}
            >
              <Input
                type="range"
                min={0}
                max={0.95}
                step={0.05}
                value={draft.condition.min_confidence ?? 0}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    condition: {
                      ...draft.condition,
                      min_confidence: Number(event.target.value) || null,
                    },
                  })
                }
              />
            </LabelHelp>

            <LabelHelp
              label="Action"
              help={{
                title: "Action",
                body: "Les cinq actions sont toutes des écritures dans le journal. « Formuler une attente » est la seule que le rétro-test sait mesurer : elle pose que l'objectif projeté sera atteint.",
              }}
            >
              <Select
                value={draft.actions[0]?.type ?? "note"}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    actions: [{ type: value as ActionType, payload: {} }],
                  })
                }
              >
                <SelectTrigger className="w-full" aria-label="Action">
                  <span className="flex flex-1 text-left">
                    {ACTION_LABELS[draft.actions[0]?.type ?? "note"]}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {ACTION_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>
          </div>
          <p className="font-mono text-xs text-muted-foreground">{describe(draft)}</p>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void add(draft)}>
              Ajouter la règle
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(emptyRule())}>
              Réinitialiser
            </Button>
          </div>
        </div>

        {rules.length ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium">{rules.length} règles</p>
              <Button size="xs" variant="outline" onClick={evaluate}>
                Évaluer sur la courbe affichée
              </Button>
              {evaluated !== null ? (
                <span className="text-xs text-muted-foreground">
                  {evaluated} déclenchement{evaluated === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            <ul className="space-y-1.5">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-xs"
                >
                  <Badge variant={rule.active ? "default" : "outline"}>
                    {rule.active ? "active" : "en pause"}
                  </Badge>
                  <span className="font-medium">{rule.name}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                    {describe(rule)}
                  </span>
                  <Button size="xs" variant="ghost" onClick={() => toggle(rule.id)}>
                    {rule.active ? "mettre en pause" : "réactiver"}
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => void remove(rule.id)}>
                    supprimer
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Aucune règle. Sélectionne une figure ci-dessus et clique sur « en
            faire un brouillon de règle » pour partir d’un exemple concret.
          </p>
        )}

        {firings.length ? (
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium">
                Journal · {summary.count} déclenchements
              </p>
              {Object.entries(summary.by_figure)
                .slice(0, 6)
                .map(([figure, count]) => (
                  <Badge key={figure} variant="outline">
                    {labelOf(figure)} × {count}
                  </Badge>
                ))}
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  persistFirings([])
                  setFirings([])
                }}
              >
                vider le journal
              </Button>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {firings.slice(0, 14).map((firing, index) => (
                <li key={`${firing.rule_id}-${firing.at}-${index}`}>
                  <span className="font-medium text-foreground">{firing.name}</span> ·{" "}
                  {firing.curve_id} · {firing.figure_date ?? firing.at.slice(0, 10)} ·{" "}
                  {firing.actions.map((a) => ACTION_LABELS[a.type] ?? a.type).join(", ")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
