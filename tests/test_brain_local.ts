import assert from "node:assert/strict"
import test from "node:test"

import { completeIa } from "../src/lib/ia/providers"

test("a local 404 does not escalate to Gemini or OpenAI", async () => {
  const urls: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    urls.push(url)
    return new Response("missing", { status: 404, headers: { "content-type": "application/json" } })
  }) as typeof fetch
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
    globalThis.fetch = original
  }
})
