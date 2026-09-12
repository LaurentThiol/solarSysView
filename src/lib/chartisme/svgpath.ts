// Fenêtre de courbe → chemins SVG → tokens de commandes.
//
// Une fenêtre est ramenée au carré unité (indépendance à la résolution), réduite
// à ses points perceptuellement importants (PIP, Fu et al.), puis ajustée par des
// Béziers cubiques. Le résultat est un *groupe* de chemins — courbe, enveloppe
// haute, enveloppe basse, activité — tokenisé comme dans DeepSVG : un
// identifiant de commande (MoveTo / LineTo / CubicBezier / ClosePath) et six
// arguments quantifiés par commande.
//
// Convention : `y = 1` est la valeur la plus haute de la fenêtre. Le retournement
// vertical pour l'affichage se fait au rendu (`toSvgD({ flipY: true })`).

export const CMD_TOKENS = ["PAD", "SOS", "EOS", "m", "l", "c", "z"] as const

export type CmdToken = (typeof CMD_TOKENS)[number]

export const CMD_PAD = 0
export const CMD_SOS = 1
export const CMD_EOS = 2
export const CMD_MOVE = 3
export const CMD_LINE = 4
export const CMD_CUBIC = 5
export const CMD_CLOSE = 6

export const N_ARGS = 6
export const ARG_BINS = 256
// 0 = argument absent ; une valeur quantifiée v ∈ [0, 255] est stockée v + 1.
export const ARG_VOCAB = ARG_BINS + 1
export const ARG_NONE = 0

export const MAX_CMDS = 48
export const MAX_PATHS = 4

export const PATH_ROLES = ["curve", "upper", "lower", "activity"] as const

export type PathRole = (typeof PATH_ROLES)[number]

export type Point = [number, number]

export type CommandArg = number | null

/** Une commande de chemin : identifiant + six arguments dans le carré unité. */
export type Command = {
  cmd: number
  args: CommandArg[]
}

export type CommandPayload = {
  cmd: CmdToken
  args: CommandArg[]
}

// `round()` de Python départage les milieux exacts vers le pair, `toFixed` les
// pousse vers le haut : sans ce correctif les deux jumeaux divergent d'un cran
// de quantification, et d'un dix-millième sur les confiances.
export function roundHalfEven(value: number, digits = 0) {
  if (!Number.isFinite(value)) return value
  // Un milieu exact suppose `value * 2^(digits + 1)` entier impair.
  const doubled = value * 2 ** (digits + 1)
  if (Number.isInteger(doubled) && Math.abs(doubled) % 2 === 1) {
    const scale = 10 ** digits
    const below = Math.abs(value) * scale - 0.5
    const nearest = below % 2 === 0 ? below : below + 1
    return (value < 0 ? -nearest : nearest) / scale
  }
  return Number(value.toFixed(digits))
}

const DEKKER_SPLIT = 134217729

// Produit exact : `hi` est l'arrondi, `lo` l'erreur. Découpage de Dekker, faute
// de `fma` en JavaScript.
function twoProduct(x: number, y: number): [number, number] {
  const hi = x * y
  const tx = x * DEKKER_SPLIT
  const xh = tx - (tx - x)
  const xl = x - xh
  const ty = y * DEKKER_SPLIT
  const yh = ty - (ty - y)
  const yl = y - yh
  return [hi, xh * yh - hi + xh * yl + xl * yh + xl * yl]
}

// `x ** 3` passe par `pow()` de la libm côté Python et par une approximation
// moins fine côté V8 : un cube sur dix diffère d'un ulp. On somme donc le cube
// en double-double, ce qui donne l'arrondi correct.
function cube(x: number) {
  const [square, squareErr] = twoProduct(x, x)
  const [hi, lo] = twoProduct(square, x)
  return hi + (lo + squareErr * x)
}

