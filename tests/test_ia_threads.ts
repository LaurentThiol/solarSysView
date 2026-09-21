import assert from "node:assert/strict"
import test from "node:test"

import type { DiagnosticSnapshot } from "../src/lib/capture/snapshot.ts"
import {
  capThreads,
  deleteThreadIn,
  filterThreads,
  mergeThreadLists,
  normalizeThreadTitle,
  parseThreadsExport,
  pinThreadIn,
  renameThreadIn,
  threadFileSlug,
  threadToMarkdown,
  upsertThreadList,
  type IaThread,
} from "../src/lib/ia/threads.ts"

function snapshot(id = "cap-1"): DiagnosticSnapshot {
  return {
    id,
    capturedAt: "2026-09-14T10:00:00.000Z",
    route: "/chartisme",
    lab: "chartisme",
    tab: "Figures",
    gitSha: "abc",
    archive: {
      n: 100,
      from: "2026-01-01",
      to: "2026-09-01",
      latest: "2026-09-01",
      stale: false,
      source: "neon",
    },
    question: "Pourquoi cette cassure ?",
    imageDataUrl: null,
    thumbDataUrl: null,
    summary: ["Somme · 100 tirages"],
    tech: { x: 20 },
    blocked: null,
    disclaimer: "Chaque tirage EuroMillions est indépendant.",
  }
}

function thread(over: Partial<IaThread> = {}): IaThread {
  const id = over.id ?? "cap-1"
  return {
    id,
    updatedAt: "2026-09-14T11:00:00.000Z",
    title: "Pourquoi cette cassure ?",
    provider: "google",
    model: "gemini-2.5-flash",
    snapshot: snapshot(id),
    messages: [
      { role: "user", content: "Pourquoi cette cassure ?" },
      {
        role: "assistant",
        content: "La cassure n’est pas confirmée.",
        model: "gemini-2.5-flash",
        provider: "google",
      },
    ],
    ...over,
  }
}

test("normalizeThreadTitle trims, collapses spaces and caps length", () => {
  assert.equal(normalizeThreadTitle("  hello   world  "), "hello world")
  assert.equal(normalizeThreadTitle(""), "")
  assert.equal(normalizeThreadTitle("x".repeat(80)).endsWith("…"), true)
})

test("rename keeps a custom title locked", () => {
  const next = renameThreadIn([thread()], "cap-1", "Cassure MM20")
  assert.ok(next)
  assert.equal(next[0].title, "Cassure MM20")
  assert.equal(next[0].titleLocked, true)
  assert.equal(renameThreadIn([thread()], "cap-1", "   "), null)
})

test("delete removes one fil", () => {
  const next = deleteThreadIn([thread(), thread({ id: "cap-2" })], "cap-1")
  assert.equal(next.length, 1)
  assert.equal(next[0].id, "cap-2")
})

test("pin survives the unpinned cap", () => {
  const many = Array.from({ length: 10 }, (_, index) =>
    thread({ id: `cap-${index}`, title: `Fil ${index}`, pinned: index === 9 })
  )
  const capped = capThreads(many)
  assert.ok(capped.some((item) => item.id === "cap-9" && item.pinned))
  assert.equal(capped.filter((item) => !item.pinned).length, 8)
  const pinned = pinThreadIn(many.map((item) => ({ ...item, pinned: undefined })), "cap-0")
  assert.equal(pinned[0].id, "cap-0")
  assert.equal(pinned[0].pinned, true)
})

test("upsert preserves a locked title", () => {
  const named = thread({ title: "Lecture Harmo", titleLocked: true })
  const next = upsertThreadList([named], thread({ title: "Pourquoi cette cassure ?" }))
  assert.equal(next[0].title, "Lecture Harmo")
  assert.equal(next[0].titleLocked, true)
})

test("filter matches title, lab and message", () => {
  const list = [
    thread(),
    thread({
      id: "cap-2",
      title: "Pic Harmo",
      snapshot: { ...snapshot("cap-2"), lab: "harmo", tab: "Mélange", question: "Nyquist ?" },
      messages: [{ role: "user", content: "Ce pic est-il Nyquist ?" }],
    }),
  ]
  assert.equal(filterThreads(list, "harmo").length, 1)
  assert.equal(filterThreads(list, "cassure").length, 1)
  assert.equal(filterThreads(list, "nyquist").length, 1)
  assert.equal(filterThreads(list, "inexistant").length, 0)
})

test("import merge keeps the newer fil and a locked title", () => {
  const local = thread({ title: "Chez moi", titleLocked: true, updatedAt: "2026-09-14T12:00:00.000Z" })
  const incoming = thread({
    title: "Export",
    updatedAt: "2026-09-14T10:00:00.000Z",
    messages: [{ role: "user", content: "ancien" }],
  })
  const merged = mergeThreadLists([local], [incoming, thread({ id: "cap-new", title: "Autre" })])
  assert.equal(merged.length, 2)
  const kept = merged.find((item) => item.id === "cap-1")
  assert.equal(kept?.title, "Chez moi")
  assert.equal(kept?.messages[1]?.content, "La cassure n’est pas confirmée.")
})

test("markdown export includes compare columns", () => {
  const md = threadToMarkdown(
    thread({
      title: "Lecture A/B",
      messages: [
        { role: "user", content: "Lis la cassure" },
        { role: "assistant", content: "A dit non", lane: "a", pairId: "p1", provider: "google", model: "gemini-2.5-flash" },
        { role: "assistant", content: "B dit oui", lane: "b", pairId: "p1", provider: "openai", model: "gpt-4o" },
      ],
    })
  )
  assert.match(md, /^# Lecture A\/B/m)
  assert.match(md, /### Comparaison/)
  assert.match(md, /A · Gemini · gemini-2\.5-flash/)
  assert.match(md, /B · OpenAI · gpt-4o/)
  assert.match(md, /A dit non/)
  assert.match(md, /B dit oui/)
})

test("parseThreadsExport accepts wrapper, array and single fil", () => {
  const item = thread()
  assert.equal(parseThreadsExport({ kind: "synchro-ia-threads", version: 1, threads: [item] }).length, 1)
  assert.equal(parseThreadsExport([item]).length, 1)
  assert.equal(parseThreadsExport(item).length, 1)
  assert.equal(parseThreadsExport({ nope: true }).length, 0)
})

test("threadFileSlug is filesystem-safe", () => {
  assert.equal(threadFileSlug("Cassure MM20", "cap-abc123xyz").startsWith("synchro-ia-cassure-mm20-"), true)
})
