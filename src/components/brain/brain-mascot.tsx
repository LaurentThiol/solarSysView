"use client"

import { useId } from "react"

import { cn } from "@/lib/utils"

export type BrainMood = "idle" | "talk" | "think" | "sleep"

const SIZES = {
  sm: "size-10",
  md: "size-[4.5rem]",
  lg: "size-24",
} as const

/** Two-lobe walnut silhouette with readable gyri, even at 40px. */
const OUTLINE =
  "M48 16C43.5 15.5 40 14.8 36.5 15.8C31 13.2 23.5 15 20.5 19.8C14.5 18.5 8.5 23 8 29.5C3.2 33.5 3.5 42 8.2 47C4.5 52.5 7 61 13.5 64.5C12 70.5 17.5 76.5 24.5 77.5C28 82.5 36 84.5 43.5 81.5C45.5 83.8 48 84 48 81C48 84 50.5 83.8 52.5 81.5C60 84.5 68 82.5 71.5 77.5C78.5 76.5 84 70.5 82.5 64.5C89 61 91.5 52.5 87.8 47C92.5 42 92.8 33.5 88 29.5C87.5 23 81.5 18.5 75.5 19.8C72.5 15 65 13.2 59.5 15.8C56 14.8 52.5 15.5 48 16Z"

