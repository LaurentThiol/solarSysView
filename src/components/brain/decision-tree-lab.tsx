"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { GitBranch, Loader2, Pin, Shapes, CircleDot } from "lucide-react"

import { DemoPopup, DemoTourBar } from "@/components/brain/brain-demo"
import { NullScoreHistogram, ReadingProgress, TreeViewport } from "@/components/brain/decision-tree-frame"
import { HelpTip, HelpWrap, LabelHelp } from "@/components/help"
import { WeekdayScopeControl } from "@/components/weekday-scope-control"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { CatalogEntry } from "@/lib/brain/catalog"
import {
  DEMO_TREE_READING,
  DEMO_TREE_STEPS,
  decisionTreeDemoWantsStart,
  type DecisionTreeDemoStepId,
} from "@/lib/brain/decision-tree-demo"
import {
  cancelDecisionJob,
  decisionTreeStatus,
  listDecisionReadings,
  loadDecisionReading,
  startDecisionJob,
  waitDecisionJob,
  writeSpecialistDraft,
  type DecisionQuestionInput,
  type DecisionReading,
  type DecisionStatus,
} from "@/lib/brain/decision-tree"
import {
  ariaTreeLabel,
  ballChanceRow,
  expectedDuration,
  formatP,
  leafLine,
  primaryFollowUp,
  readingStale,
  ruleCuts,
  sortRules,
} from "@/lib/brain/decision-tree-view"
import { queueBrainPin } from "@/lib/brain/specialist-demo"
import { trainSpecialist } from "@/lib/brain/specialists"
import { ERA_LABELS } from "@/lib/copy"
import { TREE_CHANCE_KEY } from "@/lib/jeux"
import { useDraws } from "@/lib/use-draws"
import { useWeekdayScope } from "@/lib/use-weekday-scope"
import { cn } from "@/lib/utils"

