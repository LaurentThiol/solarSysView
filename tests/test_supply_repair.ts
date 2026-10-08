import assert from "node:assert/strict"
import test from "node:test"

import {
  repairDocument,
  repairFilename,
  repairHtml,
  repairJson,
  repairMarkdown,
  type SupplyRepairReport,
} from "../src/lib/supply-repair.ts"

function finding(
  id: string,
  severity: string,
  name: string,
  version: string,
  ecosystem: string,
  fix: string | null,
  summary = "Un avis.",
): SupplyRepairReport["findings"][number] {
  return {
    id,
    severity,
    package: name,
    version,
    ecosystem,
    fix_version: fix,
    url: `https://example.test/${id}`,
    summary,
  }
}

function report(findings: SupplyRepairReport["findings"], extra: Partial<SupplyRepairReport> = {}): SupplyRepairReport {
  return {
    generated_at: "2026-10-07 18:00 UTC",
    tools: { syft: "1.20.0", grype: "0.87.0", db_built: "2026-10-06T03:04:05Z" },
    counts: { critical: 1, high: 1, medium: 1, low: 0, negligible: 0, unknown: 0 },
    sbom: { components: 4, by_type: { npm: 1, python: 2, autre: 1 } },
    findings,
    python_note: "Sans .venv, les requirements ne sont pas figés.",
    errors: [],
    ...extra,
  }
}

const SAMPLE = report([
  finding("GHSA-1", "high", "lodash", "4.17.20", "npm", "4.17.21", "Prototype pollution."),
  finding("GHSA-1b", "high", "lodash", "4.17.20", "npm", "4.17.22", "Second avis."),
  finding("GHSA-2", "critical", "fastapi", "0.115.0", "python", null),
  finding("CVE-3", "medium", "openssl", "3.0.0", "autre", "3.0.13"),
  finding("GHSA-4", "low", "leftpad", "1.0.0", "npm", "1.2.3"),
  finding("GHSA-4", "low", "leftpad", "1.1.0", "npm", "1.2.3"),
])

test("repair brief targets the highest published fix and leaves the rest alone", () => {
  const doc = repairDocument(SAMPLE)
  assert.equal(doc.actions[0].package, "lodash")
  assert.equal(doc.actions[0].target, "4.17.22")
  assert.deepEqual(doc.actions[0].candidate_fixes, ["4.17.21", "4.17.22"])
  assert.deepEqual(doc.actions[0].files, ["package.json", "package-lock.json"])
  const pads = doc.actions.filter((item) => item.package === "leftpad")
  assert.equal(pads.length, 2)
  assert.equal(pads[0].version, "1.0.0")
  assert.equal(pads[0].target, "1.2.3")
  assert.equal(doc.blocked[0].package, "fastapi")
  assert.equal(doc.blocked[0].target, null)
  assert.deepEqual(doc.blocked[0].files, ["requirements*.txt"])
  assert.equal(doc.external[0].package, "openssl")
  assert.equal(doc.external[0].target, "3.0.13")
  assert.deepEqual(doc.external[0].files, [])
  assert.match(doc.instructions, /actions/)
  assert.match(doc.instructions, /blocked/)
  assert.match(doc.instructions, /\.env/)
})

test("two versions of the same package stay split", () => {
  const doc = repairDocument(SAMPLE)
  const pads = [...doc.actions, ...doc.blocked, ...doc.external].filter((item) => item.package === "leftpad")
  assert.equal(pads.length, 2)
  assert.deepEqual(
    pads.map((item) => item.version).sort(),
    ["1.0.0", "1.1.0"],
  )
})

test("incomparable fixes stay a manual choice", () => {
  const doc = repairDocument(
    report([
      finding("GHSA-9", "high", "widget", "1.0.0", "npm", "1.2.3"),
      finding("GHSA-8", "medium", "widget", "1.0.0", "npm", "1.2.3rc1"),
    ]),
  )
  assert.equal(doc.actions[0].target, null)
  assert.deepEqual(doc.actions[0].candidate_fixes, ["1.2.3", "1.2.3rc1"])
})

test("markdown is a pasteable repair brief", () => {
  const text = repairMarkdown(SAMPLE)
  assert.equal(text.endsWith("\n"), true)
  assert.match(text, /^# Synchro — réparation des failles\n/)
  assert.doesNotMatch(text, /<!-- supply-chain -->/)
  assert.match(text, /Sans \.venv/)
  const fixes = text.split("## Sans correctif publié")[0]
  assert.match(fixes, /lodash/)
  assert.match(fixes, /Version cible : `4\.17\.22`/)
  assert.doesNotMatch(fixes, /fastapi/)
  const blocked = text.split("## Sans correctif publié")[1].split("## Hors dépôt")[0]
  assert.match(blocked, /fastapi/)
  assert.match(blocked, /ne pas inventer de version/)
  assert.doesNotMatch(blocked, /openssl/)
  const external = text.split("## Hors dépôt")[1].split("## Données")[0]
  assert.match(external, /openssl/)
  assert.match(external, /ne pas modifier ce dépôt/)
  const fenced = text.match(/```json\n([\s\S]*?)\n```/)
  assert.ok(fenced)
  const parsed = JSON.parse(fenced[1]) as { actions: Array<{ package: string; target: string | null }> }
  assert.equal(parsed.actions[0].package, "lodash")
  assert.equal(parsed.actions[0].target, "4.17.22")
  assert.equal(parsed.actions.some((item) => item.package === "fastapi"), false)
})

test("html escapes advisory text and keeps the same groups", () => {
  const nasty = report([
    finding("GHSA-1", "high", "lodash", "4.17.20", "npm", "4.17.21", "<script>alert(1)</script>"),
  ])
  const html = repairHtml(nasty)
  assert.match(html, /<!DOCTYPE html>/)
  assert.match(html, /<title>synchro-failles-2026-10-07<\/title>/)
  assert.match(html, /Version cible/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>alert/)
  assert.match(html, /href="https:\/\/example\.test\/GHSA-1"/)
  const empty = repairHtml(report([], { findings: [], python_note: null, errors: ["Réponse Grype sans liste."] }))
  assert.match(empty, /Aucune faille connue/)
  assert.match(empty, /Lectures impossibles/)
  assert.match(empty, /Réponse Grype sans liste/)
})

test("unsafe urls are not linked", () => {
  const doc = repairDocument(
    report([
      {
        ...finding("GHSA-1", "low", "leftpad", "1.0.0", "npm", null),
        url: "javascript:alert(1)",
      },
    ]),
  )
  assert.equal(doc.blocked[0].advisories[0].url, null)
  const html = repairMarkdown(
    report([
      {
        ...finding("GHSA-1", "low", "leftpad", "1.0.0", "npm", null),
        url: "javascript:alert(1)",
      },
    ]),
  )
  assert.doesNotMatch(html, /javascript:/)
})

test("filename uses the report day", () => {
  assert.equal(repairFilename("2026-10-07 18:00 UTC", "md"), "synchro-failles-2026-10-07.md")
  assert.equal(repairFilename("pas une date", "html"), "synchro-failles-releve.html")
  assert.equal(repairJson(SAMPLE).includes('"target": "4.17.22"'), true)
})
