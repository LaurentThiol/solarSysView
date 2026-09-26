"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

import { DemoPopup, DemoTourBar } from "@/components/brain/brain-demo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { segmentsSentence, senseSentence } from "@/lib/chartisme/sense"
import {
  fetchCards,
  fetchMode,
  postHelp,
  postReading,
  saveCard,
  saveMode,
  type LexiconCard,
  type Reading,
  type SenseCell,
} from "@/lib/lexicon/client"
import { DEMO_QUESTION, DEMO_SIGMA, DEMO_STEPS, demoSegments, demoSense, demoSkill } from "@/lib/lexicon/demo"
import { ficheHref } from "@/lib/lexicon/fiche"
import { readableSvg, sketchForSymbol } from "@/lib/lexicon/sketch"
import { cn } from "@/lib/utils"

const FIELDS = [
  ["sum", "Somme"],
  ["parity", "Parité"],
  ["star_sum", "Étoiles"],
  ["spread", "Étendue"],
  ["n1", "n1"],
  ["n5", "n5"],
] as const

const LENGTHS = ["20", "50", "100"] as const

const EQUATION =
  "Droite des deux bouts. stable si |Δ| ≤ σ des résidus.\nRegistre = σ_résidus / σ de toute la courbe : 05 jusqu'à 0,5, 1 jusqu'à 1, sup au-delà.\nAbstention si moins de 16 tirages."

const LEGACY_EQUATION = EQUATION.replaceAll("\n", " ")

function readableEquation(text: string) {
  return text === LEGACY_EQUATION ? EQUATION : text
}

const SCOPE =
  "Fenêtre d'au moins 16 tirages, rapportée au σ de toute la courbe. Le jour affiché choisit le prédécesseur. Ce n'est pas le symbole de jambe, ni un pronostic de tirage."

function refHref(clock: string) {
  if (clock === "carrington" || clock === "schwabe" || clock === "hale" || clock === "gleissberg") {
    return "/ref?tab=solaire"
  }
  if (clock === "tropique") return "/ref?tab=autres"
  if (clock === "lunaire" || clock === "nodal" || clock === "saros" || clock === "meton") {
    return "/ref?tab=lunaire"
  }
  return "/ref"
}

function symbolOf(cell: SenseCell) {
  return cell?.symbol ?? "—"
}

function safeSvg(svg: string | undefined) {
  if (!svg) return ""
  const trimmed = svg.trim()
  if (!trimmed.startsWith("<svg") || trimmed.toLowerCase().includes("<script")) return ""
  return trimmed
}

