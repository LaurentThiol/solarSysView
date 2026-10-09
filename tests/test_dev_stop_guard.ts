import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import vm from "node:vm"

import { devStopGuardSource } from "../src/lib/dev-stop-guard.ts"
import { requestLocalStop } from "../src/lib/dev-stop.ts"

type Style = { cssText: string; setProperty: (name: string, value: string) => void } & Record<string, string>

type El = {
  tag: string
  id: string
  attrs: Record<string, string>
  style: Style
  innerHTML: string
  children: El[]
  parent: El | null
  appendChild: (child: El) => El
}

function createDom() {
  const observers: Array<() => void> = []

  function fire() {
    for (const cb of observers) cb()
  }

  function make(tag: string): El {
    const el = {
      tag,
      id: "",
      attrs: {},
      innerHTML: "",
      children: [] as El[],
      parent: null as El | null,
      style: {} as Style,
      appendChild(child: El) {
        if (child.parent) {
          child.parent.children = child.parent.children.filter((node) => node !== child)
        }
        child.parent = el
        el.children.push(child)
        fire()
        return child
      },
    }
    el.style.setProperty = (name: string, value: string) => {
      el.style[name] = value
    }
    el.setAttribute = (name: string, value: string) => {
      el.attrs[name] = value
    }
    return el as El & { setAttribute: (name: string, value: string) => void }
  }

  const html = make("html")
  const body = make("body")
  html.appendChild(body)
  observers.length = 0

  function walk(node: El, visit: (node: El) => void) {
    visit(node)
    for (const child of node.children) walk(child, visit)
  }

  const document = {
    documentElement: html,
    body,
    createElement: (tag: string) => make(tag),
    getElementById(id: string) {
      let found: El | null = null
      walk(html, (node) => {
        if (node.id === id) found = node
      })
      return found
    },
    querySelectorAll(sel: string) {
      const found: El[] = []
      walk(html, (node) => {
        if (sel.includes("nextjs-portal") && node.tag === "nextjs-portal") found.push(node)
        if (sel.includes("data-nextjs-dev-overlay") && node.attrs["data-nextjs-dev-overlay"] != null) {
          found.push(node)
        }
      })
      return found
    },
  }

  class MutationObserver {
    constructor(cb: () => void) {
      observers.push(cb)
    }
    observe() {}
    disconnect() {}
  }

  return { document, MutationObserver, body }
}

  class FakeSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  url: string
  readyState = FakeSocket.OPEN
  _onmessage: ((event: unknown) => void) | null = null
  _onclose: ((event: unknown) => void) | null = null
  _onerror: ((event: unknown) => void) | null = null
  _onopen: ((event: unknown) => void) | null = null

  constructor(url: string) {
    this.url = String(url)
  }

  close() {
    this.readyState = FakeSocket.CLOSED
    this._onclose?.({ type: "close" })
  }

  emit(type: "message" | "close" | "error" | "open", event: unknown = {}) {
    const fn = this[`_on${type}`]
    fn?.(event)
  }
}

for (const prop of ["onmessage", "onclose", "onerror", "onopen"] as const) {
  Object.defineProperty(FakeSocket.prototype, prop, {
    configurable: true,
    enumerable: true,
    get(this: FakeSocket) {
      return this[`_${prop}`]
    },
    set(this: FakeSocket, fn: ((event: unknown) => void) | null) {
      this[`_${prop}`] = fn
    },
  })
}

function installGuard() {
  const dom = createDom()
  const sandbox = {
    window: {
      WebSocket: FakeSocket,
      document: dom.document,
    } as Record<string, unknown>,
    document: dom.document,
    MutationObserver: dom.MutationObserver,
    Object,
    String,
  }
  sandbox.window = sandbox.window
  vm.runInNewContext(devStopGuardSource, sandbox)
  return { sandbox, body: dom.body, document: dom.document }
}

