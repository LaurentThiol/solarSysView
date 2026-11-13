import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { estimateTokens } from "../src/lib/ia/usage.ts"
import { RUN_ARCADE_HELP } from "../src/lib/run-arcade/help.ts"
import { iaUsedLabel } from "../src/lib/run-arcade/ia-label.ts"
import {
  actionSchema,
  localReflectionFilled,
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
  assert.equal(schema.properties.forme.enum.length, 9)
  assert.equal((schema.properties.forme.enum as readonly string[]).includes("cos"), false)
  assert.ok(schema.properties.forme.enum.includes("arccos"))
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
      const record = body as { format?: unknown; think?: unknown; options?: { seed?: number; num_predict?: number } }
      formats.push(record.format)
      assert.equal(record.think, false)
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
      const record = body as { format?: unknown; think?: unknown }
      assert.equal(record.think, false)
      formats.push(record.format)
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
  assert.equal(plain.think, false)
  assert.equal("response_format" in plain, false)
  assert.equal("chat_template_kwargs" in plain, false)
})

test("a thinking compat model disables thinking, a llama3.2 does not", () => {
  const qwen = localThinkPayload({
    native: false,
    model: "qwen3",
    messages: [],
    seed: 4,
    schema: false,
  }) as { max_tokens: number; seed: number; chat_template_kwargs?: { enable_thinking: false } }
  assert.equal(qwen.max_tokens, 320)
  assert.equal(qwen.seed, 4)
  assert.deepEqual(qwen.chat_template_kwargs, { enable_thinking: false })
  assert.equal("think" in qwen, false)

  const llama = localThinkPayload({
    native: false,
    model: "llama3.2",
    messages: [],
    seed: 4,
    schema: false,
  }) as { max_tokens: number; seed: number; chat_template_kwargs?: { enable_thinking: false } }
  assert.equal(llama.max_tokens, 320)
  assert.equal(llama.seed, 4)
  assert.equal("chat_template_kwargs" in llama, false)
  assert.equal("think" in llama, false)
})

test("empty content with thinking is not the action", () => {
  const native = { message: { content: "", thinking: '{"action":"brave","query":"or"}' } }
  assert.equal(localThinkText(true, native), "")
  assert.equal(localReflectionFilled(native), true)

  const compat = { choices: [{ message: { content: "", reasoning_content: "je réfléchis" } }] }
  assert.equal(localThinkText(false, compat), "")
  assert.equal(localThinkText(true, compat), "")
  assert.equal(localReflectionFilled(compat), true)

  const objectWithThinking = { message: { content: { action: "brave", query: "or" }, thinking: "hmm" } }
  assert.equal(localThinkText(true, objectWithThinking), '{"action":"brave","query":"or"}')

  assert.equal(localReflectionFilled({ message: { content: "" } }), false)
})

test("an empty 200 without reflection is returned once", async () => {
  let calls = 0
  const parsed = await requestLocalThink({ native: true, model: "llama3.2", messages: [], seed: 1 }, async () => {
    calls += 1
    return { ok: true, status: 200, text: JSON.stringify({ message: { content: "" } }) }
  })
  assert.equal(calls, 1)
  assert.equal(localThinkText(true, parsed), "")
  assert.equal(localReflectionFilled(parsed), false)
})

test("a 200 with only reflection retries once, not a third time", async () => {
  let calls = 0
  const empty = { message: { content: "", thinking: "je cherche l’action" } }
  const bodies: Array<{ think?: unknown; options?: { seed?: number; num_predict?: number } }> = []
  const parsed = await requestLocalThink(
    { native: true, model: "qwen3", messages: [{ role: "user", content: "propose" }], seed: 1 },
    async (body) => {
      calls += 1
      const record = body as { think?: unknown; options?: { seed?: number; num_predict?: number } }
      bodies.push(record)
      assert.equal(record.think, false)
      assert.equal(record.options?.seed, 1)
      assert.equal(record.options?.num_predict, 320)
      if (calls > 2) throw new Error("troisième essai")
      return { ok: true, status: 200, text: JSON.stringify(empty) }
    }
  )
  assert.equal(calls, 2)
  assert.deepEqual(bodies[0], bodies[1])
  assert.equal(localThinkText(true, parsed), "")
  assert.equal(localReflectionFilled(parsed), true)
})

test("the reflection retry keeps a JSON answer", async () => {
  let calls = 0
  const parsed = await requestLocalThink(
    { native: false, model: "qwen3", messages: [], seed: 9 },
    async (body) => {
      calls += 1
      const record = body as {
        chat_template_kwargs?: { enable_thinking?: boolean }
        max_tokens?: number
        seed?: number
      }
      assert.deepEqual(record.chat_template_kwargs, { enable_thinking: false })
      assert.equal(record.max_tokens, 320)
      assert.equal(record.seed, 9)
      if (calls === 1) {
        return {
          ok: true,
          status: 200,
          text: JSON.stringify({ choices: [{ message: { content: "", reasoning_content: "hmm" } }] }),
        }
      }
      return {
        ok: true,
        status: 200,
        text: JSON.stringify({ choices: [{ message: { content: '{"action":"skill","curve":"n1"}' } }] }),
      }
    }
  )
  assert.equal(calls, 2)
  assert.equal(localThinkText(false, parsed), '{"action":"skill","curve":"n1"}')
})

test("the local help says this call does not think", () => {
  const local = RUN_ARCADE_HELP.services.items?.find((item) => item.label === "IA locale")
  assert.match(local?.text ?? "", /Pour cet appel, le modèle ne réfléchit pas/)
  assert.match(local?.text ?? "", /L’action tient dans les 320 jetons/)
})

test("the think route journals the provider token counts", () => {
  const src = readFileSync(new URL("../src/app/api/run-arcade/think/route.ts", import.meta.url), "utf8")
  assert.match(src, /requestLocalThink/)
  assert.match(src, /localThinkText/)
  assert.match(src, /localReflectionFilled/)
  assert.match(src, /réflexion sans JSON/)
  assert.match(src, /promptTokens: tokens\.promptTokens/)
  assert.match(src, /completionTokens: tokens\.completionTokens/)
  assert.match(src, /estimated: tokens\.estimated/)
  assert.doesNotMatch(src, /openaiDeltaText/)
  assert.match(src, /error: message, latencyMs, model/)
})

test("the banner names the model, including an empty reply", () => {
  assert.equal(iaUsedLabel("qwen3", "prête"), "IA utilisée : qwen3. prête")
  assert.equal(iaUsedLabel(null, null), "IA utilisée : pas encore d’appel.")
  assert.equal(iaUsedLabel("", "en attente"), "IA utilisée : pas encore d’appel.")
  assert.equal(
    iaUsedLabel("qwen3", "en attente (réponse vide)"),
    "IA utilisée : qwen3. en attente (réponse vide)"
  )
})
