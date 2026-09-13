"use client"

import { Stat } from "@/components/analysis/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatStat, type HarmoReport } from "@/lib/harmo"

import { ApiState, EnvelopeChart, HarmoNotes, PeakTable, SpectrumChart } from "@/components/harmo/shared"

export function MechPanel({
  envelope,
  orders,
  loading,
}: {
  envelope: HarmoReport | null
  orders: HarmoReport | null
  loading: boolean
}) {
  const error =
    (envelope && envelope.ok === false ? envelope.error : null) ||
    (orders && orders.ok === false ? orders.error : null)
  if (loading || error) {
    return <ApiState loading={loading} error={error} />
  }
  if (!envelope?.ok) {
    return <ApiState error={envelope?.error || "Enveloppe indisponible"} />
  }
  return (
    <div className="flex flex-col gap-4">
      <HarmoNotes notes={envelope.notes} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="SNR enveloppe" value={formatStat(envelope.snr ?? null, 2)} />
        <Stat label="Révolutions estimées" value={formatStat(orders?.n_revolutions ?? null, 1)} />
        <Stat
          label="Crête suivie"
          value={
            orders?.ridge
              ? `${orders.ridge.kind} · ${formatStat(orders.ridge.mean_freq, 4)} c/tirage`
              : "—"
          }
        />
      </div>
      <EnvelopeChart points={envelope.envelope} title="Enveloppe de Hilbert" />
      <SpectrumChart
        points={envelope.spectrum?.points}
        title="Spectre d’enveloppe"
        help={{
          title: "Démodulation",
          body: "Hilbert extrait l’enveloppe. Un pic ici est une modulation périodique (chocs, « roulement » analogique), pas la porteuse.",
        }}
        yLabel="Amplitude de l’enveloppe, cycles/tirage."
      />
      <SpectrumChart
        points={envelope.inst_freq}
        title="Fréquence instantanée (Hilbert)"
        help={{
          title: "IF Hilbert",
          body: "Dérivée de la phase analytique. Bruitée sur un mélange ; le suivi STFT (onglet Temps-fréquence / Ordres) est plus stable.",
        }}
        yLabel="Cycles/tirage le long de l’index."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Spectre d’ordres (tacholess)</CardTitle>
        </CardHeader>
        <CardContent>
          {orders?.ok_orders ? (
            <>
              <SpectrumChart
                points={orders.points}
                title="Après rééchantillonnage angulaire"
                help={{
                  title: "Order tracking",
                  body: "La phase estimée de la crête mécanique rééchantillonne le signal selon l’angle. Les harmoniques mécaniques se figent en ordres entiers, même si la « vitesse » varie.",
                }}
                yLabel="Amplitude vs ordre (1 = fondamentale suivie)."
              />
              <PeakTable peaks={orders.peaks} order />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {orders?.reason || "Pas de crête mécanique assez nette pour figer les ordres."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
