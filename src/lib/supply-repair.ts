const SEVERITIES = [
  ["critical", "Critique"],
  ["high", "Haute"],
  ["medium", "Moyenne"],
  ["low", "Basse"],
  ["negligible", "Négligeable"],
  ["unknown", "Inconnue"],
] as const

export const REPAIR_INSTRUCTIONS =
  "Applique uniquement les paquets listés dans actions. Installe la version target quand elle est renseignée. Si target est null, choisis une version parmi candidate_fixes, sans en inventer d’autre. Respecte le style de contrainte déjà présent dans le fichier, pourvu que la version installée atteigne la cible. Ne modifie pas les paquets de blocked ni de external. Ne change pas le code applicatif pour contourner une faille. Ne touche pas à .env ni aux secrets. Après les montées, relance le scan Failles et vérifie que les avis corrigés ont disparu."

export type SupplyRepairFinding = {
  id: string
  severity: string
  package: string
  version: string
  ecosystem: string
  fix_version: string | null
  url: string | null
  summary: string
}

export type SupplyRepairReport = {
  generated_at: string
  tools: { syft: string | null; grype: string | null; db_built: string | null }
  counts: Record<string, number>
  sbom: { components: number; by_type: { npm?: number; python?: number; autre?: number } }
  findings: SupplyRepairFinding[]
  python_note: string | null
  errors: string[]
}

export type RepairAdvisory = {
  id: string
  severity: string
  summary: string
  url: string | null
  fix_version: string | null
}

export type RepairPackage = {
  ecosystem: string
  package: string
  version: string
  target: string | null
  candidate_fixes: string[]
  files: string[]
  advisories: RepairAdvisory[]
}

export type RepairDocument = {
  generated_at: string
  instructions: string
  tools: { syft: string | null; grype: string | null; db_built: string | null }
  counts: Record<string, number>
  components: number
  by_type: { npm: number; python: number; autre: number }
  python_note: string | null
  errors: string[]
  actions: RepairPackage[]
  blocked: RepairPackage[]
  external: RepairPackage[]
}

function severityLabel(id: string) {
  return SEVERITIES.find(([key]) => key === id)?.[1] ?? id
}

function severityRank(id: string) {
  const index = SEVERITIES.findIndex(([key]) => key === id)
  return index === -1 ? SEVERITIES.length : index
}

function ecosystemRank(id: string) {
  if (id === "npm") return 0
  if (id === "python") return 1
  return 2
}

function ecosystemLabel(id: string) {
  if (id === "npm") return "npm"
  if (id === "python") return "Python"
  return id === "autre" ? "autre" : id
}

function versionKey(version: string): number[] | null {
  const cleaned = version.trim().replace(/^v/i, "")
  if (!/^\d+(\.\d+)*$/.test(cleaned)) return null
  return cleaned.split(".").map((part) => Number(part))
}

function compareVersions(a: number[], b: number[]) {
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0)
    if (delta !== 0) return delta
  }
  return 0
}

function sortFixes(versions: Array<string | null | undefined>) {
  const unique = [...new Set(versions.map((item) => item?.trim() ?? "").filter(Boolean))]
  const keys = unique.map(versionKey)
  if (keys.every((key) => key != null)) {
    return unique
      .map((version, index) => ({ version, key: keys[index]! }))
      .sort((a, b) => compareVersions(a.key, b.key))
      .map((item) => item.version)
  }
  return unique.sort((a, b) => a.localeCompare(b))
}

function preferredFix(versions: string[]) {
  if (versions.length === 0) return null
  if (versions.length === 1) return versions[0]
  if (versions.every((item) => versionKey(item))) return versions[versions.length - 1]
  return null
}

function filesFor(ecosystem: string) {
  if (ecosystem === "npm") return ["package.json", "package-lock.json"]
  if (ecosystem === "python") return ["requirements*.txt"]
  return []
}

function cleanSummary(value: string) {
  return value.replace(/\s+/g, " ").replace(/```/g, "'''").trim()
}

function safeUrl(url: string | null) {
  if (!url) return null
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) return null
  return trimmed
}

function code(value: string) {
  return value.replace(/[`\r\n]/g, "'").trim()
}

function dash(value: string | null | undefined) {
  const text = value?.trim()
  return text ? text : "—"
}

function advisoryLink(id: string, url: string | null) {
  const safeId = id.replace(/[\[\]]/g, "")
  if (!url || /[\s()]/.test(url)) return url ? `${safeId} — ${url}` : safeId
  return `[${safeId}](${url})`
}