const HELP = {
  page: {
    title: "decisionTree",
    body: "Un arbre cherche où le flux se coupe, juste avant le tirage t. L’indépendance n’est que l’hypothèse nulle : on détruit l’ordre des tirages et on rejoue tout le calcul. Un seuil qui tient ici et disparaît sur l’ordre détruit est un seuil de flux. S’il ne dépasse pas ce nul, aucun seuil n’est visible — ce n’est pas une conclusion d’indépendance.",
    items: [
      { label: "Question", text: "Flux, Boules ou Figures. Rien ne se lance sans « Lire le flux »." },
      { label: "Verdict", text: "Le score sur le contrôle, face à la moyenne des remaniements, et le p." },
      { label: "Suite", text: "Spécialiste, chances vers Jeux, ou règle chartiste. Rien n’est écrit en silence." },
    ],
  },
  archive: {
    title: "Archive",
    body: "Formule actuelle par défaut. « Tout l’historique » mélange les anciennes formules d’étoiles : elles sortent alors du tableau, parce que leur pool a changé. Le filtre Jour est le même que sur Spécialistes.",
  },
  flux: {
    title: "Flux",
    body: "Une ligne est l’état du flux juste avant le tirage t. Les pastilles demandent si ce tirage a une somme haute, au moins 3 pairs, ou un n1 bas. Défaut : somme haute.",
  },
  portee: {
    title: "Portée",
    body: "Toutes les séries : dernière valeur, pas, pente et z20 de la somme, de l’étendue, de la parité, de n1–n5 et de g1–g4. Une série : les quinze indicateurs de cette seule série. L’étiquette est alors la même que le spécialiste binaire (parité ≥ 3, sinon au-dessus de la médiane d’apprentissage).",
  },
  forme: {
    title: "Forme demandée",
    body: "Ce que l’on demande au tirage t quand la portée est « toutes les séries ». Somme haute et parité ≥ 3 coïncident avec le spécialiste binaire. n1 bas est l’inverse de la forme haute que le spécialiste apprend : le brouillon le dit.",
  },
  serie: {
    title: "Une série",
    body: "L’arbre ne lit que les indicateurs de cette série, et pose la même question binaire que le spécialiste. Un clic sur une carte de Spécialistes lance cette portée.",
  },
  balls: {
    title: "Boules",
    body: "Une ligne est une boule, juste avant le tirage t : son retard, ses sorties sur 20 et 50 tirages, la dernière valeur, le RSI et le z20 de ce retard. L’étiquette est : elle sort au tirage t. Les classes sont rééquilibrées (une sortie pour beaucoup d’absences). Le mot « retard » ne désigne que ce retard de boule.",
  },
  figures: {
    title: "Figures",
    body: "Une ligne est une figure dont le breakout est tranché : objectif atteint, ou figure invalidée. L’arbre lit la confiance, l’activité, la longueur, la direction, la courbe et le jour. Le nul ne rejoue pas un nouveau balayage : ce sont des départs tirés au hasard sur la même courbe.",
  },
  reglages: {
    title: "Réglages",
    body: "Profondeur maximale, critère, nombre de remaniements, et courbes des figures. Repliés : la recherche choisit déjà profondeur, critère et plancher de feuille dans l’apprentissage. Vous n’avez rien à régler pour lancer une lecture.",
  },
  profondeur: {
    title: "Profondeur",
    body: "Plafond de coupures successives : 2, 3 ou 4. La validation temporelle, dans l’apprentissage seul, choisit la profondeur parmi ce plafond. Le contrôle ne vote pas.",
  },
  gini: {
    title: "Gini",
    body: "Critère de coupure : à quel point un seuil mélange les deux classes. Plus il est bas dans une branche, plus la branche est pure. « Gini ou entropie » laisse la recherche choisir sur l’apprentissage seul.",
  },
  entropy: {
    title: "Entropie",
    body: "Autre critère de coupure, plus sensible aux classes rares. La recherche le compare à Gini sans regarder le contrôle.",
  },
  n: {
    title: "N",
    body: "Nombre de fois où l’ordre des tirages est détruit et où tout le calcul est rejoué. 99 par défaut, 49 pour les boules. Laissez vide pour garder ce défaut.",
  },
  courbes: {
    title: "Courbes",
    body: "Séries sur lesquelles les figures sont lues. Défaut : somme, étendue, parité, n1. Une courbe retirée sort du tableau.",
  },
  lire: {
    title: "Lire le flux",
    body: "Construit le tableau, cherche l’arbre, rejoue les remaniements, puis dessine. La durée attendue est sous le bouton. Échap ou Annuler arrête. Une seule lecture à la fois.",
  },
  annuler: {
    title: "Annuler",
    body: "Arrête la lecture en cours. Le calcul déjà fait n’est pas gardé. Échap fait la même chose.",
  },
  lecture: {
    title: "Lecture",
    body: "Quatre étapes réelles : le tableau du flux, la recherche de l’arbre, chaque remaniement (k/N), puis le dessin. La barre ne simule pas une attente.",
  },
  verdict: {
    title: "Verdict",
    body: "Une phrase, puis l’histogramme des scores obtenus quand l’ordre est détruit. Le trait est le score réel, sur le contrôle. Le flux est reconnu si p ≤ 0,05.",
  },
  histogramme: {
    title: "Histogramme du nul",
    body: "Chaque barre compte des remaniements dont le score tombe dans la même tranche. La barre marquée est celle du score réel. S’il est dans le tas, le seuil ne dépasse pas le nul.",
  },
  apprentissage: {
    title: "Apprentissage",
    body: "Tirages sur lesquels l’arbre a été cherché. Les histogrammes du dessin montrent cet apprentissage. L’effectif de contrôle est à part, dans la liste des feuilles.",
  },
  seuil: {
    title: "Seuil",
    body: "Valeur de coupure sur une mesure du flux, juste avant le tirage t. Le même nombre, à deux décimales, est dans le dessin et dans la liste (162.50).",
  },
  feuille: {
    title: "Feuille",
    body: "Bout de l’arbre : une classe, un effectif d’apprentissage et un effectif de contrôle. Le numéro est celui du dessin. Les flèches haut et bas parcourent la liste. Une feuille dont le contrôle tombe sous la moyenne du nul est grisée.",
  },
  remaniement: {
    title: "Remaniement",
    body: "On détruit l’ordre des tirages et on rejoue caractéristiques, étiquettes, recherche et score. Ce nul annule le retour à la moyenne des pas et des lags. On ne compare jamais à un taux fixe (50 %, 5/50).",
  },
  p: {
    title: "p",
    body: "(1 + nombre de remaniements au moins aussi bons que la lecture) / (1 + N). Le flux est reconnu si p ≤ 0,05.",
  },
  pcorrige: {
    title: "p corrigé",
    body: "Le p revu par Benjamini–Hochberg sur toutes les lectures de la même ère, y compris celles sans seuil. Une démonstration doit encore tenir après cette correction.",
  },
  controle: {
    title: "Contrôle",
    body: "Les 100 derniers tirages (ou 30 % si la série est courte). Ils ne servent qu’une fois, au verdict et sur chaque feuille. Ils ne choisissent pas la profondeur. C’est le même découpage que le score 20/50/100 des spécialistes.",
  },
  dessin: {
    title: "Dessin",
    body: "Chaque nœud montre l’histogramme empilé des deux classes arrivées là, avec un trait à la coupure. Les feuilles sont des barres d’effectifs, pas un camembert. Glisser déplace, Ctrl + molette zoome. Sans le programme dot, le même arbre s’écrit en texte.",
  },
  cas: {
    title: "Prochain tirage",
    body: "Le dernier état du flux, classé par l’arbre déjà lu. La feuille atteinte et sa probabilité. « Chemin seul » ne garde que les branches de ce cas.",
  },
  chemin: {
    title: "Chemin seul",
    body: "Le dessin du prochain tirage ne montre plus que le chemin suivi, avec la valeur du cas sur chaque histogramme.",
  },
  train: {
    title: "Entraîner ce spécialiste",
    body: "Le brouillon reprend la série, la forme binaire (la même étiquette que l’arbre) et seulement les indicateurs que l’arbre utilise. Le nom se corrige. Entraîner lance le réseau. Boules et Figures ne deviennent pas des spécialistes.",
  },
  jeux: {
    title: "Envoyer vers Jeux",
    body: "Propose une chance par boule, colorée selon la probabilité de sortie. Jeux affiche la provenance. Rien n’est écrit dans la spec tant que vous n’avez pas cliqué « Appliquer les chances ».",
  },
  regle: {
    title: "Préparer la règle",
    body: "Ouvre le panneau des règles chartistes, prérempli par la feuille qui tient au contrôle. La règle n’est pas enregistrée.",
  },
  retry: {
    title: "Essayer une autre question",
    body: "Le seuil n’a pas dépassé le nul. Deux autres questions sont proposées. L’atelier des spécialistes reste accessible, en second plan.",
  },
  pin: {
    title: "Épingler à Brain",
    body: "Pose @tree.<lecture> sur la table de Brain, comme un spécialiste. Sans épingle, Brain ne cite pas cette lecture.",
  },
  export: {
    title: "Exporter",
    body: "Télécharge les règles en JSON, et le dessin SVG quand il existe. Les seuils sont les mêmes nombres que dans la liste.",
  },
  journal: {
    title: "Journal",
    body: "Toutes les lectures, y compris les verdicts sans seuil. Le rail coloré marque un seuil reconnu. Le p corrigé est celui de l’ère. Une lecture est périmée quand l’ère, le jour ou de nouveaux tirages l’ont dépassée : Relire la refait.",
  },
}

