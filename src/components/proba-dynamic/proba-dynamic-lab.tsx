"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { HelpTip, TitleHelp } from "@/components/help"
import { ChargeBoard } from "@/components/proba-dynamic/charge-board"
import { CounterMap } from "@/components/proba-dynamic/counter-map"
import { SiteHeaderSlot } from "@/components/site-header-slot"
import { WeekdayScopeControl } from "@/components/weekday-scope-control"
import { Button } from "@/components/ui/button"
import { PillTabs } from "@/components/ui/pill-tabs"
import type { Draw } from "@/lib/draws"
import { PROBA_DYNAMIC_HELP } from "@/lib/proba-dynamic-help"
import {
  buildProbaMap,
  MAP_PLACEMENT_LABELS,
  MAP_PLACEMENTS,
  MAP_SCALE_LABELS,
  MAP_SCALES,
  parseMapKind,
  parseMapPlacement,
  parseMapScale,
  type MapPlacement,
  type MapScale,
  type ProbaMap,
} from "@/lib/proba-map"
import {
  NUMBER_POOL,
  STAR_POOL,
  ballValues,
  buildProbaBoards,
  nextPinnedBall,
  orderBalls,
  parsePinned,
  parseProbaDir,
  parseProbaSort,
  type ProbaBoards,
  type ProbaDir,
  type ProbaKind,
  type ProbaSort,
} from "@/lib/proba-dynamic"
import { useDraws } from "@/lib/use-draws"
import { cn } from "@/lib/utils"
import { useWeekdayScope } from "@/lib/use-weekday-scope"
import type { WeekdayScope } from "@/lib/weekday-scope"

const SORTS = [
  { id: "dizaines", label: "Dizaines", help: PROBA_DYNAMIC_HELP.dizaines },
  { id: "unites", label: "Unités", help: PROBA_DYNAMIC_HELP.unites },
  { id: "compteur-asc", label: "Compteur croissant", help: PROBA_DYNAMIC_HELP.compteur },
  { id: "compteur-desc", label: "Compteur décroissant", help: PROBA_DYNAMIC_HELP.compteur },
  { id: "map", label: "Carte", help: PROBA_DYNAMIC_HELP.carte },
] as const

const MAP_SCALE_ITEMS = MAP_SCALES.map((id) => ({ id, label: MAP_SCALE_LABELS[id] }))
const MAP_PLACEMENT_ITEMS = MAP_PLACEMENTS.map((id) => ({ id, label: MAP_PLACEMENT_LABELS[id] }))
const BANDS = [
  { id: "numeros", label: "Numéros", help: PROBA_DYNAMIC_HELP.numeros },
  { id: "etoiles", label: "Étoiles", help: PROBA_DYNAMIC_HELP.etoiles },
] as const

type SortId = (typeof SORTS)[number]["id"]
type BandId = (typeof BANDS)[number]["id"]
type Pin = { kind: ProbaKind; value: number }

const AUTO_MS = 700

function pinKey(pin: Pin | null) {
  return pin ? `${pin.kind}:${pin.value}` : ""
}

function sortId(sort: ProbaSort, dir: ProbaDir): SortId {
  if (sort === "compteur") return dir === "asc" ? "compteur-asc" : "compteur-desc"
  if (sort === "map") return "map"
  return sort
}

function CalcLight({ thinking }: { thinking: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
      aria-live="polite"
    >
      <span className="relative inline-flex size-2.5" aria-hidden="true">
        {thinking ? (
          <>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-warn opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-warn" />
          </>
        ) : (
          <span className="relative inline-flex size-2.5 rounded-full bg-ok" />
        )}
      </span>
      {thinking ? "Calcul" : "À jour"}
    </span>
  )
}

