import { labLabel, type DiagnosticSnapshot } from "@/lib/capture/snapshot"
import { threadFileSlug, type IaThread } from "@/lib/ia/threads"
import { providerLabel } from "@/lib/ia/models"
import { groupIaTurns } from "@/lib/ia/turns"

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function metaRows(snapshot: DiagnosticSnapshot) {
  const rows: Array<[string, string]> = [
    ["Laboratoire", `${labLabel(snapshot.lab)}${snapshot.tab ? ` · ${snapshot.tab}` : ""}`],
    ["Route", snapshot.route],
    ["Capturé", snapshot.capturedAt],
    ["Git", snapshot.gitSha || "—"],
    [
      "Archive",
      [
        snapshot.archive.n != null ? `${snapshot.archive.n} tirages` : null,
        snapshot.archive.from && snapshot.archive.to
          ? `${snapshot.archive.from} → ${snapshot.archive.to}`
          : snapshot.archive.latest
            ? `dernier ${snapshot.archive.latest}`
            : null,
        snapshot.archive.source,
        snapshot.archive.stale ? "en retard" : null,
      ]
        .filter(Boolean)
        .join(" · ") || "—",
    ],
  ]
  return rows
    .map(
      ([label, value]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
    )
    .join("")
}

export function snapshotReportHtml(snapshot: DiagnosticSnapshot) {
  const summary = snapshot.summary.map((line) => `<li>${escapeHtml(line)}</li>`).join("")
  const tech = escapeHtml(JSON.stringify(snapshot.tech, null, 2))
  const image = snapshot.imageDataUrl || snapshot.thumbDataUrl
    ? `<img alt="Capture de l’écran" src="${snapshot.imageDataUrl || snapshot.thumbDataUrl}" />`
    : "<p class='muted'>Pas d’image (capture visuelle indisponible).</p>"
  const question = snapshot.question.trim() || "—"
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Synchro — capture de lecture</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #1b2030; background: #fff; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    h2 { font-size: 14px; margin: 24px 0 8px; }
    p, li { font-size: 13px; line-height: 1.45; }
    .muted { color: #5b6475; font-size: 12px; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; }
    th, td { border-bottom: 1px solid #d8dee8; text-align: left; padding: 6px 8px; font-size: 12px; vertical-align: top; }
    th { width: 8rem; color: #5b6475; font-weight: 600; }
    img { max-width: 100%; border: 1px solid #d8dee8; border-radius: 8px; }
    pre { font-size: 11px; background: #f4f6fa; padding: 12px; border-radius: 8px; overflow: auto; white-space: pre-wrap; }
    .banner { padding: 10px 12px; background: #fff6d8; border: 1px solid #ead37a; border-radius: 8px; font-size: 12px; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>Synchro — capture de lecture</h1>
  <p class="muted">Rapport généré depuis l’interface. Imprimer ou enregistrer en PDF via le dialogue du navigateur.</p>
  <p class="banner">${escapeHtml(snapshot.disclaimer)}</p>
  <h2>Contexte</h2>
  <table>${metaRows(snapshot)}</table>
  <h2>Question</h2>
  <p>${escapeHtml(question)}</p>
  <h2>Résumé technique</h2>
  <ul>${summary || "<li>—</li>"}</ul>
  <h2>Visuel</h2>
  ${image}
  <h2>Données sous-jacentes</h2>
  <pre>${tech}</pre>
</body>
</html>`
}

function reportStyles() {
  return `
    :root { color-scheme: light; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #1b2030; background: #fff; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    h2 { font-size: 14px; margin: 24px 0 8px; }
    h3 { font-size: 13px; margin: 16px 0 6px; }
    p, li { font-size: 13px; line-height: 1.45; }
    .muted { color: #5b6475; font-size: 12px; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; }
    th, td { border-bottom: 1px solid #d8dee8; text-align: left; padding: 6px 8px; font-size: 12px; vertical-align: top; }
    th { width: 8rem; color: #5b6475; font-weight: 600; }
    img { max-width: 100%; border: 1px solid #d8dee8; border-radius: 8px; }
    pre { font-size: 11px; background: #f4f6fa; padding: 12px; border-radius: 8px; overflow: auto; white-space: pre-wrap; }
    .banner { padding: 10px 12px; background: #fff6d8; border: 1px solid #ead37a; border-radius: 8px; font-size: 12px; }
    .msg { padding: 10px 12px; border-radius: 8px; margin: 8px 0; white-space: pre-wrap; }
    .msg.user { background: #eef2ff; }
    .msg.assistant { background: #f4f6fa; }
    .compare { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media print { body { margin: 12px; } .compare { break-inside: avoid; } }
  `
}

export function printHtml(html: string, filename: string) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=720")
  if (!popup) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
    return
  }
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
  popup.focus()
  const trigger = () => {
    popup.print()
  }
  if (popup.document.readyState === "complete") {
    window.setTimeout(trigger, 250)
  } else {
    popup.addEventListener("load", () => window.setTimeout(trigger, 250), { once: true })
  }
}

export function printSnapshot(snapshot: DiagnosticSnapshot) {
  printHtml(snapshotReportHtml(snapshot), `synchro-capture-${snapshot.id}.html`)
}

function speakerHtml(message: { role: string; model?: string; provider?: "google" | "openai" }) {
  if (message.role === "user") return "Toi"
  return `${providerLabel(message.provider ?? "google")}${message.model ? ` · ${escapeHtml(message.model)}` : ""}`
}

export function threadReportHtml(thread: IaThread) {
  const snapshot = thread.snapshot
  const summary = snapshot.summary.map((line) => `<li>${escapeHtml(line)}</li>`).join("")
  const image = snapshot.imageDataUrl || snapshot.thumbDataUrl
    ? `<img alt="Capture de l’écran" src="${snapshot.imageDataUrl || snapshot.thumbDataUrl}" />`
    : "<p class='muted'>Pas d’image (capture visuelle indisponible).</p>"
  const turns = groupIaTurns(thread.messages)
  const conversation = turns.length
    ? turns
        .map((turn) => {
          if (turn.kind === "user") {
            return `<h3>Toi</h3><div class="msg user">${escapeHtml(turn.message.content)}</div>`
          }
          if (turn.kind === "compare") {
            const b = turn.b
              ? `<div><h3>B · ${speakerHtml(turn.b)}</h3><div class="msg assistant">${escapeHtml(turn.b.content)}</div></div>`
              : ""
            return `<h3>Comparaison</h3><div class="compare"><div><h3>A · ${speakerHtml(turn.a)}</h3><div class="msg assistant">${escapeHtml(turn.a.content)}</div></div>${b}</div>`
          }
          return `<h3>${speakerHtml(turn.message)}</h3><div class="msg assistant">${escapeHtml(turn.message.content)}</div>`
        })
        .join("")
    : "<p class='muted'>Pas encore de réponse.</p>"
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Synchro — ${escapeHtml(thread.title)}</title>
  <style>${reportStyles()}</style>
</head>
<body>
  <h1>${escapeHtml(thread.title)}</h1>
  <p class="muted">Lecture IA exportée depuis Synchro. Imprimer ou enregistrer en PDF via le dialogue du navigateur.</p>
  <p class="banner">${escapeHtml(snapshot.disclaimer)}</p>
  <h2>Contexte</h2>
  <table>${metaRows(snapshot)}</table>
  ${snapshot.question ? `<h2>Question</h2><p>${escapeHtml(snapshot.question)}</p>` : ""}
  <h2>Résumé technique</h2>
  <ul>${summary || "<li>—</li>"}</ul>
  <h2>Visuel</h2>
  ${image}
  <h2>Conversation</h2>
  ${conversation}
</body>
</html>`
}

export function printThread(thread: IaThread) {
  printHtml(threadReportHtml(thread), `${threadFileSlug(thread.title, thread.id)}.html`)
}
