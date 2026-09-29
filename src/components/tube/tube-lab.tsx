"use client"

import { useDeferredValue, useMemo, useState, type ReactNode } from "react"

import { OverlayToggle } from "@/components/analysis/shared"
import { useRegisterCapture } from "@/components/capture"
import { HelpTip, LabelHelp, TitleHelp, type HelpCopy } from "@/components/help"
import { FAMILY_COLORS, TUBE_COLORS } from "@/components/tube/palette"
import { SectionView } from "@/components/tube/section-view"
import { StrainChart, TubeChart } from "@/components/tube/tube-chart"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { WeekdayScopeControl } from "@/components/weekday-scope-control"
import { packTube } from "@/lib/capture/pack"
import { INDEPENDENCE_DISCLAIMER } from "@/lib/capture/snapshot"
import { formatDrawDate, formatShortDate, takeLastDraws } from "@/lib/draws"
import { RANK_RGB, rgbCssOf } from "@/lib/relief"
import {
  DEFAULT_TUBE_OPTIONS,
  SUM_SIGMA,
  TUBE_FAMILIES,
  TUBE_FAMILY_LABELS,
  TUBE_LEVELS,
  TUBE_PERIODS,
  TUBE_RANKS,
  TUBE_SAMPLES,
  TUBE_SOURCE_LABELS,
  TUBE_SOURCES,
  deformTube,
  lunarIllumination,
  lunarPhaseLabel,
  tubeDomain,
  tubeFrame,
  tubeNull,
  tubeScore,
  tubeStrainSummary,
  type TubeEnvelope,
  type TubeFamily,
  type TubeGains,
  type TubeLevel,
  type TubeNull,
  type TubeSample,
  type TubeScore,
  type TubeSection,
  type TubeSource,
  type TubeTiming,
} from "@/lib/tube"
import { useDraws } from "@/lib/use-draws"
import { useWeekdayScope } from "@/lib/use-weekday-scope"

const ENVELOPE_LABELS: Record<TubeEnvelope, string> = {
  hasard: "Hasard",
  glissante: "Glissante",
}

const TIMING_LABELS: Record<TubeTiming, string> = {
  veille: "La veille",
  jour: "Le jour même",
}

const SOURCE_HELP: Record<TubeSource, HelpCopy> = {
  n1: { title: "N1", body: "Plus petit numéro du tirage, en bas de la section. Son écart à sa SMA pousse le bas du tube." },
  n2: { title: "N2", body: "Deuxième numéro, entre le bas et l’axe." },
  n3: { title: "N3", body: "Numéro médian, sur l’axe. Il pèse dans la translation (cisaillement), pas dans l’ouverture." },
  n4: { title: "N4", body: "Quatrième numéro, entre l’axe et le haut." },
  n5: { title: "N5", body: "Plus grand numéro, en haut de la section. Son écart à sa SMA pousse le haut du tube." },
  lune: {
    title: "Lune",
    body: "Phase à la date du tirage, connue d’avance. Marée cos 2θ : étire aux syzygies (nouvelle et pleine lune, vive-eau), comprime aux quartiers (morte-eau). sin θ : glisse vers le haut en lune croissante, vers le bas en décroissante. Ce sens est une convention, pas une mesure.",
  },
}

const FAMILY_HELP: Record<TubeFamily, HelpCopy> = {
  etirement: {
    title: "Étirement",
    body: "Quand la grille s’ouvre (N5 et N4 au-dessus de leur SMA, N1 et N2 en dessous) ou en vive-eau, la section s’élargit. 100 % : largeur doublée au plus fort de la force.",
  },
  cisaillement: {
    title: "Cisaillement",
    body: "Quand les rangs montent ou descendent ensemble (translation), la section glisse le long de la normale. Un glissement qui change d’un tirage à l’autre fait glisser les couches du tube les unes sur les autres : c’est le cisaillement. 100 % : une demi-largeur au plus fort.",
  },
  compression: {
    title: "Compression",
    body: "Quand la grille se resserre (N1, N2 montent, N4, N5 descendent) ou en morte-eau, la section rétrécit. 100 % : largeur divisée par deux au plus fort de la force.",
  },
}

