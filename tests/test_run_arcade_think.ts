import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { estimateTokens } from "../src/lib/ia/usage.ts"
import {
  actionSchema,
  localThinkPayload,
  localThinkText,
  localThinkTokens,
  requestLocalThink,
} from "../src/lib/run-arcade/local-call.ts"

const nativeReply = {
  message: { content: '{"action":"brave","query":"or"}' },
  prompt_eval_count: 140,
  eval_count: 36,
  total_duration: 1_684_000_000,
}

test("native Ollama text and token counts are kept", () => {
  assert.equal(localThinkText(true, nativeReply), '{"action":"brave","query":"or"}')
  const tokens = localThinkTokens(nativeReply, '{"action":"brave","query":"or"}', "systeme\nutilisateur", 0, 1684)
  assert.deepEqual(tokens, { promptTokens: 140, completionTokens: 36, estimated: false })
})

test("a non-streaming OpenAI body is read from message.content, with its usage", () => {
  const payload = {
    choices: [{ message: { content: '{"action":"skill","curve":"n1"}' } }],
    usage: { prompt_tokens: 21, completion_tokens: 9 },
  }
  assert.equal(localThinkText(false, payload), '{"action":"skill","curve":"n1"}')
  assert.equal(localThinkText(true, payload), '{"action":"skill","curve":"n1"}')
  const tokens = localThinkTokens(payload, '{"action":"skill","curve":"n1"}', "prompt", 0, 10)
  assert.deepEqual(tokens, { promptTokens: 21, completionTokens: 9, estimated: false })
})

test("an object content and a missing usage become text and an estimate", () => {
  const payload = { message: { content: { action: "brave", query: "or" } } }
  assert.equal(localThinkText(true, payload), '{"action":"brave","query":"or"}')
  const prompt = "abcdefgh"
  const text = '{"action":"brave","query":"or"}'
  const tokens = localThinkTokens(payload, text, prompt, 0, 10)
  assert.equal(tokens.estimated, true)
  assert.equal(tokens.promptTokens, estimateTokens(prompt))
  assert.equal(tokens.completionTokens, estimateTokens(text))
})

test("Ollama gets a schema and retries format json once on HTTP 400", async () => {
  const schema = actionSchema()
  assert.ok(schema.properties.gesture.enum.includes("glisse"))
  assert.ok(schema.properties.gesture.enum.includes("suite"))
  assert.ok(schema.properties.gesture.enum.includes("figure"))
  assert.ok(schema.properties.forme.enum.includes("cercle"))
  assert.ok(schema.properties.n.enum.includes(30))
  assert.ok(schema.required.includes("forme"))
  assert.ok(schema.required.includes("n"))
  assert.deepEqual(schema.properties.r.enum, [1, 1.5, 2, 2.8, 3.2])
  assert.deepEqual(schema.properties.suite.enum, ["logistique"])
  assert.ok(schema.required.includes("r"))
  assert.ok(schema.required.includes("suite"))
  assert.ok(schema.properties.curve.enum.includes("sumNumbers"))
  assert.ok(schema.properties.curve.enum.includes("*"))
  assert.ok(schema.properties.ratio.enum.includes(0.618))
  assert.deepEqual(schema.properties.lecture.properties.tangente.enum, ["correspond", "ecarte"])
  assert.ok(schema.required.includes("lecture"))

  const formats: unknown[] = []
  const parsed = await requestLocalThink(
    { native: true, model: "llama3.2:latest", messages: [{ role: "user", content: "propose" }], seed: 7 },
    async (body) => {
      const record = body as { format?: unknown; options?: { seed?: number; num_predict?: number } }
      formats.push(record.format)
      assert.equal(record.options?.seed, 7)
      assert.equal(record.options?.num_predict, 320)
      if (formats.length === 1) return { ok: false, status: 400, text: "invalid format" }
      return { ok: true, status: 200, text: JSON.stringify(nativeReply) }
    }
  )
  assert.equal(typeof formats[0], "object")
  assert.equal(formats[1], "json")
  assert.equal(localThinkText(true, parsed), nativeReply.message.content)
})

test("a schema compilation 500 falls back to format json", async () => {
  const formats: unknown[] = []
  const parsed = await requestLocalThink(
    { native: true, model: "llama3.2:latest", messages: [], seed: 1 },
    async (body) => {
      formats.push((body as { format?: unknown }).format)
      if (formats.length === 1) return { ok: false, status: 500, text: "invalid JSON schema" }
      return { ok: true, status: 200, text: JSON.stringify(nativeReply) }
    }
  )
  assert.equal(typeof formats[0], "object")
  assert.equal(formats[1], "json")
  assert.equal(localThinkText(true, parsed), nativeReply.message.content)
})

test("a 500 and a compat 400 are not retried", async () => {
  let nativeCalls = 0
  await assert.rejects(
    () =>
      requestLocalThink({ native: true, model: "llama3.2:latest", messages: [], seed: 1 }, async () => {
        nativeCalls += 1
        return { ok: false, status: 500, text: "boom" }
      }),
    /HTTP 500 · boom/
  )
  assert.equal(nativeCalls, 1)

  let compatCalls = 0
  await assert.rejects(
    () =>
      requestLocalThink({ native: false, model: "mistral", messages: [], seed: 3 }, async (body) => {
        compatCalls += 1
        const record = body as { response_format?: { type?: string }; seed?: number; format?: unknown }
        assert.equal(record.response_format?.type, "json_object")
        assert.equal(record.seed, 3)
        assert.equal(record.format, undefined)
        return { ok: false, status: 400, text: "bad" }
      }),
    /HTTP 400/
  )
  assert.equal(compatCalls, 1)
})

test("the native payload without schema stays on format json", () => {
  const plain = localThinkPayload({
    native: true,
    model: "llama3.2:latest",
    messages: [],
    seed: 1,
    schema: false,
  })
  assert.equal(plain.format, "json")
  assert.equal("response_format" in plain, false)
})

test("the think route journals the provider token counts", () => {
  const src = readFileSync(new URL("../src/app/api/run-arcade/think/route.ts", import.meta.url), "utf8")
  assert.match(src, /requestLocalThink/)
  assert.match(src, /localThinkText/)
  assert.match(src, /promptTokens: tokens\.promptTokens/)
  assert.match(src, /completionTokens: tokens\.completionTokens/)
  assert.match(src, /estimated: tokens\.estimated/)
  assert.doesNotMatch(src, /openaiDeltaText/)
})
