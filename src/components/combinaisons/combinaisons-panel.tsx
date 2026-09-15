"use client"

import { useEffect, useMemo, useState } from "react"
import { Pencil } from "lucide-react"

import { WindowBar } from "@/components/analysis/window-bar"
import {
  Disclaimer,
  OverlayToggle,
  formatStat,
} from "@/components/analysis/shared"
import { DrawBalls } from "@/components/draw-balls"
import {
  HelpWrap,
  LabelHelp,
  TitleHelp,
  type HelpCopy,
} from "@/components/help"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DEFAULT_WARMUP,
  resolveWindow,
  type WindowPreset,
} from "@/lib/analysis-window"
import {
  DEFAULT_GRID_LABEL,
  MAX_GRID_LABEL,
  STRATEGY_LABELS,
  STRATEGIES,
  SUM_BOUND_MODE_LABELS,
  MAX_PROPOSALS,
  SUM_BOUND_MODES,
  autoMaxSum,
  autoMinSum,
  empiricalWinRate,
  isCompleteGrid,
  normalizeGridLabel,
  numberSum,
  officialWinProbability,
  profileGrid,
  proposeGrids,
  readStoredProposals,
  renameSavedGridIn,
  resolveSumBand,
  windowSumExtent,
  writeStoredProposals,
  type CombinationGrid,
  type CombinationStrategy,
  type SumBoundMode,
} from "@/lib/combinations"
import { HANDOFF_KEY } from "@/lib/jeux"
import {
  expectedNumberHits,
  expectedStarHits,
  numberFrequencyTable,
  starFrequencyTable,
  type FrequencyItem,
} from "@/lib/draws"
import { useDraws } from "@/lib/use-draws"
import { cn } from "@/lib/utils"

const SESSION_KEY = "synchro.combinaisons.grids"
const OFFICIAL_TABLE_KEY = "synchro.combinaisons.officialTable"

type Intensity = "count" | "delay"
type SavedGrid = CombinationGrid & {
  id: number | string
  label: string
  local?: boolean
}

