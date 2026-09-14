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
import type { CombinationGrid } from "@/lib/combinations"
import {
  numberFrequencyTable,
  starFrequencyTable,
} from "@/lib/draws"
import {
  DEFAULT_CHANCE,
  HANDOFF_KEY,
  LIST_LIMIT,
  NUMBER_DRAW,
  NUMBER_POOL,
  NUMBER_SUM_MAX,
  NUMBER_SUM_MIN,
  NUMBER_VALUES,
  SAMPLE_SIZE,
  SESSION_KEY,
  STAR_DRAW,
  STAR_POOL,
  STAR_SUM_MAX,
  STAR_SUM_MIN,
  STAR_VALUES,
  TOTAL_GRIDS,
  ballRole,
  chancesFromCounts,
  defaultStoredSpec,
  evaluateGame,
  evenPercent,
  formatCount,
  formatMass,
  formatOneIn,
  listGrids,
  listPool,
  samplePool,
  storedToPoolSpecs,
  type PoolKind,
  type PoolResult,
  type StoredSpec,
} from "@/lib/jeux"
import { useDraws } from "@/lib/use-draws"
import { cn } from "@/lib/utils"

const HELP = {
  banner: {
    title: "Solutions",
    body: "Décompte exact des grilles 5+2 qui respectent les restrictions. Ce n’est pas un pronostic : chaque tirage officiel reste uniforme sur 139 838 160 grilles.",
  },
  count: {
    title: "Nombre de solutions",
    body: "Produit du nombre de 5-combinaisons de numéros restantes par le nombre de 2-combinaisons d’étoiles. Recalculé à chaque curseur, par programmation dynamique.",
  },
  oneIn: {
    title: "1 sur N",
    body: "Univers / solutions. 1 sur 1 = aucune restriction. Plus N est grand, plus l’espace a été réduit.",
  },
  mass: {
    title: "Masse pondérée",
    body: "Somme, sur les solutions, du produit des chances (p/100) des boules choisies. Si toutes les chances sont à 100 %, masse = nombre entier. Les pourcentages intermédiaires réduisent la masse sans exclure une boule (sauf sous le seuil).",
  },
  sum: {
    title: "Somme mini / maxi",
    body: "Bornes de la somme des boules tirées. Numéros : 15 (1+2+3+4+5) à 240 (46+…+50). Étoiles : 3 (1+2) à 23 (11+12).",
  },
  parity: {
    title: "Taux de pairs",
    body: "Nombre de pairs parmi les boules tirées, affiché aussi en %. 5 numéros : 0, 20, 40, 60, 80 ou 100 %. 2 étoiles : 0, 50 ou 100 %. Mini et maxi bornent la plage acceptée.",
  },
  threshold: {
    title: "Seuil de présence",
    body: "Une boule reste dans le bassin seulement si sa chance est ≥ seuil (et > 0). Sans ce seuil, 40 % et 80 % ne changeraient pas le décompte entier.",
  },
  chance: {
    title: "Chance de tirage",
    body: "0 % exclut la boule. 1–100 % la laisse optionnelle, sous réserve du seuil. 100 % ne l’impose pas — sinon tout à 100 % forcerait les 50 numéros. Pour imposer : clic sur le numéro.",
  },
  force: {
    title: "Imposer",
    body: "Clic sur le numéro : la boule doit figurer dans chaque solution. Un second clic relâche. Au plus 5 numéros et 2 étoiles.",
  },
  list: {
    title: "Liste",
    body: "Les grilles 5+2 s’affichent dès que leur nombre est ≤ 50. Au-delà, un échantillon uniforme de 12 est tiré dans l’espace restant.",
  },
  archive: {
    title: "Fréquences archive",
    body: "Recopie les chances sur les totaux des 100 derniers tirages (max = 100 %). Une boule absente de cette fenêtre passe à 0 % et sort du bassin. Ce n’est pas une proba de sortie.",
  },
} satisfies Record<string, HelpCopy>

function formatPct(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—"
  if (value > 0 && value < 0.000001) {
    return value.toLocaleString("fr-FR", {
      style: "percent",
      maximumSignificantDigits: 2,
    })
  }
  return value.toLocaleString("fr-FR", {
    style: "percent",
    maximumFractionDigits: digits,
    minimumFractionDigits: value > 0 && value < 0.01 ? digits : Math.min(digits, 1),
  })
}

