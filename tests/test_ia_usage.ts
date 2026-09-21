import assert from "node:assert/strict"
import test from "node:test"

import {
  estimateTokens,
  fallbackUsage,
  parseProviderUsage,
  usageFromPayload,
} from "../src/lib/ia/usage.ts"
import { chatSurface } from "../src/lib/ia/record-usage.ts"

test("Ollama done chunk exposes eval counts and duration", () => {
  const usage = parseProviderUsage({
    message: { content: "" },
    done: true,
    prompt_eval_count: 12,
    eval_count: 8,
    total_duration: 1_500_000_000,
  })
  assert.deepEqual(usage, {
    promptTokens: 12,
    completionTokens: 8,
    estimated: false,
    latencyMs: 1500,
  })
})

test("Gemini usageMetadata is mapped", () => {
  const usage = parseProviderUsage({
    candidates: [{ content: { parts: [{ text: "ok" }] } }],
    usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 9, totalTokenCount: 49 },
  })
  assert.equal(usage?.promptTokens, 40)
  assert.equal(usage?.completionTokens, 9)
  assert.equal(usage?.estimated, false)
})

test("OpenAI usage object is mapped", () => {
  const usage = parseProviderUsage({
    choices: [{ message: { content: "ok" } }],
    usage: { prompt_tokens: 21, completion_tokens: 3, total_tokens: 24 },
  })
  assert.equal(usage?.promptTokens, 21)
  assert.equal(usage?.completionTokens, 3)
})

test("missing usage falls back to chars/4 marked estimated", () => {
  assert.equal(estimateTokens("abcd"), 1)
  const fallback = fallbackUsage("abcdefgh", 42)
  assert.equal(fallback.completionTokens, 2)
  assert.equal(fallback.estimated, true)
  assert.equal(fallback.latencyMs, 42)
  const fromEmpty = usageFromPayload({}, "hello world!!", 1000, 1100)
  assert.equal(fromEmpty.estimated, true)
  assert.equal(fromEmpty.latencyMs, 100)
  assert.equal(fromEmpty.promptTokens, null)
})

test("chat surface prefers the explicit assistant then Brain lab", () => {
  assert.equal(chatSurface("chartisme", "ia"), "ia")
  assert.equal(chatSurface("brain", null), "brain")
  assert.equal(chatSurface("analyse", "brain"), "brain")
  assert.equal(chatSurface("morpho"), "ia")
})
