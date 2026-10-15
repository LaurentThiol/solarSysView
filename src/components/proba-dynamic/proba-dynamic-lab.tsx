"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { HelpTip, TitleHelp } from "@/components/help"
import { ChargeBoard } from "@/components/proba-dynamic/charge-board"
import { SiteHeaderSlot } from "@/components/site-header-slot"
import { WeekdayScopeControl } from "@/components/weekday-scope-control"
import { PillTabs } from "@/components/ui/pill-tabs"
import type { Draw } from "@/lib/draws"
import { PROBA_DYNAMIC_HELP } from "@/lib/proba-dynamic-help"
import {
  NUMBER_POOL,
  STAR_POOL,
  ballValues,
  buildProbaBoards,
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
] as const

type SortId = (typeof SORTS)[number]["id"]

function sortId(sort: ProbaSort, dir: ProbaDir): SortId {
  if (sort === "compteur") return dir === "asc" ? "compteur-asc" : "compteur-desc"
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
  const seenWeekday = useRef(weekday)
  const requestId = useRef(0)
  const sort = parseProbaSort(searchParams.get("tri"))
  const dir = parseProbaDir(searchParams.get("sens"))
  const numberPin = parsePinned(searchParams.get("n"), NUMBER_POOL)
  const starPin = parsePinned(searchParams.get("e"), STAR_POOL)
  const pinned =
    numberPin != null
      ? { kind: "number" as const, value: numberPin }
      : starPin != null
        ? { kind: "star" as const, value: starPin }
        : null

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
      } else {
        params.set("tri", "compteur")
        params.delete("sens")
      }
      replace(params)
    },
    [replace, searchParams]
  )

  const onPin = useCallback(
    (kind: ProbaKind, value: number) => {
      const params = new URLSearchParams(searchParams.toString())
      const same =
        (kind === "number" && numberPin === value && starPin == null) ||
        (kind === "star" && starPin === value && numberPin == null)
      params.delete("n")
      params.delete("e")
      if (!same) params.set(kind === "number" ? "n" : "e", String(value))
      replace(params)
    },
    [numberPin, replace, searchParams, starPin]
  )

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

  const boards = view?.boards ?? []
  const thinking = loading || busy || readyWeekday !== weekday || readyDraws !== draws
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
          aria-label="Tri du compteur"
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
            <CalcLight thinking={thinking} />
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
          {pinned
            ? pinned.kind === "number"
              ? `numéro ${pinned.value}`
              : `étoile ${pinned.value}`
            : "aucune boule épinglée"}
        </span>
      </div>

      <div
        className={cn("grid gap-4 xl:grid-cols-2", thinking && boards.length > 0 && "opacity-60")}
        aria-busy={thinking}
      >
        {boards.map((board) => (
          <ChargeBoard
            key={board.preset}
            board={board}
            numberOrder={numberOrder}
            starOrder={starOrder}
            sort={sort}
            pinned={pinned}
            onPin={onPin}
          />
        ))}
      </div>
    </div>
  )
}
