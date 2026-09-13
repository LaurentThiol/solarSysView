"use client"

import { useMemo } from "react"

import { TitleHelp } from "@/components/help"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ScanHit } from "@/lib/chartisme/scan"

/**
 * La même fenêtre, juste avant.
 *
 * Une lecture faite sur une seule fenêtre ne dit pas si elle décrit le système
 * ou le découpage. Le point de comparaison le moins arbitraire est la fenêtre de
 * même longueur qui précède immédiatement : mêmes échelles, même seuil, même
 * nombre de tirages. Ce qui se retrouve dans les deux a une chance de tenir ;
 * ce qui n'apparaît que dans l'une décrit surtout l'endroit où l'on a coupé.
 */

type Row = { figure: string; label: string; now: number; before: number }

function countByFigure(hits: ScanHit[]) {
  const out = new Map<string, { label: string; count: number }>()
  for (const hit of hits) {
    const seen = out.get(hit.figure)
    if (seen) seen.count += 1
    else out.set(hit.figure, { label: hit.label, count: 1 })
  }
  return out
}

export function WindowCompare({
  hits,
  previousHits,
  window,
  previous,
}: {
  hits: ScanHit[]
  previousHits: ScanHit[]
  window: { fromDate: string | null; toDate: string | null; drawCount: number }
  previous: { fromDate: string | null; toDate: string | null; drawCount: number } | null
}) {
  const rows = useMemo<Row[]>(() => {
    const now = countByFigure(hits)
    const before = countByFigure(previousHits)
    const figures = new Set([...now.keys(), ...before.keys()])
    return [...figures]
      .map((figure) => ({
        figure,
        label: now.get(figure)?.label ?? before.get(figure)?.label ?? figure,
        now: now.get(figure)?.count ?? 0,
        before: before.get(figure)?.count ?? 0,
      }))
      .sort((a, b) => b.now + b.before - (a.now + a.before))
  }, [hits, previousHits])

  const shared = rows.filter((row) => row.now > 0 && row.before > 0).length

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <TitleHelp
            help={{
              title: "La fenêtre précédente",
              body: "La fenêtre de même longueur qui précède immédiatement celle étudiée, lue avec les mêmes échelles et le même seuil. Elle répond à une question que la fenêtre seule ne peut pas trancher : ce qu'on voit décrit-il le système observé, ou l'endroit où l'on a coupé ? Une figure présente dans les deux fenêtres a une chance de décrire le premier.",
            }}
          >
            Est-ce que ça change ?
          </TitleHelp>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!previous ? (
          <p className="text-sm text-muted-foreground">
            Pas de fenêtre antérieure de {window.drawCount} tirages dans cette
            archive : la fenêtre étudiée touche le début des tirages chargés. Une
            tranche plus courte ne servirait à rien ici — le nombre de figures
            croît avec le nombre de tirages, et l’écart ne dirait que cela.
            Raccourcis la fenêtre ou élargis l’archive.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Étudiée : du {window.fromDate} au {window.toDate} ({window.drawCount}{" "}
              tirages, {hits.length} figure{hits.length > 1 ? "s" : ""}) ·
              précédente : du {previous.fromDate} au {previous.toDate} (
              {previous.drawCount} tirages, {previousHits.length} figure
              {previousHits.length > 1 ? "s" : ""})
            </p>

            {rows.length ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Figure</TableHead>
                      <TableHead className="text-right">étudiée</TableHead>
                      <TableHead className="text-right">précédente</TableHead>
                      <TableHead className="text-right">présente dans</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.figure}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell className="text-right">{row.now}</TableCell>
                        <TableCell className="text-right">{row.before}</TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={
                              row.now > 0 && row.before > 0 ? "default" : "outline"
                            }
                          >
                            {row.now > 0 && row.before > 0
                              ? "les deux"
                              : row.now > 0
                                ? "étudiée seule"
                                : "précédente seule"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-xs text-muted-foreground">
                  {shared === 0
                    ? `Aucune des ${rows.length} figure${rows.length > 1 ? "s" : ""} ne se retrouve`
                    : `${shared} figure${shared > 1 ? "s" : ""} sur ${rows.length} se retrouve${shared > 1 ? "nt" : ""}`}{" "}
                  dans les deux fenêtres. À ces effectifs aucun test ne
                  trancherait — une occurrence de plus ou de moins n’est pas un
                  écart. La comparaison sert à voir si la lecture survit au
                  déplacement de la fenêtre, pas à la valider : une figure
                  absente d’une des deux tranches décrivait surtout l’endroit où
                  l’on a coupé.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune figure au-dessus du seuil dans l’une ou l’autre fenêtre.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