function readStored(): StoredSpec {
  const fallback = defaultStoredSpec()
  if (typeof window === "undefined") return fallback
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<StoredSpec>
    const base = defaultStoredSpec()
    const numberChance = Array.isArray(parsed.numberChance)
      ? NUMBER_VALUES.map((_, i) =>
          Math.min(100, Math.max(0, Math.round(Number(parsed.numberChance?.[i]) || 0)))
        )
      : base.numberChance
    const starChance = Array.isArray(parsed.starChance)
      ? STAR_VALUES.map((_, i) =>
          Math.min(100, Math.max(0, Math.round(Number(parsed.starChance?.[i]) || 0)))
        )
      : base.starChance
    return {
      ...base,
      ...parsed,
      numberChance,
      starChance,
      numberForced: Array.isArray(parsed.numberForced) ? parsed.numberForced : [],
      starForced: Array.isArray(parsed.starForced) ? parsed.starForced : [],
    }
  } catch {
    return fallback
  }
}

function writeStored(spec: StoredSpec) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(spec))
  } catch {
    /* quota / private mode */
  }
}

function RangeField({
  label,
  help,
  min,
  max,
  value,
  onChange,
  display,
  ariaLabel,
}: {
  label: string
  help: HelpCopy
  min: number
  max: number
  value: number
  onChange: (value: number) => void
  display: string
  ariaLabel: string
}) {
  return (
    <LabelHelp label={label} help={help} className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="jeux-range min-w-0 flex-1"
          aria-label={ariaLabel}
        />
        <span className="w-16 shrink-0 text-right text-xs tabular-nums text-foreground">
          {display}
        </span>
      </div>
    </LabelHelp>
  )
}

