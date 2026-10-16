import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { NEXTDATA_SWEEP_HELP, NEXTDATA_TRAINING_HELP } from "../src/lib/nextdata/help.ts"
import {
  SWEEP_READINGS,
  anchorVerdict,
  covariateCaption,
  loadLabel,
  maeCell,
  sortSweepRows,
  sweepBanner,
  yearLabel,
  type SweepRow,
} from "../src/lib/nextdata/sweep.ts"

const lab = readFileSync(new URL("../src/components/nextdata/training-lab.tsx", import.meta.url), "utf8")
const table = readFileSync(new URL("../src/components/nextdata/training-sweep.tsx", import.meta.url), "utf8")
const proxy = readFileSync(new URL("../src/app/api/nextdata/[...path]/route.ts", import.meta.url), "utf8")

function row(partial: Partial<SweepRow> & Pick<SweepRow, "id" | "label">): SweepRow {
  return {
    role: "focus",
    anchor: false,
    focus: 50,
    years: ["n", "n-1", "n-2"],
    covariates: ["forme"],
    dropped: null,
    with_chronos: false,
    status: "ready",
    detail: null,
    shifts_ready: 10,
    shifts_total: 10,
    summary: {},
    versus_anchor: null,
    holm: null,
    ...partial,
  }
}

test("the synthesis table sorts the anchor first, then by corpus MAE", () => {
  const rows = sortSweepRows([
    row({ id: "high", label: "Focus 100", summary: { corpus: { mae_sum: 30, hits_numbers: 0.2, count: 10 } } }),
    row({
      id: "anchor",
      label: "Réglage affiché",
      anchor: true,
      role: "anchor",
      summary: { corpus: { mae_sum: 22, hits_numbers: 0.4, count: 10 } },
    }),
    row({ id: "low", label: "Sans Pulse", summary: { corpus: { mae_sum: 18, hits_numbers: 0.5, count: 10 } } }),
    row({ id: "empty", label: "Années n", status: "short" }),
  ])
  assert.deepEqual(
    rows.map((item) => item.id),
    ["anchor", "low", "high", "empty"]
  )
  assert.equal(yearLabel(["n", "n-1", "n-2"]), "n, n−1, n−2")
  assert.equal(covariateCaption({ anchor: true, dropped: null }), "celles des boutons")
  assert.equal(covariateCaption({ dropped: "pulse" }), "sans Pulse")
  assert.equal(maeCell({ corpus: { mae_sum: 12.26, hits_numbers: 0, count: 10 } }, "corpus"), "12,3")
  assert.equal(maeCell({}, "fenetre"), "—")
})

test("a variant is named only after Holm, and the load stays visible", () => {
  const held = sweepBanner({
    held: true,
    leader: null,
    progress: { ready: 4, total: 4, complete: true },
  })
  assert.match(held, /réglage affiché tient/)
  assert.match(held, /Holm/)
  const leader = sweepBanner({
    held: false,
    leader: { id: "drop-pulse", label: "Sans Pulse", reading: "corpus" },
    progress: { ready: 4, total: 4, complete: true },
  })
  assert.match(leader, /Sans Pulse/)
  assert.match(leader, /Holm/)
  assert.match(sweepBanner({ progress: { ready: 1, total: 4, complete: false } }), /en cours/)
  assert.equal(loadLabel({ cpu: 0.42, memory_free: 0.5, allowed: 3, cap: 6, parallel: true }), "charge 42 % · 3 processus sur 6")
  assert.equal(loadLabel({ cpu: null, memory_free: null, allowed: 1, cap: 8, parallel: false }), "charge — · 1 processus")

  const kept = row({
    id: "drop-pulse",
    label: "Sans Pulse",
    holm: { p: 0.01, p_holm: 0.02, reject: true, retained: true },
    versus_anchor: {
      corpus: { value: -2.5, lo: -4, hi: -1, count: 10, p: 0.01, verdict: "lower" },
    },
  })
  assert.match(anchorVerdict(kept), /erreur plus basse/)
  const softened = row({
    id: "focus-100",
    label: "Focus 100",
    holm: { p: 0.04, p_holm: 0.08, reject: false, retained: false },
    versus_anchor: {
      corpus: { value: -1, lo: -2, hi: -0.1, count: 10, p: 0.04, verdict: "undecided", raw_verdict: "lower" },
    },
  })
  assert.match(anchorVerdict(softened), /non tranché après Holm/)
  assert.equal(anchorVerdict(row({ id: "anchor", label: "Réglage affiché", anchor: true })), "—")
})