const QUESTIONS = [
  {
    id: "flux",
    title: "Flux",
    sentence: "Le tirage t porte-t-il la forme demandée ?",
    icon: GitBranch,
  },
  {
    id: "balls",
    title: "Boules",
    sentence: "Cette boule sort-elle au tirage t ?",
    icon: CircleDot,
  },
  {
    id: "chartisme",
    title: "Figures",
    sentence: "L’objectif de cette figure est-il atteint ?",
    icon: Shapes,
  },
] as const

const SHAPE_PILLS = [
  { id: "sum_high", label: "somme haute" },
  { id: "parity_high", label: "parité ≥ 3" },
  { id: "n1_low", label: "n1 bas" },
] as const

const SERIES = [
  { id: "parity", label: "parité" },
  { id: "sum", label: "somme" },
  { id: "spread", label: "étendue" },
  { id: "n1", label: "n1" },
] as const

const CURVES = ["sum", "spread", "parity", "n1"] as const

function treeEntry(reading: DecisionReading): CatalogEntry {
  return {
    id: `tree/${reading.slug}`,
    handle: reading.slug,
    aliases: [`tree.${reading.slug}`],
    lab: "specialist",
    family: "decisionTree",
    kind: "tree",
    label: reading.phrase || reading.slug,
    units: "seuil",
    reading: reading.verdict_text || "",
    defaults: { variable: "sum" },
  }
}

function questionPayload(
  card: "flux" | "balls" | "chartisme",
  scope: "shape" | "series",
  label: string,
  series: string,
  curves: string[],
  depth: number,
  criterion: string,
  permutations: string
): DecisionQuestionInput {
  const perm = permutations.trim() ? Number(permutations) : null
  const base = {
    era: "current" as const,
    max_depth: depth,
    criterion: criterion === "auto" ? null : criterion,
    permutations: perm != null && Number.isFinite(perm) ? perm : null,
  }
  if (card === "balls") return { ...base, question: "balls" }
  if (card === "chartisme") return { ...base, question: "chartisme", curves }
  if (scope === "series") return { ...base, question: "series", series }
  return { ...base, question: "shape", label }
}

export function DecisionTreeTitle() {
  return (
    <span className="inline-flex items-center gap-2">
      decisionTree
      <HelpTip {...HELP.page} />
    </span>
  )
}

