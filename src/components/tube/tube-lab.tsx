"use client"

import { useDeferredValue, useMemo, useState, type ReactNode } from "react"

import { OverlayToggle } from "@/components/analysis/shared"
import { useRegisterCapture } from "@/components/capture"
import { HelpTip, LabelHelp, TitleHelp, type HelpCopy } from "@/components/help"
import { EllipseStrip, EllipseView } from "@/components/tube/ellipse-view"
import { FAMILY_COLORS, TUBE_COLORS } from "@/components/tube/palette"
import { SectionView } from "@/components/tube/section-view"
import { PhaseChart, StrainChart, TubeChart } from "@/components/tube/tube-chart"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { WeekdayScopeControl } from "@/components/weekday-scope-control"
import { packTube } from "@/lib/capture/pack"
import { INDEPENDENCE_DISCLAIMER } from "@/lib/capture/snapshot"
import { formatDrawDate, takeLastDraws } from "@/lib/draws"
import { RANK_RGB, rgbCssOf } from "@/lib/relief"
import {
  DEFAULT_TUBE_OPTIONS,
  SUM_SIGMA,
  TUBE_BLOCKS,
  TUBE_FAMILIES,
  TUBE_FAMILY_LABELS,
  TUBE_LEVELS,
  TUBE_PERIODS,
  TUBE_PHASES,
  TUBE_RANKS,
  TUBE_SAMPLES,
  TUBE_SOURCE_LABELS,
  TUBE_SOURCES,
  ZERO_GAINS,
  deformTube,
  ellipseScore,
  learnTube,
  lunarIllumination,
  lunarPhaseLabel,
  scoreLearned,
  sectionEllipse,
  tubeDomain,
  tubeFrame,
  tubeLearnedNull,
  tubeNull,
  tubeScore,
  tubeStrainSummary,
  type EllipseScore,
  type TubeBlock,
  type TubeSample,
  type TubeEnvelope,
  type TubeFamily,
  type TubeGains,
  type TubeLevel,
  type TubeNull,
  type TubePlane,
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
  n3: {
    title: "N3",
    body: "Numéro médian. Il pèse dans la translation, et c’est lui qui ouvre l’asymétrie : N3 contre N1 et N5. Son poids dans l’ouverture symétrique est nul.",
  },
  n4: { title: "N4", body: "Quatrième numéro, entre l’axe et le haut." },
  n5: { title: "N5", body: "Plus grand numéro, en haut de la section. Son écart à sa SMA pousse le haut du tube." },
  lune: {
    title: "Lune",
    body: "Phase synodique à la date du tirage, connue d’avance. Marée cos 2θ : étire aux syzygies, comprime aux quartiers. sin θ : glisse vers le haut en lune croissante. Convention, pas une mesure.",
  },
  "vive-eau": {
    title: "Vive-eau",
    body: "Quinzaine du registre Cycles. Phase 0 à la nouvelle et à la pleine lune. cos 2πf étire en vive-eau et comprime en morte-eau. C’est la marée de la lune, sans sa dérive synodique.",
  },
  anomalistique: {
    title: "Anomalistique",
    body: "0 au périgée, 0,5 à l’apogée. cos 2πf étire au périgée, sin 2πf cisaille. Convention de sens, comme la lune.",
  },
  draconitique: {
    title: "Draconitique",
    body: "0 au nœud ascendant, 0,5 au nœud descendant. Même lecture cos / sin qu’une phase du registre.",
  },
  tropique: {
    title: "Année tropique",
    body: "0 à l’équinoxe de mars. La phase est connue à la date du tirage. cos étire à l’équinoxe de mars, comprime à celui de septembre.",
  },
  nodal: {
    title: "Nodal",
    body: "Cycle de 18,6 ans du nœud ascendant. Lent : sur la formule actuelle il bouge peu. Une force presque constante ne bat pas un mélange de dates.",
  },
  carrington: {
    title: "Carrington",
    body: "Rotation solaire moyenne, 27,28 jours. Phase locale du registre, pas le flux F10.7 mesuré.",
  },
  retards: {
    title: "Retards",
    body: "État de la grille avant le tirage t, jamais les numéros de t. Haut (26–50) contre bas (1–25) : cisaillement. Extrêmes (1–10 et 41–50) contre le milieu (16–35) : étirement. Échelle : 4 tirages.",
  },
  etoiles: {
    title: "Étoiles",
    body: "Somme et étendue des deux étoiles, écart à leur SMA. La veille : le tirage t − 1, connu avant t. Le jour même : les étoiles de t, qui ne sont pas la somme, mais qui sortent avec elle.",
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
    body: "Quand la grille se resserre (N1, N2 montent, N4, N5 descendent) ou en morte-eau, la section rétrécit. 100 % : largeur divisée par deux au plus fort de la force. Dans l’ellipse, c’est l’autre valeur propre : le petit axe, à l’inverse de l’étirement.",
  },
  asymetrie: {
    title: "Asymétrie",
    body: "N3 contre les extrêmes. 100 % et force maximale : la demi-largeur haute vaut 1,75 fois la nominale et la basse 0,25, ou l’inverse. La largeur totale ne change pas. Positif : N3 haut par rapport à N1 et N5, le haut de la section s’allonge.",
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
  disabled,
  onChange,
}: {
  family: TubeFamily
  value: number
  disabled?: boolean
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
        className="accent-primary disabled:opacity-60"
        disabled={disabled}
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
  const neutral = Math.abs(section.widthFactor - 1) < 0.001
  const stretched = section.widthFactor > 1
  const widthLabel = neutral ? "Largeur" : stretched ? "Étirement" : "Compression"
  const widthColor = neutral
    ? undefined
    : stretched
      ? FAMILY_COLORS.etirement
      : FAMILY_COLORS.compression
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
      <Fact label={widthLabel}>
        <span style={{ color: widthColor }}>largeur × {formatPts(section.widthFactor, 2)}</span>{" "}
        · force {formatSigned(section.strainDriver, 2)}
      </Fact>
      <Fact label="Cisaillement">
        <span style={{ color: FAMILY_COLORS.cisaillement }}>
          glissement {formatSigned(section.shift)} pt
        </span>{" "}
        · force {formatSigned(section.shearDriver, 2)}
      </Fact>
      <Fact label="Asymétrie">
        <span style={{ color: FAMILY_COLORS.asymetrie }}>
          bas {formatPts(section.lowerHalf)} · haut {formatPts(section.upperHalf)}
        </span>{" "}
        · force {formatSigned(section.skewDriver, 2)}
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
  learned,
}: {
  score: TubeScore
  nullTest: TubeNull
  circular: boolean
  idle: boolean
  learned: boolean
}) {
  if (!score.n) return learned ? "Pas assez de blocs : le premier sert à apprendre, le suivant à juger." : "Pas assez de tirages pour poser une section."
  if (idle) return "Aucune force appliquée : le tube déformé est le tube nominal."
  if (circular) {
    return "Forces lues le jour même : la somme des écarts N1–N5 est l’écart de la somme à sa SMA, donc le tirage t déforme son propre tube. Le score est circulaire et ne mesure rien. Repassez sur « La veille »."
  }
  const gain = score.gain ?? 0
  const share = nullTest.rounds ? `${nullTest.asGood} mélanges sur ${nullTest.rounds}` : "aucun mélange"
  const rule = learned
    ? "Règle fixée d’avance : les gains du bloc précédent, appliqués au suivant, puis la même règle sur des dates mélangées."
    : "Réglage à la main : chaque position de curseur est un test de plus."
  if (gain > 0 && nullTest.p != null && nullTest.p <= 0.05) {
    return `Le score d’intervalle baisse de ${formatPct(gain)} et seuls ${share} font aussi bien. ${rule}`
  }
  if (gain > 0) {
    return `Le score baisse de ${formatPct(gain)}, mais ${share} font au moins aussi bien. ${rule}`
  }
  return `La déformation dégrade le score de ${formatPct(-gain)} (${share} font au moins aussi bien). ${rule}`
}

