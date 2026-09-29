import { parseC4, type SchemaNodeKind } from "./parse.ts"

/** Fond du lecteur. Les libellés de lien Mermaid naissent en #444 : illisibles ici. */
export const SCHEMA_CANVAS = "#101826"
export const SCHEMA_INK = "#F7F4EE"
export const SCHEMA_LINE = "#D7E2F0"
export const SCHEMA_INK_DARK = "#121820"
export const SCHEMA_PAPER = "#E7EEF7"

const PALETTE: Record<SchemaNodeKind, { bg: string; font: string; border: string } | null> = {
  person: { bg: "#0B3A72", font: "#FFFFFF", border: "#9EC0EE" },
  system: { bg: "#0E5CAD", font: "#FFFFFF", border: "#A9CBF2" },
  container: { bg: "#1A6BB8", font: "#FFFFFF", border: "#B7D4F5" },
  component: { bg: "#D7E8FA", font: SCHEMA_INK_DARK, border: "#3E6EA8" },
  external: { bg: SCHEMA_PAPER, font: SCHEMA_INK_DARK, border: "#4C6078" },
  boundary: null,
  step: null,
}

const BOUNDARY_BORDER = "#C5D4EA"

export function contrastRatio(a: string, b: string) {
  const channel = (hex: string, index: number) => {
    const value = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2)
  const [hi, lo] = [luminance(a), luminance(b)].sort((left, right) => right - left)
  return (hi + 0.05) / (lo + 0.05)
}

export function prepareDiagramSource(source: string) {
  const trimmed = source.trim()
  if (!/^C4(Context|Container|Component|Dynamic|Deployment)\b/m.test(trimmed)) return trimmed
  if (trimmed.includes("UpdateElementStyle(") || trimmed.includes("UpdateRelStyle(")) return trimmed
  const { nodes, links } = parseC4(trimmed)
  const lines: string[] = []
  for (const node of nodes) {
    const colors = PALETTE[node.kind]
    if (colors) {
      lines.push(`UpdateElementStyle(${node.alias}, "${colors.bg}", "${colors.font}", "${colors.border}")`)
    } else if (node.kind === "boundary") {
      lines.push(`UpdateElementStyle(${node.alias}, $borderColor="${BOUNDARY_BORDER}")`)
    }
  }
  for (const link of links) {
    lines.push(`UpdateRelStyle(${link.from}, ${link.to}, "${SCHEMA_INK}", "${SCHEMA_LINE}")`)
  }
  return `${trimmed}\n${lines.join("\n")}`
}

function pinSvgSize(svg: string) {
  const box = svg.match(/viewBox="\s*[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)\s*"/)
  if (!box) return svg
  const width = Number(box[1])
  const height = Number(box[2])
  if (!Number.isFinite(width) || !Number.isFinite(height)) return svg
  return svg.replace(/<svg\b([^>]*)>/, (_full, attrs: string) => {
    const cleaned = attrs.replace(/\s(?:width|height|style)="[^"]*"/g, "")
    return `<svg width="${width}" height="${height}"${cleaned}>`
  })
}

function paintMarkers(svg: string) {
  return svg.replace(/<marker\b[\s\S]*?<\/marker>/g, (marker) =>
    marker.replace(/<path\b([^>]*?)\/?\s*>/g, (_tag, attrs: string) => {
      const cleaned = attrs.replace(/\s(?:fill|stroke)="[^"]*"/g, "").replace(/\s*\/\s*$/, "")
      return `<path fill="${SCHEMA_LINE}" stroke="${SCHEMA_LINE}"${cleaned} />`
    })
  )
}

