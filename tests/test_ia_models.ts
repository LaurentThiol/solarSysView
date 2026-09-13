import assert from "node:assert/strict"
import test from "node:test"

import {
  isOpenAiChatModel,
  mergeModelOptions,
  modelSequence,
  pickAvailableModel,
  providerOfModel,
  resolveRequestedModel,
  stripGeminiName,
} from "../src/lib/ia/models"

test("the requested Gemini model is tried before the catalog fallbacks", () => {
  const sequence = modelSequence("google", "gemini-2.5-pro")
  assert.equal(sequence[0], "gemini-2.5-pro")
  assert.ok(sequence.includes("gemini-2.5-flash"))
})

test("a model from the other provider is ignored", () => {
  assert.equal(resolveRequestedModel("google", "gpt-4o"), "gemini-2.5-flash")
  assert.equal(providerOfModel("gemini-2.5-flash"), "google")
  assert.equal(providerOfModel("gpt-4.1-mini"), "openai")
})

test("live extras are added without duplicating the catalog", () => {
  const models = mergeModelOptions({
    google: true,
    openai: false,
    liveGoogle: ["models/gemini-2.5-flash", "gemini-2.5-flash-preview-09-2025", "gemini-embedding-001"].map(
      (id) => stripGeminiName(id)
    ),
    liveOpenAI: ["gpt-4o", "whisper-1"],
  })
  const google = models.filter((item) => item.provider === "google")
  assert.ok(google.some((item) => item.id === "gemini-2.5-flash" && item.source === "catalog"))
  assert.ok(google.some((item) => item.id === "gemini-2.5-flash-preview-09-2025" && item.source === "live"))
  assert.ok(!google.some((item) => item.id.includes("embed")))
  assert.ok(!models.some((item) => item.provider === "openai" && item.available))
})

test("the stored model is reused when it is still available", () => {
  const models = mergeModelOptions({
    google: true,
    openai: true,
    liveGoogle: null,
    liveOpenAI: ["gpt-4.1", "gpt-4o"],
  })
  assert.equal(pickAvailableModel(models, "openai", "gpt-4.1"), "gpt-4.1")
  assert.equal(pickAvailableModel(models, "openai", "missing"), "gpt-4o")
})

test("non-chat OpenAI ids are rejected", () => {
  assert.equal(isOpenAiChatModel("gpt-4o-mini"), true)
  assert.equal(isOpenAiChatModel("whisper-1"), false)
  assert.equal(isOpenAiChatModel("gpt-4o-audio-preview"), false)
})