function worstSeverity(item: RepairPackage) {
  return item.advisories.reduce(
    (top, advisory) => (severityRank(advisory.severity) < severityRank(top) ? advisory.severity : top),
    item.advisories[0]?.severity ?? "unknown",
  )
}

function buildPackages(findings: SupplyRepairFinding[]) {
  const groups = new Map<string, SupplyRepairFinding[]>()
  for (const finding of findings) {
    const key = `${finding.ecosystem}\0${finding.package}\0${finding.version}`
    const current = groups.get(key)
    if (current) current.push(finding)
    else groups.set(key, [finding])
  }
  const packages: RepairPackage[] = []
  for (const items of groups.values()) {
    const first = items[0]
    const advisories = [...items]
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.id.localeCompare(b.id))
      .map((item) => ({
        id: item.id,
        severity: item.severity,
        summary: cleanSummary(item.summary),
        url: safeUrl(item.url),
        fix_version: item.fix_version?.trim() || null,
      }))
    const candidate_fixes = sortFixes(advisories.map((item) => item.fix_version))
    packages.push({
      ecosystem: first.ecosystem,
      package: first.package,
      version: first.version,
      target: preferredFix(candidate_fixes),
      candidate_fixes,
      files: filesFor(first.ecosystem),
      advisories,
    })
  }
  packages.sort(
    (a, b) =>
      severityRank(worstSeverity(a)) - severityRank(worstSeverity(b)) ||
      ecosystemRank(a.ecosystem) - ecosystemRank(b.ecosystem) ||
      a.package.localeCompare(b.package) ||
      a.version.localeCompare(b.version),
  )
  return packages
}

export function repairDocument(report: SupplyRepairReport): RepairDocument {
  const actions: RepairPackage[] = []
  const blocked: RepairPackage[] = []
  const external: RepairPackage[] = []
  for (const item of buildPackages(report.findings)) {
    if (item.ecosystem !== "npm" && item.ecosystem !== "python") external.push(item)
    else if (item.candidate_fixes.length > 0) actions.push(item)
    else blocked.push(item)
  }
  const counts: Record<string, number> = {}
  for (const [id] of SEVERITIES) counts[id] = report.counts[id] ?? 0
  return {
    generated_at: report.generated_at,
    instructions: REPAIR_INSTRUCTIONS,
    tools: {
      syft: report.tools.syft,
      grype: report.tools.grype,
      db_built: report.tools.db_built,
    },
    counts,
    components: report.sbom.components,
    by_type: {
      npm: report.sbom.by_type.npm ?? 0,
      python: report.sbom.by_type.python ?? 0,
      autre: report.sbom.by_type.autre ?? 0,
    },
    python_note: report.python_note,
    errors: report.errors,
    actions,
    blocked,
    external,
  }
}

export function repairJson(report: SupplyRepairReport) {
  return JSON.stringify(repairDocument(report), null, 2)
}

function pushPackage(lines: string[], item: RepairPackage, kind: "action" | "blocked" | "external") {
  lines.push(`### \`${code(item.package) || "—"}\``, "")
  lines.push(`- Écosystème : ${ecosystemLabel(item.ecosystem)}`)
  lines.push(`- Version actuelle : \`${code(item.version) || "—"}\``)
  if (kind === "action") {
    if (item.target) lines.push(`- Version cible : \`${code(item.target)}\``)
    else {
      const choices = item.candidate_fixes.map((version) => `\`${code(version)}\``).join(", ")
      lines.push(`- Version cible : à choisir parmi ${choices}`)
    }
  } else if (kind === "blocked") {
    lines.push("- Pas de correctif publié — ne pas inventer de version")
  } else if (item.target) {
    lines.push(`- Correctif connu : \`${code(item.target)}\` — ne pas modifier ce dépôt`)
  } else if (item.candidate_fixes.length > 0) {
    const choices = item.candidate_fixes.map((version) => `\`${code(version)}\``).join(", ")
    lines.push(`- Correctifs connus : ${choices} — ne pas modifier ce dépôt`)
  } else {
    lines.push("- Pas de correctif publié — composant hors dépôt")
  }
  if (item.files.length > 0) {
    lines.push(`- Fichiers : ${item.files.map((file) => `\`${code(file)}\``).join(", ")}`)
  }
  lines.push("- Avis :")
  for (const advisory of item.advisories) {
    const fix = advisory.fix_version
      ? `correctif \`${code(advisory.fix_version)}\``
      : "pas de correctif publié"
    const summary = advisory.summary ? ` — ${advisory.summary}` : ""
    lines.push(
      `  - ${advisoryLink(advisory.id, advisory.url)} — ${severityLabel(advisory.severity)} — ${fix}${summary}`,
    )
  }
  lines.push("")
}