export function DecisionTreeLab() {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const [era, setEra] = useState<"current" | "all">("current")
  const [weekday, setWeekday] = useWeekdayScope()
  const { draws, source, loading } = useDraws(era, weekday)
  const [card, setCard] = useState<"flux" | "balls" | "chartisme">("flux")
  const [scope, setScope] = useState<"shape" | "series">("shape")
  const [label, setLabel] = useState("sum_high")
  const [series, setSeries] = useState("parity")
  const [curves, setCurves] = useState<string[]>([...CURVES])
  const [depth, setDepth] = useState(4)
  const [criterion, setCriterion] = useState("auto")
  const [permutations, setPermutations] = useState("")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [status, setStatus] = useState<DecisionStatus & { api?: boolean } | null>(null)
  const [journal, setJournal] = useState<DecisionReading[]>([])
  const [journalReady, setJournalReady] = useState(false)
  const [filterQ, setFilterQ] = useState("all")
  const [filterV, setFilterV] = useState("all")
  const [reading, setReading] = useState<DecisionReading | null>(null)
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState<string | null>(null)
  const [k, setK] = useState(0)
  const [n, setN] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [leaf, setLeaf] = useState<number | null>(null)
  const [pathOnly, setPathOnly] = useState(false)
  const [trainName, setTrainName] = useState("")
  const [training, setTraining] = useState(false)
  const [pins, setPins] = useState<CatalogEntry[]>([])
  const [demoStep, setDemoStep] = useState<DecisionTreeDemoStepId | null>(null)
  const [demoRunning, setDemoRunning] = useState(false)
  const [demoDone, setDemoDone] = useState(false)
  const [demoWaiting, setDemoWaiting] = useState(false)
  const cancelRef = useRef({ cancelled: false, id: "" })
  const demoGate = useRef<{ resolve: (ok: boolean) => void } | null>(null)
  const demoStop = useRef(false)
  const demoAuto = useRef(false)

  const demoShowsResult =
    demoRunning && (demoStep === "verdict" || demoStep === "arbre" || demoStep === "suite")
  const shown = demoShowsResult ? DEMO_TREE_READING : reading
  const beats = Boolean(shown?.beats_independence)
  const follow = shown ? primaryFollowUp(shown.question, beats) : "retry"
  const rules = useMemo(() => sortRules(shown?.rules ?? []), [shown])
  const openLeaf = rules.find((rule) => rule.node === leaf) ?? rules[0]
  const duration = expectedDuration(
    card === "flux" ? (scope === "series" ? "series" : "shape") : card,
    permutations.trim() ? Number(permutations) : null
  )

  const refreshJournal = useCallback(async () => {
    const listed = await listDecisionReadings()
    if (listed.ok) setJournal(listed.items)
    setJournalReady(true)
    return listed
  }, [])

  useEffect(() => {
    void decisionTreeStatus().then(setStatus)
    void refreshJournal()
  }, [refreshJournal])

  useEffect(() => {
    const slug = search.get("lecture")
    if (!slug) return
    void loadDecisionReading(slug)
      .then((item) => {
        setReading(item)
        setError(null)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Lecture introuvable"))
  }, [search])

  const stop = useCallback(async () => {
    cancelRef.current.cancelled = true
    if (cancelRef.current.id) await cancelDecisionJob(cancelRef.current.id).catch(() => undefined)
    setRunning(false)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && running) void stop()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [running, stop])

  const read = async (override?: Partial<DecisionQuestionInput> & { card?: "flux" | "balls" | "chartisme" }) => {
    setError(null)
    setRunning(true)
    setStage("tableau")
    setK(0)
    setN(0)
    cancelRef.current = { cancelled: false, id: "" }
    const nextCard = override?.card ?? card
    const payload = {
      ...questionPayload(nextCard, scope, label, series, curves, depth, criterion, permutations),
      era,
      ...override,
    }
    delete (payload as { card?: string }).card
    try {
      const job = await startDecisionJob(payload, weekday)
      cancelRef.current.id = job.id
      const result = await waitDecisionJob(job.id, (tick) => {
        setStage(tick.stage ?? null)
        setK(tick.k ?? 0)
        setN(tick.n ?? 0)
      }, cancelRef.current)
      if (result) {
        setReading(result)
        setLeaf(result.rules?.[0]?.node ?? null)
        setTrainName(result.drafts?.[0]?.name ?? "")
        setPathOnly(false)
      }
      await refreshJournal()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lecture impossible")
    } finally {
      setRunning(false)
    }
  }

  const pin = (item: DecisionReading) => {
    const entry = treeEntry(item)
    setPins((prev) => (prev.some((pinItem) => pinItem.id === entry.id) ? prev : [...prev, entry]))
    queueBrainPin(entry.id)
  }

  const trainDraft = async (draft = shown?.drafts?.[0]) => {
    if (!draft || !shown) return
    setTraining(true)
    setError(null)
    try {
      const record = await trainSpecialist(
        {
          name: trainName.trim() || draft.name,
          target: draft.target,
          indicators: draft.indicators,
          instructions: draft.instructions,
          task: "binary",
          horizon: "value",
          era,
          origin: shown.slug,
        },
        weekday
      )
      if (!record.saved && record.reason) setError(record.reason)
      else router.push("/brain/specialistes")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Entraînement impossible")
    } finally {
      setTraining(false)
    }
  }

  const sendJeux = () => {
    if (!shown) return
    const numberChance = ballChanceRow(shown.ball_scores ?? [])
    try {
      sessionStorage.setItem(
        TREE_CHANCE_KEY,
        JSON.stringify({ slug: shown.slug, phrase: shown.phrase ?? "", numberChance })
      )
    } catch {
      /* quota */
    }
    router.push("/jeux")
  }

  const prepareRule = () => {
    const rule = shown?.chartisme_rules?.[0]
    if (!rule) {
      setError("Aucune feuille positive tenue au contrôle.")
      return
    }
    sessionStorage.setItem("synchro.chartisme.rule-draft", JSON.stringify(rule))
    router.push("/chartisme")
  }

  const openAtelier = (draft = shown?.drafts?.[0]) => {
    if (!draft || !shown) return
    writeSpecialistDraft({ ...draft, name: trainName.trim() || draft.name, origin: shown.slug })
    router.push("/brain/specialistes")
  }

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      setError("Copie impossible.")
    }
  }

  const exportReading = () => {
    if (!shown) return
    const blob = new Blob([JSON.stringify({ rules: shown.rules, verdict: shown.verdict_text }, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${shown.slug}-regles.json`
    link.click()
    URL.revokeObjectURL(url)
    if (shown.tree_svg) {
      const svgUrl = URL.createObjectURL(new Blob([shown.tree_svg], { type: "image/svg+xml" }))
      const svgLink = document.createElement("a")
      svgLink.href = svgUrl
      svgLink.download = `${shown.slug}.svg`
      svgLink.click()
      URL.revokeObjectURL(svgUrl)
    }
  }

  const finishDemo = useCallback((ok: boolean) => {
    const gate = demoGate.current
    demoGate.current = null
    setDemoWaiting(false)
    gate?.resolve(ok)
  }, [])

  const stopDemo = useCallback(() => {
    demoStop.current = true
    setDemoRunning(false)
    setDemoDone(true)
    setDemoStep(null)
    finishDemo(false)
  }, [finishDemo])

  const runDemo = useCallback(async () => {
    if (demoRunning) return
    demoAuto.current = true
    demoStop.current = false
    setDemoRunning(true)
    setDemoDone(false)
    setReading(null)
    setCard("flux")
    setScope("shape")
    setLabel("sum_high")
    const ask = async (step: DecisionTreeDemoStepId) => {
      if (demoStop.current) return false
      setDemoStep(step)
      document.querySelector(`[data-demo="${DEMO_TREE_STEPS.find((item) => item.id === step)?.target}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
      await new Promise((resolve) => window.setTimeout(resolve, 280))
      if (demoStop.current) return false
      setDemoWaiting(true)
      const ok = await new Promise<boolean>((resolve) => {
        demoGate.current = { resolve }
      })
      return ok && !demoStop.current
    }
    try {
      if (!(await ask("question"))) return
      setStage("remaniements")
      setK(37)
      setN(99)
      setRunning(true)
      if (!(await ask("lecture"))) return
      setRunning(false)
      setStage("fait")
      setReading(DEMO_TREE_READING)
      if (!(await ask("verdict"))) return
      if (!(await ask("arbre"))) return
      if (!(await ask("suite"))) return
    } finally {
      setRunning(false)
      setDemoWaiting(false)
      setDemoRunning(false)
      setDemoDone(true)
      if (!demoStop.current) setDemoStep("suite")
    }
  }, [demoRunning])

  useEffect(() => {
    if (demoAuto.current) return
    if (!decisionTreeDemoWantsStart(search.toString(), pathname)) return
    const timer = window.setTimeout(() => {
      if (!demoAuto.current) void runDemo()
    }, 80)
    return () => window.clearTimeout(timer)
  }, [pathname, runDemo, search])

  const journalRows = journal.filter((item) => {
    if (filterQ !== "all" && item.question !== filterQ) return false
    if (filterV === "flux" && !item.beats_independence) return false
    if (filterV === "aucun" && item.beats_independence) return false
    return true
  })

  const phrase =
    card === "balls"
      ? "la boule sort-elle au tirage t ?"
      : card === "chartisme"
        ? "l’objectif de la figure est-il atteint ?"
        : scope === "series"
          ? `cette série sera-t-elle haute au tirage t ?`
          : label === "parity_high"
            ? "le tirage t aura-t-il une parité ≥ 3 ?"
            : label === "n1_low"
              ? "le tirage t aura-t-il un n1 bas ?"
              : "le tirage t aura-t-il une somme haute ?"

  const apiDown = status != null && status.api === false
  const noSklearn = status?.api && status.sklearn === false

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <DemoPopup
        step={demoStep}
        steps={DEMO_TREE_STEPS}
        open={demoRunning && demoWaiting}
        onNext={() => finishDemo(true)}
        onCancel={stopDemo}
        titleId="tree-demo-title"
        nextId="tree-demo-next"
      />
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-card/50 px-3 py-2">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1 text-sm font-semibold tracking-tight">
            decisionTree
            <HelpTip {...HELP.page} />
          </p>
          <p className="text-[11px] text-muted-foreground">
            {loading ? "tirages…" : `${draws.length} tirages · ${source}`}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <WeekdayScopeControl value={weekday} onChange={setWeekday} compact />
          <label className="flex items-center gap-1 text-xs">
            Archive
            <HelpTip {...HELP.archive} />
            <select
              className="rounded-md border border-border bg-background px-2 py-1"
              value={era}
              onChange={(event) => setEra(event.target.value as "current" | "all")}
            >
              <option value="current">{ERA_LABELS.current}</option>
              <option value="all">{ERA_LABELS.all}</option>
            </select>
          </label>
        </div>
      </section>

      <p className="rounded-xl border border-primary/20 bg-primary/8 px-3 py-2 text-xs leading-5 text-muted-foreground">
        Les tirages sont dans des flux (somme, rangs, retards, figures). L’indépendance n’est que l’hypothèse nulle : un seuil qui tient sur l’ordre réel et disparaît quand on détruit l’ordre la dépasse. Si rien ne dépasse ce nul, aucun seuil de flux n’est visible sur cette question.
      </p>

      {apiDown ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
          API éteinte. Relance <span className="font-mono">./launch</span>. En ligne de commande :{" "}
          <span className="font-mono">python -m synchro decision-tree read</span>.
        </p>
      ) : null}
      {noSklearn ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
          scikit-learn est absent (démarrage avec <span className="font-mono">--skip-install</span>, ou pip en échec). Relance <span className="font-mono">./launch</span> : il installe decisionTree tout seul. Réparation : <span className="font-mono">./launch install-decision-tree</span>.
        </p>
      ) : null}

      <DemoTourBar
        title="Démo decisionTree"
        help={{
          title: "Démo decisionTree",
          body: "Cinq pas : question, lecture, verdict, arbre, suite. Une lecture d’exemple, sans lancer le calcul.",
        }}
        steps={DEMO_TREE_STEPS}
        step={demoStep}
        running={demoRunning}
        done={demoDone}
        waiting={demoWaiting}
        idleHint="Question, lecture, verdict, arbre, suite. Sans calcul."
        doneHint="Terminée : l’exemple reste à l’écran."
        onStart={() => void runDemo()}
        onStop={stopDemo}
        startLabel="Lancer la démo"
        dataDemo="tree-bar"
      />

      <section data-demo="tree-question" className="flex flex-col gap-3">
        <div className="grid gap-3 md:grid-cols-3">
          {QUESTIONS.map((item) => {
            const on = card === item.id
            const Icon = item.icon
            const help = item.id === "flux" ? HELP.flux : item.id === "balls" ? HELP.balls : HELP.figures
            return (
              <div key={item.id} className="relative">
                <button
                  type="button"
                  aria-label={item.title}
                  className={cn(
                    "h-full w-full rounded-2xl border px-3 py-3 pr-8 text-left",
                    on ? "border-primary/50 bg-primary/10" : "border-border bg-card/40"
                  )}
                  onClick={() => setCard(item.id)}
                >
                  <Icon className="size-4 text-primary" />
                  <p className="mt-2 text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{item.sentence}</p>
                </button>
                <span className="absolute top-2 right-2">
                  <HelpTip {...help} />
                </span>
              </div>
            )
          })}
        </div>
        <p className="text-sm text-foreground">{phrase}</p>
        {card === "flux" ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Portée">
              <HelpTip {...HELP.portee} />
              {(
                [
                  ["shape", "toutes les séries"],
                  ["series", "une série"],
                ] as const
              ).map(([id, text]) => (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs",
                    scope === id ? "border-primary/50 bg-primary/15" : "border-border text-muted-foreground"
                  )}
                  onClick={() => setScope(id)}
                >
                  {text}
                </button>
              ))}
            </div>
            {scope === "shape" ? (
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Forme">
                <HelpTip {...HELP.forme} />
                {SHAPE_PILLS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs",
                      label === item.id ? "border-primary/50 bg-primary/15" : "border-border text-muted-foreground"
                    )}
                    onClick={() => setLabel(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Série">
                <HelpTip {...HELP.serie} />
                {SERIES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs",
                      series === item.id ? "border-primary/50 bg-primary/15" : "border-border text-muted-foreground"
                    )}
                    onClick={() => setSeries(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
        <div>
          <span className="inline-flex items-center gap-1">
            <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setSettingsOpen((open) => !open)}>
              {settingsOpen ? "Replier les réglages" : "Réglages"}
            </button>
            <HelpTip {...HELP.reglages} />
          </span>
          {settingsOpen ? (
            <div className="mt-2 grid gap-2 rounded-xl border border-border p-3 text-xs sm:grid-cols-3">
              <LabelHelp label="Profondeur max" help={HELP.profondeur}>
                <select className="rounded-md border border-border bg-background px-2 py-1" value={depth} onChange={(event) => setDepth(Number(event.target.value))}>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </LabelHelp>
              <label className="flex items-center gap-1">
                Critère
                <HelpTip {...HELP.gini} />
                <HelpTip {...HELP.entropy} />
                <select className="rounded-md border border-border bg-background px-2 py-1" value={criterion} onChange={(event) => setCriterion(event.target.value)}>
                  <option value="auto">Gini ou entropie</option>
                  <option value="gini">Gini</option>
                  <option value="entropy">entropie</option>
                </select>
              </label>
              <LabelHelp label="N" help={HELP.n} row>
                <Input value={permutations} placeholder={card === "balls" ? "49" : "99"} onChange={(event) => setPermutations(event.target.value)} />
              </LabelHelp>
              {card === "chartisme" ? (
                <div className="flex flex-wrap items-center gap-1 sm:col-span-3">
                  <HelpTip {...HELP.courbes} />
                  {CURVES.map((name) => {
                    const on = curves.includes(name)
                    return (
                      <button
                        key={name}
                        type="button"
                        className={cn("rounded-full border px-2 py-1", on ? "border-primary/50 bg-primary/15" : "border-border")}
                        onClick={() => setCurves((prev) => (on ? prev.filter((item) => item !== name) : [...prev, name]))}
                      >
                        {name}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div>
          <HelpWrap help={HELP.lire}>
            <Button type="button" disabled={running || Boolean(noSklearn) || apiDown} onClick={() => void read()}>
              {running ? <Loader2 className="animate-spin" /> : <GitBranch />}
              Lire le flux
            </Button>
          </HelpWrap>
          <p className="mt-1 text-[11px] text-muted-foreground">Durée attendue : {duration}.</p>
        </div>
      </section>

      {running || stage ? (
        <section className="flex flex-col gap-2">
          <p className="inline-flex items-center gap-1 text-xs font-medium">
            Lecture
            <HelpTip {...HELP.lecture} />
          </p>
          <ReadingProgress stage={stage} k={k} n={n} running={running} />
          {running ? (
            <HelpWrap help={HELP.annuler}>
              <Button type="button" size="sm" variant="outline" onClick={() => void stop()}>
                Annuler
              </Button>
            </HelpWrap>
          ) : null}
        </section>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {shown ? (
        <>
          <section data-demo="tree-verdict" className="flex flex-col gap-3 rounded-2xl border border-border bg-card/40 p-3">
            <p className="inline-flex items-start gap-1 text-base leading-6">
              <span>{shown.verdict_text}</span>
              <HelpTip {...HELP.verdict} />
            </p>
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <NullScoreHistogram scores={shown.null_scores ?? []} real={shown.holdout_score ?? 0} />
              </div>
              <HelpTip {...HELP.histogramme} />
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <Badge variant="outline">
                {shown.criterion === "entropy" ? "entropie" : "Gini"} <HelpTip {...(shown.criterion === "entropy" ? HELP.entropy : HELP.gini)} />
              </Badge>
              <Badge variant="outline">
                profondeur {shown.max_depth} <HelpTip {...HELP.profondeur} />
              </Badge>
              <Badge variant="outline">
                apprentissage {shown.train_n} <HelpTip {...HELP.apprentissage} />
              </Badge>
              <Badge variant="outline">
                contrôle {shown.holdout_n} <HelpTip {...HELP.controle} />
              </Badge>
              <Badge variant="outline">
                p = {formatP(shown.p)} <HelpTip {...HELP.p} />
              </Badge>
              {shown.p_adjusted != null ? (
                <Badge variant="outline">
                  p corrigé {formatP(shown.p_adjusted)} <HelpTip {...HELP.pcorrige} />
                </Badge>
              ) : null}
            </div>
          </section>

          <section data-demo="tree-drawing" className="flex flex-col gap-3 xl:flex-row">
            <div className="min-w-0 xl:w-2/3">
              <p className="mb-1 inline-flex items-center gap-1 text-xs font-medium">
                Dessin
                <HelpTip {...HELP.dessin} />
              </p>
              <TreeViewport
                svg={shown.tree_svg}
                text={shown.tree_text}
                label={ariaTreeLabel(rules)}
                fallbackHint={shown.slug !== "demo-flux"}
              />
              {!shown.tree_svg && shown.tree_text ? (
                <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => void copyText(shown.tree_text || "")}>
                  Copier
                </Button>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col gap-2 xl:w-1/3">
              <p className="inline-flex items-center gap-1 text-xs font-medium">
                Feuilles
                <HelpTip {...HELP.feuille} />
                <HelpTip {...HELP.seuil} />
              </p>
              <div
                className="flex max-h-[28rem] flex-col gap-1.5 overflow-auto"
                role="listbox"
                aria-label={ariaTreeLabel(rules)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
                  event.preventDefault()
                  const index = Math.max(0, rules.findIndex((rule) => rule.node === openLeaf?.node))
                  const next = event.key === "ArrowDown" ? Math.min(rules.length - 1, index + 1) : Math.max(0, index - 1)
                  setLeaf(rules[next]?.node ?? null)
                }}
              >
                {rules.map((rule) => (
                  <button
                    key={rule.node}
                    type="button"
                    role="option"
                    aria-selected={openLeaf?.node === rule.node}
                    className={cn(
                      "rounded-xl border px-2.5 py-2 text-left text-xs",
                      rule.weak ? "border-border bg-muted/40 text-muted-foreground" : "border-border",
                      openLeaf?.node === rule.node ? "border-primary/50 bg-primary/10" : ""
                    )}
                    onClick={() => setLeaf(rule.node)}
                  >
                    <span className="font-medium">Feuille {rule.node}</span>
                    <span className="mt-0.5 block">{rule.class_name}</span>
                    <span className="mt-0.5 block">{leafLine(rule)}</span>
                    {rule.weak ? <span className="mt-0.5 block">Le contrôle tombe sous le nul.</span> : null}
                  </button>
                ))}
              </div>
              {openLeaf ? (
                <ol className="rounded-xl border border-border px-2.5 py-2 text-xs">
                  {ruleCuts(openLeaf).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ol>
              ) : null}
            </div>
          </section>

          <section data-demo="tree-next" className="flex flex-col gap-3 rounded-2xl border border-border p-3">
            <p className="inline-flex items-center gap-1 text-sm font-medium">
              Prochain tirage
              <HelpTip {...HELP.cas} />
            </p>
            {shown.case ? (
              <p className="text-sm">
                Feuille {shown.case.leaf}
                {shown.case.class_name ? ` · ${shown.case.class_name}` : ""}
                {shown.case.proba && shown.case.predicted != null && shown.case.proba[shown.case.predicted] != null
                  ? ` · ${Math.round(shown.case.proba[shown.case.predicted] * 100)} %`
                  : ""}
              </p>
            ) : null}
            {shown.case_svg ? (
              <>
                <TreeViewport
                  svg={pathOnly && shown.path_svg ? shown.path_svg : shown.case_svg}
                  label="Chemin du prochain tirage"
                  compact
                />
                {shown.path_svg ? (
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={pathOnly} onChange={(event) => setPathOnly(event.target.checked)} />
                    chemin seul
                    <HelpTip {...HELP.chemin} />
                  </label>
                ) : null}
              </>
            ) : null}
            {follow === "retry" ? (
              <div className="flex flex-col gap-2">
                <HelpWrap help={HELP.retry}>
                  <Button type="button" onClick={() => document.querySelector("[data-demo=tree-question]")?.scrollIntoView({ behavior: "smooth" })}>
                    Essayer une autre question
                  </Button>
                </HelpWrap>
                <div className="flex flex-wrap gap-1.5">
                  {(shown.suggestions ?? []).map((item) => (
                    <Button
                      key={item.text}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void read({
                          question: item.question,
                          label: item.label,
                          series: item.series,
                          card: item.question === "balls" ? "balls" : item.question === "chartisme" ? "chartisme" : "flux",
                        })
                      }
                    >
                      {item.text}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            {follow === "train" || follow === "train-many" ? (
              <div className="flex flex-col gap-2">
                <LabelHelp label="Nom" help={HELP.train}>
                  <Input value={trainName} onChange={(event) => setTrainName(event.target.value)} />
                </LabelHelp>
                <div className="flex flex-wrap gap-1.5">
                  {(shown.drafts ?? []).map((draft) => (
                    <HelpWrap key={draft.target} help={HELP.train}>
                      <Button type="button" disabled={training} onClick={() => void trainDraft(draft)}>
                        {training ? <Loader2 className="animate-spin" /> : null}
                        {follow === "train" ? "Entraîner ce spécialiste" : `Entraîner ${draft.name}`}
                      </Button>
                    </HelpWrap>
                  ))}
                </div>
              </div>
            ) : null}
            {follow === "jeux" ? (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-10 gap-1">
                  {(shown.ball_scores ?? []).map((row) => (
                    <span
                      key={row.ball}
                      className="flex h-8 items-center justify-center rounded-md text-[10px] text-white"
                      style={{ background: `color-mix(in oklab, var(--chart-3) ${Math.round(row.proba * 100)}%, #8d8a84)` }}
                      title={`${row.ball} · ${Math.round(row.proba * 100)} %`}
                    >
                      {row.ball}
                    </span>
                  ))}
                </div>
                <HelpWrap help={HELP.jeux}>
                  <Button type="button" onClick={sendJeux}>
                    Envoyer vers Jeux
                  </Button>
                </HelpWrap>
              </div>
            ) : null}
            {follow === "rule" ? (
              <HelpWrap help={HELP.regle}>
                <Button type="button" onClick={prepareRule}>
                  Préparer la règle
                </Button>
              </HelpWrap>
            ) : null}
            {beats ? null : (
              <Button type="button" variant="outline" onClick={() => openAtelier()}>
                Ouvrir l’atelier
              </Button>
            )}
            <div className="flex flex-wrap gap-1.5">
              <HelpWrap help={HELP.pin}>
                <Button type="button" size="sm" variant="outline" onClick={() => pin(shown)}>
                  <Pin />
                  Épingler à Brain
                </Button>
              </HelpWrap>
              <HelpWrap help={HELP.export}>
                <Button type="button" size="sm" variant="outline" onClick={exportReading}>
                  Exporter
                </Button>
              </HelpWrap>
              {(shown.specialists ?? []).map((item) => (
                <Link key={item.slug} className="text-xs text-primary underline-offset-2 hover:underline" href="/brain/specialistes">
                  {item.name}
                </Link>
              ))}
            </div>
            {pins.length ? (
              <p className="text-[11px] text-muted-foreground">
                Sur la table : {pins.map((item) => `@tree.${item.handle}`).join(", ")}
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      {journalReady && journal.length ? (
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="inline-flex items-center gap-1 text-sm font-medium">
              Journal
              <HelpTip {...HELP.journal} />
            </p>
            <select className="rounded-md border border-border bg-background px-2 py-1 text-xs" value={filterQ} onChange={(event) => setFilterQ(event.target.value)} aria-label="Filtrer par question">
              <option value="all">Toutes les questions</option>
              <option value="shape">Flux</option>
              <option value="series">Une série</option>
              <option value="balls">Boules</option>
              <option value="chartisme">Figures</option>
            </select>
            <select className="rounded-md border border-border bg-background px-2 py-1 text-xs" value={filterV} onChange={(event) => setFilterV(event.target.value)} aria-label="Filtrer par verdict">
              <option value="all">Tous les verdicts</option>
              <option value="flux">Seuil</option>
              <option value="aucun">Aucun seuil</option>
            </select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {journalRows.map((item) => {
              const stale = readingStale(item, { era, weekday, drawCount: draws.length })
              return (
                <article key={item.slug} className="flex overflow-hidden rounded-xl border border-border">
                  <div className={cn("w-1.5", item.beats_independence ? "bg-chart-3" : "bg-muted-foreground/40")} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2 text-xs">
                    <p className="font-medium">{item.phrase || item.question}</p>
                    <p className="text-muted-foreground">
                      p = {formatP(item.p)} · p corrigé {formatP(item.p_adjusted)} · {item.created_at?.slice(0, 10)}
                    </p>
                    {stale.stale ? <p>périmée · {stale.label}</p> : null}
                    <div className="flex gap-1.5">
                      <Button type="button" size="xs" variant="outline" onClick={() => void loadDecisionReading(item.slug).then(setReading)}>
                        Ouvrir
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          void read({
                            question: item.question,
                            label: item.label,
                            series: item.series,
                            card: item.question === "balls" ? "balls" : item.question === "chartisme" ? "chartisme" : "flux",
                          })
                        }
                      >
                        Relire
                      </Button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}
    </div>
  )
}
