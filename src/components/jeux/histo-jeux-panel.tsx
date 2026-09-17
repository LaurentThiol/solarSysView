"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { Disclaimer } from "@/components/analysis/shared"
import { useRegisterCapture } from "@/components/capture"
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
import { gridKey, isCompleteGrid, type CombinationGrid } from "@/lib/combinations"
import {
  NUMBER_VALUES,
  STAR_VALUES,
  parseStoredSpec,
  summarizeStoredSpec,
  writeStoredSpec,
  type StoredSpec,
} from "@/lib/jeux"
import {
  PLAY_SOURCES,
  PLAY_SOURCE_LABELS,
  PLAYS_EVENT,
  decoratePlays,
  formatPValue,
  formatPct,
  formatPlayDate,
  friendlyPlaysError,
  nextPlayDate,
  persistPlays,
  playDateOptions,
  playShape,
  playsToCsv,
  readPlayHandoff,
  readSessionPlays,
  summarizePlays,
  writeSessionPlays,
  type DecoratedPlay,
  type PlayHandoff,
  type PlayRecord,
  type PlaySource,
  type PlayStats,
} from "@/lib/plays"
import { useDraws } from "@/lib/use-draws"
import { formatEuro } from "@/lib/draws"
import { cn } from "@/lib/utils"

const HELP = {
  banner: {
    title: "histoJeux",
    body: "Journal des grilles réellement jouées, une date de tirage (mardi/vendredi) par ligne. Après synchro FDJ, le rang et les correspondances se calculent tout seuls. Ce n’est pas un pronostic : chaque tirage reste indépendant.",
  },
  playDate: {
    title: "Tirage visé",
    body: "Date du tirage EuroMillions pour lequel la grille a été (ou sera) jouée. Mardi et vendredi seulement. Par défaut : prochain tirage encore ouvert (avant 20h45 Paris).",
  },
  consign: {
    title: "Consigner",
    body: "Enregistre la grille 5+2 pour cette date dans Neon. Si l’API ne répond pas, copie en session de cet onglet. Les modèles de Combinaisons restent dans Mes grilles.",
  },
  copies: {
    title: "Copies",
    body: "Nombre de fois que la même grille a été jouée sur ce tirage (1 à 20). Les stats pondèrent par ce nombre.",
  },
  source: {
    title: "Origine",
    body: "D’où vient la grille : composeur Combinaisons, échantillon Jeux, ou saisie manuelle ici.",
  },
  pending: {
    title: "En attente",
    body: "Le tirage n’est pas encore dans l’archive FDJ. Après synchro, la ligne passe au rang obtenu (ou « Pas de gain »).",
  },
  settled: {
    title: "Tranché",
    body: "Le tirage officiel de cette date est connu. Les boules communes sont cerclées. Rang FDJ 1–13, ou pas de gain, plus le rapport € de ce rang (× copies).",
  },
  stats: {
    title: "Lecture",
    body: "Totaux descriptifs du journal. Le taux de rangs pondère les copies (tickets). Le test binomial compte une consignation = un essai, H0 : P(gain) = 7,71 %. Plusieurs grilles le même tirage ne sont pas indépendantes ; un p petit décrit le journal, pas le prochain tirage.",
  },
  binomial: {
    title: "Test binomial",
    body: "H0 : chaque consignation tranchée a P(rang) = 7,71 % (loi officielle, identique pour toute grille 5+2). Test exact bilatéral. Les copies du même ticket ne sont pas des essais de plus. Un p ≥ 5 % veut dire : l’écart au hasard n’est pas détectable sur ce journal.",
  },
  spec: {
    title: "Spec Jeux",
    body: "Curseurs (somme, parité, étendue, décennies, forcés…) au moment de la consignation depuis Solutions. Ça relit pourquoi la grille a été jouée, pas un score de gain. « Rouvrir dans Jeux » recharge ces curseurs.",
  },
  export: {
    title: "Export CSV",
    body: "Une ligne par consignation : date, boules, rang, correspondances, rapport €, spec Jeux. Pour une analyse hors de l’app (tableur).",
  },
  note: {
    title: "Note",
    body: "Mémo libre (stratégie, mood, « salve équilibré »…). N’entre pas dans le scoring.",
  },
} satisfies Record<string, HelpCopy>

type FilterId = "all" | "pending" | "settled"