export function repairMarkdown(report: SupplyRepairReport) {
  const doc = repairDocument(report)
  const lines = [
    "# Synchro — réparation des failles",
    "",
    `Brief à coller à une IA qui modifie ce dépôt. Relevé complet du ${doc.generated_at}, filtres de la carte ignorés.`,
    "",
    "## Mission",
    "",
    doc.instructions,
    "",
    "## Contexte",
    "",
    `- Relevé : ${doc.generated_at}`,
    `- Syft : ${dash(doc.tools.syft)}`,
    `- Grype : ${dash(doc.tools.grype)}`,
    `- Base Grype : ${dash(doc.tools.db_built)}`,
    `- Composants : ${doc.components} (npm ${doc.by_type.npm}, Python ${doc.by_type.python}, autre ${doc.by_type.autre})`,
    "",
    "| Sévérité | Nombre |",
    "| --- | --- |",
  ]
  for (const [id, label] of SEVERITIES) lines.push(`| ${label} | ${doc.counts[id] ?? 0} |`)
  lines.push("")
  if (doc.python_note) lines.push("## Couverture Python", "", doc.python_note, "")
  lines.push("## Correctifs publiés", "")
  if (doc.actions.length === 0) {
    lines.push(
      report.findings.length === 0
        ? "Aucune faille connue sur cet inventaire. Ne change aucune dépendance."
        : "Aucun correctif publié à appliquer dans ce dépôt.",
      "",
    )
  } else {
    for (const item of doc.actions) pushPackage(lines, item, "action")
  }
  if (doc.blocked.length > 0) {
    lines.push("## Sans correctif publié", "")
    for (const item of doc.blocked) pushPackage(lines, item, "blocked")
  }
  if (doc.external.length > 0) {
    lines.push("## Hors dépôt", "")
    for (const item of doc.external) pushPackage(lines, item, "external")
  }
  if (doc.errors.length > 0) {
    lines.push("## Lectures impossibles", "")
    for (const item of doc.errors) lines.push(`- ${item.replace(/\s+/g, " ").trim()}`)
    lines.push("")
  }
  lines.push("## Données", "", "```json", repairJson(report), "```", "")
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function packageHtml(item: RepairPackage, kind: "action" | "blocked" | "external") {
  const facts: string[] = [
    `<li>Écosystème : ${escapeHtml(ecosystemLabel(item.ecosystem))}</li>`,
    `<li>Version actuelle : <code>${escapeHtml(code(item.version) || "—")}</code></li>`,
  ]
  if (kind === "action") {
    facts.push(
      item.target
        ? `<li>Version cible : <code>${escapeHtml(code(item.target))}</code></li>`
        : `<li>Version cible : à choisir parmi ${item.candidate_fixes
            .map((version) => `<code>${escapeHtml(code(version))}</code>`)
            .join(", ")}</li>`,
    )
  } else if (kind === "blocked") {
    facts.push("<li>Pas de correctif publié — ne pas inventer de version</li>")
  } else if (item.target) {
    facts.push(
      `<li>Correctif connu : <code>${escapeHtml(code(item.target))}</code> — ne pas modifier ce dépôt</li>`,
    )
  } else if (item.candidate_fixes.length > 0) {
    facts.push(
      `<li>Correctifs connus : ${item.candidate_fixes
        .map((version) => `<code>${escapeHtml(code(version))}</code>`)
        .join(", ")} — ne pas modifier ce dépôt</li>`,
    )
  } else {
    facts.push("<li>Pas de correctif publié — composant hors dépôt</li>")
  }
  if (item.files.length > 0) {
    facts.push(
      `<li>Fichiers : ${item.files.map((file) => `<code>${escapeHtml(file)}</code>`).join(", ")}</li>`,
    )
  }
  const advisories = item.advisories
    .map((advisory) => {
      const label = escapeHtml(advisory.id)
      const link = advisory.url
        ? `<a href="${escapeHtml(advisory.url)}">${label}</a>`
        : label
      const fix = advisory.fix_version
        ? `correctif <code>${escapeHtml(code(advisory.fix_version))}</code>`
        : "pas de correctif publié"
      const summary = advisory.summary ? ` — ${escapeHtml(advisory.summary)}` : ""
      return `<li>${link} — ${escapeHtml(severityLabel(advisory.severity))} — ${fix}${summary}</li>`
    })
    .join("")
  return `<section class="pkg"><h3><code>${escapeHtml(code(item.package) || "—")}</code></h3><ul>${facts.join("")}<li>Avis :<ul>${advisories}</ul></li></ul></section>`
}

export function repairHtml(report: SupplyRepairReport) {
  const doc = repairDocument(report)
  const title = repairFilename(doc.generated_at, "html").replace(/\.html$/, "")
  const counts = SEVERITIES.map(
    ([id, label]) => `<tr><th>${label}</th><td>${doc.counts[id] ?? 0}</td></tr>`,
  ).join("")
  const actions =
    doc.actions.length === 0
      ? `<p>${
          report.findings.length === 0
            ? "Aucune faille connue sur cet inventaire. Ne change aucune dépendance."
            : "Aucun correctif publié à appliquer dans ce dépôt."
        }</p>`
      : doc.actions.map((item) => packageHtml(item, "action")).join("")
  const blocked =
    doc.blocked.length === 0
      ? ""
      : `<h2>Sans correctif publié</h2>${doc.blocked.map((item) => packageHtml(item, "blocked")).join("")}`
  const external =
    doc.external.length === 0
      ? ""
      : `<h2>Hors dépôt</h2>${doc.external.map((item) => packageHtml(item, "external")).join("")}`
  const note = doc.python_note ? `<h2>Couverture Python</h2><p class="note">${escapeHtml(doc.python_note)}</p>` : ""
  const errors =
    doc.errors.length === 0
      ? ""
      : `<h2>Lectures impossibles</h2><ul>${doc.errors
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")}</ul>`
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #1b2030; background: #fff; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    h2 { font-size: 15px; margin: 24px 0 8px; }
    h3 { font-size: 13px; margin: 0 0 6px; }
    p, li { font-size: 13px; line-height: 1.45; }
    .muted { color: #5b6475; font-size: 12px; }
    .note { padding: 10px 12px; background: #fff6d8; border: 1px solid #ead37a; border-radius: 8px; }
    table { border-collapse: collapse; width: 100%; max-width: 28rem; margin-top: 8px; }
    th, td { border-bottom: 1px solid #d8dee8; text-align: left; padding: 6px 8px; font-size: 12px; }
    th { width: 10rem; color: #5b6475; font-weight: 600; }
    code { font-family: ui-monospace, monospace; font-size: 12px; }
    pre { font-size: 11px; background: #f4f6fa; padding: 12px; border-radius: 8px; white-space: pre-wrap; }
    .pkg { break-inside: avoid; margin: 0 0 12px; padding: 8px 12px; border: 1px solid #d8dee8; border-radius: 8px; }
    a { color: #1b2030; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>Synchro — réparation des failles</h1>
  <p class="muted">Brief à coller à une IA qui modifie ce dépôt. Enregistrer en PDF depuis le dialogue d’impression. Relevé complet du ${escapeHtml(doc.generated_at)}, filtres de la carte ignorés.</p>
  <h2>Mission</h2>
  <p>${escapeHtml(doc.instructions)}</p>
  <h2>Contexte</h2>
  <table>
    <tr><th>Relevé</th><td>${escapeHtml(doc.generated_at)}</td></tr>
    <tr><th>Syft</th><td>${escapeHtml(dash(doc.tools.syft))}</td></tr>
    <tr><th>Grype</th><td>${escapeHtml(dash(doc.tools.grype))}</td></tr>
    <tr><th>Base Grype</th><td>${escapeHtml(dash(doc.tools.db_built))}</td></tr>
    <tr><th>Composants</th><td>${doc.components} (npm ${doc.by_type.npm}, Python ${doc.by_type.python}, autre ${doc.by_type.autre})</td></tr>
  </table>
  <table>${counts}</table>
  ${note}
  <h2>Correctifs publiés</h2>
  ${actions}
  ${blocked}
  ${external}
  ${errors}
  <h2>Données</h2>
  <pre>${escapeHtml(repairJson(report))}</pre>
</body>
</html>`
}

export function repairFilename(generatedAt: string, extension: "md" | "html") {
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(generatedAt.trim())?.[1]
  return `synchro-failles-${day ?? "releve"}.${extension}`
}

export function downloadRepairFile(filename: string, content: string, mime: string) {
  if (typeof document === "undefined") return
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
