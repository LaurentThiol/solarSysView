import http from "node:http"
import https from "node:https"
import type { IncomingMessage, OutgoingHttpHeaders } from "node:http"
import { URL } from "node:url"

import { isLoopbackHostname } from "@/lib/ia/local-url"

export type LlmTransport = (url: string, init?: RequestInit) => Promise<Response>

let llmTransport: LlmTransport | null = null

export function setLlmTransport(fn: LlmTransport | null) {
  llmTransport = fn
}

function headerRecord(headers?: HeadersInit): OutgoingHttpHeaders {
  const out: OutgoingHttpHeaders = { connection: "close", accept: "application/json" }
  if (!headers) return out
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value
    })
    return out
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value
    return out
  }
  return { ...out, ...headers }
}

function incomingToWebStream(res: IncomingMessage): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      res.on("data", (chunk: Buffer | string) => {
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk
        controller.enqueue(new Uint8Array(buf))
      })
      res.on("end", () => controller.close())
      res.on("error", (error) => controller.error(error))
    },
    cancel() {
      res.destroy()
    },
  })
}

export function nodeLoopbackFetch(url: string, init: RequestInit = {}, timeoutMs = 5_000): Promise<Response> {
  return new Promise((resolve, reject) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch (error) {
      reject(error)
      return
    }
    const isHttps = parsed.protocol === "https:"
    const lib = isHttps ? https : http
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "")
    const family = hostname === "127.0.0.1" || hostname === "0.0.0.0" ? 4 : hostname === "::1" ? 6 : undefined
    const headers = headerRecord(init.headers)
    const body = typeof init.body === "string" ? init.body : undefined
    if (body && headers["content-length"] == null) {
      headers["content-length"] = Buffer.byteLength(body)
    }
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname,
        family,
        port: Number(parsed.port) || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: (init.method || "GET").toUpperCase(),
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const hdrs = new Headers()
        for (const [key, value] of Object.entries(res.headers)) {
          if (value == null || key === "transfer-encoding") continue
          hdrs.set(key, Array.isArray(value) ? value.join(", ") : value)
        }
        resolve(
          new Response(incomingToWebStream(res), {
            status: res.statusCode || 502,
            headers: hdrs,
          })
        )
      }
    )
    const fail = (error: unknown) => {
      req.destroy()
      reject(error instanceof Error ? error : new Error(String(error)))
    }
    req.on("timeout", () => fail(new Error(`timeout ${timeoutMs}ms ${url}`)))
    req.on("error", fail)
    if (init.signal) {
      if (init.signal.aborted) {
        fail(new Error("aborted"))
        return
      }
      init.signal.addEventListener("abort", () => fail(new Error("aborted")), { once: true })
    }
    if (body) req.write(body)
    req.end()
  })
}

export async function llmFetch(url: string, init: RequestInit = {}, timeoutMs = 5_000): Promise<Response> {
  if (llmTransport) return llmTransport(url, init)
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return fetch(url, { cache: "no-store", ...init })
  }
  if (isLoopbackHostname(parsed.hostname)) {
    return nodeLoopbackFetch(url, init, timeoutMs)
  }
  return fetch(url, { cache: "no-store", ...init })
}