// `math.hypot` de CPython met la norme à l'échelle puis corrige l'arrondi par un
// pas de Newton ; `Math.hypot` de V8 non. Un tiers des longueurs de corde
// tomberaient à un ulp près, et les Béziers du jumeau ne seraient plus celles du
// backend.
function hypot(dx: number, dy: number) {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const max = Math.max(ax, ay)
  if (!Number.isFinite(max) || max === 0) return max
  let exponent = Math.floor(Math.log2(max)) + 1
  while (max * 2 ** -exponent >= 1) exponent += 1
  while (max * 2 ** -exponent < 0.5) exponent -= 1
  const scale = 2 ** -exponent
  let csum = 1
  let frac1 = 0
  let frac2 = 0
  const accumulate = (value: number) => {
    const [hi, lo] = twoProduct(value, value)
    const total = csum + hi
    frac2 += csum - total + hi
    csum = total
    frac1 += lo
  }
  accumulate(ax * scale)
  accumulate(ay * scale)
  let h = Math.sqrt(csum - 1 + (frac1 + frac2))
  const [hi, lo] = twoProduct(-h, h)
  const total = csum + hi
  frac2 += csum - total + hi
  csum = total
  frac1 += lo
  h += (csum - 1 + (frac1 + frac2)) / (2 * h)
  return h / scale
}

export function makeCommand(cmd: number, args: CommandArg[] = []): Command {
  const raw = [...args]
  while (raw.length < N_ARGS) raw.push(null)
  return { cmd, args: raw.slice(0, N_ARGS) }
}

export function commandEnd(command: Command): Point {
  const [, , , , x, y] = command.args
  return [x == null ? 0 : x, y == null ? 0 : y]
}

export function commandPayload(command: Command): CommandPayload {
  return { cmd: CMD_TOKENS[command.cmd], args: [...command.args] }
}

export function moveTo(x: number, y: number) {
  return makeCommand(CMD_MOVE, [null, null, null, null, x, y])
}

export function lineTo(x: number, y: number) {
  return makeCommand(CMD_LINE, [null, null, null, null, x, y])
}

export function cubicTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
  return makeCommand(CMD_CUBIC, [x1, y1, x2, y2, x, y])
}

export function closePath() {
  return makeCommand(CMD_CLOSE)
}

// --- Normalisation -----------------------------------------------------------

/** Fenêtre → points du carré unité. x = rang, y = valeur (1 = max). */
export function normalizeWindow(values: number[]): Point[] {
  const n = values.length
  if (n === 0) return []
  if (n === 1) return [[0, 0.5]]
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo
  if (span <= 0) return values.map((_, i) => [i / (n - 1), 0.5] as Point)
  return values.map((value, i) => [i / (n - 1), (value - lo) / span] as Point)
}

/** Inverse de `normalizeWindow` sur l'axe des valeurs. */
export function denormalizeY(y: number, values: number[]) {
  if (!values.length) return 0
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo
  if (span <= 0) return lo
  return lo + y * span
}

// --- Points perceptuellement importants --------------------------------------

/** Indices des k points les plus saillants (distance verticale maximale). */
export function pips(points: Point[], k = 15): number[] {
  const n = points.length
  if (n === 0) return []
  if (n <= 2 || k <= 2) return [...new Set([0, n - 1])].sort((a, b) => a - b)
  const keep = [0, n - 1]
  while (keep.length < Math.min(k, n)) {
    let bestIdx = -1
    let bestDist = -1
    for (let slot = 0; slot < keep.length - 1; slot += 1) {
      const left = keep[slot]
      const right = keep[slot + 1]
      if (right - left < 2) continue
      const [x0, y0] = points[left]
      const [x1, y1] = points[right]
      const dx = x1 - x0
      for (let i = left + 1; i < right; i += 1) {
        const [x, y] = points[i]
        const onLine = dx === 0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / dx
        const dist = Math.abs(y - onLine)
        if (dist > bestDist) {
          bestDist = dist
          bestIdx = i
        }
      }
    }
    if (bestIdx < 0) break
    keep.push(bestIdx)
    keep.sort((a, b) => a - b)
  }
  return keep
}

// --- Ajustement de Béziers cubiques ------------------------------------------

function chordParams(points: Point[]): number[] {
  if (points.length < 2) return points.map(() => 0)
  const dists = [0]
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    total += hypot(x1 - x0, y1 - y0)
    dists.push(total)
  }
  if (total <= 0) return points.map((_, i) => i / (points.length - 1))
  return dists.map((d) => d / total)
}

/**
 * Points de contrôle d'une Bézier cubique ajustée aux moindres carrés.
 *
 * Les extrémités sont imposées (`points[0]`, dernier point) ; seuls les deux
 * points de contrôle intermédiaires sont résolus.
 */
