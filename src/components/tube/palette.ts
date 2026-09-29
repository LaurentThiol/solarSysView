import type { TubeFamily } from "@/lib/tube"

export const FAMILY_COLORS: Record<TubeFamily, string> = {
  etirement: "var(--chart-4)",
  cisaillement: "var(--chart-5)",
  compression: "var(--chart-2)",
}

export const TUBE_COLORS = {
  deformed: "var(--chart-1)",
  nominal: "var(--muted-foreground)",
  inside: "var(--foreground)",
  outside: "var(--destructive)",
  moonLit: "oklch(0.92 0.06 95)",
  moonDark: "var(--muted)",
} as const