function formatPts(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

function formatSigned(value: number, digits = 1) {
  const text = formatPts(Math.abs(value), digits)
  if (Math.abs(value) < 10 ** -digits / 2) return formatPts(0, digits)
  return `${value > 0 ? "+" : "−"}${text}`
}

function formatPct(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—"
  return `${(value * 100).toLocaleString("fr-FR", { maximumFractionDigits: digits })} %`
}

function ChoiceRow<T extends string | number>({
  label,
  help,
  value,
  options,
  format,
  onChange,
}: {
  label: string
  help: HelpCopy
  value: T
  options: readonly T[]
  format: (option: T) => string
  onChange: (option: T) => void
}) {
  return (
    <LabelHelp label={label} help={help}>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <Button
            key={String(option)}
            type="button"
            size="sm"
            variant={value === option ? "default" : "outline"}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {format(option)}
          </Button>
        ))}
      </div>
    </LabelHelp>
  )
}

function GainSlider({
  family,
  value,
  onChange,
}: {
  family: TubeFamily
  value: number
  onChange: (value: number) => void
}) {
  const label = TUBE_FAMILY_LABELS[family]
  return (
    <label className="flex w-full min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground sm:min-w-48">
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: FAMILY_COLORS[family] }}
        />
        <span className="text-foreground">{label}</span>
        <span className="tabular-nums">{Math.round(value * 100)} %</span>
        <HelpTip {...FAMILY_HELP[family]} />
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={`${label} : part des vecteurs périphériques appliquée`}
        className="accent-primary"
        style={{ accentColor: FAMILY_COLORS[family] }}
      />
    </label>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground tabular-nums">{children}</dd>
    </div>
  )
}

function SectionFacts({ section, period }: { section: TubeSection; period: number }) {
  const stretched = section.widthFactor >= 1
  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
      <Fact label="Vecteur central (axe)">
        {formatPts(section.center)} · pente {formatSigned(section.slope)} / tirage
      </Fact>
      <Fact label={`Somme du tirage`}>
        <span style={{ color: section.insideDeformed ? undefined : TUBE_COLORS.outside }}>
          {section.sum} · {section.insideDeformed ? "dans le tube" : "hors du tube"}
        </span>
      </Fact>
      <Fact label="Tube nominal">
        {formatPts(section.lower)} → {formatPts(section.upper)} (± {formatPts(section.halfWidth)})
      </Fact>
      <Fact label="Tube déformé">
        {formatPts(section.deformedLower)} → {formatPts(section.deformedUpper)}
      </Fact>
      <Fact label={stretched ? "Étirement" : "Compression"}>
        <span style={{ color: stretched ? FAMILY_COLORS.etirement : FAMILY_COLORS.compression }}>
          largeur × {formatPts(section.widthFactor, 2)}
        </span>{" "}
        · force {formatSigned(section.strainDriver, 2)}
      </Fact>
      <Fact label="Cisaillement">
        <span style={{ color: FAMILY_COLORS.cisaillement }}>
          glissement {formatSigned(section.shift)} pt
        </span>{" "}
        · force {formatSigned(section.shearDriver, 2)}
      </Fact>
      <Fact label="Lune">
        {lunarPhaseLabel(section.moonFraction)} · {formatPct(lunarIllumination(section.moonFraction))}{" "}
        éclairée · marée {formatSigned(section.tide, 2)}
      </Fact>
      <Fact label={`Écarts à la SMA ${period} (σ du rang)`}>
        <span className="flex flex-wrap gap-x-2">
          {TUBE_RANKS.map((rank, k) => (
            <span key={rank} style={{ color: rgbCssOf(RANK_RGB[k]) }}>
              {TUBE_SOURCE_LABELS[rank]} {formatSigned(section.forces[k], 1)}
            </span>
          ))}
        </span>
      </Fact>
    </dl>
  )
}

