import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import http from "node:http"
import { register } from "node:module"
import type { AddressInfo } from "node:net"
import test from "node:test"

import type { NextRequest } from "next/server"

// Le job pytest n’installe pas `next` : les deux routes se testent avec le même remplaçant de `next/server` que la route Brave.
register("./node-next-stub.mjs", import.meta.url)
const think = await import("../src/app/api/run-arcade/think/route.ts")
const brave = await import("../src/app/api/run-arcade/brave/route.ts")

const thinkSource = readFileSync(new URL("../src/app/api/run-arcade/think/route.ts", import.meta.url), "utf8")
const braveSource = readFileSync(new URL("../src/app/api/run-arcade/brave/route.ts", import.meta.url), "utf8")

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function withEnv<T>(values: Record<string, string | null>, run: () => Promise<T>) {
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]))
  for (const [key, value] of Object.entries(values)) {
    if (value === null) delete process.env[key]
    else process.env[key] = value
  }
  return run().finally(() => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
}

test("each outgoing request of both routes stops when the browser cancels, and keeps its own time limit", () => {
  assert.match(thinkSource, /AbortSignal\.any\(\[request\.signal, AbortSignal\.timeout\(TIMEOUT_MS\)\]\)/)
  assert.match(braveSource, /AbortSignal\.any\(\[request\.signal, AbortSignal\.timeout\(10_000\)\]\)/)
  assert.match(braveSource, /AbortSignal\.any\(\[cancelled, AbortSignal\.timeout\(HEALTH_TIMEOUT_MS\)\]\)/)
  assert.match(braveSource, /hiddenDraws\(cutoff, request\.signal\)/)
  assert.equal(/signal: AbortSignal\.timeout\(/.test(thinkSource), false)
  assert.equal(/signal: AbortSignal\.timeout\(/.test(braveSource), false)
})

test("a call cut by the browser is not logged as a model failure", () => {
  const cut = thinkSource.indexOf("request.signal.aborted")
  const logged = thinkSource.indexOf('recordLlmUsage({ surface: "brain", provider: "local", model, ok: false')
  assert.ok(cut > 0 && logged > cut)
})

function thinkRequest(controller?: AbortController) {
  return new Request("http://localhost/api/run-arcade/think", {
    method: "POST",
    body: JSON.stringify({ system: "s", user: "u", seed: 1 }),
    signal: controller?.signal,
  }) as NextRequest
}

test("the think route cuts the model call as soon as the browser cancels", async () => {
  const events: string[] = []
  let generationEnded = false
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith("/api/tags")) {
      res.setHeader("content-type", "application/json")
      res.end(JSON.stringify({ models: [{ name: "llama3.2:latest" }] }))
      return
    }
    if (req.url?.startsWith("/api/chat")) {
      events.push("génération commencée")
      req.on("close", () => {
        if (!generationEnded) events.push("connexion coupée")
      })
      const timer = setTimeout(() => {
        generationEnded = true
        res.setHeader("content-type", "application/json")
        res.end(JSON.stringify({ message: { content: '{"action":"brave"}' }, prompt_eval_count: 10, eval_count: 5 }))
      }, 3000)
      res.on("close", () => clearTimeout(timer))
      return
    }
    res.statusCode = 404
    res.end("{}")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = (server.address() as AddressInfo).port
  try {
    await withEnv({ OLLAMA_HOST: `http://127.0.0.1:${port}`, NETLIFY: "true" }, async () => {
      const controller = new AbortController()
      const started = Date.now()
      const pending = think.POST(thinkRequest(controller))
      await wait(400)
      assert.deepEqual(events, ["génération commencée"])
      controller.abort()
      const response = await pending
      const elapsed = Date.now() - started
      assert.ok(elapsed < 2000, `la route a répondu après ${elapsed} ms : le modèle a fini sa génération`)
      assert.equal(response.status, 499)
      assert.equal(((await response.json()) as { ok: boolean }).ok, false)
      await wait(150)
      assert.deepEqual(events, ["génération commencée", "connexion coupée"])
      assert.equal(generationEnded, false)
    })
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
})

test("the think route still answers when nobody cancels", async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json")
    if (req.url?.startsWith("/api/tags")) {
      res.end(JSON.stringify({ models: [{ name: "llama3.2:latest" }] }))
      return
    }
    res.end(JSON.stringify({ message: { content: '{"action":"brave"}' }, prompt_eval_count: 10, eval_count: 5 }))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = (server.address() as AddressInfo).port
  try {
    await withEnv({ OLLAMA_HOST: `http://127.0.0.1:${port}`, NETLIFY: "true" }, async () => {
      const response = await think.POST(thinkRequest())
      assert.equal(response.status, 200)
      const body = (await response.json()) as { ok: boolean; text: string }
      assert.equal(body.ok, true)
      assert.equal(body.text, '{"action":"brave"}')
    })
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
})

const SEARCH = { query: "n1 et n2, même sens, même pas", from: "2025-01-01", cutoff: "2026-08-07", through: "2026-10-23" }
const OCTOBER = { draw_date: "2026-10-23", numbers: [3, 17, 22, 38, 44], stars: [2, 9] }

function braveRequest(controller: AbortController) {
  return new Request("http://localhost/api/run-arcade/brave", {
    method: "POST",
    body: JSON.stringify(SEARCH),
    signal: controller.signal,
  }) as NextRequest
}

type Outgoing = { url: string; signal: AbortSignal }

/** La vraie route Brave, avec une fausse API des tirages et un faux Brave : `slow` dit lequel des deux ne répond jamais. */
async function cancelled(slow: "draws" | "brave") {
  const outgoing: Outgoing[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const signal = init?.signal as AbortSignal
    outgoing.push({ url, signal })
    if (url.startsWith("http://api.test/api/draws") && slow !== "draws") return Promise.resolve(Response.json({ items: [OCTOBER] }))
    return new Promise<Response>((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true })
    })
  }) as typeof fetch
  try {
    return await withEnv({ BRAVE_API_KEY: "BSA-test-key-0123456789abcdef", SYNCHRO_API_URL: "http://api.test", NETLIFY: null }, async () => {
      const controller = new AbortController()
      const started = Date.now()
      const pending = brave.POST(braveRequest(controller))
      await wait(150)
      const before = outgoing.map((call) => ({ url: call.url, aborted: call.signal.aborted }))
      controller.abort()
      await pending
      return {
        before,
        after: outgoing.map((call) => ({ url: call.url, aborted: call.signal.aborted })),
        elapsed: Date.now() - started,
      }
    })
  } finally {
    globalThis.fetch = realFetch
  }
}

test("the Brave route stops reading the draws API when the browser cancels, and never calls Brave", async () => {
  const run = await cancelled("draws")
  assert.deepEqual(run.before, [{ url: "http://api.test/api/draws?limit=200&offset=0", aborted: false }])
  assert.deepEqual(run.after, [{ url: "http://api.test/api/draws?limit=200&offset=0", aborted: true }])
  assert.ok(run.elapsed < 2000, `la route a attendu ${run.elapsed} ms`)
})

test("the Brave route stops its search when the browser cancels, once the draws are read", async () => {
  const run = await cancelled("brave")
  assert.equal(run.before.length, 2)
  assert.match(run.before[0].url, /^http:\/\/api\.test\/api\/draws/)
  assert.match(run.before[1].url, /^https:\/\/api\.search\.brave\.com\//)
  assert.deepEqual(
    run.before.map((call) => call.aborted),
    [false, false]
  )
  assert.equal(run.after[1].aborted, true)
  assert.ok(run.elapsed < 2000, `la route a attendu ${run.elapsed} ms`)
})
