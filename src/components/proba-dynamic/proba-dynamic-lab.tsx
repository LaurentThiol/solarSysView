"use client"

import { useCallback, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { HelpTip, TitleHelp } from "@/components/help"
import { ChargeBoard } from "@/components/proba-dynamic/charge-board"
import { SiteHeaderSlot } from "@/components/site-header-slot"
import { WeekdayScopeControl } from "@/components/weekday-scope-control"
import { PillTabs } from "@/components/ui/pill-tabs"
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
  type ProbaDir,
  type ProbaKind,
  type ProbaSort,
} from "@/lib/proba-dynamic"
import { useDraws } from "@/lib/use-draws"
import { useWeekdayScope } from "@/lib/use-weekday-scope"

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

export function ProbaDynamicLab() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [weekday, setWeekday] = useWeekdayScope()
  const { draws } = useDraws("all", weekday)
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

  const { boards, referenceDelay } = useMemo(() => buildProbaBoards(draws), [draws])
  const numberOrder = useMemo(
    () => orderBalls(ballValues(NUMBER_POOL), (value) => referenceDelay.number[value - 1] ?? 0, sort, dir),
    [dir, referenceDelay.number, sort]
  )
  const starOrder = useMemo(
    () => orderBalls(ballValues(STAR_POOL), (value) => referenceDelay.star[value - 1] ?? 0, sort, dir),
    [dir, referenceDelay.star, sort]
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
            <WeekdayScopeControl value={weekday} onChange={setWeekday} compact inline help={PROBA_DYNAMIC_HELP.jour} />
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

      <div className="grid gap-4 xl:grid-cols-2">
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
