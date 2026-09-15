import assert from "node:assert/strict"
import test from "node:test"

import { localChatCompletionsUrl, localModelsUrl, normalizeLocalLlmBase } from "../src/lib/ia/local-url"

test("localhost LLM base is rewritten to IPv4", () => {
  assert.equal(normalizeLocalLlmBase("http://localhost:11434/"), "http://127.0.0.1:11434")
  assert.equal(normalizeLocalLlmBase("http://[::1]:11434"), "http://127.0.0.1:11434")
  assert.equal(normalizeLocalLlmBase("127.0.0.1:8080/v1"), "http://127.0.0.1:8080/v1")
  assert.equal(normalizeLocalLlmBase(""), "http://127.0.0.1:11434")
})

test("OpenAI-compat model and chat URLs respect a /v1 suffix", () => {
  assert.equal(localModelsUrl("http://127.0.0.1:8080/v1"), "http://127.0.0.1:8080/v1/models")
  assert.equal(localModelsUrl("http://127.0.0.1:11434"), "http://127.0.0.1:11434/v1/models")
  assert.equal(
    localChatCompletionsUrl("http://127.0.0.1:8080/v1"),
    "http://127.0.0.1:8080/v1/chat/completions"
  )
  assert.equal(
    localChatCompletionsUrl("http://127.0.0.1:11434"),
    "http://127.0.0.1:11434/v1/chat/completions"
  )
})