function MiniPicker({
  numbers,
  stars,
  onToggleNumber,
  onToggleStar,
}: {
  numbers: number[]
  stars: number[]
  onToggleNumber: (value: number) => void
  onToggleStar: (value: number) => void
}) {
  const numberSet = new Set(numbers)
  const starSet = new Set(stars)
  return (
    <div className="flex flex-col gap-3">
      <div className="euromillions-ball-grid" role="group" aria-label="Numéros 1 à 50">
        {NUMBER_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={numberSet.has(value)}
            onClick={() => onToggleNumber(value)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums sm:size-8",
              numberSet.has(value)
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-1 sm:grid-cols-12" role="group" aria-label="Étoiles 1 à 12">
        {STAR_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={starSet.has(value)}
            onClick={() => onToggleStar(value)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums sm:size-8",
              starSet.has(value)
                ? "bg-[oklch(0.78_0.14_75)] text-[oklch(0.18_0.04_260)]"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  )
}

function resultTone(item: DecoratedPlay) {
  if (item.status === "pending") return "text-muted-foreground"
  if (item.result?.rank == null) return "text-muted-foreground"
  if (item.result.rank <= 3) return "text-foreground"
  return "text-foreground"
}

function downloadCsv(items: DecoratedPlay[]) {
  const blob = new Blob([playsToCsv(items)], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = "histo-jeux.csv"
  link.click()
  URL.revokeObjectURL(url)
}

export function HistoJeuxPanel() {
  const router = useRouter()
  const { draws } = useDraws("all")
  const dates = useMemo(() => playDateOptions(), [])
  const [playDate, setPlayDate] = useState(dates.next)
  const [label, setLabel] = useState("Grille")
  const [note, setNote] = useState("")
  const [copies, setCopies] = useState("1")
  const [source, setSource] = useState<PlaySource>("manuel")
  const [playSpec, setPlaySpec] = useState<StoredSpec | null>(null)
  const [numbers, setNumbers] = useState<number[]>([])
  const [stars, setStars] = useState<number[]>([])
  const [saved, setSaved] = useState<PlayRecord[]>([])
  const [playsSource, setPlaysSource] = useState<"api" | "session" | "loading">("loading")
  const [playsError, setPlaysError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterId>("all")
  const [sourceFilter, setSourceFilter] = useState<"all" | PlaySource>("all")
  const [renamingId, setRenamingId] = useState<string | number | null>(null)
  const [renameLabel, setRenameLabel] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingBatch, setPendingBatch] = useState<PlayHandoff["items"] | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch("/api/plays", { cache: "no-store" })
        const payload = (await response.json()) as {
          items?: PlayRecord[]
          next_play_date?: string
          error?: string
        }
        if (cancelled) return
        if (!response.ok || !Array.isArray(payload.items)) {
          setSaved(readSessionPlays())
          setPlaysSource("session")
          setPlaysError(friendlyPlaysError(payload.error))
          return
        }
        setSaved(payload.items)
        setPlaysSource("api")
        setPlaysError(null)
        if (payload.next_play_date) setPlayDate((current) => current || payload.next_play_date || nextPlayDate())
      } catch {
        if (cancelled) return
        setSaved(readSessionPlays())
        setPlaysSource("session")
        setPlaysError(friendlyPlaysError("API histoJeux indisponible"))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      const handoff = readPlayHandoff()
      if (!handoff) return
      if (handoff.play_date) setPlayDate(handoff.play_date)
      const first = handoff.items[0]
      if (first) {
        setNumbers([...first.numbers])
        setStars([...first.stars])
        setLabel(first.label || "Grille")
        setSource(first.source || "manuel")
        setCopies(String(first.copies ?? 1))
        setNote(first.note || "")
        setPlaySpec(parseStoredSpec(first.spec))
      }
      if (handoff.items.length > 1) {
        setPendingBatch(handoff.items)
        setNotice(
          `${handoff.items.length} grilles prêtes à consigner pour le ${formatPlayDate(handoff.play_date || dates.next)}.`
        )
      } else {
        setNotice(
          `Grille prête à consigner pour le ${formatPlayDate(handoff.play_date || dates.next)}.`
        )
      }
    }, 0)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const decorated = useMemo(() => decoratePlays(saved, draws), [saved, draws])
  const stats: PlayStats = useMemo(() => summarizePlays(decorated), [decorated])
  const visible = useMemo(() => {
    return decorated.filter((item) => {
      if (filter === "pending" && item.status !== "pending") return false
      if (filter === "settled" && item.status !== "settled") return false
      if (sourceFilter !== "all" && item.source !== sourceFilter) return false
      return true
    })
  }, [decorated, filter, sourceFilter])

  const complete = isCompleteGrid({ numbers, stars })
  const grid: CombinationGrid = {
    numbers: [...numbers].sort((a, b) => a - b),
    stars: [...stars].sort((a, b) => a - b),
  }
  const shape = complete ? playShape(grid) : null
  const duplicate = complete
    ? decorated.filter((item) => item.repeat_key === `${playDate}|${gridKey(grid)}`).length
    : 0

  useRegisterCapture(() => ({
    lab: "jeux",
    tab: "histoJeux",
    summary: [
      `${stats.tickets} ticket${stats.tickets === 1 ? "" : "s"} consignés`,
      `${stats.pending} en attente · ${stats.settled} tranchés`,
      stats.p_win == null
        ? "Aucun tirage encore tranché"
        : `Rangs obtenus : ${stats.wins}/${stats.settled} (${formatPct(stats.p_win)}) vs ${formatPct(stats.p0, 2)}`,
      stats.binomial
        ? `Binomial ${stats.binomial.wins}/${stats.binomial.n} · p = ${formatPValue(stats.binomial.p_value)} · ${stats.binomial.verdict}`
        : null,
    ].filter((item): item is string => Boolean(item)),
    tech: {
      tickets: stats.tickets,
      pending: stats.pending,
      settled: stats.settled,
      wins: stats.wins,
      unique: stats.unique_grids,
      p0: stats.p0,
      binomial: stats.binomial,
      byRank: stats.by_rank,
      byMatch: stats.by_match,
    },
  }))

  function toggleNumber(value: number) {
    setNumbers((current) => {
      if (current.includes(value)) return current.filter((item) => item !== value)
      if (current.length >= 5) return current
      return [...current, value]
    })
  }

  function toggleStar(value: number) {
    setStars((current) => {
      if (current.includes(value)) return current.filter((item) => item !== value)
      if (current.length >= 2) return current
      return [...current, value]
    })
  }

  async function consignMany(
    items: Array<{
      numbers: number[]
      stars: number[]
      label?: string
      source?: PlaySource
      copies?: number
      note?: string | null
      spec?: StoredSpec | null
    }>,
    date = playDate
  ) {
    const result = await persistPlays({
      play_date: date,
      items,
      preferSession: playsSource === "session",
    })
    if (result.items.length === 0) {
      setNotice(result.error)
      return
    }
    setSaved((current) => {
      const next = [...result.items, ...current.filter((row) => !result.items.some((item) => item.id === row.id))]
      if (result.source === "session") writeSessionPlays(next)
      return next
    })
    if (result.source === "api") setPlaysSource("api")
    else setPlaysSource("session")
    setPlaysError(result.source === "session" ? result.error : null)
    setNotice(
      `${result.items.length} grille${result.items.length > 1 ? "s" : ""} consignée${result.items.length > 1 ? "s" : ""} pour le ${formatPlayDate(date)}.`
    )
    window.dispatchEvent(new Event(PLAYS_EVENT))
  }

  async function consignCurrent() {
    if (!complete) return
    const parsedCopies = Number.parseInt(copies, 10)
    await consignMany([
      {
        numbers: grid.numbers,
        stars: grid.stars,
        label,
        source,
        copies: Number.isFinite(parsedCopies) ? parsedCopies : 1,
        note: note.trim() || null,
        spec: playSpec,
      },
    ])
  }

  async function removePlay(item: DecoratedPlay) {
    if (playsSource === "api" && typeof item.id === "number") {
      try {
        const response = await fetch(`/api/plays/${item.id}`, { method: "DELETE" })
        if (!response.ok && response.status !== 404) {
          setPlaysError("Suppression impossible")
          return
        }
        setSaved((current) => current.filter((row) => row.id !== item.id))
        return
      } catch {
        setPlaysError("Suppression API impossible")
        return
      }
    }
    const next = saved.filter((row) => row.id !== item.id)
    setSaved(next)
    writeSessionPlays(next)
  }

  async function renamePlay(item: DecoratedPlay) {
    const nextLabel = renameLabel.trim() || "Grille"
    if (playsSource === "api" && typeof item.id === "number") {
      try {
        const response = await fetch(`/api/plays/${item.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ label: nextLabel }),
        })
        const row = (await response.json()) as PlayRecord & { error?: string }
        if (!response.ok) {
          setPlaysError(row.error ?? "Renommage impossible")
          return
        }
        setSaved((current) => current.map((entry) => (entry.id === item.id ? { ...entry, ...row } : entry)))
        setRenamingId(null)
        return
      } catch {
        setPlaysError("Renommage API impossible")
        return
      }
    }
    const next = saved.map((row) => (row.id === item.id ? { ...row, label: nextLabel } : row))
    setSaved(next)
    writeSessionPlays(next)
    setRenamingId(null)
  }

  function loadPlay(item: DecoratedPlay) {
    setNumbers([...item.numbers])
    setStars([...item.stars])
    setLabel(item.label || "Grille")
    setSource(item.source)
    setCopies(String(item.copies))
    setNote(item.note || "")
    setPlayDate(item.play_date)
    setPlaySpec(parseStoredSpec(item.spec))
  }

  function reopenInJeux(spec: StoredSpec | null | undefined) {
    const parsed = parseStoredSpec(spec)
    if (!parsed) return
    writeStoredSpec(parsed)
    router.push("/jeux")
  }

  const dateChoices = [...dates.upcoming, ...dates.recent.filter((day) => !dates.upcoming.includes(day))]

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        <TitleHelp help={HELP.banner}>histoJeux</TitleHelp> consigne les grilles
        jouées pour un tirage donné, puis relit le résultat officiel. Mes grilles
        (Combinaisons) reste la bibliothèque de modèles.
      </p>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              <TitleHelp help={HELP.stats}>Tickets</TitleHelp>
            </p>
            <CardTitle className="text-lg tabular-nums">{stats.tickets}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              <TitleHelp help={HELP.pending}>En attente</TitleHelp>
            </p>
            <CardTitle className="text-lg tabular-nums">{stats.pending}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              <TitleHelp help={HELP.settled}>Tranchés</TitleHelp>
            </p>
            <CardTitle className="text-lg tabular-nums">{stats.settled}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              Gains FDJ
            </p>
            <CardTitle className="text-lg tabular-nums">
              {stats.prize_known > 0 ? formatEuro(stats.prize_total) : "n.d."}
            </CardTitle>
            {stats.prize_known > 0 ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                Rapports du rang × copies, sur {stats.prize_known} ticket
                {stats.prize_known > 1 ? "s" : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Rapports FDJ absents (fichier local ou tirages sans échelle).
              </p>
            )}
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              Rangs obtenus
            </p>
            <CardTitle className="text-lg tabular-nums">
              {stats.p_win == null
                ? "—"
                : `${stats.wins}/${stats.settled} · ${formatPct(stats.p_win)}`}
            </CardTitle>
            {stats.wilson ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                IC Wilson {formatPct(stats.wilson.lo)} – {formatPct(stats.wilson.hi)}
              </p>
            ) : null}
            {stats.binomial ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                <TitleHelp help={HELP.binomial}>vs {formatPct(stats.p0, 2)}</TitleHelp>
                {" · p = "}
                {formatPValue(stats.binomial.p_value)}
              </p>
            ) : null}
          </CardHeader>
        </Card>
      </section>

      {stats.by_rank.length > 0 || stats.by_match.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <TitleHelp help={HELP.stats}>Lecture du journal</TitleHelp>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {stats.by_rank.length > 0 ? (
              <ul className="flex flex-wrap gap-2 text-xs tabular-nums text-muted-foreground">
                {stats.by_rank.map((row) => (
                  <li key={row.label}>
                    {row.rank == null ? "Pas de gain" : `Rang ${row.rank}`} · {row.count}
                  </li>
                ))}
              </ul>
            ) : null}
            {stats.by_match.length > 0 ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                Correspondances :{" "}
                {stats.by_match.map((row) => `${row.label} ×${row.count}`).join(" · ")}
              </p>
            ) : null}
            {stats.numbers_played.length > 0 ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                Numéros les plus joués :{" "}
                {stats.numbers_played
                  .slice(0, 8)
                  .map((row) => `${row.value} (${row.hits}/${row.played})`)
                  .join(" · ")}
              </p>
            ) : null}
            {stats.binomial ? (
              <p className="text-xs leading-5 text-muted-foreground">
                <TitleHelp help={HELP.binomial}>Test binomial</TitleHelp>
                {" · H0 : P(gain) = "}
                {formatPct(stats.p0, 2)}
                {` · ${stats.binomial.wins} rang${stats.binomial.wins > 1 ? "s" : ""} / ${stats.binomial.n} consignation${stats.binomial.n > 1 ? "s" : ""} (attendu ${stats.binomial.expected.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}) · p = ${formatPValue(stats.binomial.p_value)} · ${stats.binomial.verdict}`}
                {stats.binomial.tickets > stats.binomial.n
                  ? ` · ${stats.binomial.tickets} tickets (copies non comptées comme essais)`
                  : ""}
                {stats.binomial.draws < stats.binomial.n
                  ? ` · ${stats.binomial.draws} tirage${stats.binomial.draws > 1 ? "s" : ""} (grilles d’un même tirage ne sont pas indépendantes)`
                  : ""}
                {stats.covers_p0 === false
                  ? " · 7,71 % hors de l’IC Wilson (tickets)"
                  : stats.covers_p0
                    ? " · 7,71 % dans l’IC Wilson"
                    : ""}
                .
              </p>
            ) : null}
            <Disclaimer>
              P(gain) officielle {formatPct(stats.p0, 2)} pour toute grille 5+2. Un
              taux observé différent sur {stats.settled} ticket
              {stats.settled > 1 ? "s" : ""} ne dit rien du prochain tirage.
            </Disclaimer>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            <TitleHelp help={HELP.consign}>Consigner une grille</TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <LabelHelp label="Tirage visé" help={HELP.playDate}>
              <Select value={playDate} onValueChange={(value) => value && setPlayDate(value)}>
                <SelectTrigger className="w-full" aria-label="Date du tirage">
                  <span className="flex flex-1 text-left">
                    {formatPlayDate(playDate)}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {dateChoices.map((day) => (
                    <SelectItem key={day} value={day}>
                      {formatPlayDate(day)}
                      {day === dates.next ? " · prochain" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>
            <LabelHelp label="Libellé" help={HELP.consign}>
              <Input value={label} onChange={(event) => setLabel(event.target.value)} aria-label="Libellé" />
            </LabelHelp>
            <LabelHelp label="Origine" help={HELP.source}>
              <Select value={source} onValueChange={(value) => setSource(value as PlaySource)}>
                <SelectTrigger className="w-full" aria-label="Origine">
                  <span className="flex flex-1 text-left">{PLAY_SOURCE_LABELS[source]}</span>
                </SelectTrigger>
                <SelectContent>
                  {PLAY_SOURCES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {PLAY_SOURCE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>
            <LabelHelp label="Copies" help={HELP.copies}>
              <Input
                type="number"
                min={1}
                max={20}
                value={copies}
                onChange={(event) => setCopies(event.target.value)}
                className="w-full min-w-0 sm:w-24"
                aria-label="Nombre de copies"
              />
            </LabelHelp>
          </div>
          <LabelHelp label="Note" help={HELP.note}>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optionnel"
              aria-label="Note"
            />
          </LabelHelp>
          <p className="text-xs text-muted-foreground">
            Sélection {numbers.length}/5 + {stars.length}/2
          </p>
          <MiniPicker
            numbers={numbers}
            stars={stars}
            onToggleNumber={toggleNumber}
            onToggleStar={toggleStar}
          />
          {complete ? (
            <div className="flex flex-col gap-2">
              <DrawBalls numbers={grid.numbers} stars={grid.stars} />
              {shape ? (
                <p className="text-xs text-muted-foreground tabular-nums">
                  Σ {shape.sum} · {shape.even}p/{shape.odd}i · étendue {shape.spread} ·{" "}
                  {shape.consecutive} consécutif{shape.consecutive > 1 ? "s" : ""}
                </p>
              ) : null}
              {playSpec ? (
                <p className="text-xs text-muted-foreground">
                  <TitleHelp help={HELP.spec}>Spec Jeux</TitleHelp>
                  {" · "}
                  {summarizeStoredSpec(playSpec).join(" · ") || "univers libre"}
                </p>
              ) : null}
              {duplicate > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Déjà {duplicate} consignation{duplicate > 1 ? "s" : ""} de cette grille
                  pour ce tirage.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <HelpWrap help={HELP.consign}>
              <Button type="button" onClick={() => void consignCurrent()} disabled={!complete}>
                Consigner
              </Button>
            </HelpWrap>
            {pendingBatch && pendingBatch.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void consignMany(pendingBatch)
                  setPendingBatch(null)
                }}
              >
                Consigner les {pendingBatch.length} grilles
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setNumbers([])
                setStars([])
                setNote("")
                setPlaySpec(null)
              }}
            >
              Vider
            </Button>
          </div>
          {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
          {playsError ? (
            <p className="text-xs text-muted-foreground">
              {playsError}
              {playsSource === "session" ? " — conservation en session." : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Journal</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <LabelHelp label="Statut" help={HELP.settled}>
              <Select value={filter} onValueChange={(value) => setFilter(value as FilterId)}>
                <SelectTrigger className="w-full min-w-0 sm:w-40" aria-label="Filtrer par statut">
                  <span className="flex flex-1 text-left">
                    {filter === "all" ? "Tous" : filter === "pending" ? "En attente" : "Tranchés"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="settled">Tranchés</SelectItem>
                </SelectContent>
              </Select>
            </LabelHelp>
            <LabelHelp label="Origine" help={HELP.source}>
              <Select
                value={sourceFilter}
                onValueChange={(value) => setSourceFilter(value as "all" | PlaySource)}
              >
                <SelectTrigger className="w-full min-w-0 sm:w-40" aria-label="Filtrer par origine">
                  <span className="flex flex-1 text-left">
                    {sourceFilter === "all" ? "Toutes" : PLAY_SOURCE_LABELS[sourceFilter]}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {PLAY_SOURCES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {PLAY_SOURCE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>
            <HelpWrap help={HELP.export}>
              <Button
                type="button"
                variant="outline"
                disabled={visible.length === 0}
                onClick={() => downloadCsv(visible)}
              >
                Export CSV
              </Button>
            </HelpWrap>
          </div>
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune grille consignée
              {filter === "all" ? "." : " dans ce filtre."}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {visible.map((item) => {
                const shapeRow = playShape(item)
                return (
                  <li
                    key={String(item.id)}
                    className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      {renamingId === item.id ? (
                        <div className="flex flex-wrap gap-2">
                          <Input
                            value={renameLabel}
                            onChange={(event) => setRenameLabel(event.target.value)}
                            aria-label="Nouveau libellé"
                            className="sm:w-56"
                          />
                          <Button type="button" size="sm" onClick={() => void renamePlay(item)}>
                            OK
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => setRenamingId(null)}>
                            Annuler
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm font-medium">
                          {item.label || "Grille"}
                          {item.copies > 1 ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              ×{item.copies}
                            </span>
                          ) : null}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatPlayDate(item.play_date)} · {item.source_label}
                      </p>
                      <DrawBalls
                        numbers={item.numbers}
                        stars={item.stars}
                        highlightNumbers={item.result?.winning_numbers}
                        highlightStars={item.result?.winning_stars}
                      />
                      <p className={cn("text-xs tabular-nums", resultTone(item))}>
                        {item.status === "pending"
                          ? "En attente du tirage officiel"
                          : item.result?.rank == null
                            ? `${item.result?.matched_numbers ?? 0} n° + ${item.result?.matched_stars ?? 0} ★ · Pas de gain${item.result?.prize != null ? ` · ${formatEuro(item.result.prize)}` : ""}`
                            : `Rang ${item.result.rank} · ${item.result.label} (${item.result.matched_numbers} n° + ${item.result.matched_stars} ★)${item.result.prize != null ? ` · ${formatEuro(item.result.prize)}` : ""}`}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Σ {shapeRow.sum} · {shapeRow.even}p/{shapeRow.odd}i · étendue {shapeRow.spread}
                        {item.note ? ` · ${item.note}` : ""}
                      </p>
                      {item.spec ? (
                        <p className="text-xs text-muted-foreground">
                          <TitleHelp help={HELP.spec}>Spec Jeux</TitleHelp>
                          {" · "}
                          {(item.spec_summary?.length
                            ? item.spec_summary
                            : summarizeStoredSpec(item.spec)
                          ).join(" · ") || "univers libre"}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => loadPlay(item)}>
                        Recharger
                      </Button>
                      {item.spec ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => reopenInJeux(item.spec)}
                        >
                          Rouvrir dans Jeux
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRenamingId(item.id)
                          setRenameLabel(item.label || "Grille")
                        }}
                      >
                        Renommer
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => void removePlay(item)}
                      >
                        Supprimer
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}