function verdict({
  score,
  nullTest,
  circular,
  idle,
}: {
  score: TubeScore
  nullTest: TubeNull
  circular: boolean
  idle: boolean
}) {
  if (!score.n) return "Pas assez de tirages pour poser une section."
  if (idle) return "Aucune force appliquée : le tube déformé est le tube nominal."
  if (circular) {
    return "Forces lues le jour même : la somme des écarts N1–N5 est l’écart de la somme à sa SMA, donc le tirage t déforme son propre tube. Le score est circulaire et ne mesure rien. Repassez sur « La veille »."
  }
  const gain = score.gain ?? 0
  const share = nullTest.rounds ? `${nullTest.asGood} mélanges sur ${nullTest.rounds}` : "aucun mélange"
  if (gain > 0 && nullTest.p != null && nullTest.p <= 0.05) {
    return `Le score d’intervalle baisse de ${formatPct(gain)} et seuls ${share} font aussi bien. À refaire sur une autre fenêtre avant d’y croire : chaque réglage essayé est un test de plus.`
  }
  if (gain > 0) {
    return `Le score baisse de ${formatPct(gain)}, mais ${share} font au moins aussi bien : rien qui se distingue du hasard.`
  }
  return `La déformation dégrade le score de ${formatPct(-gain)} (${share} font au moins aussi bien). Le tube nominal reste le meilleur sur cette fenêtre.`
}

function ScoreCard({
  score,
  nullTest,
  circular,
  idle,
  stretched,
  compressed,
}: {
  score: TubeScore
  nullTest: TubeNull
  circular: boolean
  idle: boolean
  stretched: number
  compressed: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">
          <TitleHelp
            help={{
              title: "Score du tube",
              body: "Couverture : part des tirages dans le tube (le tube nominal « hasard » en couvre environ le niveau choisi). Score d’intervalle : largeur + 2/α × dépassement, moyenne sur les sections ; plus bas = mieux, élargir se paie. Mélanges : mêmes déformations, dates tirées au hasard, 199 fois. Si l’ordre réel ne bat pas les mélanges, le calendrier des forces n’apporte rien.",
              wide: true,
            }}
          >
            Le tube tient-il ?
          </TitleHelp>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Fact label={`Couverture (visée ${formatPct(score.level)})`}>
            {formatPct(score.coverageNominal)} → {formatPct(score.coverageDeformed)}
          </Fact>
          <Fact label="Largeur moyenne">
            {formatPts(score.widthNominal)} → {formatPts(score.widthDeformed)} pt
          </Fact>
          <Fact label="Score d’intervalle">
            {formatPts(score.scoreNominal)} → {formatPts(score.scoreDeformed)}
          </Fact>
          <Fact label="Mélanges des dates">
            {nullTest.rounds ? `${nullTest.asGood}/${nullTest.rounds} · p ≈ ${formatPts(nullTest.p, 2)}` : "—"}
          </Fact>
          <Fact label="Sections étirées / comprimées">
            {stretched} / {compressed} sur {score.n}
          </Fact>
          <Fact label="Gain au score">
            {score.gain == null ? "—" : `${score.gain >= 0 ? "+" : "−"}${formatPct(Math.abs(score.gain), 1)}`}
          </Fact>
        </dl>
        <p className={`text-sm leading-6 ${circular ? "text-destructive" : "text-muted-foreground"}`}>
          {verdict({ score, nullTest, circular, idle })}
        </p>
        <p className="text-xs text-muted-foreground">{INDEPENDENCE_DISCLAIMER}</p>
      </CardContent>
    </Card>
  )
}