function labelPlate(attrs: string, inner: string) {
  const x = Number(attrs.match(/\bx="([\d.+\-eE]+)"/)?.[1])
  const y = Number(attrs.match(/\by="([\d.+\-eE]+)"/)?.[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return ""
  const dy = Number(inner.match(/\bdy="([\d.+\-eE]+)"/)?.[1] ?? 0)
  const font = Number(attrs.match(/font-size:\s*([\d.]+)px/)?.[1] ?? attrs.match(/\bfont-size="([\d.]+)"/)?.[1] ?? 15)
  const lines = [...inner.matchAll(/<tspan\b[^>]*>([^<]*)<\/tspan>/g)].map((match) => match[1])
  const plain = (lines.length ? lines : [inner.replace(/<[^>]+>/g, "")]).map((line) => line.trim()).filter(Boolean)
  const longest = Math.max(...plain.map((line) => line.length), 1)
  const width = longest * font * 0.54 + 10
  const height = Math.max(plain.length, 1) * font * 1.15 + 6
  const centerY = y + (Number.isFinite(dy) ? dy : 0)
  const left = (x - width / 2).toFixed(1)
  const top = (centerY - height / 2).toFixed(1)
  return `<rect data-schema-plate="1" x="${left}" y="${top}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="5" fill="${SCHEMA_CANVAS}" fill-opacity="0.94" />`
}

/** Éclaircit les libellés laissés en #444 et pose une plaque sous chaque lien. */
export function liftDiagramContrast(svg: string) {
  let next = svg.replace(/<script[\s\S]*?<\/script>/gi, "")
  next = next.replace(/<text\b([^>]*)>/g, (full, attrs: string) => {
    if (/\bfill\s*=/.test(attrs) || /fill\s*:/.test(attrs)) return full
    return `<text class="schema-title" fill="${SCHEMA_INK}" font-size="20" font-weight="650"${attrs}>`
  })
  next = next.replaceAll('fill="#444444"', `fill="${SCHEMA_INK}"`)
  next = next.replaceAll("fill:#444444", `fill:${SCHEMA_INK}`)
  next = next.replaceAll('stroke="#444444"', `stroke="${SCHEMA_LINE}"`)
  next = next.replaceAll("stroke:#444444", `stroke:${SCHEMA_LINE}`)
  next = next.replace(/<text\b([^>]*\bfill="#F7F4EE"[^>]*)>([\s\S]*?)<\/text>/g, (full, attrs: string, inner: string) => {
    if (/\bclass="schema-title"/.test(attrs)) return full
    const ink = "font-weight:650;paint-order:stroke;stroke:#0c1422;stroke-width:3.5px;"
    const emphasized = /style="/.test(attrs) ? attrs.replace(/style="/, `style="${ink}`) : ` style="${ink}"${attrs}`
    return `${labelPlate(attrs, inner)}<text${emphasized}>${inner}</text>`
  })
  next = paintMarkers(pinSvgSize(next))
  return next
}

export const SCHEMA_MERMAID = {
  startOnLoad: false,
  securityLevel: "antiscript" as const,
  theme: "base" as const,
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  themeVariables: {
    darkMode: true,
    background: SCHEMA_CANVAS,
    fontSize: "16px",
    primaryColor: "#1B4F8A",
    primaryTextColor: SCHEMA_INK,
    primaryBorderColor: "#9EBFEE",
    secondaryColor: SCHEMA_PAPER,
    secondaryTextColor: SCHEMA_INK_DARK,
    secondaryBorderColor: "#4C6078",
    tertiaryColor: "#24344A",
    tertiaryTextColor: SCHEMA_INK,
    tertiaryBorderColor: "#9BB0CC",
    lineColor: SCHEMA_LINE,
    textColor: SCHEMA_INK,
    mainBkg: "#1B4F8A",
    nodeBorder: "#9EBFEE",
    nodeTextColor: SCHEMA_INK,
    clusterBkg: "#152033",
    clusterBorder: "#9BB0CC",
    titleColor: SCHEMA_INK,
    edgeLabelBackground: SCHEMA_CANVAS,
    actorBkg: "#1B4F8A",
    actorTextColor: SCHEMA_INK,
    actorBorder: "#9EBFEE",
    actorLineColor: SCHEMA_LINE,
    signalColor: SCHEMA_LINE,
    signalTextColor: SCHEMA_INK,
    labelBoxBkgColor: SCHEMA_CANVAS,
    labelTextColor: SCHEMA_INK,
    loopTextColor: SCHEMA_INK,
    noteBkgColor: "#2C2618",
    noteTextColor: SCHEMA_INK,
    noteBorderColor: "#E6C56A",
    activationBkgColor: "#1B4F8A",
    activationBorderColor: "#9EBFEE",
    sequenceNumberColor: SCHEMA_INK,
  },
  flowchart: {
    htmlLabels: false,
    useMaxWidth: false,
    wrappingWidth: 240,
    curve: "basis" as const,
    nodeSpacing: 40,
    rankSpacing: 48,
  },
  sequence: {
    useMaxWidth: false,
    actorFontSize: 16,
    messageFontSize: 15,
    noteFontSize: 15,
    diagramMarginX: 16,
    diagramMarginY: 16,
  },
  c4: {
    useMaxWidth: false,
    fontSize: 16,
    wrap: true,
    textPlacement: "tspan",
    diagramMarginX: 48,
    diagramMarginY: 28,
    ...c4FontSizes(16),
  },
}

function c4FontSizes(size: number) {
  const types = [
    "person",
    "external_person",
    "system",
    "external_system",
    "system_db",
    "external_system_db",
    "system_queue",
    "external_system_queue",
    "container",
    "external_container",
    "container_db",
    "external_container_db",
    "container_queue",
    "external_container_queue",
    "component",
    "external_component",
    "component_db",
    "external_component_db",
    "component_queue",
    "external_component_queue",
    "boundary",
    "message",
  ]
  return Object.fromEntries(types.map((type) => [`${type}FontSize`, size]))
}
