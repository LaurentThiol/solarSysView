export type ReliefSums = { sum?: number | null; star_sum?: number | null }

export function reliefHasSum(
  steps: Array<{ sommes?: Record<string, ReliefSums> }> | null | undefined
): boolean {
  return (steps ?? []).some((step) =>
    Object.values(step.sommes ?? {}).some((lane) => {
      const sum = lane.sum
      const stars = lane.star_sum
      return (typeof sum === "number" && Number.isFinite(sum)) || (typeof stars === "number" && Number.isFinite(stars))
    })
  )
}
