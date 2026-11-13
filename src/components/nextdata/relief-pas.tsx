"use client"

import { useMemo, useState } from "react"
import { Canvas } from "@react-three/fiber"
import * as THREE from "three"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { reliefHasSum } from "@/lib/nextdata/relief"

export type ReliefSums = { sum?: number | null; star_sum?: number | null }
export type ReliefShell = {
  lo?: { sum?: number | null; star_sum?: number | null }
  hi?: { sum?: number | null; star_sum?: number | null }
}
export type ReliefStep = {
  label?: string | null
  sommes?: Record<string, ReliefSums>
  rangs?: Record<string, Array<number | null>>
  sorti?: number[]
  timesfm?: ReliefShell | null
}

const LANES = ["corpus", "fenetre", "corpus_catboost", "fenetre_catboost", "persistence"] as const
const COLORS: Record<string, string> = {
  corpus: "#d4a017",
  fenetre: "#3d8bfd",
  corpus_catboost: "#c084fc",
  fenetre_catboost: "#34d399",
  persistence: "#94a3b8",
}
const LABELS: Record<string, string> = {
  corpus: "LightGBM · trois ans",
  fenetre: "LightGBM · fenêtre",
  corpus_catboost: "CatBoost · trois ans",
  fenetre_catboost: "CatBoost · fenêtre",
  persistence: "Persistance",
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function toPoints(values: Array<number | null | undefined>, yBase: number, scale: number): number[] {
  return values.flatMap((value, index) => [index - (values.length - 1) / 2, yBase + (finite(value) ? value * scale : yBase), 0])
}

function Path({
  positions,
  color,
  onPick,
}: {
  positions: number[]
  color: string
  onPick: () => void
}) {
  const object = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }))
  }, [positions, color])
  return (
    <primitive
      object={object}
      onClick={(event: { stopPropagation: () => void }) => {
        event.stopPropagation()
        onPick()
      }}
    />
  )
}

function Lane({
  name,
  steps,
  solo,
  onPick,
}: {
  name: string
  steps: ReliefStep[]
  solo: string | null
  onPick: (name: string) => void
}) {
  if (solo && solo !== name) return null
  const sums = steps.map((step) => step.sommes?.[name]?.sum ?? null)
  const stars = steps.map((step) => step.sommes?.[name]?.star_sum ?? null)
  const ranks = steps.map((step) => step.rangs?.[name]?.[0] ?? null)
  if (!sums.some(finite) && !stars.some(finite)) return null
  const pick = () => onPick(name)
  return (
    <group>
      <Path positions={toPoints(sums, 1.6, 0.012)} color={COLORS[name]} onPick={pick} />
      <Path positions={toPoints(stars, 0.7, 0.04)} color={COLORS[name]} onPick={pick} />
      <Path positions={toPoints(ranks, -1.2, 0.03)} color={COLORS[name]} onPick={pick} />
    </group>
  )
}

function Shell({ steps }: { steps: ReliefStep[] }) {
  const band = steps.find((step) => finite(step.timesfm?.lo?.sum) && finite(step.timesfm?.hi?.sum))?.timesfm
  if (!band || !finite(band.lo?.sum) || !finite(band.hi?.sum)) return null
  const width = Math.max(steps.length - 1, 1)
  const y1 = 1.6 + band.lo.sum * 0.012
  const y2 = 1.6 + band.hi.sum * 0.012
  return (
    <mesh position={[0, (y1 + y2) / 2, -0.2]}>
      <planeGeometry args={[width, Math.max(0.08, Math.abs(y2 - y1))]} />
      <meshBasicMaterial color="#d4a017" transparent opacity={0.18} />
    </mesh>
  )
}

export function ReliefPas({ steps }: { steps?: ReliefStep[] | null }) {
  const [solo, setSolo] = useState<string | null>(null)
  const shown = (steps ?? []).slice(-10)
  if (!reliefHasSum(shown)) return null
  const shell = shown.some((step) => finite(step.timesfm?.lo?.sum) && finite(step.timesfm?.hi?.sum))
  return (
    <Card data-relief-pas>
      <CardHeader>
        <CardTitle className="text-base">Relief du pas</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          En haut, les sommes sur dix pas, une voie par lecture. En bas, le premier rang projeté et le tirage sorti.
          {shell ? " La coque est la bande 0,1–0,9 de TimesFM." : " TimesFM n’a pas répondu : pas de coque."}
        </p>
        <div className="h-72 overflow-hidden rounded-lg border border-border">
          <Canvas camera={{ position: [0, 0.2, 8], fov: 45 }} onPointerMissed={() => setSolo(null)}>
            <color attach="background" args={["#0b1020"]} />
            <ambientLight intensity={0.8} />
            <Shell steps={shown} />
            {LANES.map((name) => (
              <Lane
                key={name}
                name={name}
                steps={shown}
                solo={solo}
                onPick={(lane) => setSolo((current) => (current === lane ? null : lane))}
              />
            ))}
            {shown.map((step, index) =>
              finite(step.sorti?.[0]) ? (
                <mesh key={step.label ?? index} position={[index - (shown.length - 1) / 2, -1.2 + step.sorti[0] * 0.03, 0.05]}>
                  <sphereGeometry args={[0.06, 12, 12]} />
                  <meshBasicMaterial color="#f8fafc" />
                </mesh>
              ) : null
            )}
          </Canvas>
        </div>
        <div className="flex flex-wrap gap-2">
          {LANES.filter((name) => shown.some((step) => finite(step.sommes?.[name]?.sum))).map((name) => (
            <button
              key={name}
              type="button"
              className="rounded-full border px-2 py-0.5 text-xs"
              style={{ borderColor: COLORS[name], opacity: solo && solo !== name ? 0.4 : 1 }}
              aria-pressed={solo === name}
              onClick={() => setSolo((current) => (current === name ? null : name))}
            >
              {LABELS[name]}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
