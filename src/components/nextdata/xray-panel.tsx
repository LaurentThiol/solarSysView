import Link from "next/link"

import { XRAY_CARDS, checksFor, headEcart, xrayLines, type Xray } from "@/lib/nextdata/xray"
import { cn } from "@/lib/utils"

/** Le calcul du réglage affiché, opération par opération. N’en relance aucun. */
export function XrayPanel({ xray }: { xray: Xray | null }) {
  if (!xray) {
    return (
      <section className="rounded-xl border bg-card p-3" data-testid="nextdata-xray">
        <h2 className="text-sm font-medium">Rayons X</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Pas de trace pour cette lecture. Le rayon suit LightGBM ou CatBoost, trois ans ou fenêtre seule, une fois le
          calcul lancé.
        </p>
      </section>
    )
  }
  const gaps = xray.controles.filter((item) => !item.ok)
  const head = headEcart(xray)
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-3" data-testid="nextdata-xray">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Rayons X</h2>
        <Link href="/schemas/nextdata" className="text-xs underline text-muted-foreground">
          Schéma du traitement
        </Link>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Le rayon montre le réglage des boutons. Une ligne Méga est un autre réglage : elle se verra quand ses boutons
        seront ceux de l’écran.
      </p>
      {gaps.length ? (
        <ul className="flex flex-col gap-1 text-sm text-destructive" data-testid="nextdata-xray-gaps">
          {gaps.map((item) => (
            <li key={item.id} data-xray-gap={item.id}>
              {item.detail}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Aucun écart de règle.</p>
      )}
      {head ? <p className="sr-only" data-testid="nextdata-xray-head">{head}</p> : null}
      <div className="flex flex-col gap-3">
        {XRAY_CARDS.map((card) => {
          const checks = checksFor(xray, card.id)
          return (
            <article key={card.id} className="rounded-lg border border-border p-3" data-xray-op={card.id}>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.title}</h3>
              <p className="mt-1 text-sm">{card.event}</p>
              <p className="text-xs leading-5 text-muted-foreground">{card.rule}</p>
              <ul className="mt-2 flex flex-col gap-1 text-xs tabular-nums">
                {xrayLines(xray, card.id).map((line, index) => (
                  <li key={`${card.id}-${index}`}>{line}</li>
                ))}
              </ul>
              {checks.map((item) => (
                <p key={item.id} className={cn("mt-1 text-xs", item.ok ? "text-muted-foreground" : "text-destructive")}>
                  {item.detail}
                </p>
              ))}
            </article>
          )
        })}
      </div>
    </section>
  )
}