function SketchFrame({ card }: { card: LexiconCard }) {
  const svg = safeSvg(sketchForSymbol(card.symbol) || readableSvg(card.image_svg))
  if (!svg) {
    return <div className="h-28 w-full rounded-xl border border-dashed border-border" />
  }
  return (
    <figure data-capture-visual className="overflow-hidden rounded-xl border border-border">
      <div
        className="lex-sketch bg-[#12182a] [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border bg-card px-3 py-2 text-xs leading-5 text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="inline-block h-[3px] w-6 rounded-full bg-[#f4efe4]" />
          fenêtre
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="inline-block w-6 border-t-2 border-dashed border-[#9fd0f5]" />
          droite des deux bouts
        </span>
      </figcaption>
    </figure>
  )
}

function emptyDemoCard(): LexiconCard {
  const named = demoSense()
  return {
    id: "sense.monte.05",
    status: "draft",
    symbol: named?.symbol ?? "monte:05",
    equation: EQUATION,
    keywords: ["monte", "fenêtre", "nuage serré"],
    gloss: named ? senseSentence(named) : "la fenêtre monte",
    scope: SCOPE,
    image_svg: sketchForSymbol("monte:05"),
    quality: { episodes: 0, skill: null, reviewed: null },
    source: "code",
    revision: 1,
  }
}

export function LexiconLab() {
  const search = useSearchParams()
  const [cards, setCards] = useState<LexiconCard[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(search.get("fiche"))
  const [filter, setFilter] = useState<"confirmed" | "draft">("confirmed")
  const [query, setQuery] = useState("")
  const [weekday, setWeekday] = useState("tous")
  const [automatic, setAutomatic] = useState(false)
  const [reading, setReading] = useState<Reading | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [escalate, setEscalate] = useState(false)
  const [cloudNote, setCloudNote] = useState("")
  const [helpText, setHelpText] = useState<string | null>(null)
  const [helpProvider, setHelpProvider] = useState<string | null>(null)
  const [demoStep, setDemoStep] = useState<string | null>(null)
  const [demoRunning, setDemoRunning] = useState(false)
  const [demoDone, setDemoDone] = useState(false)
  const [demoCard, setDemoCard] = useState<LexiconCard | null>(null)
  const [demoOutcome, setDemoOutcome] = useState<"open" | "reached">("open")
  const autoRef = useRef(false)

  const skill = useMemo(() => demoSkill(), [])
  const named = useMemo(() => demoSense(), [])
  const demoSteps = useMemo(
    () =>
      DEMO_STEPS.map((step) => {
        if (step.id !== "skill" || skill == null) return step
        const score = skill.toFixed(2)
        const note = skill <= 0 ? " Un score ≤ 0 : ce sens est courant une fois l'ordre mélangé." : ""
        return { ...step, body: `Le même calcul sur la série remaniée. Score ${score}.${note}` }
      }),
    [skill]
  )

  useEffect(() => {
    let cancel = false
    fetchCards()
      .then((payload) => {
        if (cancel) return
        setCards(payload.cards)
        const fiche = search.get("fiche")
        if (fiche && payload.cards.some((card) => card.id === fiche)) {
          setSelectedId(fiche)
          const hit = payload.cards.find((card) => card.id === fiche)
          if (hit?.status === "draft") setFilter("draft")
        } else if (!selectedId && payload.cards[0]) {
          setSelectedId(payload.cards[0].id)
        }
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Dictionnaire illisible")
      })
    fetchMode()
      .then((payload) => {
        if (!cancel) setAutomatic(payload.automatic)
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
    // Le paramètre fiche ne change pas pendant la vie de la page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (autoRef.current) return
    if (search.get("demo") !== "1") return
    autoRef.current = true
    beginDemo()
  }, [search])

  useEffect(() => {
    if (!demoRunning || !demoStep) return
    const step = demoSteps.find((item) => item.id === demoStep)
    document.querySelector(`[data-demo="${step?.target}"]`)?.scrollIntoView({ block: "center" })
    if (demoStep === "confirm") {
      setDemoCard((card) => (card ? { ...card, status: "confirmed" } : card))
    }
    if (demoStep === "outcome" || demoStep === "skill" || demoStep === "help") {
      setDemoOutcome("reached")
    }
  }, [demoRunning, demoStep])

  function beginDemo() {
    setDemoCard(emptyDemoCard())
    setDemoOutcome("open")
    setDemoDone(false)
    setDemoRunning(true)
    setDemoStep(DEMO_STEPS[0].id)
    setEscalate(false)
    setCloudNote("")
    setHelpText(null)
  }

  function stopDemo() {
    setDemoRunning(false)
    setDemoStep(null)
    setDemoCard(null)
    setDemoOutcome("open")
    setEscalate(false)
  }

  function nextDemo() {
    const index = demoSteps.findIndex((item) => item.id === demoStep)
    if (index < 0 || index >= demoSteps.length - 1) {
      setDemoRunning(false)
      setDemoStep(null)
      setDemoDone(true)
      return
    }
    setDemoStep(demoSteps[index + 1].id)
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return cards.filter((card) => {
      if (card.status !== filter) return false
      if (!needle) return true
      const hay = `${card.symbol ?? ""} ${card.id} ${(card.keywords || []).join(" ")}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [cards, filter, query])

  const selected = demoRunning
    ? demoCard
    : cards.find((card) => card.id === selectedId) ?? visible[0] ?? null

  async function onRead() {
    if (demoRunning) return
    setBusy(true)
    setError(null)
    setHelpText(null)
    setHelpProvider(null)
    try {
      const payload = await postReading(weekday)
      setReading(payload.reading)
      const fresh = await fetchCards()
      setCards(fresh.cards)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Lecture impossible")
    } finally {
      setBusy(false)
    }
  }

  async function onMode(next: boolean) {
    if (demoRunning) return
    setAutomatic(next)
    try {
      const payload = await saveMode(next)
      setAutomatic(payload.automatic)
    } catch (reason: unknown) {
      setAutomatic(!next)
      setError(reason instanceof Error ? reason.message : "Mode non enregistré")
    }
  }

  async function onSave(status: "draft" | "confirmed") {
    if (!selected) return
    if (demoRunning) {
      setDemoCard({ ...selected, status })
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload = await saveCard({
        id: selected.id,
        status,
        equation: selected.equation,
        keywords: selected.keywords,
        gloss: selected.gloss,
        scope: selected.scope,
        source: "user",
      })
      setCards((current) => current.map((card) => (card.id === payload.card.id ? payload.card : card)))
      if (status === "draft") setFilter("draft")
      if (status === "confirmed") setFilter("confirmed")
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Fiche non enregistrée")
    } finally {
      setBusy(false)
    }
  }

  function patch(partial: Partial<LexiconCard>) {
    if (demoRunning) {
      setDemoCard((card) => (card ? { ...card, ...partial } : card))
      return
    }
    setCards((current) =>
      current.map((card) => (card.id === selected?.id ? { ...card, ...partial } : card))
    )
  }

  async function onHelp() {
    if (demoRunning) return
    setBusy(true)
    setError(null)
    try {
      const payload = await postHelp(reading?.id, escalate, cloudNote)
      setHelpProvider(payload.provider)
      if (payload.awaiting_note) {
        setHelpText("La case cloud est vide : rien n'est parti. Écrivez la note, ou laissez le modèle local.")
      } else if (payload.provider === "queued" || !payload.text) {
        setHelpText("En file. Ollama ne répond pas. Rien n'est parti dans le cloud.")
      } else {
        setHelpText(payload.text)
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Aide indisponible")
    } finally {
      setBusy(false)
    }
  }

  const active = (id: string) => demoRunning && demoSteps.find((item) => item.id === demoStep)?.target === id

  return (
    <div className="flex flex-col gap-4">
      <DemoTourBar
        title="Démo d'apprentissage"
        help={{
          title: "Démo Dictionnaire",
          body: "Courbe fixe 0…19, σ habituel 8, sens monte:05. Le bac reste en mémoire. Arrêter ou Annuler le jette. Aucun appel de modèle.",
        }}
        steps={demoSteps}
        step={demoStep}
        running={demoRunning}
        done={demoDone}
        waiting={demoRunning}
        idleHint="Boucle sur une courbe fixe, sans enregistrement."
        doneHint="Terminée. Rien n'a été écrit dans le dictionnaire."
        onStart={beginDemo}
        onStop={stopDemo}
        dataDemo="lex-bar"
      />
      {demoRunning ? (
        <p className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
          {"Démo — rien n'est enregistré"}
        </p>
      ) : null}

      <div
        data-demo="lex-curve"
        className={cn("rounded-xl border border-border px-3 py-3", active("lex-curve") && "ring-2 ring-primary")}
      >
        <p className="text-sm font-medium">Courbe fixe</p>
        <p className="mt-1 text-xs text-muted-foreground">
          0…19 · σ habituel {DEMO_SIGMA}. Les dates du parcours sont fictives.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div
          data-demo="lex-sense"
          className={cn("rounded-xl border border-border px-3 py-3", active("lex-sense") && "ring-2 ring-primary")}
        >
          <p className="text-sm font-medium">Sens</p>
          <p className="mt-1 font-mono text-sm">{named?.symbol ?? "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{named ? senseSentence(named) : "abstention"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{segmentsSentence(demoSegments())}</p>
        </div>
        <div
          data-demo="lex-episode"
          className={cn("rounded-xl border border-border px-3 py-3", active("lex-episode") && "ring-2 ring-primary")}
        >
          <p className="text-sm font-medium">Épisode</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Dates fictives : du 2024-01-01 au 2024-01-20 · {named?.symbol ?? "monte:05"} · issue {demoOutcome}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lecture 20 / 50 / 100</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(["tous", "mardi", "vendredi"] as const).map((day) => (
              <Button
                key={day}
                size="sm"
                variant={weekday === day ? "default" : "outline"}
                onClick={() => setWeekday(day)}
                disabled={demoRunning}
              >
                {day === "tous" ? "Tous" : day === "mardi" ? "Mardi" : "Vendredi"}
              </Button>
            ))}
            <Button size="sm" onClick={() => void onRead()} disabled={busy || demoRunning}>
              Lire 20/50/100
            </Button>
            <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={automatic}
                disabled={demoRunning}
                onChange={(event) => void onMode(event.target.checked)}
              />
              Automatique à la synchro
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Éteint par défaut. Allumé, une demande part à chaque tirage nouveau : trois appels locaux au plus, le reste en file. Ollama arrêté n&apos;envoie rien dans le cloud.
          </p>
          {reading ? <ReadingGrid reading={reading} /> : null}
          <div
            data-demo="lex-help"
            className={cn("space-y-2 rounded-xl border border-border p-3", active("lex-help") && "ring-2 ring-primary")}
          >
            <p className="text-sm font-medium">Aide</p>
            <p className="text-xs text-muted-foreground">
              {demoRunning ? DEMO_QUESTION : reading?.question || "Une opposition mesurée ouvre la question locale."}
            </p>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={demoRunning ? false : escalate}
                disabled={demoRunning}
                onChange={(event) => setEscalate(event.target.checked)}
              />
              Ce cas dans le cloud
            </label>
            <textarea
              className="min-h-16 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
              placeholder="Note cloud, seulement si la case est cochée"
              value={demoRunning ? "" : cloudNote}
              disabled={demoRunning || !escalate}
              onChange={(event) => setCloudNote(event.target.value)}
            />
            <Button size="sm" variant="outline" disabled={demoRunning || busy || !reading?.opens_llm} onClick={() => void onHelp()}>
              Demander
            </Button>
            {helpText ? (
              <p className="text-sm">
                {helpProvider ? <span className="text-xs text-muted-foreground">{helpProvider} · </span> : null}
                {helpText}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="flex gap-1">
            <Button size="sm" variant={filter === "confirmed" ? "default" : "outline"} onClick={() => setFilter("confirmed")}>
              Confirmées
            </Button>
            <Button size="sm" variant={filter === "draft" ? "default" : "outline"} onClick={() => setFilter("draft")}>
              Brouillons
            </Button>
          </div>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Symbole ou mot-clé"
            aria-label="Recherche"
          />
          <ul className="flex flex-col gap-1">
            {(demoRunning && demoCard ? [demoCard] : visible).map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(card.id)}
                  className={cn(
                    "w-full rounded-lg border px-2 py-1.5 text-left text-xs",
                    selected?.id === card.id ? "border-primary bg-primary/10" : "border-border"
                  )}
                >
                  <span className="font-mono">{card.symbol ?? card.id}</span>
                  <span className="mt-0.5 block text-muted-foreground">{card.status === "draft" ? "brouillon" : "confirmée"} · {card.source}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {selected ? (
          <Card
            data-demo="lex-card"
            className={cn(active("lex-card") && "ring-2 ring-primary")}
          >
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{selected.id}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {selected.status === "draft" ? "brouillon" : "confirmée"} · {selected.source} · rév. {selected.revision ?? 1}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SketchFrame card={selected} />
              <label className="block text-xs text-muted-foreground">
                Équation
                <textarea
                  rows={Math.max(4, readableEquation(selected.equation).split("\n").length + 1)}
                  className="mt-1 field-sizing-content min-h-28 w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm leading-6 text-foreground"
                  value={readableEquation(selected.equation)}
                  onChange={(event) => patch({ equation: event.target.value })}
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Mots-clés
                <Input
                  className="mt-1"
                  value={(selected.keywords || []).join(", ")}
                  onChange={(event) =>
                    patch({
                      keywords: event.target.value
                        .split(",")
                        .map((word) => word.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Phrase
                <textarea
                  className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  value={selected.gloss}
                  onChange={(event) => patch({ gloss: event.target.value })}
                />
              </label>
              <label
                data-demo="lex-scope"
                className={cn("block rounded-lg text-xs text-muted-foreground", active("lex-scope") && "ring-2 ring-primary")}
              >
                Portée
                <textarea
                  className="mt-1 min-h-16 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  value={selected.scope}
                  onChange={(event) => patch({ scope: event.target.value })}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Qualité · épisodes {selected.quality?.episodes ?? 0}
                {selected.quality?.skill != null ? ` · skill ${selected.quality.skill}` : ""}
                {selected.quality?.skill != null && selected.quality.skill <= 0 ? " · abstention" : ""}
                {selected.quality?.reviewed ? ` · relu ${selected.quality.reviewed}` : ""}
              </p>
              <OutcomeRates outcomes={selected.quality?.outcomes} />
              <div data-demo="lex-outcome" className={cn("text-xs text-muted-foreground", active("lex-outcome") && "rounded-lg ring-2 ring-primary")}>
                Issue du parcours : {demoRunning || demoDone ? demoOutcome : "ouverte tant que la fenêtre est en queue d'archive"}
              </div>
              <div data-demo="lex-skill" className={cn("text-xs text-muted-foreground", active("lex-skill") && "rounded-lg ring-2 ring-primary")}>
                Skill du remaniement (courbe fixe) : {skill == null ? "—" : skill.toFixed(2)}
                {skill != null && skill <= 0 ? " · ≤ 0, ce sens est courant une fois l'ordre mélangé" : ""}
              </div>
              <div data-demo="lex-confirm" className={cn("flex gap-2", active("lex-confirm") && "rounded-lg ring-2 ring-primary")}>
                <Button size="sm" disabled={busy} onClick={() => void onSave("confirmed")}>
                  Confirmer
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void onSave("draft")}>
                  Laisser en brouillon
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune fiche dans ce filtre.</p>
        )}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <DemoPopup
        step={demoStep}
        steps={demoSteps}
        open={demoRunning}
        onNext={nextDemo}
        onCancel={stopDemo}
        titleId="lexicon-demo-popup-title"
        nextId="lexicon-demo-next"
      />
    </div>
  )
}

const OUTCOME_DAYS = [
  ["tous", "Tous"],
  ["mardi", "Mardi"],
  ["vendredi", "Vendredi"],
] as const

function OutcomeRates({
  outcomes,
}: {
  outcomes?: Record<string, { reached?: number; invalidated?: number; open?: number }>
}) {
  if (!outcomes) return null
  return (
    <ul className="space-y-0.5 text-xs text-muted-foreground">
      {OUTCOME_DAYS.map(([key, label]) => {
        const bucket = outcomes[key]
        if (!bucket) return null
        return (
          <li key={key}>
            {label} · {bucket.reached ?? 0} suivis · {bucket.invalidated ?? 0} invalidés · {bucket.open ?? 0} ouverts
          </li>
        )
      })}
    </ul>
  )
}

function ReadingGrid({ reading }: { reading: Reading }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {reading.weekday} · {reading.draw_count} tirages
        {reading.from_date && reading.to_date ? ` · du ${reading.from_date} au ${reading.to_date}` : ""}
        {reading.cycles?.draw_date ? ` · jointure Cycles ${reading.cycles.draw_date}` : ""}
      </p>
      {reading.pack?.some((card) => card.recall) ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {reading.pack.map((card) =>
            card.recall ? (
              <li key={card.id}>
                {card.id} · {card.recall}
              </li>
            ) : null
          )}
        </ul>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Champ</th>
              {LENGTHS.map((length) => (
                <th key={length} className="py-1 pr-2 font-medium">
                  {length}
                </th>
              ))}
              <th className="py-1 font-medium">Horizon</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map(([key, label]) => (
              <tr key={key} className="border-t border-border">
                <td className="py-1 pr-2">{label}</td>
                {LENGTHS.map((length) => {
                  const cell = reading.columns?.[length]?.[key]
                  const href = ficheHref(cell?.sense?.symbol)
                  return (
                    <td key={length} className="py-1 pr-2 font-mono">
                      {href ? (
                        <Link href={href} className="text-primary underline-offset-2 hover:underline">
                          {symbolOf(cell?.sense ?? null)}
                        </Link>
                      ) : (
                        symbolOf(cell?.sense ?? null)
                      )}
                      {cell?.reread === "opposé" ? <span className="text-rose-300"> · relit</span> : null}
                    </td>
                  )
                })}
                <td className="py-1">{reading.horizons?.[key] ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {reading.oppositions?.length ? (
        <ul className="space-y-1 text-xs">
          {reading.oppositions.map((item, index) => (
            <li key={`${item.kind}-${index}`}>
              opposé · {item.kind}
              {item.field ? ` · ${item.field}` : ""}
              {item.length ? ` · ${item.length}` : ""}
              {item.clock ? ` · ${item.clock}` : ""}
              {item.left && item.right ? ` · ${item.left} / ${item.right}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Pas d&apos;opposition sur cette demande.</p>
      )}
      {reading.ref?.length ? (
        <ul className="space-y-1 text-xs">
          {reading.ref.map((row) => (
            <li key={`${row.clock}-${row.field}`}>
              <Link href={refHref(row.clock)} className="text-primary underline-offset-2 hover:underline">
                {row.clock}
              </Link>
              {" · "}
              {row.field} · {row.verdict}
            </li>
          ))}
        </ul>
      ) : null}
      {reading.stamps?.length ? (
        <p className="text-xs text-muted-foreground">
          {reading.stamps.map((stamp) => (
            <span key={stamp.clock} className="mr-2">
              <Link href={refHref(stamp.clock)} className="text-primary underline-offset-2 hover:underline">
                {stamp.clock}
              </Link>{" "}
              {stamp.phase.toFixed(2)}
            </span>
          ))}
        </p>
      ) : null}
      {reading.measured?.length ? (
        <p className="text-xs text-muted-foreground">
          {reading.measured.map((row) => `${row.id} ${row.status}`).join(" · ")}
        </p>
      ) : null}
      {reading.link ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {Object.values(reading.link).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {reading.difficulties?.some((item) => item.startsWith("skill:")) ? (
        <p className="text-xs text-muted-foreground">
          Skill ≤ 0 écrit sur la fiche : abstention, pas une opposition.
        </p>
      ) : null}
    </div>
  )
}