function ScoreCard({
  score,
  nullTest,
  circular,
  idle,
  learned,
  ellipse,
  stretched,
  compressed,
}: {
  score: TubeScore
  nullTest: TubeNull
  circular: boolean
  idle: boolean
  learned: boolean
  ellipse: EllipseScore | null
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
              body: "Couverture : part des tirages dans le tube. Score d’intervalle : largeur + 2/α × dépassement, plus bas = mieux. Gains appris : grille sur le bloc précédent, appliquée au suivant ; le premier bloc ne compte pas. Le nul relance cette règle après mélange des dates. À la main, les mélanges gardent les curseurs et ne mélangent que les dates : chaque curseur est un test de plus. L’ellipse a son score (log dét + distance), elle n’est pas ce que l’apprentissage minimise.",
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
          {ellipse ? (
            <Fact label="Ellipse (couverture · score)">
              {formatPct(ellipse.coverageNominal)} → {formatPct(ellipse.coverageDeformed)} ·{" "}
              {formatPts(ellipse.dssNominal, 2)} → {formatPts(ellipse.dssDeformed, 2)}
            </Fact>
          ) : null}
        </dl>
        <p className={`text-sm leading-6 ${circular ? "text-destructive" : "text-muted-foreground"}`}>
          {verdict({ score, nullTest, circular, idle, learned })}
        </p>
        <p className="text-xs text-muted-foreground">{INDEPENDENCE_DISCLAIMER}</p>
      </CardContent>
    </Card>
  )
}

