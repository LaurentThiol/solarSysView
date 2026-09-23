import assert from "node:assert/strict"
import test from "node:test"

import { setLlmTransport } from "../src/lib/ia/loopback-fetch.ts"
import { backendStatus } from "../src/lib/startup-backend.ts"

test("a slow health probe leaves the API up", async () => {
  setLlmTransport(async (url) => {
    if (url.endsWith("/api/alive")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })
    }
    throw new Error("The operation was aborted due to timeout")
  })
  try {
    const status = await backendStatus("http://127.0.0.1:8000")
    assert.equal(status.ok, true)
    assert.equal(status.error, undefined)
    assert.match(String(status.health?.neon?.error), /délai/)
    assert.equal(status.health?.neon?.ok, false)
  } finally {
    setLlmTransport(null)
  }
})

test("an alive timeout is a French deadline", async () => {
  setLlmTransport(async () => {
    throw new Error("timeout 8000ms http://127.0.0.1:8000/api/alive")
  })
  try {
    const status = await backendStatus("http://127.0.0.1:8000")
    assert.equal(status.ok, false)
    assert.equal(status.error, "délai dépassé")
  } finally {
    setLlmTransport(null)
  }
})

test("a refused API is stopped, not an English socket error", async () => {
  setLlmTransport(async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:8000")
  })
  try {
    const status = await backendStatus("http://127.0.0.1:8000")
    assert.equal(status.ok, false)
    assert.equal(status.error, "arrêtée")
  } finally {
    setLlmTransport(null)
  }
})