export function fitCubic(points: Point[]): [Point, Point] {
  if (points.length < 2) {
    const p: Point = points.length ? points[0] : [0, 0]
    return [p, p]
  }
  const p0 = points[0]
  const p3 = points[points.length - 1]
  const thirds = (): [Point, Point] => [
    [p0[0] + (p3[0] - p0[0]) / 3, p0[1] + (p3[1] - p0[1]) / 3],
    [p0[0] + (2 * (p3[0] - p0[0])) / 3, p0[1] + (2 * (p3[1] - p0[1])) / 3],
  ]
  if (points.length === 2) return thirds()
  const us = chordParams(points)
  let c11 = 0
  let c12 = 0
  let c22 = 0
  const x1 = [0, 0]
  const x2 = [0, 0]
  points.forEach((point, i) => {
    const u = us[i]
    const mt = 1 - u
    const b0 = cube(mt)
    const b1 = 3 * u * mt * mt
    const b2 = 3 * u * u * mt
    const b3 = cube(u)
    c11 += b1 * b1
    c12 += b1 * b2
    c22 += b2 * b2
    const rx = point[0] - (b0 * p0[0] + b3 * p3[0])
    const ry = point[1] - (b0 * p0[1] + b3 * p3[1])
    x1[0] += b1 * rx
    x1[1] += b1 * ry
    x2[0] += b2 * rx
    x2[1] += b2 * ry
  })
  const det = c11 * c22 - c12 * c12
  if (Math.abs(det) < 1e-12) return thirds()
  return [
    [(c22 * x1[0] - c12 * x2[0]) / det, (c22 * x1[1] - c12 * x2[1]) / det],
    [(c11 * x2[0] - c12 * x1[0]) / det, (c11 * x2[1] - c12 * x1[1]) / det],
  ]
}

/** Chemin passant par les ancres, segments ajustés en cubiques si demandé. */
export function buildPath(
  points: Point[],
  anchors?: number[] | null,
  options: { cubic?: boolean } = {}
): Command[] {
  if (!points.length) return []
  const cubic = options.cubic ?? true
  const raw = anchors && anchors.length ? anchors : points.map((_, i) => i)
  const idx = [...new Set(raw.map((i) => Math.max(0, Math.min(points.length - 1, i))))].sort(
    (a, b) => a - b
  )
  if (idx.length < 2) return [moveTo(...points[idx.length ? idx[0] : 0])]
  const commands = [moveTo(...points[idx[0]])]
  for (let slot = 0; slot < idx.length - 1; slot += 1) {
    const left = idx[slot]
    const right = idx[slot + 1]
    const target = points[right]
    if (!cubic || right - left < 2) {
      commands.push(lineTo(...target))
      continue
    }
    const [c1, c2] = fitCubic(points.slice(left, right + 1))
    commands.push(cubicTo(c1[0], c1[1], c2[0], c2[1], target[0], target[1]))
  }
  return commands
}

export function polylinePath(points: Point[]): Command[] {
  if (!points.length) return []
  return [moveTo(...points[0]), ...points.slice(1).map((p) => lineTo(...p))]
}

// --- Groupe de chemins -------------------------------------------------------

export type GroupPivot = { index: number; type?: string }

export type PathGroup = {
  points: Point[]
  anchors: number[]
  paths: Command[][]
  roles: PathRole[]
}

/**
 * Groupe multi-chemins d'une fenêtre : courbe, enveloppes, activité.
 *
 * C'est la hiérarchie que le transformer encode : chemins d'abord, groupe
 * ensuite. Les enveloppes portent la topologie des pivots (épaules à même
 * niveau, résistance plate), l'activité porte la règle d'or.
 */
export function buildGroup(
  values: number[],
  options: {
    activity?: number[] | null
    pivots?: GroupPivot[] | null
    k?: number
    cubic?: boolean
  } = {}
): PathGroup {
  const { activity = null, pivots = null } = options
  const k = options.k ?? 15
  const cubic = options.cubic ?? true
  const points = normalizeWindow(values)
  const anchors = pips(points, k)
  const paths: Command[][] = [buildPath(points, anchors, { cubic })]
  const roles: PathRole[] = ["curve"]

  const highs: Point[] = []
  const lows: Point[] = []
  for (const pivot of pivots ?? []) {
    const i = pivot.index
    if (i >= 0 && i < points.length) (pivot.type === "H" ? highs : lows).push(points[i])
  }
  if (highs.length >= 2) {
    paths.push(polylinePath(highs))
    roles.push("upper")
  }
  if (lows.length >= 2) {
    paths.push(polylinePath(lows))
    roles.push("lower")
  }
  if (activity != null && activity.length >= 2) {
    const actPoints = normalizeWindow(activity.slice(0, values.length))
    const actAnchors = pips(actPoints, Math.max(4, Math.floor(k / 2)))
    paths.push(buildPath(actPoints, actAnchors, { cubic: false }))
    roles.push("activity")
  }

  return {
    points,
    anchors,
    paths: paths.slice(0, MAX_PATHS),
    roles: roles.slice(0, MAX_PATHS),
  }
}