const HELP = {
  banner: {
    title: "Combinaisons",
    body: "Composer, proposer et comparer des grilles EuroMillions. La loi officielle est la même pour toute grille 5+2. Le taux empirique est un rétro-test sur la fenêtre, pas P(prochain tirage).",
  },
  draws: {
    title: "Tirages",
    body: "Nombre de tirages de la fenêtre de travail. Les retards, totaux de sorties et P̂(gain) empirique en dépendent.",
  },
  expected: {
    title: "Attendu / boule",
    body: "N × 5/50 : sorties théoriques d’un numéro si chaque boule est équiprobable. Les étoiles suivent N × 2/12.",
  },
  medianDelay: {
    title: "Retard médian",
    body: "Médiane des retards (tirages depuis la dernière sortie) des numéros 1–50 dans la fenêtre.",
  },
  meanSum: {
    title: "Somme moyenne",
    body: "Moyenne des sommes des 5 numéros sur les tirages de la fenêtre. Sert de référence au profil d’une grille.",
  },
  numbers: {
    title: "Grille 1–50",
    body: "Cliquez pour ajouter ou retirer un numéro (5 max). Chaque case montre le total de sorties (×) et le retard (R) dans la fenêtre.",
  },
  stars: {
    title: "Étoiles 1–12",
    body: "Cliquez pour ajouter ou retirer une étoile (2 max). Même overlay : total de sorties et retard.",
  },
  intensityCount: {
    title: "Intensité · totaux",
    body: "La couleur suit le nombre de sorties dans la fenêtre. Cela ne change pas la sélection, seulement le rendu.",
  },
  intensityDelay: {
    title: "Intensité · retards",
    body: "La couleur suit le retard (tirages depuis la dernière sortie). Cela ne change pas la sélection.",
  },
  selection: {
    title: "Sélection",
    body: "Grille en cours : 5 numéros et 2 étoiles. Incomplète tant que le compte n’y est pas ; le profil et l’enregistrement attendent 5+2.",
  },
  officialP: {
    title: "P(gain) officielle",
    body: "Probabilité hypergéométrique d’obtenir au moins un rang payé (formule 5/50 + 2/12). Identique pour toute grille valide.",
  },
  officialTable: {
    title: "Tableau des rangs",
    body: "Les 13 rangs FDJ plus « pas de gain ». P est exacte ; « 1 sur N » = arrondi de 1/P.",
  },
  officialCollapse: {
    title: "Réduire le tableau",
    body: "Masque ou réaffiche le détail des 13 rangs. La ligne 7,71 % reste visible : même loi pour toute grille 5+2.",
  },
  rankCol: {
    title: "Rang",
    body: "Rang officiel FDJ (1 = jackpot). Un tiret = pas de gain.",
  },
  gainCol: {
    title: "Gain",
    body: "Correspondances requises pour ce rang (numéros + étoiles).",
  },
  pCol: {
    title: "P",
    body: "Probabilité exacte de ce rang pour n’importe quelle grille 5+2.",
  },
  oneInCol: {
    title: "1 sur",
    body: "Inverse arrondi de P. Vide quand P ≥ 0,5 (cas « pas de gain »).",
  },
  empiricalP: {
    title: "P̂(gain) empirique",
    body: "Part des tirages de la fenêtre où cette grille aurait été payée (rang 1–13). Rétro-test, pas une proba pour le prochain tirage.",
  },
  wilson: {
    title: "IC Wilson",
    body: "Intervalle de confiance à 95 % sur le taux empirique wins/N. Large si la fenêtre est courte.",
  },
  delayMean: {
    title: "Retard moyen",
    body: "Moyenne (puis min–max) des retards des boules de cette grille, puis des étoiles.",
  },
  totals: {
    title: "Totaux vs attendu",
    body: "Sorties moyennes des numéros choisis, comparées à N × 5/50 (même lecture pour les étoiles vs N × 2/12).",
  },
  sum: {
    title: "Somme / percentile",
    body: "Somme des 5 numéros, vs la moyenne des sommes de la fenêtre, et rang percentile (0 = plus petite, 1 = plus grande).",
  },
  parity: {
    title: "Pair / impair",
    body: "Nombre de pairs et d’impairs parmi les 5 numéros. Descriptif, pas une proba de gain.",
  },
  spread: {
    title: "Étendue",
    body: "max − min des 5 numéros. Descriptif, pas une proba de gain.",
  },
  strategy: {
    title: "Stratégie",
    body: "Comment les candidates sont tirées dans la fenêtre.",
    items: [
      {
        label: "Équilibré",
        text: "Mélange : quelques retards longs, un chaud, le reste proche de l’attendu.",
      },
      { label: "Retards longs", text: "Tirage pondéré par le retard." },
      { label: "Totaux élevés", text: "Tirage pondéré par le nombre de sorties." },
      {
        label: "Totaux faibles",
        text: "Tirage pondéré par l’écart sous l’attendu (froids).",
      },
      { label: "Aléatoire", text: "Tirage uniforme, contrôle." },
    ],
  },
  proposeCount: {
    title: "Nombre",
    body: "Combien de grilles distinctes générer (1 à 20). La salve est dédoublonnée puis triée par P̂(gain). Jeux lit cette salve pour compter combien survivent aux restrictions.",
  },
  sumMin: {
    title: "Somme mini",
    body: "Plancher de la somme des 5 numéros (15–240). Bride les propositions, pas le composeur. Si mini > max, la bande est réordonnée. Cela ne change pas P(gain) officielle.",
    items: [
      {
        label: "Auto",
        text: "25e percentile des sommes de la fenêtre (arrondi). Coupe la queue basse sans caler sur la moyenne, trop sévère pour un min.",
      },
      {
        label: "Manuel",
        text: "Valeur saisie, ramenée à 15–240. 15 = aucun plancher utile. Vide = retombe sur Auto.",
      },
    ],
  },
  sumMax: {
    title: "Somme max",
    body: "Plafond de la somme des 5 numéros (15–240). Couple avec Somme mini. Bride les propositions, pas le composeur. Cela ne change pas P(gain) officielle.",
    items: [
      {
        label: "Auto",
        text: "75e percentile des sommes de la fenêtre (arrondi). Coupe la queue haute sans caler sur la moyenne, trop sévère pour un max.",
      },
      {
        label: "Manuel",
        text: "Valeur saisie, ramenée à 15–240. 240 = aucun plafond utile. Vide = retombe sur Auto.",
      },
    ],
  },
  generate: {
    title: "Générer",
    body: "Recalcule une salve selon la stratégie, puis ne garde que les grilles dont la somme est dans la bande mini–max. Les retards et totaux choisissent les boules ; le classement utilise P̂(gain) empirique.",
  },
  proposalP: {
    title: "P̂(gain) d’une ligne",
    body: "Taux empirique de cette proposition sur la fenêtre, plus la somme des 5 numéros. Cliquez la ligne pour l’envoyer dans le composeur.",
  },
  label: {
    title: "Libellé",
    body: "Nom enregistré avec la grille (Neon si l’API répond, sinon session de cet onglet). Les lignes déjà sauvées se renomment ensuite.",
  },
  save: {
    title: "Enregistrer",
    body: "Envoie la grille 5+2 courante. Inactif tant que la sélection est incomplète.",
  },
  rename: {
    title: "Renommer",
    body: "Change le nom de cette grille enregistrée, sans toucher aux numéros ni aux étoiles.",
  },
  load: {
    title: "Recharger",
    body: "Remplit le composeur avec cette grille sauvegardée.",
  },
  remove: {
    title: "Supprimer",
    body: "Retire la grille (soft-delete Neon, ou session locale).",
  },
  check: {
    title: "Contrôle vs fenêtre",
    body: "Détail du P̂ empirique : pour chaque tirage de la fenêtre, correspondances et rang. Même jeu que le profil.",
  },
  checkDate: {
    title: "Date",
    body: "Date du tirage comparé, du plus récent au plus ancien.",
  },
  checkMatch: {
    title: "Correspondances",
    body: "Nombre de numéros puis d’étoiles en commun avec le tirage.",
  },
  checkRank: {
    title: "Rang",
    body: "Rang FDJ obtenu sur ce tirage, ou « Pas de gain ».",
  },
} satisfies Record<string, HelpCopy>

