"use client"

import { useMemo } from "react"

import { HelpTip } from "@/components/help"
import { BallVolume, type VolumeSegment } from "@/components/next/ball-volume"
import { linksTouching, type CoupleLink, type CoupleSchema } from "@/lib/next/couple"
import { NEXT_FIELD_HELP } from "@/lib/next/help"

function asSegment(link: CoupleLink): VolumeSegment {
  return { a: link.a, b: link.b, affinity: link.affinity }
}

export function CoupleVolume({
  schema,
  active,
  onSelect,
}: {
  schema: CoupleSchema
  active: readonly number[]
  onSelect: (ball: number | null) => void
}) {
  const layers = useMemo(() => {
    const incident = new Set<string>()
    for (const ball of active) {
      for (const link of linksTouching(schema.links, ball)) incident.add(`${link.a}-${link.b}`)
    }
    return {
      dim: schema.edges.filter((link) => !incident.has(`${link.a}-${link.b}`)).map(asSegment),
      hot: schema.links.filter((link) => incident.has(`${link.a}-${link.b}`)).map(asSegment),
      maxAffinity: schema.edges[0]?.affinity ?? 0,
    }
  }, [active, schema.edges, schema.links])

  return (
    <BallVolume
      points={schema.points}
      active={active}
      dim={layers.dim}
      hot={layers.hot}
      maxAffinity={layers.maxAffinity}
      volumeHelp={NEXT_FIELD_HELP.volume}
      frameHelp={NEXT_FIELD_HELP.frame}
      onSelect={onSelect}
    />
  )
}

export function CoupleStress({ stress }: { stress: number | null }) {
  const label =
    stress == null
      ? "—"
      : stress.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  return (
    <p className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
      Stress {label}
      <HelpTip {...NEXT_FIELD_HELP.stress} />
    </p>
  )
}
