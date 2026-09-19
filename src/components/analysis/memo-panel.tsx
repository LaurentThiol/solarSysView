"use client"

import Link from "next/link"

import { Disclaimer } from "@/components/analysis/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GLOSSARY } from "@/lib/copy"

const PARAM_GROUPS: {
  label: string
  rows: { name: string; period: string; note: string }[]
}[] = [
  {
    label: "Tendance",
    rows: [
      { name: "ADX / DMI", period: "14", note: "20 seuil de tendance" },
      { name: "Supertrend", period: "10, mult=3", note: "trend following" },
      { name: "Parabolic SAR", period: "AF 0.02 → 0.20", note: "trailing stop" },
      { name: "Aroon", period: "25", note: "Up / Down ; crosse et extrêmes" },
    ],
  },
  {
    label: "Momentum",
    rows: [
      { name: "RSI", period: "14", note: "70 / 30 (50 médiane)" },
      { name: "Stochastique %K/%D", period: "14 / 3", note: "80 / 20" },
      { name: "MACD", period: "12 / 26 / 9", note: "croisement, divergence, histogramme" },
      { name: "CCI", period: "20", note: "+100 / −100 (extrêmes ±200)" },
      { name: "Williams %R", period: "14", note: "−20 / −80" },
    ],
  },
  {
    label: "Volatilité",
    rows: [
      { name: "ATR", period: "14", note: "sizing, stop de volatilité" },
      { name: "Bollinger", period: "20, k=2", note: "%B > 1 ou < 0 = extrêmes" },
      { name: "Keltner", period: "20, k=2", note: "squeeze si Bollinger ⊂ Keltner" },
      { name: "Donchian", period: "20 / 55", note: "système Turtle" },
    ],
  },
  {
    label: "Niveaux",
    rows: [
      { name: "Ichimoku", period: "9 / 26 / 52", note: "Kumo, Chikou, croisements" },
      { name: "Fibonacci", period: "0.236 … 0.786", note: "retracements ; 1.272 / 1.618 extensions" },
    ],
  },
  {
    label: "Flux",
    rows: [
      { name: "MFI", period: "14", note: "80 / 20" },
      { name: "VWAP", period: "fenêtre", note: "recalé sur la fenêtre de travail" },
    ],
  },
]

const BIASES = [
  "Sur-optimisation (curve fitting) — un système parfait en backtest s’effondre hors échantillon.",
  "Data snooping — trop de combinaisons produisent du bruit statistique.",
  "Look-ahead — Chikou / Ichimoku projeté n’est pas un signal temps réel.",
  "Signaux retardés — les moyennes confirment, elles n’anticipent pas.",
  "Régimes — trend-following perd en range ; l’ADX sert de filtre.",
  "Divergences — elles peuvent persister longtemps.",
  "Événements exogènes — un tirage n’a pas de carnet d’ordres ; l’indépendance reste le modèle honnête.",
  "Coûts — spread, frais, slippage érodent l’edge théorique (ici 0,1 % dans le squelette).",
  "Les tirages EuroMillions sont indépendants : SMA, RSI, figures décrivent l’archive, pas le prochain tirage.",
]

const VOCAB_TERMS = [
  "Période X",
  "Warmup",
  "Indépendance des tirages",
  "Probabilités officielles",
  "Look-ahead",
  "Intervalle de Wilson",
] as const

const vocab = VOCAB_TERMS.map((term) => GLOSSARY.find((entry) => entry.term === term)).filter(
  (entry): entry is (typeof GLOSSARY)[number] => entry != null
)

export function MemoPanel() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-6 text-muted-foreground">
        Aide-mémoire des périodes utilisées par les onglets Technique, plus les biais à
        ne pas oublier. Le vocabulaire figé de tout Synchro est dans le bouton{" "}
        <strong>Glossaire</strong> du bandeau. Les rangs officiels sont dans{" "}
        <Link href="/analyse?tab=proba" className="underline underline-offset-2">
          Probabilités
        </Link>
        .
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Vocabulaire Analyse</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-3">
            {vocab.map((entry) => (
              <div key={entry.term}>
                <dt className="text-sm font-medium text-foreground">{entry.term}</dt>
                <dd className="mt-0.5 text-sm leading-6 text-muted-foreground">{entry.text}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Aide-mémoire — paramètres usuels</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Groupés comme les onglets Technique. X plus haut remplace ces périodes quand
            l’indicateur le permet (SMA, RSI, Bollinger…).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3">Indicateur</th>
                  <th className="py-1 pr-3">Périodes</th>
                  <th className="py-1">Zones</th>
                </tr>
              </thead>
              {PARAM_GROUPS.map((group) => (
                <tbody key={group.label}>
                  <tr>
                    <th
                      colSpan={3}
                      className="pt-3 pb-1 text-left text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      {group.label}
                    </th>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.name} className="border-t border-border">
                      <td className="py-1 pr-3">{row.name}</td>
                      <td className="py-1 pr-3 tabular-nums">{row.period}</td>
                      <td className="py-1 text-muted-foreground">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Biais, pièges, limites</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex list-disc flex-col gap-2 pl-4 text-sm leading-6">
            {BIASES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="mt-3">
            <Disclaimer>
              Support pédagogique. L’analyse technique ne garantit aucun résultat. Ceci n’est ni un
              conseil de jeu ni une recommandation d’achat.
            </Disclaimer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
