/** Portée jour : sépare mardi / vendredi sans inventer de mercredi. */

export const WEEKDAY_SCOPES = ["all", "mardi", "vendredi", "synthese"] as const

export type WeekdayScope = (typeof WEEKDAY_SCOPES)[number]

export type DrawWeekday = "mardi" | "vendredi"

export type GainsWeekday = WeekdayScope

export const WEEKDAY_QUERY = "jour"
export const WEEKDAY_STORAGE_KEY = "synchro.jour"
export const WEEKDAY_API_PARAM = "weekday"

export const WEEKDAY_SCOPE_OPTIONS: { value: WeekdayScope; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "mardi", label: "Mardi" },
  { value: "vendredi", label: "Vendredi" },
  { value: "synthese", label: "Synthèse" },
]

export const WEEKDAY_SCOPE_HELP = {
  title: "Jour de tirage",
  body: "EuroMillions ne tire que le mardi et le vendredi. Mardi / Vendredi : la fenêtre (20 derniers, warmup…) se compte dans ce jour seul. Synthèse : même jeu mixte que Tous, plus mardi, vendredi et combiné côte à côte. Sur les courbes, le mardi (cyan, trait plein) et le vendredi (rose, tirets) se lisent dans la légende. Le menu burger garde le choix.",
} as const

/** Couleurs propres aux soirées : pas celles de FR, EU ou de la somme. */
export const WEEKDAY_LINE_COLOR: Record<DrawWeekday, string> = {
  mardi: "oklch(0.86 0.13 195)",
  vendredi: "oklch(0.74 0.2 350)",
}

export function weekdayLineDash(day: DrawWeekday): string | undefined {
  return day === "vendredi" ? "6 3" : undefined
}

/** Valeur du soir, ou null pour l’autre soir et les mesures absentes. */
export function weekdaySplitFields(
  weekday: string | null | undefined,
  value: number | null | undefined
): { overlayMardi: number | null; overlayVendredi: number | null } {
  const day = normalizeDrawWeekday(weekday)
  const finite = typeof value === "number" && Number.isFinite(value) ? value : null
  return {
    overlayMardi: day === "mardi" ? finite : null,
    overlayVendredi: day === "vendredi" ? finite : null,
  }
}

export function asWeekdayScope(value: string | null | undefined): WeekdayScope | null {
  if (!value) return null
  const day = value.trim().toLowerCase()
  if (day === "synthèse") return "synthese"
  return (WEEKDAY_SCOPES as readonly string[]).includes(day) ? (day as WeekdayScope) : null
}

export function normalizeDrawWeekday(
  value: string | null | undefined
): DrawWeekday | null {
  const day = String(value ?? "").trim().toLowerCase()
  if (day === "mardi" || day === "vendredi") return day
  return null
}

export function weekdayFilterDay(scope: WeekdayScope | null | undefined): DrawWeekday | null {
  if (scope === "mardi" || scope === "vendredi") return scope
  return null
}

export function filterDrawsByWeekday<T extends { weekday?: string }>(
  draws: T[],
  weekday: WeekdayScope | DrawWeekday | null | undefined
): T[] {
  const day = weekdayFilterDay(
    weekday === "mardi" || weekday === "vendredi" || weekday === "all" || weekday === "synthese"
      ? weekday
      : asWeekdayScope(weekday) ?? "all"
  )
  if (!day) return draws
  return draws.filter((draw) => normalizeDrawWeekday(draw.weekday) === day)
}

export function weekdayScopeLabel(scope: WeekdayScope): string {
  return WEEKDAY_SCOPE_OPTIONS.find((item) => item.value === scope)?.label ?? scope
}

export function weekdayApiValue(scope: WeekdayScope | null | undefined): DrawWeekday | undefined {
  return weekdayFilterDay(scope) ?? undefined
}

export function setWeekdaySearchParam(
  params: URLSearchParams,
  scope: WeekdayScope
) {
  const day = weekdayApiValue(scope)
  if (day) params.set(WEEKDAY_API_PARAM, day)
  else params.delete(WEEKDAY_API_PARAM)
}