test("quitting hides the compiling portal and ignores a later HMR message", () => {
  const { sandbox, document } = installGuard()
  const portal = document.createElement("nextjs-portal")
  portal.innerHTML = "Compiling"
  document.body.appendChild(portal)

  const ws = new (sandbox.window.WebSocket as typeof FakeSocket)("ws://127.0.0.1:43147/_next/hmr?id=1")
  let messages = 0
  let closes = 0
  ws.onmessage = () => {
    messages += 1
  }
  ws.onclose = () => {
    closes += 1
  }
  ws.emit("message", { data: '{"type":"building"}' })
  assert.equal(messages, 1)

  const show = sandbox.window.__synchroShowStopped as () => void
  show()

  assert.equal(messages, 1)
  assert.equal(closes, 0)
  assert.equal(portal.style.display, "none")
  assert.equal(portal.style.visibility, "hidden")
  const stopped = document.getElementById("synchro-stopped")
  assert.ok(stopped)
  assert.match(stopped.innerHTML, /Synchro est arrêté/)
  assert.match(stopped.innerHTML, /fermer cet onglet/)

  ws.emit("message", { data: '{"type":"building"}' })
  assert.equal(messages, 1)

  const late = document.createElement("nextjs-portal")
  document.body.appendChild(late)
  assert.equal(late.style.display, "none")
  assert.equal(document.querySelectorAll("nextjs-portal").length, 2)
})

test("a non-dev socket still receives events after the stop", () => {
  const { sandbox } = installGuard()
  const ws = new (sandbox.window.WebSocket as typeof FakeSocket)("ws://127.0.0.1:11434/api")
  let messages = 0
  ws.onmessage = () => {
    messages += 1
  }
  const show = sandbox.window.__synchroShowStopped as () => void
  show()
  ws.emit("message", {})
  assert.equal(messages, 1)
  assert.equal(ws.readyState, FakeSocket.OPEN)
})

test("an HMR listener added after the stop stays silent", () => {
  const { sandbox } = installGuard()
  const show = sandbox.window.__synchroShowStopped as () => void
  show()
  const ws = new (sandbox.window.WebSocket as typeof FakeSocket)("ws://127.0.0.1:43147/_next/hmr")
  let messages = 0
  ws.onmessage = () => {
    messages += 1
  }
  ws.emit("message", {})
  assert.equal(messages, 0)
})

test("installing the guard twice leaves the stop screen idempotent", () => {
  const { sandbox, document } = installGuard()
  vm.runInNewContext(devStopGuardSource, sandbox)
  const show = sandbox.window.__synchroShowStopped as () => void
  show()
  show()
  const screens = document.body.children.filter((node) => node.id === "synchro-stopped")
  assert.equal(screens.length, 1)
})

test("stop freezes the page before calling the API", async () => {
  const order: string[] = []
  const previous = globalThis.window
  globalThis.window = {
    __synchroFreezeDev() {
      order.push("freeze")
    },
    __synchroShowStopped() {
      order.push("show")
    },
  } as unknown as Window & typeof globalThis
  try {
    await requestLocalStop(async (input) => {
      order.push(String(input))
      return new Response(null, { status: 200 })
    }, "http://127.0.0.1:8000")
    assert.deepEqual(order, ["freeze", "show", "http://127.0.0.1:8000/api/shutdown"])
  } finally {
    globalThis.window = previous
  }
})

test("a dead Python API falls back to the Next route", async () => {
  const calls: string[] = []
  const previous = globalThis.window
  globalThis.window = {} as unknown as Window & typeof globalThis
  try {
    await requestLocalStop(async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.startsWith("http://127.0.0.1:8000")) throw new Error("ECONNREFUSED")
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }, "http://127.0.0.1:8000/")
    assert.deepEqual(calls, ["http://127.0.0.1:8000/api/shutdown", "/api/shutdown"])
  } finally {
    globalThis.window = previous
  }
})

test("the root layout installs the guard before the app", () => {
  const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8")
  const quit = readFileSync(new URL("../src/components/startup-status.tsx", import.meta.url), "utf8")
  assert.match(layout, /devStopGuardSource/)
  assert.match(layout, /<script dangerouslySetInnerHTML=\{\{ __html: devStopGuardSource \}\} \/>/)
  const scriptAt = layout.indexOf("<script")
  const headerAt = layout.indexOf("<SiteHeader")
  assert.ok(scriptAt > 0 && scriptAt < headerAt)
  assert.match(quit, /requestLocalStop/)
  assert.doesNotMatch(quit, /fetch\("\/api\/shutdown"/)
  assert.match(devStopGuardSource, /\/_next\/hmr/)
  assert.match(devStopGuardSource, /nextjs-portal/)
  assert.doesNotMatch(devStopGuardSource, /<\/script/)
})