test("the training page wires Méga to the sweep route", () => {
  assert.match(NEXTDATA_TRAINING_HELP.mega.body, /Holm/)
  assert.match(NEXTDATA_TRAINING_HELP.mega.body, /80 %/)
  assert.match(lab, /NEXTDATA_TRAINING_HELP\.mega/)
  assert.match(lab, /Méga/)
  assert.match(lab, /Comparer/)
  assert.match(lab, /\/api\/nextdata\/sweep/)
  assert.match(table, /<table/)
  assert.match(table, /data-sweep-table/)
  assert.match(table, /data-sweep-banner/)
  assert.match(table, /vs affiché/)
  assert.match(table, /vs persistance/)
  assert.match(table, /Décalages/)
  assert.match(table, /corpus_persist/)
  assert.equal(SWEEP_READINGS[0].short, "LGB · 3 ans")
  assert.match(table, /reading\.short/)
  assert.match(proxy, /suffix === "sweep"/)
})

test("Synthèse Méga explains the logic of each value", () => {
  const keys = [
    "synthese",
    "reglage",
    "focus",
    "annees",
    "covariables",
    "mae",
    "versusAffiche",
    "versusPersistance",
    "persist",
    "communs",
    "decalages",
    "charge",
  ] as const
  for (const key of keys) {
    assert.match(table, new RegExp(`NEXTDATA_SWEEP_HELP\\.${key}\\b`), key)
    assert.ok(NEXTDATA_SWEEP_HELP[key].title.trim().length > 0, key)
    assert.ok(NEXTDATA_SWEEP_HELP[key].body.trim().length > 80, key)
  }
  assert.match(table, /TitleHelp help=\{NEXTDATA_SWEEP_HELP\.synthese\}/)
  assert.match(NEXTDATA_SWEEP_HELP.synthese.body, /Holm/)
  assert.match(NEXTDATA_SWEEP_HELP.mae.body, /erreur absolue moyenne/)
  assert.match(NEXTDATA_SWEEP_HELP.mae.body, /12,26 s’affiche 12,3/)
  assert.match(NEXTDATA_SWEEP_HELP.versusAffiche.body, /Diebold et Mariano/)
  assert.match(NEXTDATA_SWEEP_HELP.versusAffiche.body, /\|somme prévue de la ligne/)
  assert.match(NEXTDATA_SWEEP_HELP.versusAffiche.items?.map((item) => item.label).join(" ") ?? "", /Holm/)
  assert.match(NEXTDATA_SWEEP_HELP.versusPersistance.body, /rejoue la somme/)
  assert.match(NEXTDATA_SWEEP_HELP.communs.body, /0,50/)
  assert.match(NEXTDATA_SWEEP_HELP.communs.body, /5×5\/50/)
  assert.match(NEXTDATA_SWEEP_HELP.decalages.body, /10\/10/)
  assert.match(NEXTDATA_SWEEP_HELP.charge.body, /80 %/)
  assert.match(NEXTDATA_SWEEP_HELP.charge.body, /60 %/)
  assert.match(NEXTDATA_SWEEP_HELP.focus.body, /même queue/)
  assert.match(NEXTDATA_TRAINING_HELP.mega.body, /Holm/)
  assert.match(NEXTDATA_TRAINING_HELP.mega.body, /80 %/)
  assert.match(NEXTDATA_TRAINING_HELP.mega.body, /lecture Corpus/)
  assert.match(NEXTDATA_TRAINING_HELP.mega.items?.map((item) => item.label).join(" ") ?? "", /Holm/)
  assert.match(NEXTDATA_TRAINING_HELP.mega.items?.map((item) => item.label).join(" ") ?? "", /Écart apparié/)
  assert.equal(NEXTDATA_SWEEP_HELP.covariables.title, "Covariables de la ligne")
})
