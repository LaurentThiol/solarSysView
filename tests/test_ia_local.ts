import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  localChatCompletionsUrl,
  localLlmCandidates,
  localLlmOffMessage,
  localLlmSearchBases,
  localModelsUrl,
  localNativeChatUrl,
  localProbeUrls,
  normalizeLocalLlmBase,
  probeKindFromUrl,
} from "../src/lib/ia/local-url"

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
  assert.equal(localNativeChatUrl("http://127.0.0.1:11434"), "http://127.0.0.1:11434/api/chat")
  assert.equal(localNativeChatUrl("http://127.0.0.1:11434/v1"), "http://127.0.0.1:11434/api/chat")
  assert.equal(probeKindFromUrl("http://127.0.0.1:11434/api/tags"), "tags")
  assert.equal(probeKindFromUrl("http://127.0.0.1:11434/api/version"), "version")
  assert.equal(probeKindFromUrl("http://127.0.0.1:1234/v1/models"), "openai")
})

test("loopback candidates retry localhost and IPv6 when 127.0.0.1 is used", () => {
  assert.deepEqual(localLlmCandidates("http://127.0.0.1:11434"), [
    "http://127.0.0.1:11434",
    "http://localhost:11434",
    "http://[::1]:11434",
  ])
  assert.ok(localProbeUrls("http://127.0.0.1:11434").includes("http://127.0.0.1:11434/api/version"))
})

test("search includes LM Studio and llama-server ports", () => {
  const bases = localLlmSearchBases("http://127.0.0.1:11434")
  assert.ok(bases.includes("http://127.0.0.1:1234"))
  assert.ok(bases.includes("http://127.0.0.1:8080/v1"))
  assert.ok(bases.includes("http://[::1]:11434"))
  assert.match(localLlmOffMessage("connect ECONNREFUSED 127.0.0.1:11434"), /Ollama n'écoute pas/)
})

test("the LLM pill does not probe loopback hosts from the browser", () => {
  const src = readFileSync(new URL("../src/components/startup-status.tsx", import.meta.url), "utf8")
  const pill = src.slice(src.indexOf("function LocalLlmPill"), src.indexOf("const NAV_ITEMS"))
  assert.doesNotMatch(pill, /pingBases/)
  assert.doesNotMatch(pill, /\[::1\]:11434/)
  assert.doesNotMatch(pill, /127\.0\.0\.1:1234/)
  assert.doesNotMatch(pill, /127\.0\.0\.1:8080/)
  assert.doesNotMatch(pill, /jsonPing\("\/api\/brain\/status"\)/)
  assert.match(pill, /\/api\/ia\/local/)
})

test("startup status ignores overlapping /api/startup polls", () => {
  const src = readFileSync(new URL("../src/components/startup-status.tsx", import.meta.url), "utf8")
  const block = src.slice(src.indexOf("export function StartupStatus"), src.indexOf("function MorphoFiringPill"))
  assert.match(block, /inFlight/)
  assert.match(block, /if \(inFlight\.current\) return/)
})
