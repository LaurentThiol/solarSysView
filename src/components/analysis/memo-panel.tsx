"use client"

import { Disclaimer } from "@/components/analysis/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const PARAMS: { name: string; period: string; note: string }[] = [
  { name: "RSI", period: "14", note: "70 / 30 (50 médiane)" },
  { name: "Stochastique %K/%D", period: "14 / 3", note: "80 / 20" },
  { name: "MACD", period: "12 / 26 / 9", note: "croisement, divergence, histogramme" },
  { name: "CCI", period: "20", note: "+100 / −100 (extrêmes ±200)" },
  { name: "ADX / DMI", period: "14", note: "20 seuil de tendance" },
  { name: "ATR", period: "14", note: "sizing, stop de volatilité" },
  { name: "Bollinger", period: "20, k=2", note: "%B > 1 ou < 0 = extrêmes" },
  { name: "Keltner", period: "20, k=2", note: "squeeze si Bollinger ⊂ Keltner" },
  { name: "Donchian", period: "20 / 55", note: "système Turtle" },
  { name: "Ichimoku", period: "9 / 26 / 52", note: "Kumo, Chikou, croisements" },
  { name: "Supertrend", period: "10, mult=3", note: "trend following" },
  { name: "Parabolic SAR", period: "AF 0.02 → 0.20", note: "trailing stop" },
  { name: "MFI", period: "14", note: "80 / 20" },
  { name: "VWAP", period: "fenêtre", note: "recalé sur la fenêtre de travail" },
  { name: "Fibonacci", period: "0.236 … 0.786", note: "retracements ; 1.272 / 1.618 extensions" },
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

export function MemoPanel() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Aide-mémoire — paramètres usuels</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3">Indicateur</th>
                  <th className="py-1 pr-3">Périodes</th>
                  <th className="py-1">Zones</th>
                </tr>
              </thead>
              <tbody>
                {PARAMS.map((row) => (
                  <tr key={row.name} className="border-t border-border">
                    <td className="py-1 pr-3">{row.name}</td>
                    <td className="py-1 pr-3 tabular-nums">{row.period}</td>
                    <td className="py-1 text-muted-foreground">{row.note}</td>
                  </tr>
                ))}
              </tbody>
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