// --- Tokenisation ------------------------------------------------------------

export function quantize(value: CommandArg, bins = ARG_BINS) {
  if (value == null) return ARG_NONE
  const clamped = Math.max(0, Math.min(1, value))
  return roundHalfEven(clamped * (bins - 1)) + 1
}

export function dequantize(token: number, bins = ARG_BINS): number | null {
  if (token <= ARG_NONE) return null
  return (token - 1) / (bins - 1)
}

export type PathTokens = {
  commands: number[]
  args: number[][]
  length: number
}

export type GroupTokens = {
  commands: number[][]
  args: number[][][]
  lengths: number[]
  path_mask: number[]
  roles: string[]
}

/** Un chemin → identifiants de commandes et arguments quantifiés, avec SOS/EOS. */
export function tokenizePath(commands: Command[], maxCmds = MAX_CMDS): PathTokens {
  const cmds = [CMD_SOS]
  const args: number[][] = [Array(N_ARGS).fill(ARG_NONE)]
  for (const command of commands.slice(0, maxCmds - 2)) {
    cmds.push(command.cmd)
    args.push(command.args.map((a) => quantize(a)))
  }
  cmds.push(CMD_EOS)
  args.push(Array(N_ARGS).fill(ARG_NONE))
  const length = cmds.length
  while (cmds.length < maxCmds) {
    cmds.push(CMD_PAD)
    args.push(Array(N_ARGS).fill(ARG_NONE))
  }
  return { commands: cmds, args, length }
}

/** Groupe → tenseurs de tokens prêts pour le transformer hiérarchique. */
export function tokenizeGroup(
  group: { paths?: Command[][]; roles?: readonly string[] },
  options: { maxCmds?: number; maxPaths?: number } = {}
): GroupTokens {
  const maxCmds = options.maxCmds ?? MAX_CMDS
  const maxPaths = options.maxPaths ?? MAX_PATHS
  const paths = (group.paths ?? []).slice(0, maxPaths)
  const commands: number[][] = []
  const args: number[][][] = []
  const lengths: number[] = []
  for (const path of paths) {
    const token = tokenizePath(path, maxCmds)
    commands.push(token.commands)
    args.push(token.args)
    lengths.push(token.length)
  }
  const pathMask = paths.map(() => 1)
  while (commands.length < maxPaths) {
    commands.push(Array(maxCmds).fill(CMD_PAD))
    args.push(Array.from({ length: maxCmds }, () => Array(N_ARGS).fill(ARG_NONE)))
    lengths.push(0)
    pathMask.push(0)
  }
  return { commands, args, lengths, path_mask: pathMask, roles: [...(group.roles ?? [])] }
}

// --- Sortie SVG --------------------------------------------------------------

function fixed(value: number, precision: number) {
  return roundHalfEven(value, precision).toFixed(precision)
}

/** Attribut `d` d'un chemin. `flipY` remet l'axe des valeurs vers le haut. */
export function toSvgD(
  commands: Command[],
  options: { width?: number; height?: number; flipY?: boolean; precision?: number } = {}
) {
  const width = options.width ?? 1
  const height = options.height ?? 1
  const flipY = options.flipY ?? true
  const precision = options.precision ?? 4

  const fx = (x: CommandArg) => fixed((x == null ? 0 : x) * width, precision)
  const fy = (y: CommandArg) => {
    const v = y == null ? 0 : y
    return fixed((flipY ? 1 - v : v) * height, precision)
  }

  const parts: string[] = []
  for (const command of commands) {
    const a = command.args
    if (command.cmd === CMD_MOVE) parts.push(`M ${fx(a[4])} ${fy(a[5])}`)
    else if (command.cmd === CMD_LINE) parts.push(`L ${fx(a[4])} ${fy(a[5])}`)
    else if (command.cmd === CMD_CUBIC) {
      parts.push(`C ${fx(a[0])} ${fy(a[1])} ${fx(a[2])} ${fy(a[3])} ${fx(a[4])} ${fy(a[5])}`)
    } else if (command.cmd === CMD_CLOSE) parts.push("Z")
  }
  return parts.join(" ")
}

