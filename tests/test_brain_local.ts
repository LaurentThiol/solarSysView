import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { completeIa, setLlmTransport } from "../src/lib/ia/providers"

test("a local 404 does not escalate to Gemini or OpenAI", async () => {
  const urls: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    urls.push(url)
    return new Response("missing", { status: 404, headers: { "content-type": "application/json" } })
  }) as typeof fetch
  setLlmTransport(async (url) => {
    urls.push(String(url))
    return new Response("missing", { status: 404, headers: { "content-type": "application/json" } })
  })
  try {
    const result = await completeIa({
      provider: "local",
      messages: [{ role: "user", content: "ping" }],
    })
    assert.equal(result.ok, false)
    assert.ok(urls.length > 0, "local URL should be called")
    assert.ok(
      urls.every((url) => !url.includes("googleapis") && !url.includes("api.openai.com")),
      `cloud URL leaked: ${urls.join(" | ")}`
    )
    assert.match(result.error, /local|Ollama|injoignable|HTTP 404/i)
  } finally {
    setLlmTransport(null)
    globalThis.fetch = original
  }
})

test("watchlist sync does not prefetch era=current on every page", () => {
  const src = readFileSync(new URL("../src/components/brain/watchlist-sync.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(src, /useDraws\(/)
  assert.match(src, /SYNC_ENSURE_EVENT/)
  assert.match(src, /\/api\/draws\?era=current/)
})
