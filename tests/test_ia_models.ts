import assert from "node:assert/strict"
import test from "node:test"

import {
  guessVision,
  isLocalChatModel,
  isLocalTextChatModel,
  isLocalVisionChatModel,
  isOpenAiChatModel,
  localChatRank,
  mergeModelOptions,
  modelSequence,
  pickAvailableModel,
  pickCompareModel,
  pickLocalTextModel,
  pickLocalVisionModel,
  providerOfModel,
  resolveRequestedModel,
  stripGeminiName,
  supportsLocalThink,
} from "../src/lib/ia/models.ts"

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

test("compare prefers the other provider, then a stored distinct model", () => {
  const both = mergeModelOptions({
    google: true,
    openai: true,
    liveGoogle: null,
    liveOpenAI: null,
  })
  assert.equal(pickCompareModel(both, "gemini-2.5-flash"), "gpt-4o")
  assert.equal(pickCompareModel(both, "gpt-4o"), "gemini-2.5-flash")
  assert.equal(pickCompareModel(both, "gemini-2.5-flash", "gpt-5"), "gpt-5")
  assert.equal(pickCompareModel(both, "gpt-5", "gpt-5"), "gemini-2.5-flash")
})

test("compare without the other key stays on the same catalog", () => {
  const googleOnly = mergeModelOptions({
    google: true,
    openai: false,
    liveGoogle: null,
    liveOpenAI: null,
  })
  assert.equal(pickCompareModel(googleOnly, "gemini-2.5-flash"), "gemini-2.5-pro")
  assert.equal(pickCompareModel(googleOnly, "gemini-2.5-flash", "gpt-4o"), "gemini-2.5-pro")
})

test("local prefers a model actually served over the catalog default", () => {
  const models = mergeModelOptions({
    google: false,
    openai: false,
    local: true,
    liveGoogle: null,
    liveOpenAI: null,
    liveLocal: ["qwen2.5", "mistral"],
  })
  assert.equal(pickAvailableModel(models, "local", "llama3.2"), "qwen2.5")
  assert.equal(pickAvailableModel(models, "local", "qwen2.5"), "qwen2.5")
})

test("local vision ids include qwen2.5vl and exclude text qwen2.5", () => {
  assert.equal(guessVision("qwen2.5vl:7b", "local"), true)
  assert.equal(guessVision("qwen2.5:7b", "local"), false)
  assert.equal(guessVision("moondream", "local"), true)
  assert.equal(guessVision("llava", "local"), true)
  assert.equal(guessVision("minicpm-v", "local"), true)
  assert.equal(guessVision("llama3.2", "local"), false)
})

test("VLM chat is a chat model; Moondream and embeds are not", () => {
  assert.equal(isLocalChatModel("qwen2.5vl:7b"), true)
  assert.equal(isLocalVisionChatModel("qwen2.5vl:7b"), true)
  assert.equal(isLocalTextChatModel("qwen2.5vl:7b"), false)
  assert.equal(isLocalTextChatModel("qwen2.5:7b"), true)
  assert.equal(isLocalChatModel("llava"), true)
  assert.equal(isLocalChatModel("moondream"), false)
  assert.equal(isLocalChatModel("nomic-embed-text"), false)
  assert.equal(isLocalChatModel("qwen2.5"), true)
})

test("text ranking does not let qwen2.5vl beat qwen2.5", () => {
  assert.ok(localChatRank("qwen2.5:7b") > localChatRank("qwen2.5vl:7b"))
  assert.equal(pickLocalTextModel(["qwen2.5vl:7b", "qwen2.5:7b"], "qwen2.5vl:7b"), "qwen2.5:7b")
  assert.equal(pickLocalVisionModel(["qwen2.5vl:7b", "qwen2-vl:7b", "llava"], null), "qwen2.5vl:7b")
})

test("local chat ranking prefers qwen2.5 over mistral over llama3.2", () => {
  assert.ok(localChatRank("qwen2.5") > localChatRank("mistral"))
  assert.ok(localChatRank("mistral") > localChatRank("llama3.2"))
  assert.ok(localChatRank("qwen3:8b") > localChatRank("qwen2.5"))
})

test("LOCAL_LLM_MODEL wins when the id is actually served", () => {
  const models = mergeModelOptions({
    google: false,
    openai: false,
    local: true,
    liveGoogle: null,
    liveOpenAI: null,
    liveLocal: ["qwen2.5", "mistral"],
  })
  assert.equal(
    pickAvailableModel(models, "local", "qwen2.5", { envModel: "mistral", liveIds: ["qwen2.5", "mistral"] }),
    "mistral"
  )
})

test("moondream is omitted from local chat extras but qwen2.5vl is kept", () => {
  const models = mergeModelOptions({
    google: false,
    openai: false,
    local: true,
    liveGoogle: null,
    liveOpenAI: null,
    liveLocal: ["moondream", "qwen2.5", "qwen2.5vl:7b"],
  })
  assert.ok(!models.some((item) => item.id === "moondream"))
  assert.ok(models.some((item) => item.id === "qwen2.5vl:7b"))
  assert.equal(pickAvailableModel(models, "local", "llama3.2"), "qwen2.5")
  assert.equal(
    pickAvailableModel(models, "local", "qwen2.5vl:7b", { liveIds: ["qwen2.5", "qwen2.5vl:7b"] }),
    "qwen2.5"
  )
})

test("think is reserved to known reasoning ids", () => {
  assert.equal(supportsLocalThink("qwen3:8b"), true)
  assert.equal(supportsLocalThink("deepseek-r1"), true)
  assert.equal(supportsLocalThink("gpt-oss"), true)
  assert.equal(supportsLocalThink("r1:latest"), true)
  assert.equal(supportsLocalThink("llama3.2"), false)
  assert.equal(supportsLocalThink("llama3.1"), false)
  assert.equal(supportsLocalThink("qwen2.5"), false)
})