export function BrainMascot({
  mood = "idle",
  size = "md",
  className,
}: {
  mood?: BrainMood
  size?: keyof typeof SIZES
  className?: string
}) {
  const uid = useId().replace(/:/g, "")
  const fillId = `brain-fill-${uid}`
  const shineId = `brain-shine-${uid}`
  const shadeId = `brain-shade-${uid}`
  const clipId = `brain-clip-${uid}`
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
      <svg viewBox="0 0 96 96" className="size-full overflow-visible drop-shadow-[0_8px_18px_oklch(0.82_0.12_85_/_0.28)]">
        <defs>
          <linearGradient id={fillId} x1="14" y1="10" x2="84" y2="88" gradientUnits="userSpaceOnUse">
            <stop stopColor="oklch(0.94 0.08 85)" />
            <stop offset="0.48" stopColor="oklch(0.84 0.14 85)" />
            <stop offset="1" stopColor="oklch(0.69 0.13 58)" />
          </linearGradient>
          <linearGradient id={shineId} x1="22" y1="12" x2="56" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="oklch(0.99 0.03 95)" stopOpacity="0.95" />
            <stop offset="1" stopColor="oklch(0.99 0.03 95)" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={shadeId} cx="48" cy="78" r="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="oklch(0.48 0.1 55)" stopOpacity="0.28" />
            <stop offset="1" stopColor="oklch(0.48 0.1 55)" stopOpacity="0" />
          </radialGradient>
          <clipPath id={clipId}>
            <path d={OUTLINE} />
          </clipPath>
        </defs>
        <ellipse cx="48" cy="89.2" rx="22" ry="4" fill="oklch(0.18 0.04 260 / 0.32)" />
        <path
          d={OUTLINE}
          fill={`url(#${fillId})`}
          stroke="oklch(0.46 0.1 70)"
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
        <g clipPath={`url(#${clipId})`}>
          <ellipse cx="48" cy="76" rx="26" ry="14" fill={`url(#${shadeId})`} />
          <path
            d="M40 20c-10-2-17 4-21 13M28 22c-8 10-10 24-4 38M40 58c-8 5-14 12-15 18"
            fill="none"
            stroke="oklch(0.48 0.1 70 / 0.7)"
            strokeWidth="1.45"
            strokeLinecap="round"
          />
          <path
            d="M56 20c10-2 17 4 21 13M68 22c8 10 10 24 4 38M56 58c8 5 14 12 15 18"
            fill="none"
            stroke="oklch(0.48 0.1 70 / 0.7)"
            strokeWidth="1.45"
            strokeLinecap="round"
          />
          <path
            d="M48 19c-2.5 19-2.5 39 0 59"
            fill="none"
            stroke="oklch(0.46 0.1 70 / 0.82)"
            strokeWidth="1.85"
            strokeLinecap="round"
          />
          <path
            d="M50.4 21c2.6 17 2.6 37 0 55"
            fill="none"
            stroke="oklch(0.99 0.03 95 / 0.32)"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <path d="M28 22c12-6.5 28-6.5 40 0" fill={`url(#${shineId})`} />
          <path
            d="M34 77q14-4 28 0M38 80.5q10-2.6 20 0"
            fill="none"
            stroke="oklch(0.48 0.1 70 / 0.45)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <ellipse cx="29.5" cy="56" rx="6" ry="3.3" fill="oklch(0.76 0.13 25 / 0.45)" />
          <ellipse cx="66.5" cy="56" rx="6" ry="3.3" fill="oklch(0.76 0.13 25 / 0.45)" />
        </g>
        <Face mood={mood} />
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

function Face({ mood }: { mood: BrainMood }) {
  const ink = "oklch(0.3 0.06 260)"
  if (mood === "sleep") {
    return (
      <>
        <path d="M30 50c4.2 3.4 9 3.4 13.2 0" fill="none" stroke={ink} strokeWidth="2.15" strokeLinecap="round" />
        <path d="M52.8 50c4.2 3.4 9 3.4 13.2 0" fill="none" stroke={ink} strokeWidth="2.15" strokeLinecap="round" />
        <path d="M42 62c4 2 8 2 12 0" fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
        <path
          d="M69 26h7.5l-7.5 7.5h7.5"
          fill="none"
          stroke="oklch(0.9 0.08 85)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M77 15h9.5l-9.5 9.5h9.5"
          fill="none"
          stroke="oklch(0.93 0.08 85)"
          strokeWidth="1.85"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    )
  }

  const lookY = mood === "think" ? 46.2 : 49.2
  const lookX = mood === "think" ? 1.25 : 0.45
  const eyeR = mood === "think" ? 3.05 : 3.35
  const brow =
    mood === "think"
      ? "M29.5 38.2c3.4-3.4 9.4-3.6 12.6-.6"
      : mood === "talk"
        ? "M30 38.8c3.6-2.8 9.2-2.4 12.4.6"
        : "M30 39.6c3.4-2.2 9-2.2 12.2 0"
  const browRight =
    mood === "think"
      ? "M54.2 38.2c3.4-3.4 9.4-3.6 12.6-.6"
      : mood === "talk"
        ? "M53.6 38.8c3.6-2.8 9.2-2.4 12.4.6"
        : "M53.8 39.6c3.4-2.2 9-2.2 12.2 0"

  return (
    <>
      <ellipse cx="36" cy="48" rx="6.3" ry="7.1" fill="oklch(0.985 0.02 95)" stroke={ink} strokeWidth="1.15" />
      <ellipse cx="60" cy="48" rx="6.3" ry="7.1" fill="oklch(0.985 0.02 95)" stroke={ink} strokeWidth="1.15" />
      <circle cx={36 + lookX} cy={lookY} r={eyeR} fill="oklch(0.27 0.06 260)" />
      <circle cx={60 + lookX} cy={lookY} r={eyeR} fill="oklch(0.27 0.06 260)" />
      <circle cx={37.7 + lookX} cy={lookY - 1.8} r="1.35" fill="white" />
      <circle cx={61.7 + lookX} cy={lookY - 1.8} r="1.35" fill="white" />
      <circle cx={35.3 + lookX} cy={lookY + 1.5} r="0.6" fill="white" fillOpacity={0.7} />
      <circle cx={59.3 + lookX} cy={lookY + 1.5} r="0.6" fill="white" fillOpacity={0.7} />
      <path d={brow} fill="none" stroke={ink} strokeWidth="1.7" strokeLinecap="round" />
      <path d={browRight} fill="none" stroke={ink} strokeWidth="1.7" strokeLinecap="round" />
      {mood === "talk" ? (
        <>
          <path
            d="M38 58.5Q48 78 58 58.5Q48 63.5 38 58.5Z"
            fill="oklch(0.4 0.11 22)"
            stroke={ink}
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <ellipse cx="48" cy="66.4" rx="3.2" ry="1.8" fill="oklch(0.62 0.16 25)" />
        </>
      ) : mood === "think" ? (
        <path d="M43 62.2c3.2 1.5 6.8 1.5 10 0" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M40 61.2c4 5.4 12 5.4 16 0" fill="none" stroke={ink} strokeWidth="2.15" strokeLinecap="round" />
      )}
    </>
  )
}