function median(values: number[]) {
  if (values.length === 0) return null
  const ordered = [...values].sort((a, b) => a - b)
  const mid = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 0
    ? (ordered[mid - 1] + ordered[mid]) / 2
    : ordered[mid]
}

function formatPct(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—"
  return value.toLocaleString("fr-FR", {
    style: "percent",
    maximumFractionDigits: digits,
    minimumFractionDigits: Math.min(digits, 1),
  })
}

function formatExtent(min: number | null, max: number | null) {
  if (min == null || max == null) return "—"
  return `${formatStat(min, 0)}–${formatStat(max, 0)}`
}

function heatStyle(value: number, max: number, even: boolean) {
  const t = max > 0 ? value / max : 0
  const color = even ? "var(--chart-1)" : "var(--chart-2)"
  return {
    backgroundColor: `color-mix(in oklch, ${color} ${Math.round(14 + t * 62)}%, transparent)`,
  }
}

function SumBoundField({
  label,
  help,
  mode,
  onMode,
  input,
  onInput,
  resolved,
  modeAria,
  valueAria,
}: {
  label: string
  help: HelpCopy
  mode: SumBoundMode
  onMode: (value: string | null) => void
  input: string
  onInput: (value: string) => void
  resolved: number
  modeAria: string
  valueAria: string
}) {
  return (
    <LabelHelp label={label} help={help}>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={mode} onValueChange={onMode}>
          <SelectTrigger className="w-28" aria-label={modeAria}>
            <span className="flex flex-1 text-left">
              {SUM_BOUND_MODE_LABELS[mode]}
            </span>
          </SelectTrigger>
          <SelectContent>
            {SUM_BOUND_MODES.map((item) => (
              <SelectItem key={item} value={item}>
                {SUM_BOUND_MODE_LABELS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={15}
          max={240}
          value={mode === "auto" ? String(resolved) : input}
          onChange={(event) => onInput(event.target.value)}
          disabled={mode === "auto"}
          className="w-24"
          aria-label={valueAria}
        />
      </div>
    </LabelHelp>
  )
}

function StatHelp({
  label,
  value,
  help,
}: {
  label: string
  value: string
  help: HelpCopy
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          <TitleHelp help={help}>{label}</TitleHelp>
        </p>
        <CardTitle className="text-lg tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

function readSessionGrids(): SavedGrid[] {
  if (typeof window === "undefined") return []
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedGrid[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeSessionGrids(items: SavedGrid[]) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(items))
}

function readOfficialTableOpen(): boolean {
  if (typeof window === "undefined") return true
  try {
    const raw = localStorage.getItem(OFFICIAL_TABLE_KEY)
    if (raw === "0") return false
    if (raw === "1") return true
    return true
  } catch {
    return true
  }
}

function writeOfficialTableOpen(open: boolean) {
  try {
    localStorage.setItem(OFFICIAL_TABLE_KEY, open ? "1" : "0")
  } catch {
    /* ignore quota / private mode */
  }
}

function friendlyGridsError(raw?: string) {
  const text = raw?.trim() || "API grilles indisponible"
  if (/fetch failed|ECONNREFUSED|injoignable|non configurée/i.test(text)) {
    return "API grilles indisponible"
  }
  return text
}

function BallPicker({
  items,
  selected,
  intensity,
  onToggle,
  ariaLabel,
}: {
  items: FrequencyItem[]
  selected: Set<number>
  intensity: Intensity
  onToggle: (value: number) => void
  ariaLabel: string
}) {
  const peak = Math.max(
    1,
    ...items.map((item) => (intensity === "count" ? item.count : item.delayDraws))
  )
  return (
    <div
      className={cn(
        items.length > 12 ? "euromillions-ball-grid" : "grid grid-cols-6 gap-1 sm:grid-cols-12"
      )}
      role="group"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const on = selected.has(item.value)
        const metric = intensity === "count" ? item.count : item.delayDraws
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={on}
            aria-label={`Boule ${item.value}, ${item.count} sorties, retard ${item.delayDraws}`}
            onClick={() => onToggle(item.value)}
            style={heatStyle(metric, peak, item.value % 2 === 0)}
            className={cn(
              "flex min-h-11 min-w-0 flex-col items-center justify-center rounded-md px-0.5 py-0.5 text-[10px] leading-tight tabular-nums sm:min-h-12 sm:text-xs",
              on && "ring-2 ring-primary ring-offset-1 ring-offset-background"
            )}
          >
            <span className="font-semibold">{item.value}</span>
            <span className="text-[9px] text-muted-foreground sm:text-[10px]">
              {item.count}× · R{item.delayDraws}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function SavedGridItem({
  item,
  rate,
  onLoad,
  onRemove,
  onRename,
}: {
  item: SavedGrid
  rate: { p: number; wins: number; n: number } | null
  onLoad: () => void
  onRemove: () => void
  onRename: (label: string) => Promise<boolean>
}) {
  const displayLabel = item.label || DEFAULT_GRID_LABEL
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(displayLabel)
  const [busy, setBusy] = useState(false)

  function startRename() {
    setDraft(displayLabel)
    setEditing(true)
  }

  function cancelRename() {
    setDraft(displayLabel)
    setEditing(false)
  }

  async function commitRename() {
    if (busy) return
    setBusy(true)
    const ok = await onRename(draft)
    setBusy(false)
    if (ok) setEditing(false)
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {editing ? (
          <Input
            value={draft}
            autoFocus
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void commitRename()
              }
              if (event.key === "Escape") {
                event.preventDefault()
                cancelRename()
              }
            }}
            aria-label="Nouveau libellé de la grille"
            maxLength={MAX_GRID_LABEL}
            className="h-7 max-w-xs text-sm font-medium"
          />
        ) : (
          <button
            type="button"
            className="max-w-full truncate text-left text-sm font-medium hover:underline"
            title="Cliquer pour renommer"
            aria-label={`Renommer ${displayLabel}`}
            onClick={startRename}
          >
            {displayLabel}
          </button>
        )}
        <DrawBalls numbers={item.numbers} stars={item.stars} />
        {rate ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            P̂ {formatPct(rate.p, 1)} · {rate.wins}/{rate.n}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <HelpWrap help={HELP.rename}>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void commitRename()}
              >
                Valider
              </Button>
            </HelpWrap>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={cancelRename}
            >
              Annuler
            </Button>
          </>
        ) : (
          <>
            <HelpWrap help={HELP.rename}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startRename}
              >
                <Pencil data-icon="inline-start" />
                Renommer
              </Button>
            </HelpWrap>
            <HelpWrap help={HELP.load}>
              <Button type="button" variant="outline" size="sm" onClick={onLoad}>
                Recharger
              </Button>
            </HelpWrap>
            <HelpWrap help={HELP.remove}>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={onRemove}
              >
                Supprimer
              </Button>
            </HelpWrap>
          </>
        )}
      </div>
    </li>
  )
}

export function CombinaisonsPanel() {
  const { draws, source, loading } = useDraws("all")
  const [preset, setPreset] = useState<WindowPreset>("last_100")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [lastN, setLastN] = useState("")
  const [warmup, setWarmup] = useState(DEFAULT_WARMUP)
  const [compareOn, setCompareOn] = useState(false)
  const [numbers, setNumbers] = useState<number[]>([])
  const [stars, setStars] = useState<number[]>([])
  const [intensity, setIntensity] = useState<Intensity>("count")
  const [strategy, setStrategy] = useState<CombinationStrategy>("balanced")
  const [proposeCount, setProposeCount] = useState("5")
  const [sumMinMode, setSumMinMode] = useState<SumBoundMode>("auto")
  const [sumMinInput, setSumMinInput] = useState("")
  const [sumMaxMode, setSumMaxMode] = useState<SumBoundMode>("auto")
  const [sumMaxInput, setSumMaxInput] = useState("")
  const [proposals, setProposals] = useState<CombinationGrid[]>([])
  const [proposeNote, setProposeNote] = useState<string | null>(null)
  const [label, setLabel] = useState(DEFAULT_GRID_LABEL)
  const [loadedId, setLoadedId] = useState<SavedGrid["id"] | null>(null)
  const [saved, setSaved] = useState<SavedGrid[]>([])
  const [gridsSource, setGridsSource] = useState<"api" | "session" | "loading">(
    "loading"
  )
  const [gridsError, setGridsError] = useState<string | null>(null)
  const [officialTableOpen, setOfficialTableOpen] = useState(true)

  const archive = useMemo(
    () => [...draws].sort((a, b) => a.date.localeCompare(b.date)),
    [draws]
  )

  const resolved = useMemo(() => {
    const parsedN = Number.parseInt(lastN, 10)
    return resolveWindow(archive, {
      preset,
      fromDate: customFrom || undefined,
      toDate: customTo || undefined,
      lastN: Number.isFinite(parsedN) && parsedN > 0 ? parsedN : undefined,
      warmup,
    })
  }, [archive, preset, customFrom, customTo, lastN, warmup])

  const work = resolved.work
  const numberStats = useMemo(() => numberFrequencyTable(work), [work])
  const starStats = useMemo(() => starFrequencyTable(work), [work])
  const official = useMemo(() => officialWinProbability(12), [])

  const grid = useMemo(
    () => ({ numbers: [...numbers].sort((a, b) => a - b), stars: [...stars].sort((a, b) => a - b) }),
    [numbers, stars]
  )
  const complete = isCompleteGrid(grid)
  const profile = useMemo(
    () => (complete ? profileGrid(grid, work, numberStats, starStats) : null),
    [complete, grid, work, numberStats, starStats]
  )

  const windowCards = useMemo(() => {
    const delays = numberStats.map((item) => item.delayDraws)
    const sums = work.map((draw) =>
      draw.numbers.reduce((total, value) => total + value, 0)
    )
    return {
      drawCount: work.length,
      expected: expectedNumberHits(work.length),
      expectedStars: expectedStarHits(work.length),
      medianDelay: median(delays),
      meanSum:
        sums.length === 0
          ? null
          : sums.reduce((total, value) => total + value, 0) / sums.length,
    }
  }, [numberStats, work])

  const sumExtent = useMemo(() => windowSumExtent(work), [work])
  const sumBand = useMemo(
    () =>
      resolveSumBand({
        minMode: sumMinMode,
        minManual: sumMinInput,
        maxMode: sumMaxMode,
        maxManual: sumMaxInput,
        draws: work,
      }),
    [sumMinMode, sumMinInput, sumMaxMode, sumMaxInput, work]
  )
  const requestedCount = useMemo(() => {
    const parsed = Number.parseInt(proposeCount, 10)
    if (!Number.isFinite(parsed)) return 5
    return Math.max(1, Math.min(MAX_PROPOSALS, Math.floor(parsed)))
  }, [proposeCount])

  const proposalRows = useMemo(
    () =>
      proposals.map((item) => ({
        grid: item,
        empirical: empiricalWinRate(item, work),
        sum: numberSum(item),
      })),
    [proposals, work]
  )

  useEffect(() => {
    setOfficialTableOpen(readOfficialTableOpen())
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const stored = readStoredProposals()
        if (stored.length > 0) setProposals(stored)
        const raw = sessionStorage.getItem(HANDOFF_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw) as CombinationGrid
        sessionStorage.removeItem(HANDOFF_KEY)
        if (isCompleteGrid(parsed)) {
          setNumbers([...parsed.numbers])
          setStars([...parsed.stars])
        }
      } catch {
        /* ignore */
      }
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch("/api/grids", { cache: "no-store" })
        const payload = (await response.json()) as {
          items?: SavedGrid[]
          error?: string
        }
        if (cancelled) return
        if (!response.ok || !Array.isArray(payload.items)) {
          setSaved(readSessionGrids())
          setGridsSource("session")
          setGridsError(friendlyGridsError(payload.error))
          return
        }
        setSaved(payload.items)
        setGridsSource("api")
        setGridsError(null)
      } catch {
        if (cancelled) return
        setSaved(readSessionGrids())
        setGridsSource("session")
        setGridsError(friendlyGridsError("API grilles indisponible"))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function toggleNumber(value: number) {
    setNumbers((current) => {
      if (current.includes(value)) return current.filter((n) => n !== value)
      if (current.length >= 5) return current
      return [...current, value]
    })
  }

  function toggleStar(value: number) {
    setStars((current) => {
      if (current.includes(value)) return current.filter((n) => n !== value)
      if (current.length >= 2) return current
      return [...current, value]
    })
  }

  function loadGrid(item: CombinationGrid) {
    setNumbers([...item.numbers])
    setStars([...item.stars])
    setLoadedId(null)
  }

  function loadSavedGrid(item: SavedGrid) {
    setNumbers([...item.numbers])
    setStars([...item.stars])
    setLabel(normalizeGridLabel(item.label))
    setLoadedId(item.id)
  }

  function handleFrom(value: string) {
    if (preset !== "custom") setCustomTo(resolved.toDate ?? "")
    setCustomFrom(value)
    setPreset("custom")
  }

  function handleTo(value: string) {
    if (preset !== "custom") setCustomFrom(resolved.fromDate ?? "")
    setCustomTo(value)
    setPreset("custom")
  }

  function generate() {
    const next = proposeGrids({
      numberStats,
      starStats,
      draws: work,
      strategy,
      count: requestedCount,
      seed: Date.now() % 1_000_000_007,
      minSum: sumBand.min,
      maxSum: sumBand.max,
    })
    setProposals(next)
    writeStoredProposals(next)
    const bandLabel = `${sumBand.min}–${sumBand.max}`
    if (next.length === 0) {
      setProposeNote(
        `Aucune grille avec une somme dans ${bandLabel}. Élargissez la bande ou changez de stratégie.`
      )
    } else if (next.length < requestedCount) {
      setProposeNote(
        `Salve incomplète : ${next.length}/${requestedCount} grilles dans ${bandLabel}.`
      )
    } else if (sumBand.swapped) {
      setProposeNote(
        `Mini et max inversés : bande réordonnée ${bandLabel}.`
      )
    } else {
      setProposeNote(null)
    }
    if (next[0]) loadGrid(next[0])
  }

  function handleSumBoundMode(
    side: "min" | "max",
    value: string | null
  ) {
    if (value !== "auto" && value !== "manual") return
    if (side === "min") {
      if (value === "manual" && sumMinInput.trim() === "") {
        setSumMinInput(String(autoMinSum(work)))
      }
      setSumMinMode(value)
      return
    }
    if (value === "manual" && sumMaxInput.trim() === "") {
      setSumMaxInput(String(autoMaxSum(work)))
    }
    setSumMaxMode(value)
  }

  async function saveGrid() {
    if (!complete) return
    const body = {
      label: normalizeGridLabel(label),
      numbers: grid.numbers,
      stars: grid.stars,
    }
    if (gridsSource === "api") {
      try {
        const response = await fetch("/api/grids", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })
        const row = (await response.json()) as SavedGrid & { error?: string }
        if (!response.ok) {
          setGridsError(row.error ?? "Enregistrement refusé")
          return
        }
        setSaved((current) => [row, ...current.filter((item) => item.id !== row.id)])
        setLoadedId(row.id)
        setLabel(normalizeGridLabel(row.label))
        setGridsError(null)
        return
      } catch {
        setGridsError("Enregistrement API impossible, copie en session")
      }
    }
    const local: SavedGrid = {
      ...body,
      id: `local-${Date.now()}`,
      local: true,
    }
    const next = [local, ...saved]
    setSaved(next)
    setLoadedId(local.id)
    writeSessionGrids(next)
    setGridsSource("session")
  }

  async function renameGrid(item: SavedGrid, nextLabel: string): Promise<boolean> {
    const renamed = renameSavedGridIn(saved, item.id, nextLabel)
    if (!renamed) return false
    const nextName =
      renamed.find((row) => row.id === item.id)?.label ?? normalizeGridLabel(nextLabel)
    if (normalizeGridLabel(item.label) === nextName) return true
    if (gridsSource === "api" && typeof item.id === "number") {
      try {
        const response = await fetch(`/api/grids/${item.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ label: nextName }),
        })
        const row = (await response.json()) as SavedGrid & { error?: string }
        if (!response.ok) {
          setGridsError(row.error ?? "Renommage impossible")
          return false
        }
        const savedLabel = normalizeGridLabel(row.label ?? nextName)
        setSaved((current) =>
          current.map((grid) =>
            grid.id === item.id ? { ...grid, ...row, label: savedLabel } : grid
          )
        )
        if (loadedId === item.id) setLabel(savedLabel)
        setGridsError(null)
        return true
      } catch {
        setGridsError("Renommage API impossible")
        return false
      }
    }
    setSaved(renamed)
    writeSessionGrids(renamed)
    if (loadedId === item.id) setLabel(nextName)
    return true
  }

  async function removeGrid(item: SavedGrid) {
    if (gridsSource === "api" && typeof item.id === "number") {
      try {
        const response = await fetch(`/api/grids/${item.id}`, { method: "DELETE" })
        if (!response.ok && response.status !== 404) {
          setGridsError("Suppression impossible")
          return
        }
        setSaved((current) => current.filter((row) => row.id !== item.id))
        return
      } catch {
        setGridsError("Suppression API impossible")
        return
      }
    }
    const next = saved.filter((row) => row.id !== item.id)
    setSaved(next)
    writeSessionGrids(next)
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Chargement des tirages…</p>
  }

  const displayFrom =
    preset === "custom" ? customFrom : resolved.fromDate ?? customFrom
  const displayTo = preset === "custom" ? customTo : resolved.toDate ?? customTo
  const numberSet = new Set(numbers)
  const starSet = new Set(stars)

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        <TitleHelp help={HELP.banner}>Même fenêtre</TitleHelp> pour les retards,
        les totaux et le rétro-test ({work.length} tirages, source{" "}
        {source === "neon" ? "Neon" : "JSON local"}). La loi officielle P(gain)
        est identique pour toute grille 5+2 ; P̂ empirique décrit le passé de la
        fenêtre, pas le prochain tirage.
      </p>

      <WindowBar
        window={{ ...resolved, work, drawCount: work.length }}
        preset={preset}
        fromDate={displayFrom}
        toDate={displayTo}
        lastN={lastN}
        warmup={warmup}
        compareOn={compareOn}
        onPreset={(value) => {
          setPreset(value)
          if (value !== "custom") {
            setCustomFrom("")
            setCustomTo("")
            setLastN("")
          }
        }}
        onFrom={handleFrom}
        onTo={handleTo}
        onLastN={setLastN}
        onWarmup={setWarmup}
        onCompare={setCompareOn}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatHelp
          label="Tirages"
          value={String(windowCards.drawCount)}
          help={HELP.draws}
        />
        <StatHelp
          label="Attendu / boule"
          value={formatStat(windowCards.expected, 1)}
          help={HELP.expected}
        />
        <StatHelp
          label="Retard médian"
          value={
            windowCards.medianDelay == null
              ? "—"
              : formatStat(windowCards.medianDelay, 1)
          }
          help={HELP.medianDelay}
        />
        <StatHelp
          label="Somme moyenne"
          value={
            windowCards.meanSum == null ? "—" : formatStat(windowCards.meanSum, 1)
          }
          help={HELP.meanSum}
        />
      </section>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>
            <TitleHelp help={HELP.numbers}>Composeur 5 + 2</TitleHelp>
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <OverlayToggle
              label="Totaux"
              on={intensity === "count"}
              onClick={() => setIntensity("count")}
              help={HELP.intensityCount}
            />
            <OverlayToggle
              label="Retards"
              on={intensity === "delay"}
              onClick={() => setIntensity("delay")}
              help={HELP.intensityDelay}
            />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <BallPicker
            items={numberStats}
            selected={numberSet}
            intensity={intensity}
            onToggle={toggleNumber}
            ariaLabel="Numéros 1 à 50"
          />
          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              <TitleHelp help={HELP.stars}>Étoiles</TitleHelp>
            </p>
            <BallPicker
              items={starStats}
              selected={starSet}
              intensity={intensity}
              onToggle={toggleStar}
              ariaLabel="Étoiles 1 à 12"
            />
          </div>
          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              <TitleHelp help={HELP.selection}>
                Sélection {numbers.length}/5 + {stars.length}/2
              </TitleHelp>
            </p>
            {numbers.length + stars.length > 0 ? (
              <DrawBalls numbers={grid.numbers} stars={grid.stars} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Cliquez 5 numéros et 2 étoiles.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <TitleHelp help={HELP.officialP}>P(gain) officielle</TitleHelp>
          </CardTitle>
          <CardAction>
            <HelpWrap help={HELP.officialCollapse}>
              <Button
                type="button"
                variant="outline"
                size="xs"
                aria-expanded={officialTableOpen}
                aria-controls="official-ranks"
                onClick={() => {
                  setOfficialTableOpen((open) => {
                    const next = !open
                    writeOfficialTableOpen(next)
                    return next
                  })
                }}
              >
                {officialTableOpen ? "Réduire" : "Déplier"}
              </Button>
            </HelpWrap>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {formatPct(official.pWin, 2)} d’obtenir au moins un rang — identique
            pour toute grille 5+2.
          </p>
          {officialTableOpen ? (
            <>
              <div id="official-ranks" className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-3">
                        <TitleHelp help={HELP.rankCol}>Rang</TitleHelp>
                      </th>
                      <th className="py-1 pr-3">
                        <TitleHelp help={HELP.gainCol}>Gain</TitleHelp>
                      </th>
                      <th className="py-1 pr-3">
                        <TitleHelp help={HELP.pCol}>P</TitleHelp>
                      </th>
                      <th className="py-1">
                        <TitleHelp help={HELP.oneInCol}>1 sur</TitleHelp>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {official.ranks.map((row) => (
                      <tr key={row.label} className="border-t border-border">
                        <td className="py-1 pr-3 tabular-nums">
                          {row.rank ?? "—"}
                        </td>
                        <td className="py-1 pr-3">{row.label}</td>
                        <td className="py-1 pr-3 tabular-nums">
                          {row.p.toExponential(3)}
                        </td>
                        <td className="py-1 tabular-nums">
                          {row.oneIn?.toLocaleString("fr-FR") ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Disclaimer>
                <TitleHelp help={HELP.officialTable}>
                  Référence combinatoire
                </TitleHelp>
                , indépendante de la fenêtre et des retards.
              </Disclaimer>
            </>
          ) : (
            <p id="official-ranks" className="sr-only">
              Tableau des rangs masqué.
            </p>
          )}
        </CardContent>
      </Card>

      {profile ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <TitleHelp help={HELP.empiricalP}>Profil de la grille</TitleHelp>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatHelp
                label="P̂(gain)"
                value={formatPct(profile.empirical.p, 1)}
                help={HELP.empiricalP}
              />
              <StatHelp
                label="IC Wilson"
                value={`${formatPct(profile.empirical.wilson.lo, 1)} – ${formatPct(profile.empirical.wilson.hi, 1)}`}
                help={HELP.wilson}
              />
              <StatHelp
                label="Retard n°"
                value={`${formatStat(profile.numberDelayMean, 1)} (${formatExtent(profile.numberDelayExtent.min, profile.numberDelayExtent.max)})`}
                help={HELP.delayMean}
              />
              <StatHelp
                label="Retard ★"
                value={`${formatStat(profile.starDelayMean, 1)} (${formatExtent(profile.starDelayExtent.min, profile.starDelayExtent.max)})`}
                help={HELP.delayMean}
              />
              <StatHelp
                label="Totaux n°"
                value={`${formatStat(profile.numberCountMean, 1)} / ${formatStat(profile.expectedNumbers, 1)}`}
                help={HELP.totals}
              />
              <StatHelp
                label="Somme"
                value={`${formatStat(profile.sum, 0)} · pctl ${formatPct(profile.sumPercentile, 0)}`}
                help={HELP.sum}
              />
              <StatHelp
                label="Pair / impair"
                value={`${profile.even}p / ${profile.odd}i`}
                help={HELP.parity}
              />
              <StatHelp
                label="Étendue"
                value={formatStat(profile.spread, 0)}
                help={HELP.spread}
              />
            </section>
            <Disclaimer>
              {profile.empirical.wins} gain
              {profile.empirical.wins > 1 ? "s" : ""} sur {profile.empirical.n}{" "}
              tirages. Attendu étoiles : {formatStat(profile.expectedStars, 1)}.
              Somme moyenne de la fenêtre : {formatStat(profile.windowSumMean, 1)}.
            </Disclaimer>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Complétez 5 numéros et 2 étoiles pour le profil et P̂(gain) empirique.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <TitleHelp help={HELP.generate}>Propositions</TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <LabelHelp label="Stratégie" help={HELP.strategy}>
              <Select
                value={strategy}
                onValueChange={(value) =>
                  setStrategy(value as CombinationStrategy)
                }
              >
                <SelectTrigger className="w-full sm:w-56" aria-label="Stratégie">
                  <span className="flex flex-1 text-left">
                    {STRATEGY_LABELS[strategy]}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {STRATEGY_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>
            <LabelHelp label="Nombre" help={HELP.proposeCount}>
              <Input
                type="number"
                min={1}
                max={MAX_PROPOSALS}
                value={proposeCount}
                onChange={(event) => setProposeCount(event.target.value)}
                className="w-24"
                aria-label="Nombre de grilles"
              />
            </LabelHelp>
            <SumBoundField
              label="Somme mini"
              help={HELP.sumMin}
              mode={sumMinMode}
              onMode={(value) => handleSumBoundMode("min", value)}
              input={sumMinInput}
              onInput={setSumMinInput}
              resolved={sumBand.autoMin}
              modeAria="Mode somme mini"
              valueAria="Plancher de la somme des 5 numéros"
            />
            <SumBoundField
              label="Somme max"
              help={HELP.sumMax}
              mode={sumMaxMode}
              onMode={(value) => handleSumBoundMode("max", value)}
              input={sumMaxInput}
              onInput={setSumMaxInput}
              resolved={sumBand.autoMax}
              modeAria="Mode somme max"
              valueAria="Plafond de la somme des 5 numéros"
            />
            <HelpWrap help={HELP.generate}>
              <Button type="button" onClick={generate} disabled={work.length === 0}>
                Générer
              </Button>
            </HelpWrap>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            Sommes de la fenêtre
            {sumExtent.min == null || sumExtent.max == null
              ? " : —"
              : ` : ${formatStat(sumExtent.min, 0)}–${formatStat(sumExtent.max, 0)} · moy. ${formatStat(sumExtent.mean, 1)} · auto ${formatStat(sumExtent.p25, 0)}–${formatStat(sumExtent.p75, 0)}`}
            {` · bande ${sumBand.min}–${sumBand.max}`}
            {sumBand.swapped ? " (mini/max inversés)" : ""}
          </p>
          {proposeNote ? (
            <p className="text-sm text-muted-foreground">{proposeNote}</p>
          ) : null}
          {proposalRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune proposition pour l’instant.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {proposalRows.map((row) => (
                <li key={`${row.grid.numbers.join("-")}-${row.grid.stars.join("-")}`}>
                  <HelpWrap help={HELP.proposalP}>
                    <button
                      type="button"
                      onClick={() => loadGrid(row.grid)}
                      className="flex w-full flex-col gap-2 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <DrawBalls numbers={row.grid.numbers} stars={row.grid.stars} />
                      <span className="text-sm tabular-nums">
                        P̂ {formatPct(row.empirical.p, 1)}
                        <span className="text-muted-foreground">
                          {" "}
                          · {row.empirical.wins}/{row.empirical.n} · Σ {row.sum}
                        </span>
                      </span>
                    </button>
                  </HelpWrap>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <TitleHelp help={HELP.save}>Mes grilles</TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <LabelHelp label="Libellé" help={HELP.label} className="sm:flex-1">
              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                aria-label="Libellé de la grille"
                maxLength={MAX_GRID_LABEL}
              />
            </LabelHelp>
            <HelpWrap help={HELP.save}>
              <Button type="button" onClick={() => void saveGrid()} disabled={!complete}>
                Enregistrer
              </Button>
            </HelpWrap>
          </div>
          {gridsError ? (
            <p className="text-xs text-muted-foreground">
              {gridsError}
              {gridsSource === "session" ? " — conservation en session." : ""}
            </p>
          ) : null}
          {saved.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune grille enregistrée.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {saved.map((item) => {
                const rate = isCompleteGrid(item)
                  ? empiricalWinRate(item, work)
                  : null
                return (
                  <SavedGridItem
                    key={String(item.id)}
                    item={item}
                    rate={rate}
                    onLoad={() => loadSavedGrid(item)}
                    onRemove={() => void removeGrid(item)}
                    onRename={(nextLabel) => renameGrid(item, nextLabel)}
                  />
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <TitleHelp help={HELP.check}>Contrôle vs fenêtre</TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!profile ? (
            <p className="text-sm text-muted-foreground">
              Complétez une grille pour voir les rangs tirage par tirage.
            </p>
          ) : (
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <TitleHelp help={HELP.checkDate}>Date</TitleHelp>
                    </TableHead>
                    <TableHead>
                      <TitleHelp help={HELP.checkMatch}>Correspondances</TitleHelp>
                    </TableHead>
                    <TableHead>
                      <TitleHelp help={HELP.checkRank}>Rang</TitleHelp>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profile.empirical.results.map((row) => (
                    <TableRow key={row.date}>
                      <TableCell className="tabular-nums">{row.date}</TableCell>
                      <TableCell className="tabular-nums">
                        {row.matchedNumbers} n° + {row.matchedStars} ★
                      </TableCell>
                      <TableCell>
                        {row.rank == null ? row.label : `${row.rank} · ${row.label}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