export function groupToSvg(
  group: { paths?: Command[][]; roles?: readonly string[] },
  options: { width?: number; height?: number } = {}
) {
  const width = options.width ?? 256
  const height = options.height ?? 128
  const paths = group.paths ?? []
  const roles = group.roles ?? []
  return paths.map((path, i) => ({
    role: i < roles.length ? roles[i] : `path${i}`,
    d: toSvgD(path, { width, height }),
  }))
}

/** Lecture d'un `d` normalisé (M/L/C/Z, coordonnées absolues dans [0, 1]). */
export function parseSvgD(d: string, options: { flipY?: boolean } = {}): Command[] {
  const flipY = options.flipY ?? true
  const tokens = d.replace(/,/g, " ").split(/\s+/).filter((token) => token.length > 0)
  const commands: Command[] = []
  let i = 0

  const take = (count: number) => {
    const out: number[] = []
    while (out.length < count && i < tokens.length) {
      const value = Number(tokens[i])
      if (Number.isNaN(value)) break
      out.push(value)
      i += 1
    }
    return out
  }

  const convY = (y: number) => (flipY ? 1 - y : y)

  while (i < tokens.length) {
    const head = tokens[i].toUpperCase()
    i += 1
    if (head === "M") {
      const xs = take(2)
      if (xs.length === 2) commands.push(moveTo(xs[0], convY(xs[1])))
    } else if (head === "L") {
      const xs = take(2)
      if (xs.length === 2) commands.push(lineTo(xs[0], convY(xs[1])))
    } else if (head === "C") {
      const xs = take(6)
      if (xs.length === 6) {
        commands.push(cubicTo(xs[0], convY(xs[1]), xs[2], convY(xs[3]), xs[4], convY(xs[5])))
      }
    } else if (head === "Z") {
      commands.push(closePath())
    }
  }
  return commands
}

/** Échantillonne un chemin en points — pour le DTW et les croquis libres. */
export function sampleCommands(commands: Command[], count = 64): Point[] {
  if (!commands.length) return []
  const dense: Point[] = []
  let cursor: Point = commands[0].cmd === CMD_MOVE ? commandEnd(commands[0]) : [0, 0]
  dense.push(cursor)
  for (const command of commands) {
    if (command.cmd === CMD_MOVE) {
      cursor = commandEnd(command)
      dense.push(cursor)
    } else if (command.cmd === CMD_LINE) {
      const target = commandEnd(command)
      for (let step = 1; step < 9; step += 1) {
        const t = step / 8
        dense.push([
          cursor[0] + (target[0] - cursor[0]) * t,
          cursor[1] + (target[1] - cursor[1]) * t,
        ])
      }
      cursor = target
    } else if (command.cmd === CMD_CUBIC) {
      const p0 = cursor
      const p1: Point = [command.args[0] ?? 0, command.args[1] ?? 0]
      const p2: Point = [command.args[2] ?? 0, command.args[3] ?? 0]
      const p3 = commandEnd(command)
      for (let step = 1; step < 17; step += 1) {
        const t = step / 16
        const mt = 1 - t
        dense.push([
          cube(mt) * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + cube(t) * p3[0],
          cube(mt) * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + cube(t) * p3[1],
        ])
      }
      cursor = p3
    }
  }
  if (dense.length <= count) return dense
  const stride = (dense.length - 1) / (count - 1)
  return Array.from(
    { length: count },
    (_, i) => dense[Math.min(dense.length - 1, roundHalfEven(i * stride))]
  )
}

/** Ré-échantillonnage linéaire — sert aux déformations temporelles. */
export function resampleValues(values: number[], count: number): number[] {
  const n = values.length
  if (n === 0 || count <= 0) return []
  if (n === 1) return Array(count).fill(values[0])
  if (count === 1) return [values[0]]
  const out: number[] = []
  for (let i = 0; i < count; i += 1) {
    const pos = (i * (n - 1)) / (count - 1)
    const left = Math.floor(pos)
    const right = Math.min(n - 1, left + 1)
    const frac = pos - left
    out.push(values[left] * (1 - frac) + values[right] * frac)
  }
  return out
}