export function TubeLab() {
  const [weekday, setWeekday] = useWeekdayScope()
  const { draws: archive, source, loading } = useDraws("current", weekday)
  const [sample, setSample] = useState<TubeSample | "formule">("formule")
  const [period, setPeriod] = useState<number>(DEFAULT_TUBE_OPTIONS.period)
  const [level, setLevel] = useState<TubeLevel>(DEFAULT_TUBE_OPTIONS.level)
  const [envelope, setEnvelope] = useState<TubeEnvelope>(DEFAULT_TUBE_OPTIONS.envelope)
  const [timing, setTiming] = useState<TubeTiming>(DEFAULT_TUBE_OPTIONS.timing)
  const [sources, setSources] = useState<TubeSource[]>([...DEFAULT_TUBE_OPTIONS.sources])
  const [gains, setGains] = useState<TubeGains>(DEFAULT_TUBE_OPTIONS.gains)
  const [gainMode, setGainMode] = useState<"manuel" | "appris">("appris")
  const [block, setBlock] = useState<TubeBlock>(40)
  const [plane, setPlane] = useState<TubePlane>("etendue")
  const [hover, setHover] = useState<number | null>(null)

  const chronological = useMemo(() => {
    const pool = sample === "formule" ? archive : takeLastDraws(archive, sample + period)
    return [...pool]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((draw) => ({
        date: draw.date,
        weekday: draw.weekday,
        numbers: draw.numbers,
        stars: draw.stars,
      }))
  }, [archive, sample, period])
  const frame = useMemo(
    () => tubeFrame(chronological, { period, level, envelope, timing }),
    [chronological, period, level, envelope, timing]
  )
  const learned = useMemo(
    () => (gainMode === "appris" ? learnTube(frame, sources, block) : null),
    [gainMode, frame, sources, block]
  )
  const sections = useMemo(
    () => (learned ? learned.sections : deformTube(frame, sources, gains)),
    [learned, frame, sources, gains]
  )
  const scoredSections = useMemo(
    () => (learned ? sections.slice(block) : sections),
    [learned, sections, block]
  )
  const score = useMemo(
    () => (learned ? scoreLearned(learned, level) : tubeScore(sections, level)),
    [learned, sections, level]
  )
  const strain = useMemo(() => tubeStrainSummary(scoredSections), [scoredSections])
  const domain = useMemo(() => tubeDomain(sections), [sections])
  const ellipses = useMemo(
    () => sections.map((section) => sectionEllipse(section, plane, level)),
    [sections, plane, level]
  )
  const ellipse = useMemo(
    () => ellipseScore(learned ? ellipses.slice(block) : ellipses),
    [ellipses, learned, block]
  )
  const deferredSources = useDeferredValue(sources)
  const deferredGains = useDeferredValue(gains)
  const deferredBlock = useDeferredValue(block)
  const deferredMode = useDeferredValue(gainMode)
  const nullTest = useMemo(
    () =>
      deferredMode === "appris"
        ? tubeLearnedNull(frame, deferredSources, deferredBlock)
        : tubeNull(frame, deferredSources, deferredGains),
    [deferredMode, frame, deferredSources, deferredBlock, deferredGains]
  )

  const activeSources = useMemo(() => new Set(sources), [sources])
  const circular = timing === "jour" && TUBE_RANKS.some((rank) => activeSources.has(rank))
  const shownIndex = hover ?? sections.length - 1
  const shownGains = learned ? (learned.blockGains[shownIndex] ?? ZERO_GAINS) : gains
  const idle =
    sources.length === 0 ||
    (learned
      ? learned.blockGains.slice(block).every((row) => row == null || TUBE_FAMILIES.every((family) => row[family] === 0))
      : TUBE_FAMILIES.every((family) => gains[family] === 0))
  const shown = sections[shownIndex] ?? null
  const shownEllipse = ellipses[shownIndex] ?? null
  const from = sections[0]?.date ?? null
  const to = sections[sections.length - 1]?.date ?? null
  const short = sample !== "formule" && sections.length < sample

  useRegisterCapture(() =>
    packTube({
      source,
      sample: sample === "formule" ? score.n : sample,
      from: scoredSections[0]?.date ?? from,
      to,
      options: { period, level, envelope, timing, sources, gains: shownGains },
      sections: scoredSections,
      score,
      nullTest,
      circular,
      learned: gainMode === "appris",
      block,
      plane,
      ellipse,
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
              <p className="px-1 text-xs text-muted-foreground">
                Contraintes : barres = largeur (
                <span style={{ color: FAMILY_COLORS.etirement }}>étirement</span> /{" "}
                <span style={{ color: FAMILY_COLORS.compression }}>compression</span>), trait ={" "}
                <span style={{ color: FAMILY_COLORS.cisaillement }}>cisaillement</span>, tirets ={" "}
                <span style={{ color: FAMILY_COLORS.asymetrie }}>asymétrie</span>.
              </p>
              <StrainChart sections={sections} hover={hover} onHover={setHover} />
              <p className="px-1 pt-2 text-xs text-muted-foreground">
                Tube replié sur la phase lunaire. L’axe horizontal est la phase, pas le temps : chaque point est la moyenne des sections qui tombent dans la même douzième de lunaison.
              </p>
              <PhaseChart sections={sections} />
              <p className="px-1 pt-2 text-xs text-muted-foreground">
                Sections dans le plan somme × {plane === "etendue" ? "étendue" : "parité"}. Verticale = somme, horizontale = le second axe, ramené à une largeur lisible. L’ellipse exacte est dans l’inspecteur.
              </p>
              <EllipseStrip sections={sections} pairs={ellipses} hover={hover} />
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
              body: "Formule : tous les tirages de la formule actuelle (Neon s’il répond, sinon le fichier de l’année). 50 à 400 : la fin de cette archive. Les p tirages d’avant posent la première section.",
            }}
            value={sample}
            options={[...TUBE_SAMPLES, "formule"]}
            format={(n) => (n === "formule" ? "Formule" : String(n))}
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
          <ChoiceRow
            label="Plan"
            help={{
              title: "Section dans un plan",
              body: "L’ellipse vit dans (somme, étendue) ou (somme, parité). La covariance est celle de la loi 5/50, ou glissante. La matrice 2×2 étire un axe principal, comprime l’autre, et cisaille par le terme croisé. Le ruban du haut reste la marge sur la somme.",
            }}
            value={plane}
            options={["etendue", "parite"] as const}
            format={(id) => (id === "etendue" ? "Somme × étendue" : "Somme × parité")}
            onChange={setPlane}
          />
          <ChoiceRow
            label="Gains"
            help={{
              title: "Appris ou à la main",
              body: "Appris : sur chaque bloc, la grille 0 / 50 / 100 % qui minimise le score d’intervalle du bloc précédent, appliquée au suivant. Le premier bloc est l’amorce, hors score. Le nul mélange les dates puis réapprend. À la main, chaque curseur est un test de plus.",
            }}
            value={gainMode}
            options={["appris", "manuel"] as const}
            format={(id) => (id === "appris" ? "Appris" : "À la main")}
            onChange={setGainMode}
          />
          {gainMode === "appris" ? (
            <ChoiceRow
              label="Bloc"
              help={{
                title: "Taille du bloc",
                body: "Nombre de sections apprises ensemble. Les gains d’un bloc viennent uniquement du bloc d’avant.",
              }}
              value={block}
              options={TUBE_BLOCKS}
              format={(n) => String(n)}
              onChange={setBlock}
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            Vecteurs périphériques
            <HelpTip
              title="Forces sur le flux"
              body="N1–N5 : trois modes. Translation (cisaillement), ouverture de N1 vers N5 (étirement ou compression), N3 contre les extrêmes (asymétrie). Chaque horloge ajoute une marée et une dérive. Retards : l’état de la grille avant t. Étoiles : somme et étendue. Les groupes actifs sont moyennés, sauf l’asymétrie, qui ne vient que des rangs."
              wide
            />
          </span>
          <div className="flex flex-wrap gap-2">
            {TUBE_RANKS.map((id) => (
              <OverlayToggle
                key={id}
                label={TUBE_SOURCE_LABELS[id]}
                on={activeSources.has(id)}
                onClick={() => toggleSource(id)}
                help={SOURCE_HELP[id]}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["lune", ...TUBE_PHASES] as const).map((id) => (
              <OverlayToggle
                key={id}
                label={TUBE_SOURCE_LABELS[id]}
                on={activeSources.has(id)}
                onClick={() => toggleSource(id)}
                help={SOURCE_HELP[id]}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["retards", "etoiles"] as const).map((id) => (
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
              value={shownGains[family]}
              disabled={gainMode === "appris"}
              onChange={(value) => setGains((current) => ({ ...current, [family]: value }))}
            />
          ))}
          {gainMode === "manuel" ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setGains(ZERO_GAINS)}>
              Gains à zéro
            </Button>
          ) : (
            <p className="max-w-sm text-xs leading-5 text-muted-foreground">
              {learned?.blockGains[shownIndex] == null
                ? "Bloc d’amorce : gains à zéro, hors score."
                : "Gains du bloc précédent, figés pour celui-ci."}
            </p>
          )}
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          {sections.length
            ? `${sections.length} sections${learned ? ` · ${score.n} au score` : ""} · ${from ? formatDrawDate(from) : "?"} → ${to ? formatDrawDate(to) : "?"} · source ${source}${loading ? " · Neon…" : ""}`
            : loading
              ? "Chargement des tirages…"
              : "Aucune section."}
          {!loading && short && sections.length
            ? ` Échantillon ${sample} incomplet (archive : ${sections.length} sections après ${period} tirages d’amorce).`
            : ""}
          {!loading && source !== "neon" && sample === "formule"
            ? " Neon n’a pas répondu : archive JSON, plus courte que la formule."
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <SectionView section={shown} sources={activeSources} />
                  {shownEllipse ? <EllipseView section={shown} pair={shownEllipse} /> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  À gauche, le vecteur central et ses δ±, avant puis après déformation. Des demi-largeurs
                  inégales sont l’asymétrie. À droite, N1–N5 et la lune. L’ellipse est la section dans le
                  plan choisi : tirets = covariance nominale, plein = matrice 2×2.
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
          learned={gainMode === "appris"}
          ellipse={ellipse}
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
              Quatre familles. La moyenne des écarts glisse la section, la pente de N1 à N5 l’ouvre ou
              la resserre, N3 contre N1 et N5 rend les deux demi-largeurs inégales. Dans le plan, la
              même force est une matrice 2×2 : valeurs propres pour l’étirement et la compression,
              terme croisé pour le cisaillement. Les gains s’apprennent sur le bloc précédent.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
