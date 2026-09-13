import assert from "node:assert/strict"
import test from "node:test"

import { consumeSse, encodeSse, geminiDeltaText, openaiDeltaText } from "../src/lib/ia/sse"
import type { IaChatMessage } from "../src/lib/ia/models"
import { groupIaTurns, historyForLane } from "../src/lib/ia/turns"

test("SSE frames round-trip and stop on [DONE]", () => {
  const frame = encodeSse({ type: "delta", text: "Bonjour" })
  const first = consumeSse(`${frame}data: [DONE]\n\n`)
  assert.equal(first.events.length, 1)
  assert.equal(JSON.parse(first.events[0]).text, "Bonjour")
  assert.equal(first.done, true)

  const split = consumeSse("data: {\"type\":\"delta\",\"text\":\"He")
  assert.deepEqual(split.events, [])
  const rest = consumeSse(`${split.rest}llo\"}\n\n`)
  assert.equal(JSON.parse(rest.events[0]).text, "Hello")
})

test("Gemini and OpenAI delta extractors", () => {
  assert.equal(
    geminiDeltaText({
      candidates: [{ content: { parts: [{ text: "A" }, { text: "B" }] } }],
    }),
    "AB"
  )
  assert.equal(openaiDeltaText({ choices: [{ delta: { content: "x" } }] }), "x")
  assert.equal(openaiDeltaText({ choices: [{ delta: { content: null } }] }), "")
  assert.throws(() => openaiDeltaText({ error: { message: "quota" } }), /quota/)
})

test("compare turns group a pair, solo pairId stays a single bubble", () => {
  const messages: IaChatMessage[] = [
    { role: "user", content: "Lis cette cassure" },
    { role: "assistant", content: "A", lane: "a", pairId: "p1" },
    { role: "assistant", content: "B", lane: "b", pairId: "p1" },
    { role: "user", content: "Et la MM20 ?" },
    { role: "assistant", content: "solo", lane: "a", pairId: "p2" },
  ]
  const turns = groupIaTurns(messages)
  assert.equal(turns[0].kind, "user")
  assert.equal(turns[1].kind, "compare")
  if (turns[1].kind === "compare") {
    assert.equal(turns[1].a.content, "A")
    assert.equal(turns[1].b?.content, "B")
  }
  assert.equal(turns[2].kind, "user")
  assert.equal(turns[3].kind, "assistant")
  if (turns[3].kind === "assistant") {
    assert.equal(turns[3].message.content, "solo")
  }
})

test("lane history hides the other model and empty placeholders", () => {
  const history: IaChatMessage[] = [
    { role: "user", content: "Q1" },
    { role: "assistant", content: "réponse A", lane: "a", pairId: "p1" },
    { role: "assistant", content: "réponse B", lane: "b", pairId: "p1" },
    { role: "assistant", content: "", lane: "a", pairId: "p2" },
  ]
  const forA = historyForLane(history, "a")
  const forB = historyForLane(history, "b")
  assert.deepEqual(
    forA.map((item) => item.content),
    ["Q1", "réponse A"]
  )
  assert.deepEqual(
    forB.map((item) => item.content),
    ["Q1", "réponse B"]
  )
})
