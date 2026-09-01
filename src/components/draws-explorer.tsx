"use client"

import { useMemo, useState } from "react"
import { Download, Search, Sparkles } from "lucide-react"

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
  DRAWS,
  FIRST_DRAW,
  LAST_DRAW,
  MONTHS,
  drawMatchesQuery,
  formatDrawDate,
  monthOf,
  numberFrequencies,
  parseQueryNumbers,
  starFrequencies,
  toCsv,
} from "@/lib/draws"

export function DrawsExplorer() {
  const [month, setMonth] = useState("all")
  const [query, setQuery] = useState("")
  const wanted = useMemo(() => parseQueryNumbers(query), [query])

  const filtered = useMemo(() => {
    return DRAWS.filter((draw) => {
      if (month !== "all" && monthOf(draw.date) !== month) return false
      return drawMatchesQuery(draw, wanted)
    })
  }, [month, wanted])

  const hotNumbers = useMemo(() => numberFrequencies(filtered), [filtered])
  const hotStars = useMemo(() => starFrequencies(filtered), [filtered])

  function downloadCsv() {
    const blob = new Blob([toCsv(filtered)], {
      type: "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download =
      month === "all"
        ? "euromillions-2026.csv"
        : `euromillions-2026-${month}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Tirages archivés"
          value={String(DRAWS.length)}
          hint={`${formatDrawDate(FIRST_DRAW.date)} → ${formatDrawDate(LAST_DRAW.date)}`}
        />
        <StatCard
          label="Dernier tirage"
          value={LAST_DRAW.numbers.join(" · ")}
          hint={`Étoiles ${LAST_DRAW.stars.join(" et ")} · n° ${LAST_DRAW.id}`}
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
              Explorer les tirages
            </CardTitle>
            <Button type="button" variant="outline" onClick={downloadCsv}>
              <Download data-icon="inline-start" />
              Télécharger le CSV
            </Button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select value={month} onValueChange={(value) => setMonth(String(value))}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Mois">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((draw) => (
                      <TableRow key={draw.id}>
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col gap-3 md:hidden">
                {filtered.map((draw) => (
                  <article
                    key={draw.id}
                    className="rounded-xl border border-border bg-card/60 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium capitalize">
                        {formatDrawDate(draw.date)}
                      </p>
                      <Badge variant="outline">n° {draw.id}</Badge>
                    </div>
                    <DrawBalls
                      numbers={draw.numbers}
                      stars={draw.stars}
                      highlights={wanted}
                    />
                  </article>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <FrequencyCard
          title="Numéros les plus sortis"
          items={hotNumbers}
          empty={filtered.length === 0}
        />
        <FrequencyCard
          title="Étoiles les plus sorties"
          items={hotStars}
          empty={filtered.length === 0}
          star
        />
      </section>
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

function FrequencyCard({
  title,
  items,
  empty,
  star = false,
}: {
  title: string
  items: [number, number][]
  empty: boolean
  star?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          {star ? <Sparkles className="size-4 text-[oklch(0.82_0.12_85)]" /> : null}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-sm text-muted-foreground">
            Aucune statistique : affinez le filtre.
          </p>
        ) : (
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map(([n, count]) => (
              <li
                key={`${star ? "s" : "n"}-${n}`}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium tabular-nums">{n}</span>
                <span className="text-muted-foreground">{count}×</span>
              </li>
            ))}
          </ol>
        )}
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