export function TubeLab() {
  const [weekday, setWeekday] = useWeekdayScope()
  const { draws: archive, source, loading } = useDraws("current", weekday)
  const [sample, setSample] = useState<TubeSample>(100)
  const [period, setPeriod] = useState<number>(DEFAULT_TUBE_OPTIONS.period)
  const [level, setLevel] = useState<TubeLevel>(DEFAULT_TUBE_OPTIONS.level)
  const [envelope, setEnvelope] = useState<TubeEnvelope>(DEFAULT_TUBE_OPTIONS.envelope)
  const [timing, setTiming] = useState<TubeTiming>(DEFAULT_TUBE_OPTIONS.timing)
  const [sources, setSources] = useState<TubeSource[]>([...DEFAULT_TUBE_OPTIONS.sources])
  const [gains, setGains] = useState<TubeGains>(DEFAULT_TUBE_OPTIONS.gains)
  const [hover, setHover] = useState<number | null>(null)

  const chronological = useMemo(
    () => [...takeLastDraws(archive, sample + period)].sort((a, b) => a.date.localeCompare(b.date)),
    [archive, sample, period]
  )
  const frame = useMemo(
    () => tubeFrame(chronological, { period, level, envelope, timing }),
    [chronological, period, level, envelope, timing]
  )
  const sections = useMemo(() => deformTube(frame, sources, gains), [frame, sources, gains])
  const score = useMemo(() => tubeScore(sections, level), [sections, level])
  const strain = useMemo(() => tubeStrainSummary(sections), [sections])
  const domain = useMemo(() => tubeDomain(sections), [sections])
  const deferredSources = useDeferredValue(sources)
  const deferredGains = useDeferredValue(gains)
  const nullTest = useMemo(
    () => tubeNull(frame, deferredSources, deferredGains),
    [frame, deferredSources, deferredGains]
  )

  const activeSources = useMemo(() => new Set(sources), [sources])
  const circular = timing === "jour" && TUBE_RANKS.some((rank) => activeSources.has(rank))
  const idle = sources.length === 0 || TUBE_FAMILIES.every((family) => gains[family] === 0)
  const shown = (hover != null ? sections[hover] : null) ?? sections[sections.length - 1] ?? null
  const from = sections[0]?.date ?? null
  const to = sections[sections.length - 1]?.date ?? null
  const short = sections.length < sample

  useRegisterCapture(() =>
    packTube({
      source,
      sample,
      from,
      to,
      options: { period, level, envelope, timing, sources, gains },
      sections,
      score,
      nullTest,
      circular,
    })
  )

  function toggleSource(id: TubeSource) {
    setSources((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : TUBE_SOURCES.filter((item) => item === id || current.includes(item))
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-1 px-2 pt-3 pb-2 sm:px-4">
          {sections.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {loading ? "Chargement des tirages…" : `Il faut plus de ${period} tirages pour poser une section.`}
            </p>
          ) : (
            <>
              <TubeChart sections={sections} domain={domain} hover={hover} onHover={setHover} />
              <p className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
                Contraintes appliquées : barres = largeur (
                <span style={{ color: FAMILY_COLORS.etirement }}>étirement</span> /{" "}
                <span style={{ color: FAMILY_COLORS.compression }}>compression</span>), trait ={" "}
                <span style={{ color: FAMILY_COLORS.cisaillement }}>cisaillement</span>, en %.
              </p>
              <StrainChart sections={sections} hover={hover} onHover={setHover} />
            </>
          )}
        </CardContent>
      </Card>

      <p className="px-1 text-sm leading-6 text-muted-foreground">
        <span className="text-foreground">Un point = la somme d’un tirage.</span> Le trait or est
        l’axe du flux (vecteur central) : la SMA des {period} sommes précédentes, déformée. La bande
        or est le tube déformé, les tirets gris le tube nominal. Chaque section est posée avant le
        tirage qu’elle encadre ; un point rouge sort du tube. Survolez pour lire une section.
      </p>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <WeekdayScopeControl value={weekday} onChange={setWeekday} />
          <ChoiceRow
            label="Échantillon"
            help={{
              title: "Échantillon",
              body: "Nombre de sections du tube, dans la formule actuelle. Les p tirages d’avant servent à poser la première section. Sans Neon, l’archive JSON de l’année est plus courte.",
            }}
            value={sample}
            options={TUBE_SAMPLES}
            format={(n) => String(n)}
            onChange={setSample}
          />
          <ChoiceRow
            label="Axe SMA"
            help={{
              title: "Vecteur central",
              body: "L’axe du tube est la moyenne des p sommes qui précèdent le tirage. Sa hauteur est l’intensité du flux, sa pente d’une section à l’autre en donne la direction.",
            }}
            value={period}
            options={TUBE_PERIODS}
            format={(n) => `p = ${n}`}
            onChange={setPeriod}
          />
          <ChoiceRow
            label="Enveloppe"
            help={{
              title: "Vecteurs périphériques du tube",
              body: `Hasard : ± z·σ·√(1 + 1/p), σ = ${formatPts(SUM_SIGMA, 2)}, la loi d’un tirage uniforme 5/50. Glissante : même formule avec l’écart-type des p sommes précédentes, plus nerveuse.`,
            }}
            value={envelope}
            options={["hasard", "glissante"] as const}
            format={(id) => ENVELOPE_LABELS[id]}
            onChange={setEnvelope}
          />
          <ChoiceRow
            label="Niveau"
            help={{
              title: "Niveau du tube",
              body: "Part des tirages que le tube nominal « hasard » doit contenir. 90 % : environ un tirage sur dix sort. C’est le quantile qui élimine le bruit.",
            }}
            value={level}
            options={TUBE_LEVELS}
            format={(n) => `${Math.round(n * 100)} %`}
            onChange={setLevel}
          />
          <ChoiceRow
            label="Forces lues"
            help={{
              title: "Quand lire N1–N5",
              body: "La veille : écarts du tirage t − 1, connus avant t. Le jour même : écarts du tirage t, qui contiennent sa propre somme (Σ écarts = somme − SMA). Utile pour voir le tube épouser le flux, pas pour le juger.",
            }}
            value={timing}
            options={["veille", "jour"] as const}
            format={(id) => TIMING_LABELS[id]}
            onChange={setTiming}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            Vecteurs périphériques
            <HelpTip
              title="Forces sur le flux"
              body="N1–N5 : écart de chaque rang à sa SMA, réduit par l’écart-type du rang. Placés dans la section de bas (N1) en haut (N5). Deux modes : translation Σ écarts (cisaillement) et ouverture Σ position × écart (étirement ou compression). La lune ajoute sa marée et sa dérive. Rangs et lune actifs : moyenne des deux."
              wide
            />
          </span>
          <div className="flex flex-wrap gap-2">
            {TUBE_SOURCES.map((id) => (
              <OverlayToggle
                key={id}
                label={TUBE_SOURCE_LABELS[id]}
                on={activeSources.has(id)}
                onClick={() => toggleSource(id)}
                help={SOURCE_HELP[id]}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          {TUBE_FAMILIES.map((family) => (
            <GainSlider
              key={family}
              family={family}
              value={gains[family]}
              onChange={(value) => setGains((current) => ({ ...current, [family]: value }))}
            />
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setGains({ etirement: 0, cisaillement: 0, compression: 0 })}
          >
            Gains à zéro
          </Button>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          {sections.length
            ? `${sections.length} sections · ${from ? formatShortDate(from) : "?"} → ${to ? formatShortDate(to) : "?"} · source ${source}${loading ? " · Neon…" : ""}`
            : loading
              ? "Chargement des tirages…"
              : "Aucune section."}
          {!loading && short && sections.length
            ? ` Échantillon ${sample} incomplet (archive : ${sections.length} sections après ${period} tirages d’amorce).`
            : ""}
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              {shown ? `Section du ${formatDrawDate(shown.date)}` : "Section sous le curseur"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {shown ? (
              <>
                <SectionView section={shown} sources={activeSources} />
                <p className="text-xs text-muted-foreground">
                  À gauche, le vecteur central et ses deux vecteurs périphériques δ±, avant puis
                  après déformation. La flèche violette est le glissement (cisaillement). À droite, les
                  forces : N1–N5 en σ au-dessus ou au-dessous de leur SMA, puis la lune.
                  {hover == null ? " Dernière section affichée." : ""}
                </p>
                <SectionFacts section={shown} period={period} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Survolez le tube.</p>
            )}
          </CardContent>
        </Card>
        <ScoreCard
          score={score}
          nullTest={nullTest}
          circular={circular}
          idle={idle}
          stretched={strain.stretched}
          compressed={strain.compressed}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Comment le tube est construit</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm leading-6 text-muted-foreground md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <p className="text-foreground">1. Vecteur central</p>
            <p>
              Axe = SMA des p sommes qui précèdent t. La hauteur est l’intensité du flux, la pente sa
              direction. En 2D temps × somme, la section est verticale, à la date du tirage : une
              normale « orthogonale » dépendrait de l’échelle choisie entre un tirage et un point.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-foreground">2. Vecteurs périphériques</p>
            <p>
              δ± = ± z·σ·√(1 + 1/p) autour de l’axe. Relier les sommets de section en section ferme
              l’enveloppe : un polygone qui suit l’axe, pas une enveloppe convexe qui comblerait
              les creux du flux.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-foreground">3. Contraintes</p>
            <p>
              Les écarts N1–N5 se lisent comme un champ de déplacement dans la section. Leur moyenne
              fait glisser la section (cisaillement), leur pente de N1 à N5 l’ouvre (étirement) ou la
              resserre (compression). Σ écarts N1–N5 = somme − SMA : lus le jour même, ils recopient
              le tirage.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
