"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { ChevronDown, Download, Search } from "lucide-react"

import { LabelHelp, TitleHelp, WithHelp } from "@/components/help"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DrawBalls } from "@/components/draw-balls"
import {
  archiveSummary,
  drawMatchesQuery,
  formatCount,
  formatDrawDate,
  formatEuro,
  formatJackpot,
  formatWinnerTotals,
  monthOf,
  monthsPresent,
  parseQueryNumbers,
  toCsv,
  totalWinners,
  type Draw,
  PRIZE_RANK_LABELS,
} from "@/lib/draws"
import { useDraws } from "@/lib/use-draws"
import { cn } from "@/lib/utils"

export function DrawsExplorer() {
  const { draws, source } = useDraws("year")
  const [month, setMonth] = useState("all")
  const [query, setQuery] = useState("")
  const [openDate, setOpenDate] = useState<string | null>(null)
  const wanted = useMemo(() => parseQueryNumbers(query), [query])
  const monthOptions = useMemo(() => monthsPresent(draws), [draws])

  useEffect(() => {
    if (month !== "all" && !monthOptions.some((item) => item.value === month)) {
      setMonth("all")
    }
  }, [month, monthOptions])

  const first = draws[draws.length - 1]
  const last = draws[0]

  const filtered = useMemo(() => {
    return draws.filter((draw) => {
      if (month !== "all" && monthOf(draw.date) !== month) return false
      return drawMatchesQuery(draw, wanted)
    })
  }, [draws, month, wanted])

  function downloadCsv() {
    const year = last?.date.slice(0, 4) || "tirages"
    const blob = new Blob([toCsv(filtered)], {
      type: "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download =
      month === "all"
        ? `euromillions-${year}.csv`
        : `euromillions-${year}-${month}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        {archiveSummary(draws)} 5 numéros (1–50) et 2 étoiles (1–12). Données
        recoupées avec les archives publiques ; source officielle : FDJ
        {source === "neon" ? " · Neon." : " · fichier local."}
      </p>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tirages archivés"
          value={String(draws.length)}
          hint={
            first && last
              ? `${formatDrawDate(first.date)} → ${formatDrawDate(last.date)}`
              : "—"
          }
        />
        <StatCard
          label="Dernier tirage"
          value={last ? last.numbers.join(" · ") : "—"}
          hint={
            last
              ? `Étoiles ${last.stars.join(" et ")} · n° ${last.id} · ${formatJackpot(last)}`
              : "Aucun tirage"
          }
        />
        <StatCard
          label="Gagnants FR+EU"
          value={last ? formatWinnerTotals(last) : "—"}
          hint={
            last
              ? "Somme des 13 rangs · EU comprend la France"
              : "Aucun tirage"
          }
        />
        <StatCard
          label="Filtre actuel"
          value={String(filtered.length)}
          hint={
            filtered.length === 1
              ? "1 tirage correspond"
              : `${filtered.length} tirages correspondent`
          }
        />
      </section>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base font-medium">
              <TitleHelp
                help={{
                  title: "Explorer les tirages",
                  body: "Liste des tirages de l’archive. Filtrez par mois et/ou par numéros, puis exportez le résultat.",
                }}
              >
                Explorer les tirages
              </TitleHelp>
            </CardTitle>
            <WithHelp
              help={{
                title: "Télécharger le CSV",
                body: "Exporte les tirages actuellement affichés (après filtres mois et numéros) au format CSV, encodage UTF-8. Colonnes jackpot, totaux gagnants FR/EU (13 rangs), puis r2–r13 : rapports FDJ en euros.",
              }}
            >
              <Button type="button" variant="outline" onClick={downloadCsv}>
                <Download data-icon="inline-start" />
                Télécharger le CSV
              </Button>
            </WithHelp>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <LabelHelp
              label="Mois"
              className="w-full sm:w-auto"
              help={{
                title: "Mois",
                body: "Restreint la liste à un mois civil, ou « Tous les mois » pour toute l’année chargée.",
              }}
            >
              <Select value={month} onValueChange={(value) => setMonth(String(value))}>
                <SelectTrigger className="w-full sm:w-52" aria-label="Mois">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelHelp>
            <LabelHelp
              label="Numéros"
              className="flex-1"
              help={{
                title: "Filtrer par numéros",
                body: "Tapez 1 à 7 valeurs séparées par un espace (boules 1–50 et/ou étoiles 1–12). Seuls les tirages qui les contiennent tous restent visibles.",
              }}
            >
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filtrer par numéros, ex. 7 14 28"
                  className="pl-8"
                  inputMode="numeric"
                  aria-label="Filtrer par numéros"
                />
              </div>
            </LabelHelp>
          </div>
          {wanted.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Correspondance exacte sur les boules et les étoiles :{" "}
              {wanted.join(", ")}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <EmptyFilter query={query} />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Tirage</TableHead>
                      <TableHead>Numéros + étoiles</TableHead>
                      <TableHead className="text-right">Jackpot</TableHead>
                      <TableHead className="text-right">
                        <TitleHelp
                          help={{
                            title: "Gagnants FR+EU",
                            body: "Somme des gagnants des 13 rangs EuroMillions. EU est le total des pays participants, France comprise (colonne FDJ « en Europe »). On n’additionne pas FR et EU rang par rang.",
                          }}
                        >
                          Gagnants FR+EU
                        </TitleHelp>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((draw) => {
                      const open = openDate === draw.date
                      return (
                        <Fragment key={`${draw.date}-${draw.id}`}>
                          <TableRow
                            className="cursor-pointer"
                            data-state={open ? "selected" : undefined}
                            onClick={() =>
                              setOpenDate(open ? null : draw.date)
                            }
                          >
                            <TableCell className="whitespace-nowrap capitalize">
                              {formatDrawDate(draw.date)}
                            </TableCell>
                            <TableCell className="text-muted-foreground tabular-nums">
                              {draw.id}
                            </TableCell>
                            <TableCell>
                              <DrawBalls
                                numbers={draw.numbers}
                                stars={draw.stars}
                                highlights={wanted}
                              />
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatJackpot(draw)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              <span className="inline-flex items-center justify-end gap-1">
                                {formatWinnerTotals(draw)}
                                <ChevronDown
                                  className={cn(
                                    "size-3.5 text-muted-foreground transition-transform",
                                    open && "rotate-180"
                                  )}
                                />
                              </span>
                            </TableCell>
                          </TableRow>
                          {open ? (
                            <TableRow>
                              <TableCell colSpan={5} className="bg-muted/30">
                                <PrizeLadder draw={draw} />
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col gap-3 md:hidden">
                {filtered.map((draw) => {
                  const open = openDate === draw.date
                  return (
                    <article
                      key={`${draw.date}-${draw.id}`}
                      className="rounded-xl border border-border bg-card/60 p-4"
                    >
                      <button
                        type="button"
                        className="mb-3 flex w-full items-center justify-between gap-2 text-left"
                        onClick={() => setOpenDate(open ? null : draw.date)}
                        aria-expanded={open}
                      >
                        <p className="text-sm font-medium capitalize">
                          {formatDrawDate(draw.date)}
                        </p>
                        <span className="flex items-center gap-2">
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {formatJackpot(draw)}
                          </span>
                          <Badge variant="outline">n° {draw.id}</Badge>
                          <ChevronDown
                            className={cn(
                              "size-3.5 text-muted-foreground transition-transform",
                              open && "rotate-180"
                            )}
                          />
                        </span>
                      </button>
                      <DrawBalls
                        numbers={draw.numbers}
                        stars={draw.stars}
                        highlights={wanted}
                      />
                      <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                        Gagnants FR+EU · {formatWinnerTotals(draw)}
                      </p>
                      {open ? (
                        <div className="mt-3">
                          <PrizeLadder draw={draw} />
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PrizeLadder({ draw }: { draw: Draw }) {
  const prizes = draw.prizes ?? []
  const totals = totalWinners(draw)
  if (prizes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Rapports FDJ indisponibles pour ce tirage (fichier local ou archive
        ancienne sans colonnes de rangs).
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 pr-3 font-medium">Rang</th>
            <th className="py-1 pr-3 font-medium">Gain</th>
            <th className="py-1 pr-3 font-medium">Rapport</th>
            <th className="py-1 pr-3 font-medium">Gagnants EU</th>
            <th className="py-1 font-medium">Gagnants FR</th>
          </tr>
        </thead>
        <tbody>
          {prizes.map((tier) => (
            <tr key={tier.rank} className="border-t border-border">
              <td className="py-1 pr-3 tabular-nums">{tier.rank}</td>
              <td className="py-1 pr-3">
                {PRIZE_RANK_LABELS[tier.rank] ?? `Rang ${tier.rank}`}
              </td>
              <td className="py-1 pr-3 tabular-nums">
                {tier.rank === 1
                  ? formatJackpot(draw)
                  : formatEuro(tier.prize)}
              </td>
              <td className="py-1 pr-3 tabular-nums">
                {formatCount(tier.winners_eu)}
              </td>
              <td className="py-1 tabular-nums">
                {formatCount(tier.winners_fr)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-medium">
            <td className="py-1.5 pr-3" colSpan={3}>
              Total FR+EU · 13 rangs
            </td>
            <td className="py-1.5 pr-3 tabular-nums">
              {formatCount(totals.eu)}
            </td>
            <td className="py-1.5 tabular-nums">{formatCount(totals.fr)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-[11px] text-muted-foreground">
        EU comprend la France. Le total d’un rang est le chiffre Europe, pas
        FR+EU.
      </p>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <CardTitle className="text-lg font-semibold tracking-tight">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground capitalize">
        {hint}
      </CardContent>
    </Card>
  )
}

function EmptyFilter({ query }: { query: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
      <p className="font-medium">Aucun tirage ne correspond</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {query.trim()
          ? `Aucun résultat pour « ${query.trim()} » sur la période choisie.`
          : "Changez de mois pour afficher d’autres tirages."}
      </p>
    </div>
  )
}
