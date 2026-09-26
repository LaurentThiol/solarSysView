import {
  catalogEntry,
  resolveHandleEntry,
  type BrainLab,
  type CatalogEntry,
} from "@/lib/brain/catalog"
import { VARIABLE_NAMES, type VariableName } from "@/lib/analysis"

export type ParsedHandle = {
  raw: string
  lab: BrainLab | null
  handle: string
  variable: VariableName | null
  n: number | null
  curveId: string | null
  readingId: number | null
  drawDate: string | null
  entry: CatalogEntry | null
  ambiguous: CatalogEntry[]
  error: string | null
}

export type HandleContext = {
  activeLab?: BrainLab | null
  variable?: VariableName
  ball?: number
  star?: number
  curveId?: string | null
}

const HANDLE_TOKEN = String.raw`[a-zA-Z][\w-]*`
const HANDLE_RE = new RegExp(
  `^@(?:(${HANDLE_TOKEN})\\.)?(${HANDLE_TOKEN})(?::(\\d{1,2}))?(?:\\.(${HANDLE_TOKEN}))?(?:@(${HANDLE_TOKEN}(?::\\d{1,2})?))?(?:#(\\d{4}-\\d{2}-\\d{2}|\\d+))?$`
)

const LABS = new Set<BrainLab>(["analyse", "chartisme", "harmo", "morpho", "combinaisons", "specialist"])

function asLab(value: string | undefined): BrainLab | null {
  if (!value) return null
  return LABS.has(value as BrainLab) ? (value as BrainLab) : null
}

function asVariable(value: string | undefined): VariableName | null {
  if (!value) return null
  return (VARIABLE_NAMES as readonly string[]).includes(value) ? (value as VariableName) : null
}

function parseN(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

const SENSE_HANDLE = /^@sense\.(monte|baisse|stable)\.(05|1|sup)$/

export function parseHandle(raw: string, ctx: HandleContext = {}): ParsedHandle {
  const text = raw.trim()
  const sense = SENSE_HANDLE.exec(text)
  if (sense) {
    const handle = `sense.${sense[1]}.${sense[2]}`
    const entry: CatalogEntry = {
      id: `lexicon/${handle}`,
      handle,
      aliases: [`${sense[1]}:${sense[2]}`],
      lab: "chartisme",
      family: "sens",
      kind: "figure",
      label: `${sense[1]}:${sense[2]}`,
      units: "fenêtre",
      reading: "Sens de fenêtre. La fiche confirmée est dans le dictionnaire.",
      defaults: {},
    }
    return {
      raw: text,
      lab: "chartisme",
      handle,
      variable: null,
      n: null,
      curveId: null,
      readingId: null,
      drawDate: null,
      entry,
      ambiguous: [],
      error: null,
    }
  }
  const empty: ParsedHandle = {
    raw: text,
    lab: null,
    handle: "",
    variable: ctx.variable ?? null,
    n: null,
    curveId: ctx.curveId ?? null,
    readingId: null,
    drawDate: null,
    entry: null,
    ambiguous: [],
    error: "handle vide",
  }
  const match = HANDLE_RE.exec(text)
  if (!match) {
    return { ...empty, error: `syntaxe invalide : ${text}` }
  }
  const prefix = match[1]
  const first = match[2]
  const nFromFirst = parseN(match[3])
  const second = match[4]
  const curveToken = match[5] ?? null
  const citation = match[6] ?? null
  const drawDate = citation && /^\d{4}-\d{2}-\d{2}$/.test(citation) ? citation : null
  const readingId = citation && !drawDate ? Number.parseInt(citation, 10) : null
  const prefixLab = asLab(prefix)
  const prefixVar = asVariable(prefix)
  const lab: BrainLab | null = prefixLab
  let handle = first
  let variable: VariableName | null = prefixVar
  let n = nFromFirst
  if (!prefixLab && !prefixVar && asVariable(first) && second) {
    variable = asVariable(first)
    n = nFromFirst
    handle = second
  } else if (prefixVar && second) {
    variable = prefixVar
    handle = second
  } else if (prefixLab) {
    handle = second || first
  }
  const activeLab = lab ?? ctx.activeLab ?? null
  const { entry, ambiguous } = resolveHandleEntry(handle, activeLab)
  if (curveToken) {
    const curveVar = asVariable(curveToken.split(":")[0])
    if (curveVar) variable = variable ?? curveVar
  }
  if (!variable && entry?.defaults.variable) variable = entry.defaults.variable
  if (variable === "delay" || variable === "hit") n = n ?? ctx.ball ?? 7
  if (variable === "star_delay" || variable === "star_hit") n = n ?? ctx.star ?? 1
  const curveId = curveToken || (entry?.lab === "chartisme" ? (ctx.curveId ?? (variable ? (n != null ? `${variable}:${n}` : variable) : "sum")) : null)
  if (!entry) {
    const hint =
      ambiguous.length > 1
        ? `ambigu : ${ambiguous.map((item) => item.id).join(", ")} — préfixe le lab`
        : `inconnu : @${handle}`
    return {
      raw: text,
      lab,
      handle,
      variable,
      n,
      curveId,
      readingId,
      drawDate,
      entry: null,
      ambiguous,
      error: hint,
    }
  }
  return {
    raw: text,
    lab: entry.lab,
    handle: entry.handle,
    variable: variable ?? entry.defaults.variable ?? null,
    n,
    curveId,
    readingId,
    drawDate,
    entry,
    ambiguous: [],
    error: null,
  }
}

export function parseHandlesInText(text: string, ctx: HandleContext = {}): ParsedHandle[] {
  const found: ParsedHandle[] = []
  const re = /@[A-Za-z][\w.:@#-]*/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    found.push(parseHandle(match[0], ctx))
  }
  return found
}

export function formatHandle(entry: CatalogEntry, extra?: { variable?: VariableName | null; n?: number | null }) {
  if (entry.lab === "specialist") return `@specialist.${entry.handle}`
  const variable = extra?.variable && extra.variable !== entry.defaults.variable ? extra.variable : null
  const n = extra?.n ?? null
  if (variable && n != null) return `@${variable}:${n}.${entry.handle}`
  if (variable && entry.kind !== "variable") return `@${variable}.${entry.handle}`
  return `@${entry.handle}`
}

export function catalogIdOf(parsed: ParsedHandle): string | null {
  return parsed.entry?.id ?? (parsed.handle ? catalogEntry(`analyse/${parsed.handle}`)?.id ?? null : null)
}
