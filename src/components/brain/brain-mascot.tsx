"use client"

import { cn } from "@/lib/utils"

export type BrainMood = "idle" | "talk" | "think" | "sleep"

const SIZES = {
  sm: "size-10",
  md: "size-[4.5rem]",
  lg: "size-24",
} as const

export function BrainMascot({
  mood = "idle",
  size = "md",
  className,
}: {
  mood?: BrainMood
  size?: keyof typeof SIZES
  className?: string
}) {
  const busy = mood === "think" || mood === "talk"
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        SIZES[size],
        busy ? "brain-mascot-busy" : "brain-mascot-idle",
        className
      )}
      aria-hidden
    >
      <svg viewBox="0 0 96 96" className="size-full drop-shadow-[0_8px_18px_oklch(0.82_0.12_85_/_0.28)]">
        <defs>
          <linearGradient id="brain-fill" x1="18" y1="12" x2="78" y2="86" gradientUnits="userSpaceOnUse">
            <stop stopColor="oklch(0.9 0.1 85)" />
            <stop offset="0.55" stopColor="oklch(0.82 0.14 85)" />
            <stop offset="1" stopColor="oklch(0.72 0.12 55)" />
          </linearGradient>
          <linearGradient id="brain-shine" x1="28" y1="16" x2="52" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="oklch(0.98 0.04 95)" stopOpacity="0.85" />
            <stop offset="1" stopColor="oklch(0.98 0.04 95)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <ellipse cx="48" cy="84" rx="22" ry="5" fill="oklch(0.18 0.04 260 / 0.28)" />
        <path
          d="M30 30c-9 1-16 10-16 20 0 8 5 15 12 18 2 8 10 14 22 14s20-6 22-14c7-3 12-10 12-18 0-10-7-19-16-20-2-8-10-14-22-14s-20 6-22 14z"
          fill="url(#brain-fill)"
          stroke="oklch(0.55 0.1 70)"
          strokeWidth="1.6"
        />
        <path
          d="M48 16c-7 8-8 18-8 28 0 10 1 20 8 28"
          fill="none"
          stroke="oklch(0.55 0.1 70)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M28 36c4-3 8-2 11 2M27 46c5-2 9 0 12 4M62 36c-4-3-8-2-11 2M63 46c-5-2-9 0-12 4M32 58c5 2 9 2 14-1M50 57c5 3 10 3 15 0"
          fill="none"
          stroke="oklch(0.55 0.08 70 / 0.7)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path d="M34 24c8-6 20-6 28 0" fill="url(#brain-shine)" />
        {mood === "sleep" ? (
          <>
            <path d="M36 52c3 2 6 2 9 0" fill="none" stroke="oklch(0.32 0.06 260)" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M51 52c3 2 6 2 9 0" fill="none" stroke="oklch(0.32 0.06 260)" strokeWidth="2.2" strokeLinecap="round" />
            <text x="70" y="28" fontSize="11" fill="oklch(0.86 0.08 85)" fontFamily="ui-sans-serif, system-ui">
              z
            </text>
            <text x="78" y="18" fontSize="14" fill="oklch(0.9 0.08 85)" fontFamily="ui-sans-serif, system-ui">
              z
            </text>
          </>
        ) : (
          <>
            <circle cx="38" cy="50" r={mood === "think" ? 3.2 : 4.2} fill="oklch(0.28 0.05 260)" />
            <circle cx="58" cy="50" r={mood === "think" ? 3.2 : 4.2} fill="oklch(0.28 0.05 260)" />
            <circle cx="39.4" cy="48.6" r="1.2" fill="oklch(0.98 0.02 95)" />
            <circle cx="59.4" cy="48.6" r="1.2" fill="oklch(0.98 0.02 95)" />
            <path
              d={mood === "think" ? "M42 63c3 2 9 2 12 0" : "M40 62c4 5 12 5 16 0"}
              fill="none"
              stroke="oklch(0.32 0.06 260)"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
      {mood === "think" ? (
        <span className="absolute -top-1 right-0 flex gap-0.5">
          <span className="brain-dot size-1.5 rounded-full bg-primary" />
          <span className="brain-dot size-1.5 rounded-full bg-primary delay-150" />
          <span className="brain-dot size-1.5 rounded-full bg-primary delay-300" />
        </span>
      ) : null}
    </span>
  )
}