export function ProbaDynamicLab() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [weekday, setWeekday] = useWeekdayScope()
  const { draws, loading } = useDraws("all", weekday)
  const [busy, setBusy] = useState(true)
  const [view, setView] = useState<ProbaBoards | null>(null)
  const [readyDraws, setReadyDraws] = useState<Draw[] | null>(null)
  const [readyWeekday, setReadyWeekday] = useState<WeekdayScope | null>(null)
  const [mapView, setMapView] = useState<ProbaMap | null>(null)
  const [readyMap, setReadyMap] = useState<{
    draws: Draw[]
    weekday: WeekdayScope
    scale: MapScale
    kind: ProbaKind
    placement: MapPlacement
  } | null>(null)
  const seenWeekday = useRef(weekday)
  const requestId = useRef(0)
  const sort = parseProbaSort(searchParams.get("tri"))
  const dir = parseProbaDir(searchParams.get("sens"))
  const mapScale = parseMapScale(searchParams.get("echelle"))
  const mapKind = parseMapKind(searchParams.get("bande"))
  const mapPlacement = parseMapPlacement(searchParams.get("pose"))
  const numberPin = parsePinned(searchParams.get("n"), NUMBER_POOL)
  const starPin = parsePinned(searchParams.get("e"), STAR_POOL)
  const urlPin: Pin | null =
    numberPin != null
      ? { kind: "number", value: numberPin }
      : starPin != null
        ? { kind: "star", value: starPin }
        : null
  const [pin, setPin] = useState<Pin | null>(urlPin)
  const [remembered, setRemembered] = useState({ number: numberPin ?? 1, star: starPin ?? 1 })
  const [bandChoice, setBandChoice] = useState<BandId>(starPin != null ? "etoiles" : "numeros")
  const [autoScroll, setAutoScroll] = useState(false)
  const [floorByKind, setFloorByKind] = useState<Partial<Record<ProbaKind, number>>>({})
  const pinRef = useRef(pin)
  const rememberedRef = useRef(remembered)
  const skipUrl = useRef(false)
  const holdUrlUntil = useRef(0)
  const autoRef = useRef(false)
  const draggingCursor = useRef(false)
  const liveRef = useRef({ kind: "number" as ProbaKind, value: 1, pool: NUMBER_POOL })
  const commitRef = useRef<(next: Pin | null, persist?: boolean) => void>(() => {})
  const focusKind: ProbaKind = sort === "map" ? mapKind : bandChoice === "etoiles" ? "star" : "number"
  const focusPool = focusKind === "number" ? NUMBER_POOL : STAR_POOL
  const sliderValue = pin?.kind === focusKind ? pin.value : remembered[focusKind]
  const sliderPinned = pin?.kind === focusKind

  const replace = useCallback(
    (params: URLSearchParams) => {
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router]
  )

  const selectSort = useCallback(
    (id: SortId) => {
      const params = new URLSearchParams(searchParams.toString())
      if (id === "dizaines") {
        params.delete("tri")
        params.delete("sens")
      } else if (id === "unites") {
        params.set("tri", "unites")
        params.delete("sens")
      } else if (id === "compteur-asc") {
        params.set("tri", "compteur")
        params.set("sens", "asc")
      } else if (id === "compteur-desc") {
        params.set("tri", "compteur")
        params.delete("sens")
      } else {
        params.set("tri", "map")
        params.delete("sens")
      }
      replace(params)
    },
    [replace, searchParams]
  )

  const selectScale = useCallback(
    (id: MapScale) => {
      const params = new URLSearchParams(searchParams.toString())
      if (id === "tout") params.delete("echelle")
      else params.set("echelle", id)
      replace(params)
    },
    [replace, searchParams]
  )

  const selectBand = useCallback(
    (id: BandId) => {
      const params = new URLSearchParams(searchParams.toString())
      if (id === "numeros") params.delete("bande")
      else params.set("bande", "etoiles")
      if (autoRef.current) {
        const kind: ProbaKind = id === "etoiles" ? "star" : "number"
        const value = kind === "number" ? rememberedRef.current.number : rememberedRef.current.star
        params.delete("n")
        params.delete("e")
        params.set(kind === "number" ? "n" : "e", String(value))
        const next = { kind, value }
        setPin(next)
        pinRef.current = next
        const key = kind === "number" ? "number" : "star"
        rememberedRef.current = { ...rememberedRef.current, [key]: value }
        setRemembered((current) => (current[key] === value ? current : { ...current, [key]: value }))
        setBandChoice(id)
        skipUrl.current = true
        holdUrlUntil.current = Date.now() + 1600
      }
      replace(params)
    },
    [replace, searchParams]
  )

  const selectPlacement = useCallback(
    (id: MapPlacement) => {
      const params = new URLSearchParams(searchParams.toString())
      if (id === "somme") params.delete("pose")
      else params.set("pose", id)
      replace(params)
    },
    [replace, searchParams]
  )

  const commitPin = useCallback(
    (next: Pin | null, persist = true) => {
      setPin(next)
      pinRef.current = next
      if (next) {
        const key = next.kind === "number" ? "number" : "star"
        rememberedRef.current = { ...rememberedRef.current, [key]: next.value }
        setRemembered((current) => (current[key] === next.value ? current : { ...current, [key]: next.value }))
        setBandChoice(next.kind === "star" ? "etoiles" : "numeros")
      }
      if (!persist) return
      const params = new URLSearchParams(searchParams.toString())
      params.delete("n")
      params.delete("e")
      if (next) params.set(next.kind === "number" ? "n" : "e", String(next.value))
      const nextN = next?.kind === "number" ? String(next.value) : null
      const nextE = next?.kind === "star" ? String(next.value) : null
      if (searchParams.get("n") === nextN && searchParams.get("e") === nextE) return
      skipUrl.current = true
      holdUrlUntil.current = Date.now() + 1600
      replace(params)
    },
    [replace, searchParams]
  )

  useEffect(() => {
    pinRef.current = pin
    rememberedRef.current = remembered
    autoRef.current = autoScroll
    liveRef.current = { kind: focusKind, value: sliderValue, pool: focusPool }
    commitRef.current = commitPin
  }, [autoScroll, commitPin, focusKind, focusPool, pin, remembered, sliderValue])

  const onPin = useCallback(
    (kind: ProbaKind, value: number) => {
      setAutoScroll(false)
      autoRef.current = false
      const current = pinRef.current
      const same = current?.kind === kind && current.value === value
      commitPin(same ? null : { kind, value })
    },
    [commitPin]
  )

  const selectCursorBand = useCallback(
    (id: BandId) => {
      const kind: ProbaKind = id === "etoiles" ? "star" : "number"
      const value = kind === "number" ? rememberedRef.current.number : rememberedRef.current.star
      commitPin({ kind, value })
    },
    [commitPin]
  )

  const toggleAuto = useCallback(() => {
    if (autoRef.current) {
      setAutoScroll(false)
      autoRef.current = false
      commitPin(pinRef.current)
      return
    }
    setAutoScroll(true)
    autoRef.current = true
    commitPin({ kind: focusKind, value: sliderValue })
  }, [commitPin, focusKind, sliderValue])

  // Le bouton retour change l’URL hors de ce composant : on reprend l’épingle.
  /* eslint-disable react-hooks/set-state-in-effect -- reprend l’épingle de l’URL */
  useEffect(() => {
    const incoming: Pin | null =
      numberPin != null
        ? { kind: "number", value: numberPin }
        : starPin != null
          ? { kind: "star", value: starPin }
          : null
    if (pinKey(incoming) === pinKey(pinRef.current)) {
      skipUrl.current = false
      return
    }
    if (skipUrl.current) {
      skipUrl.current = false
      return
    }
    if (autoRef.current || Date.now() < holdUrlUntil.current) return
    setPin(incoming)
    pinRef.current = incoming
    if (!incoming) return
    const key = incoming.kind === "number" ? "number" : "star"
    rememberedRef.current = { ...rememberedRef.current, [key]: incoming.value }
    setRemembered((current) =>
      current[key] === incoming.value ? current : { ...current, [key]: incoming.value }
    )
    setBandChoice(incoming.kind === "star" ? "etoiles" : "numeros")
  }, [numberPin, starPin])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!autoScroll) return
    const id = window.setInterval(() => {
      if (draggingCursor.current) return
      const live = liveRef.current
      commitRef.current({ kind: live.kind, value: nextPinnedBall(live.value, live.pool) })
    }, AUTO_MS)
    return () => window.clearInterval(id)
  }, [autoScroll, focusKind])

  useEffect(() => {
    const header = document.querySelector("header")
    if (!header) return
    const apply = () => {
      document.documentElement.style.setProperty(
        "--proba-stick",
        `${Math.ceil(header.getBoundingClientRect().height) + 8}px`
      )
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(header)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty("--proba-stick")
    }
  }, [])

  useEffect(() => {
    if (!autoScroll || sort === "map") return
    const node = document.querySelector<HTMLElement>("[data-proba-pin='true']")
    const card = node?.closest<HTMLElement>("[data-proba-board]")
    if (!node || !card) return
    const rect = card.getBoundingClientRect()
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) return
    node.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [autoScroll, sort, pin])

  const onWeekday = useCallback(
    (next: WeekdayScope) => {
      if (next === weekday) return
      seenWeekday.current = next
      requestId.current += 1
      setBusy(true)
      setWeekday(next)
    },
    [setWeekday, weekday]
  )

  useEffect(() => {
    if (seenWeekday.current === weekday) return
    seenWeekday.current = weekday
    requestId.current += 1
    setBusy(true)
  }, [weekday])

  // Le jour part avant l'archive : useDraws ne remet pas loading à vrai.
  // Le voyant jaunit tout de suite, et les échelles se recalculent après peinture.
  useEffect(() => {
    if (loading) return
    const id = requestId.current
    const stamp = seenWeekday.current
    const series = draws
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled || requestId.current !== id) return
      const next = buildProbaBoards(series)
      if (cancelled || requestId.current !== id) return
      setView(next)
      setReadyDraws(series)
      setReadyWeekday(stamp)
      setBusy(false)
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [draws, loading])

  const mapStale =
    sort === "map" &&
    (readyMap == null ||
      readyMap.draws !== draws ||
      readyMap.weekday !== weekday ||
      readyMap.scale !== mapScale ||
      readyMap.kind !== mapKind ||
      readyMap.placement !== mapPlacement)

  useEffect(() => {
    if (loading || sort !== "map") return
    if (readyDraws !== draws || readyWeekday !== weekday) return
    if (
      readyMap != null &&
      readyMap.draws === draws &&
      readyMap.weekday === weekday &&
      readyMap.scale === mapScale &&
      readyMap.kind === mapKind &&
      readyMap.placement === mapPlacement
    ) {
      return
    }
    const id = requestId.current
    const series = draws
    const scale = mapScale
    const kind = mapKind
    const placement = mapPlacement
    const stamp = weekday
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled || requestId.current !== id) return
      const next = buildProbaMap(series, scale, kind, placement)
      if (cancelled || requestId.current !== id) return
      setMapView(next)
      setReadyMap({ draws: series, weekday: stamp, scale, kind, placement })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [draws, loading, mapKind, mapPlacement, mapScale, readyDraws, readyMap, readyWeekday, sort, weekday])

  const boards = view?.boards ?? []
  const thinking = loading || busy || readyWeekday !== weekday || readyDraws !== draws || mapStale
  const numberOrder = useMemo(
    () =>
      orderBalls(
        ballValues(NUMBER_POOL),
        (value) => view?.referenceDelay.number[value - 1] ?? 0,
        sort,
        dir
      ),
    [dir, sort, view]
  )
  const starOrder = useMemo(
    () =>
      orderBalls(
        ballValues(STAR_POOL),
        (value) => view?.referenceDelay.star[value - 1] ?? 0,
        sort,
        dir
      ),
    [dir, sort, view]
  )

  return (
    <div className="space-y-4">
      <SiteHeaderSlot>
        <div
          className="w-full min-w-0 max-w-full border-t border-border/80"
          role="region"
          aria-label="Réglages du compteur"
        >
          <div className="mx-auto flex w-full min-w-0 max-w-[92rem] flex-col gap-2 px-[max(1rem,env(safe-area-inset-left))] py-2 pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                Tri
                <HelpTip {...PROBA_DYNAMIC_HELP.tri} />
              </span>
              <PillTabs
                label="Tri des boules"
                mode="chips"
                compact
                wrap
                value={sortId(sort, dir)}
                onValueChange={selectSort}
                items={SORTS}
              />
            </div>
            <WeekdayScopeControl value={weekday} onChange={onWeekday} compact inline help={PROBA_DYNAMIC_HELP.jour} />
            {sort === "map" ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  Échelle
                  <HelpTip {...PROBA_DYNAMIC_HELP.echelle} />
                </span>
                <PillTabs
                  label="Échelle de la carte"
                  mode="chips"
                  compact
                  wrap
                  value={mapScale}
                  onValueChange={selectScale}
                  items={MAP_SCALE_ITEMS}
                />
              </div>
            ) : null}
            {sort === "map" ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  Bande
                  <HelpTip {...PROBA_DYNAMIC_HELP.bande} />
                </span>
                <PillTabs
                  label="Bande de la carte"
                  mode="chips"
                  compact
                  wrap
                  value={mapKind === "star" ? "etoiles" : "numeros"}
                  onValueChange={selectBand}
                  items={BANDS}
                />
              </div>
            ) : null}
            {sort === "map" ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  Pose
                  <HelpTip {...PROBA_DYNAMIC_HELP.pose} />
                </span>
                <PillTabs
                  label="Pose de la carte"
                  mode="chips"
                  compact
                  wrap
                  value={mapPlacement}
                  onValueChange={selectPlacement}
                  items={MAP_PLACEMENT_ITEMS}
                />
              </div>
            ) : null}
            <CalcLight thinking={thinking} />
          </div>
          <div className="mx-auto flex w-full min-w-0 max-w-[92rem] flex-col gap-2 px-[max(1rem,env(safe-area-inset-left))] pb-2 pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 sm:flex-row sm:items-end">
            {sort !== "map" ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:mb-1">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  Bande
                  <HelpTip {...PROBA_DYNAMIC_HELP.curseur} />
                </span>
                <PillTabs
                  label="Bande du curseur"
                  mode="chips"
                  compact
                  wrap
                  value={bandChoice}
                  onValueChange={selectCursorBand}
                  items={BANDS}
                />
              </div>
            ) : null}
            <div className="flex min-w-0 flex-1 items-end gap-2 sm:max-w-xl">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1">
                    {focusKind === "number" ? "Numéro" : "Étoile"}
                    {sort === "map" ? <HelpTip {...PROBA_DYNAMIC_HELP.curseur} /> : null}
                  </span>
                  <span className={cn("tabular-nums", sliderPinned ? "text-foreground" : undefined)}>{sliderValue}</span>
                </span>
                <input
                  type="range"
                  min={1}
                  max={focusPool}
                  step={1}
                  value={sliderValue}
                  aria-label={focusKind === "number" ? "Numéro épinglé" : "Étoile épinglée"}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    commitPin({ kind: focusKind, value }, !autoScroll && !draggingCursor.current)
                  }}
                  onPointerDown={() => {
                    draggingCursor.current = true
                  }}
                  onPointerUp={() => {
                    draggingCursor.current = false
                    if (pinRef.current) commitPin(pinRef.current)
                  }}
                  onPointerCancel={() => {
                    draggingCursor.current = false
                    if (pinRef.current) commitPin(pinRef.current)
                  }}
                  className="accent-primary"
                />
              </label>
              <Button
                type="button"
                size="xs"
                variant={autoScroll ? "default" : "outline"}
                aria-pressed={autoScroll}
                aria-label="Défilement automatique des numéros ou des étoiles"
                className="mb-1 shrink-0"
                onClick={toggleAuto}
              >
                Auto
              </Button>
            </div>
          </div>
        </div>
      </SiteHeaderSlot>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <TitleHelp help={PROBA_DYNAMIC_HELP.numeros}>Numéros</TitleHelp>
          <span
            className="inline-block h-2 w-10 rounded-full"
            style={{ background: "linear-gradient(90deg, var(--muted), var(--chart-2))" }}
          />
          0 → 1 · trait 9/50
        </span>
        <span className="inline-flex items-center gap-1">
          <TitleHelp help={PROBA_DYNAMIC_HELP.etoiles}>Étoiles</TitleHelp>
          <span
            className="inline-block h-2 w-10 rounded-full"
            style={{ background: "linear-gradient(90deg, var(--muted), var(--star))" }}
          />
          0 → 1 · trait 5/12
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-destructive" />
          au-delà de 1
        </span>
        <span className="inline-flex items-center gap-1">
          <TitleHelp help={PROBA_DYNAMIC_HELP.dent}>Dent de scie</TitleHelp>
          {pin
            ? pin.kind === "number"
              ? `numéro ${pin.value}`
              : `étoile ${pin.value}`
            : "aucune boule épinglée"}
        </span>
      </div>

      <div
        className={cn(
          sort === "map" ? "space-y-4" : "grid gap-4 xl:grid-cols-2",
          thinking && (sort === "map" ? mapView != null && !mapStale : boards.length > 0) && "opacity-60"
        )}
        aria-busy={thinking}
      >
        {sort === "map" ? (
          mapView != null && !mapStale ? (
            <CounterMap
              map={mapView}
              pinned={pin}
              onPin={onPin}
              floorDelay={floorByKind[mapView.kind]}
              onFloor={(delay) => {
                const kind = mapView.kind
                setFloorByKind((current) => (current[kind] === delay ? current : { ...current, [kind]: delay }))
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Calcul de la carte…</p>
          )
        ) : (
          boards.map((board) => (
            <ChargeBoard
              key={board.preset}
              board={board}
              numberOrder={numberOrder}
              starOrder={starOrder}
              sort={sort}
              pinned={pin}
              onPin={onPin}
            />
          ))
        )}
      </div>
    </div>
  )
}
