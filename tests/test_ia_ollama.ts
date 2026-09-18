import assert from "node:assert/strict"
import test from "node:test"

import { packCharBudget } from "../src/lib/capture/snapshot"
import { buildOllamaChatBody, clearLocalLlmProbeCache, completeIa, setLlmTransport, streamIa } from "../src/lib/ia/providers"
import { supportsLocalThink } from "../src/lib/ia/models"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function missing() {
  return new Response("missing", { status: 404, headers: { "content-type": "application/json" } })
}

async function withTransport<T>(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response,
  fn: () => Promise<T>
) {
  clearLocalLlmProbeCache()
  setLlmTransport(async (url, init) => handler(url, init))
  try {
    return await fn()
  } finally {
    setLlmTransport(null)
    clearLocalLlmProbeCache()
  }
}

test("pack budget for default num_ctx is 49152 characters", () => {
  assert.equal(packCharBudget(16_384), 49_152)
  assert.ok(packCharBudget() < 80_000)
})

test("native Ollama payload uses /api/chat with num_ctx and no think by default", async () => {
  const posts: Array<{ url: string; body: Record<string, unknown> }> = []
  const result = await withTransport(async (url, init) => {
    if (url.includes("/api/tags") && (!init?.method || init.method === "GET")) {
      return jsonResponse({ models: [{ name: "qwen2.5" }] })
    }
    if (url.includes("/api/chat") && init?.method === "POST") {
      posts.push({ url, body: JSON.parse(String(init.body || "{}")) as Record<string, unknown> })
      return jsonResponse({
        message: { content: "lu" },
        prompt_eval_count: 11,
        eval_count: 2,
        total_duration: 2_000_000_000,
      })
    }
    return missing()
  }, () =>
    completeIa({
      provider: "local",
      model: "qwen2.5",
      messages: [{ role: "user", content: "ping" }],
    })
  )
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.text, "lu")
    assert.equal(result.promptTokens, 11)
    assert.equal(result.completionTokens, 2)
    assert.equal(result.estimated, false)
    assert.equal(result.latencyMs, 2000)
  }
  assert.equal(posts.length, 1)
  assert.match(posts[0].url, /\/api\/chat$/)
  assert.doesNotMatch(posts[0].url, /\/v1\//)
  const options = posts[0].body.options as { num_ctx?: number; temperature?: number }
  assert.equal(options.num_ctx, 16_384)
  assert.equal(options.temperature, 0.3)
  assert.equal(posts[0].body.keep_alive, "30m")
  assert.equal(posts[0].body.think, undefined)
})

test("LM Studio style /v1/models stays on OpenAI-compat SSE, not native chat", async () => {
  const posts: string[] = []
  const result = await withTransport(async (url, init) => {
    if (url.includes("/api/tags") || url.includes("/api/version")) return missing()
    if (url.includes("/models") && (!init?.method || init.method === "GET")) {
      return jsonResponse({ data: [{ id: "mistral" }] })
    }
    if (url.includes("/chat/completions") && init?.method === "POST") {
      posts.push(url)
      return jsonResponse({ choices: [{ message: { content: "compat" } }] })
    }
    return missing()
  }, () =>
    completeIa({
      provider: "local",
      model: "mistral",
      messages: [{ role: "user", content: "ping" }],
    })
  )
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.text, "compat")
  assert.ok(posts.some((url) => url.includes("/v1/chat/completions") || url.endsWith("/chat/completions")))
  assert.ok(posts.every((url) => !url.endsWith("/api/chat")))
})

test("Python status fallback never uses native /api/chat", async () => {
  const posts: string[] = []
  const result = await withTransport(async (url, init) => {
    if (url.includes("/api/brain/status")) {
      return jsonResponse({ ollama: { ok: true, models: ["qwen2.5"] } })
    }
    if (url.includes("/chat/completions") && init?.method === "POST") {
      posts.push(url)
      return jsonResponse({ choices: [{ message: { content: "via-python" } }] })
    }
    return missing()
  }, () =>
    completeIa({
      provider: "local",
      model: "qwen2.5",
      messages: [{ role: "user", content: "ping" }],
    })
  )
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.text, "via-python")
  assert.ok(posts.length > 0)
  assert.ok(posts.every((url) => !url.includes("/api/chat")))
})

test("deepen enables think only on reasoning models", () => {
  const thinking = buildOllamaChatBody(
    "qwen3:8b",
    [{ role: "user", content: "ping" }],
    null,
    { deepen: true }
  )
  const plain = buildOllamaChatBody(
    "llama3.2",
    [{ role: "user", content: "ping" }],
    null,
    { deepen: true }
  )
  const off = buildOllamaChatBody("qwen3:8b", [{ role: "user", content: "ping" }], null, { deepen: false })
  assert.equal(thinking.think, true)
  assert.equal(plain.think, undefined)
  assert.equal(off.think, undefined)
  const deepOpts = thinking.options as { temperature?: number; num_predict?: number; top_p?: number }
  assert.equal(deepOpts.temperature, 0.7)
  assert.equal(deepOpts.num_predict, 8192)
  assert.equal(deepOpts.top_p, 0.95)
  assert.equal(supportsLocalThink("qwen3:8b"), true)
})

test("native stream reads NDJSON content and ignores thinking", async () => {
  const chunks: string[] = []
  const result = await withTransport(async (url, init) => {
    if (url.includes("/api/tags") && (!init?.method || init.method === "GET")) {
      return jsonResponse({ models: [{ name: "qwen2.5" }] })
    }
    if (url.includes("/api/chat") && init?.method === "POST") {
      const stream = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder()
          controller.enqueue(enc.encode('{"message":{"content":"bon","thinking":"secret"}}\n'))
          controller.enqueue(enc.encode('{"message":{"content":"jour"},"done":true,"prompt_eval_count":4,"eval_count":2}\n'))
          controller.close()
        },
      })
      return new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson" } })
    }
    return missing()
  }, () =>
    streamIa(
      {
        provider: "local",
        model: "qwen2.5",
        messages: [{ role: "user", content: "ping" }],
      },
      (event) => {
        if (event.type === "delta") chunks.push(event.text)
      }
    )
  )
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.text, "bonjour")
    assert.equal(result.promptTokens, 4)
    assert.equal(result.completionTokens, 2)
  }
  assert.ok(!chunks.join("").includes("secret"))
})