function Histogram({
  bins,
  label,
}: {
  bins: Array<{ sum: number; count: number }>
  label: string
}) {
  if (bins.length === 0) {
    return <p className="text-xs text-muted-foreground">Aucune somme restante.</p>
  }
  const peak = Math.max(1, ...bins.map((bin) => bin.count))
  return (
    <div className="flex flex-col gap-1" aria-label={label}>
      <div className="flex h-16 items-end gap-px">
        {bins.map((bin) => (
          <div
            key={bin.sum}
            title={`${bin.sum} : ${formatCount(bin.count)}`}
            className="min-w-0 flex-1 rounded-t-sm bg-primary/70"
            style={{ height: `${Math.max(6, (100 * bin.count) / peak)}%` }}
          />
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground tabular-nums">
        Σ {bins[0].sum}–{bins[bins.length - 1].sum}
      </p>
    </div>
  )
}

function ChanceGrid({
  kind,
  values,
  chance,
  threshold,
  forced,
  onChance,
  onForce,
}: {
  kind: PoolKind
  values: number[]
  chance: number[]
  threshold: number
  forced: number[]
  onChance: (value: number, chance: number) => void
  onForce: (value: number) => void
}) {
  const forcedSet = new Set(forced)
  return (
    <div
      className={kind === "numbers" ? "euromillions-ball-grid" : "grid grid-cols-6 gap-1 sm:grid-cols-12"}
      role="group"
      aria-label={kind === "numbers" ? "Chances des numéros 1 à 50" : "Chances des étoiles 1 à 12"}
    >
      {values.map((value) => {
        const p = chance[value - 1] ?? 0
        const role = ballRole(p, threshold, forcedSet.has(value))
        return (
          <div
            key={value}
            className={cn(
              "flex min-w-0 flex-col items-center gap-0.5 rounded-md px-0.5 py-1",
              role === "excluded" && "opacity-40",
              role === "forced" && "ring-2 ring-primary ring-offset-1 ring-offset-background"
            )}
          >
            <button
              type="button"
              aria-pressed={role === "forced"}
              aria-label={
                role === "forced"
                  ? `Relâcher ${kind === "stars" ? "l’étoile" : "le numéro"} ${value}`
                  : `Imposer ${kind === "stars" ? "l’étoile" : "le numéro"} ${value}`
              }
              onClick={() => onForce(value)}
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums sm:size-8",
                kind === "stars"
                  ? "bg-[oklch(0.78_0.14_75)] text-[oklch(0.18_0.04_260)]"
                  : "bg-primary text-primary-foreground",
                role === "excluded" && "bg-muted text-muted-foreground"
              )}
            >
              {value}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={p}
              onChange={(event) => onChance(value, Number(event.target.value))}
              className="jeux-range w-full"
              aria-label={`Chance ${kind === "stars" ? "de l’étoile" : "du numéro"} ${value}`}
            />
            <span className="text-[9px] tabular-nums text-muted-foreground sm:text-[10px]">
              {p}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

function PoolStats({ result }: { result: PoolResult }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm tabular-nums">
        <span className="font-medium text-foreground">{formatCount(result.count)}</span>
        <span className="text-muted-foreground">
          {" "}
          / {formatCount(result.universe)} · bassin {result.poolSize} · imposées{" "}
          {result.forced.length} · exclues {result.excluded.length}
        </span>
      </p>
      {result.impossible ? (
        <p className="text-sm text-muted-foreground">{result.impossible}</p>
      ) : null}
      {result.byEven.length > 0 ? (
        <ul className="flex flex-wrap gap-2 text-xs tabular-nums text-muted-foreground">
          {result.byEven.map((row) => (
            <li key={row.even}>
              {row.label} · {formatCount(row.count)}
            </li>
          ))}
        </ul>
      ) : null}
      <Histogram
        bins={result.bySum}
        label={result.kind === "numbers" ? "Sommes des numéros restantes" : "Sommes des étoiles restantes"}
      />
    </div>
  )
}

function gridLabel(grid: CombinationGrid) {
  return `${grid.numbers.join(" ")} + ${grid.stars.join(" ")}`
}

export function JeuxPanel() {
  const router = useRouter()
  const { draws } = useDraws("all")
  const [spec, setSpec] = useState<StoredSpec>(defaultStoredSpec)
  const [ready, setReady] = useState(false)
  const [sampleSeed, setSampleSeed] = useState(1)
  const [sampleOn, setSampleOn] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSpec(readStored())
      setReady(true)
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    if (!ready) return
    writeStored(spec)
  }, [spec, ready])

  const pools = useMemo(() => storedToPoolSpecs(spec), [spec])
  const game = useMemo(
    () => evaluateGame(pools.numbers, pools.stars),
    [pools]
  )

  const listedNumbers = useMemo(
    () =>
      game.numbers.count > 0 && game.numbers.count <= LIST_LIMIT
        ? listPool(pools.numbers)
        : [],
    [game.numbers.count, pools.numbers]
  )
  const listedStars = useMemo(
    () =>
      game.stars.count > 0 && game.stars.count <= LIST_LIMIT
        ? listPool(pools.stars)
        : [],
    [game.stars.count, pools.stars]
  )
  const listedGrids = useMemo(() => {
    if (game.grids === 0 || game.grids > LIST_LIMIT) return []
    if (listedNumbers.length === 0 || listedStars.length === 0) return []
    return listGrids(listedNumbers, listedStars, LIST_LIMIT)
  }, [game.grids, listedNumbers, listedStars])

  const samples = useMemo(() => {
    if (!sampleOn || game.grids === 0 || game.grids <= LIST_LIMIT) return []
    const numberSample =
      game.numbers.count <= SAMPLE_SIZE
        ? listPool(pools.numbers)
        : samplePool(pools.numbers, SAMPLE_SIZE, sampleSeed)
    const starSample =
      game.stars.count <= SAMPLE_SIZE
        ? listPool(pools.stars)
        : samplePool(pools.stars, SAMPLE_SIZE, sampleSeed + 17)
    const grids: CombinationGrid[] = []
    const nCount = Math.max(numberSample.length, 1)
    const sCount = Math.max(starSample.length, 1)
    const take = Math.min(SAMPLE_SIZE, Math.max(numberSample.length, starSample.length))
    for (let i = 0; i < take; i += 1) {
      const numbers = numberSample[i % nCount]
      const stars = starSample[i % sCount]
      if (!numbers || !stars) continue
      grids.push({ numbers, stars })
    }
    return grids
  }, [game.grids, game.numbers.count, game.stars.count, pools, sampleSeed, sampleOn])

  useRegisterCapture(() => ({
    lab: "jeux",
    tab: null,
    summary: [
      `${formatCount(game.grids)} grilles 5+2 restantes`,
      `${formatCount(game.numbers.count)} combinaisons de numéros × ${formatCount(game.stars.count)} d’étoiles`,
      game.oneIn == null ? "Aucune solution" : `1 sur ${formatOneIn(game.oneIn)} de l’univers`,
    ],
    tech: {
      grids: game.grids,
      fraction: game.fraction,
      numbers: {
        count: game.numbers.count,
        pool: game.numbers.poolSize,
        forced: game.numbers.forced,
        excluded: game.numbers.excluded.length,
        sum: [spec.numberMinSum, spec.numberMaxSum],
        even: [spec.numberMinEven, spec.numberMaxEven],
      },
      stars: {
        count: game.stars.count,
        pool: game.stars.poolSize,
        forced: game.stars.forced,
        excluded: game.stars.excluded.length,
        sum: [spec.starMinSum, spec.starMaxSum],
        even: [spec.starMinEven, spec.starMaxEven],
      },
    },
  }))

  function patch(partial: Partial<StoredSpec>) {
    setSpec((current) => ({ ...current, ...partial }))
  }

  function setChance(kind: PoolKind, value: number, chance: number) {
    setSpec((current) => {
      if (kind === "numbers") {
        const next = [...current.numberChance]
        next[value - 1] = chance
        const forced =
          chance <= 0
            ? current.numberForced.filter((item) => item !== value)
            : current.numberForced
        return { ...current, numberChance: next, numberForced: forced }
      }
      const next = [...current.starChance]
      next[value - 1] = chance
      const forced =
        chance <= 0
          ? current.starForced.filter((item) => item !== value)
          : current.starForced
      return { ...current, starChance: next, starForced: forced }
    })
  }

  function toggleForce(kind: PoolKind, value: number) {
    setSpec((current) => {
      const key = kind === "numbers" ? "numberForced" : "starForced"
      const chanceKey = kind === "numbers" ? "numberChance" : "starChance"
      const present = current[key].includes(value)
      const forced = present
        ? current[key].filter((item) => item !== value)
        : [...current[key], value].sort((a, b) => a - b)
      const chance = [...current[chanceKey]]
      if (!present && (chance[value - 1] ?? 0) <= 0) chance[value - 1] = DEFAULT_CHANCE
      return { ...current, [key]: forced, [chanceKey]: chance }
    })
  }

  function setAllChance(kind: PoolKind, chance: number) {
    if (kind === "numbers") {
      patch({
        numberChance: NUMBER_VALUES.map(() => chance),
        numberForced: chance <= 0 ? [] : spec.numberForced,
      })
      return
    }
    patch({
      starChance: STAR_VALUES.map(() => chance),
      starForced: chance <= 0 ? [] : spec.starForced,
    })
  }

  function keepParity(kind: PoolKind, evenOnly: boolean) {
    const values = kind === "numbers" ? NUMBER_VALUES : STAR_VALUES
    const next = values.map((value) =>
      evenOnly === (value % 2 === 0) ? DEFAULT_CHANCE : 0
    )
    if (kind === "numbers") {
      patch({
        numberChance: next,
        numberForced: spec.numberForced.filter((value) => evenOnly === (value % 2 === 0)),
      })
      return
    }
    patch({
      starChance: next,
      starForced: spec.starForced.filter((value) => evenOnly === (value % 2 === 0)),
    })
  }

  function fromArchive() {
    const recent = draws.slice(0, 100)
    if (recent.length === 0) return
    patch({
      numberChance: chancesFromCounts(numberFrequencyTable(recent), NUMBER_POOL),
      starChance: chancesFromCounts(starFrequencyTable(recent), STAR_POOL),
      numberForced: [],
      starForced: [],
    })
  }

  function sendGrid(grid: CombinationGrid) {
    try {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(grid))
    } catch {
      /* ignore */
    }
    router.push("/combinaisons")
  }

  const solutions = listedGrids.length > 0 ? listedGrids : samples

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-28">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        <TitleHelp help={HELP.banner}>Compteur combinatoire</TitleHelp> : on
        restreint l’univers 5/50 + 2/12, puis on lit le nombre exact de grilles
        restantes. Les curseurs de chance filtrent (0 % / seuil) ou pondèrent
        (masse) ; ils ne prédisent pas le prochain tirage.
      </p>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              <TitleHelp help={HELP.count}>Solutions 5+2</TitleHelp>
            </p>
            <CardTitle className="text-lg tabular-nums">
              {formatCount(game.grids)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              Comb. n° × étoiles
            </p>
            <CardTitle className="text-lg tabular-nums">
              {formatCount(game.numbers.count)} × {formatCount(game.stars.count)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              <TitleHelp help={HELP.oneIn}>1 sur</TitleHelp>
            </p>
            <CardTitle className="text-lg tabular-nums">
              {formatOneIn(game.oneIn)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              <TitleHelp help={HELP.mass}>Masse pondérée</TitleHelp>
            </p>
            <CardTitle className="text-lg tabular-nums">
              {formatMass(game.mass)}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>
            <TitleHelp help={HELP.chance}>Numéros 1–50</TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <RangeField
              label="Somme mini"
              help={HELP.sum}
              min={NUMBER_SUM_MIN}
              max={NUMBER_SUM_MAX}
              value={spec.numberMinSum}
              onChange={(value) => patch({ numberMinSum: value })}
              display={String(spec.numberMinSum)}
              ariaLabel="Somme minimale des 5 numéros"
            />
            <RangeField
              label="Somme maxi"
              help={HELP.sum}
              min={NUMBER_SUM_MIN}
              max={NUMBER_SUM_MAX}
              value={spec.numberMaxSum}
              onChange={(value) => patch({ numberMaxSum: value })}
              display={String(spec.numberMaxSum)}
              ariaLabel="Somme maximale des 5 numéros"
            />
            <RangeField
              label={`Pairs mini · ${evenPercent(spec.numberMinEven, NUMBER_DRAW)}%`}
              help={HELP.parity}
              min={0}
              max={NUMBER_DRAW}
              value={spec.numberMinEven}
              onChange={(value) => patch({ numberMinEven: value })}
              display={`${spec.numberMinEven}p`}
              ariaLabel="Nombre minimal de numéros pairs"
            />
            <RangeField
              label={`Pairs maxi · ${evenPercent(spec.numberMaxEven, NUMBER_DRAW)}%`}
              help={HELP.parity}
              min={0}
              max={NUMBER_DRAW}
              value={spec.numberMaxEven}
              onChange={(value) => patch({ numberMaxEven: value })}
              display={`${spec.numberMaxEven}p`}
              ariaLabel="Nombre maximal de numéros pairs"
            />
            <RangeField
              label="Seuil de présence"
              help={HELP.threshold}
              min={0}
              max={100}
              value={spec.numberThreshold}
              onChange={(value) => patch({ numberThreshold: value })}
              display={`${spec.numberThreshold}%`}
              ariaLabel="Seuil de chance des numéros"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAllChance("numbers", 100)}>
              Tout 100 %
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setAllChance("numbers", 0)}>
              Tout 0 %
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => keepParity("numbers", true)}>
              Pairs seulement
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => keepParity("numbers", false)}>
              Impairs seulement
            </Button>
          </div>
          <HelpWrap help={HELP.force}>
            <ChanceGrid
              kind="numbers"
              values={NUMBER_VALUES}
              chance={spec.numberChance}
              threshold={spec.numberThreshold}
              forced={spec.numberForced}
              onChance={(value, chance) => setChance("numbers", value, chance)}
              onForce={(value) => toggleForce("numbers", value)}
            />
          </HelpWrap>
          <PoolStats result={game.numbers} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <TitleHelp help={HELP.chance}>Étoiles 1–12</TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <RangeField
              label="Somme mini"
              help={HELP.sum}
              min={STAR_SUM_MIN}
              max={STAR_SUM_MAX}
              value={spec.starMinSum}
              onChange={(value) => patch({ starMinSum: value })}
              display={String(spec.starMinSum)}
              ariaLabel="Somme minimale des 2 étoiles"
            />
            <RangeField
              label="Somme maxi"
              help={HELP.sum}
              min={STAR_SUM_MIN}
              max={STAR_SUM_MAX}
              value={spec.starMaxSum}
              onChange={(value) => patch({ starMaxSum: value })}
              display={String(spec.starMaxSum)}
              ariaLabel="Somme maximale des 2 étoiles"
            />
            <RangeField
              label={`Pairs mini · ${evenPercent(spec.starMinEven, STAR_DRAW)}%`}
              help={HELP.parity}
              min={0}
              max={STAR_DRAW}
              value={spec.starMinEven}
              onChange={(value) => patch({ starMinEven: value })}
              display={`${spec.starMinEven}p`}
              ariaLabel="Nombre minimal d’étoiles paires"
            />
            <RangeField
              label={`Pairs maxi · ${evenPercent(spec.starMaxEven, STAR_DRAW)}%`}
              help={HELP.parity}
              min={0}
              max={STAR_DRAW}
              value={spec.starMaxEven}
              onChange={(value) => patch({ starMaxEven: value })}
              display={`${spec.starMaxEven}p`}
              ariaLabel="Nombre maximal d’étoiles paires"
            />
            <RangeField
              label="Seuil de présence"
              help={HELP.threshold}
              min={0}
              max={100}
              value={spec.starThreshold}
              onChange={(value) => patch({ starThreshold: value })}
              display={`${spec.starThreshold}%`}
              ariaLabel="Seuil de chance des étoiles"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAllChance("stars", 100)}>
              Tout 100 %
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setAllChance("stars", 0)}>
              Tout 0 %
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => keepParity("stars", true)}>
              Paires seulement
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => keepParity("stars", false)}>
              Impaires seulement
            </Button>
          </div>
          <HelpWrap help={HELP.force}>
            <ChanceGrid
              kind="stars"
              values={STAR_VALUES}
              chance={spec.starChance}
              threshold={spec.starThreshold}
              forced={spec.starForced}
              onChance={(value, chance) => setChance("stars", value, chance)}
              onForce={(value) => toggleForce("stars", value)}
            />
          </HelpWrap>
          <PoolStats result={game.stars} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <TitleHelp help={HELP.list}>Solutions visibles</TitleHelp>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setSpec(defaultStoredSpec())}>
              Réinitialiser
            </Button>
            <HelpWrap help={HELP.archive}>
              <Button
                type="button"
                variant="outline"
                onClick={fromArchive}
                disabled={draws.length === 0}
              >
                Fréquences (100 tirages)
              </Button>
            </HelpWrap>
            {game.grids > LIST_LIMIT ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSampleOn(true)
                  setSampleSeed((seed) => seed + 1)
                }}
              >
                {sampleOn ? "Relancer l’échantillon" : "Tirer 12 exemples"}
              </Button>
            ) : null}
          </div>
          {game.grids === 0 ? (
            <p className="text-sm text-muted-foreground">
              {game.numbers.impossible || game.stars.impossible || "Aucune grille 5+2 dans ces bornes."}
            </p>
          ) : game.grids <= LIST_LIMIT ? (
            <ul className="flex flex-col gap-2">
              {solutions.map((grid) => (
                <li key={gridLabel(grid)}>
                  <button
                    type="button"
                    onClick={() => sendGrid(grid)}
                    className="flex w-full flex-col gap-2 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <DrawBalls numbers={grid.numbers} stars={grid.stars} />
                    <span className="text-xs text-muted-foreground">Ouvrir dans Combinaisons</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {formatCount(game.grids)} grilles : trop pour les lister ({LIST_LIMIT} max).
                {sampleOn
                  ? ` Échantillon uniforme de ${samples.length} :`
                  : " Serrez les curseurs, ou tirez 12 exemples uniformes dans l’espace restant."}
              </p>
              {sampleOn && samples.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {samples.map((grid) => (
                  <li key={gridLabel(grid)}>
                    <button
                      type="button"
                      onClick={() => sendGrid(grid)}
                      className="flex w-full flex-col gap-2 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <DrawBalls numbers={grid.numbers} stars={grid.stars} />
                      <span className="text-xs text-muted-foreground">Ouvrir dans Combinaisons</span>
                    </button>
                  </li>
                ))}
              </ul>
              ) : null}
              {listedNumbers.length > 0 ? (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {listedNumbers.length} combinaison
                  {listedNumbers.length > 1 ? "s" : ""} de numéros ≤ {LIST_LIMIT} :{" "}
                  {listedNumbers
                    .slice(0, 8)
                    .map((combo) => combo.join("-"))
                    .join(" · ")}
                  {listedNumbers.length > 8 ? " …" : ""}
                </p>
              ) : null}
              {listedStars.length > 0 ? (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {listedStars.length} combinaison
                  {listedStars.length > 1 ? "s" : ""} d’étoiles ≤ {LIST_LIMIT} :{" "}
                  {listedStars.map((combo) => combo.join("-")).join(" · ")}
                </p>
              ) : null}
            </div>
          )}
          <Disclaimer>
            Univers : {formatCount(TOTAL_GRIDS)} grilles. Part restante :{" "}
            {formatPct(game.fraction, 4)}. Masse {formatMass(game.mass)} (poids des
            chances). Cliquez une grille pour l’envoyer au composeur.
          </Disclaimer>
        </CardContent>
      </Card>

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-baseline justify-between gap-2 px-4 py-3 sm:px-6">
          <p className="text-sm font-medium tabular-nums">
            {formatCount(game.grids)} solution{game.grids === 1 ? "" : "s"}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {game.grids === 0
              ? game.numbers.impossible ||
                game.stars.impossible ||
                "Aucune grille 5+2 dans ces bornes."
              : `${formatCount(game.numbers.count)} comb. n° × ${formatCount(game.stars.count)} comb. ★ · 1 sur ${formatOneIn(game.oneIn)} · ${formatPct(game.fraction, 3)} de l’univers`}
          </p>
        </div>
      </div>
    </div>
  )
}
