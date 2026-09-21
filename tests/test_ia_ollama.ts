import assert from "node:assert/strict"
import test from "node:test"

import { packCharBudget } from "../src/lib/capture/snapshot.ts"
import { buildOllamaChatBody, clearLocalLlmProbeCache, completeIa, setLlmTransport, streamIa } from "../src/lib/ia/providers.ts"
import { supportsLocalThink } from "../src/lib/ia/models.ts"

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

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

test("local capture uses VLM then text model without sending the pack to vision", async () => {
  const posts: Array<{ model: string; body: Record<string, unknown> }> = []
  const result = await withTransport(async (url, init) => {
    if (url.includes("/api/tags") && (!init?.method || init.method === "GET")) {
      return jsonResponse({ models: [{ name: "qwen2.5:7b" }, { name: "qwen2.5vl:7b" }] })
    }
    if (url.includes("/api/chat") && init?.method === "POST") {
      const body = JSON.parse(String(init.body || "{}")) as Record<string, unknown>
      posts.push({ model: String(body.model), body })
      const content = body.model === "qwen2.5vl:7b" ? "courbe RSI visible en haut" : "lecture pack"
      return jsonResponse({ message: { content } })
    }
    return missing()
  }, () =>
    completeIa({
      provider: "local",
      model: "qwen2.5:7b",
      messages: [{ role: "user", content: "que vois-tu ?" }],
      snapshot: {
        lab: "chartisme",
        tab: "vue",
        route: "/chartisme",
        tech: { secret: "ne-pas-envoyer-au-vlm" },
        imageDataUrl: TINY_PNG,
      },
    })
  )
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.text, "lecture pack")
    assert.equal(result.model, "qwen2.5:7b")
    assert.equal(result.visionModel, "qwen2.5vl:7b")
    assert.equal(result.imageOmitted, false)
  }
  assert.equal(posts.length, 2)
  assert.equal(posts[0].model, "qwen2.5vl:7b")
  const visionMessages = posts[0].body.messages as Array<{ images?: string[]; content?: string }>
  assert.ok(visionMessages.some((item) => item.images?.length))
  const visionBlob = JSON.stringify(posts[0].body)
  assert.doesNotMatch(visionBlob, /ne-pas-envoyer-au-vlm/)
  assert.doesNotMatch(visionBlob, /Données techniques JSON/)
  assert.equal(posts[1].model, "qwen2.5:7b")
  const textBlob = JSON.stringify(posts[1].body)
  assert.match(textBlob, /Notes visuelles/)
  assert.match(textBlob, /courbe RSI visible en haut/)
  assert.doesNotMatch(textBlob, /"images"/)
})

test("local capture without VLM omits the image", async () => {
  const posts: Array<Record<string, unknown>> = []
  const result = await withTransport(async (url, init) => {
    if (url.includes("/api/tags") && (!init?.method || init.method === "GET")) {
      return jsonResponse({ models: [{ name: "qwen2.5:7b" }] })
    }
    if (url.includes("/api/chat") && init?.method === "POST") {
      posts.push(JSON.parse(String(init.body || "{}")) as Record<string, unknown>)
      return jsonResponse({ message: { content: "texte seul" } })
    }
    return missing()
  }, () =>
    completeIa({
      provider: "local",
      model: "qwen2.5:7b",
      messages: [{ role: "user", content: "ping" }],
      snapshot: { lab: "analyse", tech: { ok: 1 }, imageDataUrl: TINY_PNG },
    })
  )
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.imageOmitted, true)
    assert.equal(result.visionModel, null)
  }
  assert.equal(posts.length, 1)
  assert.doesNotMatch(JSON.stringify(posts[0]), /"images"/)
})

test("IA_LOCAL_TWO_PASS=0 sends image and pack to the VLM in one pass", async () => {
  const previous = process.env.IA_LOCAL_TWO_PASS
  process.env.IA_LOCAL_TWO_PASS = "0"
  try {
    const posts: Array<{ model: string; body: Record<string, unknown> }> = []
    const result = await withTransport(async (url, init) => {
      if (url.includes("/api/tags") && (!init?.method || init.method === "GET")) {
        return jsonResponse({ models: [{ name: "qwen2.5:7b" }, { name: "qwen2.5vl:7b" }] })
      }
      if (url.includes("/api/chat") && init?.method === "POST") {
        const body = JSON.parse(String(init.body || "{}")) as Record<string, unknown>
        posts.push({ model: String(body.model), body })
        return jsonResponse({ message: { content: "une passe" } })
      }
      return missing()
    }, () =>
      completeIa({
        provider: "local",
        model: "qwen2.5:7b",
        messages: [{ role: "user", content: "que vois-tu ?" }],
        snapshot: {
          lab: "chartisme",
          tech: { secret: "pack-ok-en-secours" },
          imageDataUrl: TINY_PNG,
        },
      })
    )
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.text, "une passe")
      assert.equal(result.model, "qwen2.5vl:7b")
      assert.equal(result.visionModel, "qwen2.5vl:7b")
      assert.equal(result.imageOmitted, false)
    }
    assert.equal(posts.length, 1)
    assert.equal(posts[0].model, "qwen2.5vl:7b")
    const blob = JSON.stringify(posts[0].body)
    assert.match(blob, /"images"/)
    assert.match(blob, /pack-ok-en-secours/)
  } finally {
    if (previous == null) delete process.env.IA_LOCAL_TWO_PASS
    else process.env.IA_LOCAL_TWO_PASS = previous
  }
})

test("local without image stays on a single text POST", async () => {
  const posts: string[] = []
  const result = await withTransport(async (url, init) => {
    if (url.includes("/api/tags") && (!init?.method || init.method === "GET")) {
      return jsonResponse({ models: [{ name: "qwen2.5:7b" }, { name: "qwen2.5vl:7b" }] })
    }
    if (url.includes("/api/chat") && init?.method === "POST") {
      const body = JSON.parse(String(init.body || "{}")) as { model?: string }
      posts.push(String(body.model))
      return jsonResponse({ message: { content: "ok" } })
    }
    return missing()
  }, () =>
    completeIa({
      provider: "local",
      model: "qwen2.5:7b",
      messages: [{ role: "user", content: "ping" }],
    })
  )
  assert.equal(result.ok, true)
  assert.deepEqual(posts, ["qwen2.5:7b"])
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
