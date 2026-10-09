/**
 * S'installe avant le client Next. Au quit, le dev server compile encore
 * `/api/shutdown` et envoie « Compiling » sur le WebSocket HMR ; le SIGTERM
 * coupe ensuite ce socket. Sans ce garde, le badge reste affiché et le client
 * HMR recharge une origine morte.
 */
export const devStopGuardSource = `(function () {
  if (window.__synchroFreezeDev) return
  var sockets = []
  var NativeWS = window.WebSocket

  function stopped() {
    return window.__SYNCHRO_STOP === true
  }

  function isHmr(url) {
    return String(url).indexOf("/_next/hmr") !== -1
  }

  function hideDevUi() {
    if (!document.querySelectorAll) return
    var nodes = document.querySelectorAll("nextjs-portal, [data-nextjs-dev-overlay]")
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i]
      if (!el.style || !el.style.setProperty) continue
      el.style.setProperty("display", "none", "important")
      el.style.setProperty("visibility", "hidden", "important")
      el.style.setProperty("pointer-events", "none", "important")
    }
  }

  function ensureObserver() {
    if (window.__synchroDevStopObserving) return
    if (typeof MutationObserver !== "function" || !document.documentElement) return
    window.__synchroDevStopObserving = true
    new MutationObserver(function () {
      if (stopped()) hideDevUi()
    }).observe(document.documentElement, { childList: true, subtree: true })
  }

  function guard(ws, prop) {
    var desc = Object.getOwnPropertyDescriptor(NativeWS.prototype, prop)
    if (!desc || typeof desc.set !== "function") return
    var userFn = null
    Object.defineProperty(ws, prop, {
      configurable: true,
      enumerable: true,
      get: function () {
        return userFn
      },
      set: function (fn) {
        userFn = typeof fn === "function" ? fn : null
        desc.set.call(ws, function (event) {
          if (stopped()) return
          if (userFn) return userFn.call(ws, event)
        })
      },
    })
  }

  function wrapListener(ws) {
    if (typeof ws.addEventListener !== "function") return
    var orig = ws.addEventListener.bind(ws)
    ws.addEventListener = function (type, fn, opts) {
      if (type !== "message" && type !== "close" && type !== "error" && type !== "open") {
        return orig(type, fn, opts)
      }
      return orig(type, function (event) {
        if (stopped()) return
        if (typeof fn === "function") return fn.call(ws, event)
      }, opts)
    }
  }

  function Patched(url, protocols) {
    var ws = arguments.length > 1 ? new NativeWS(url, protocols) : new NativeWS(url)
    if (!isHmr(url)) return ws
    sockets.push(ws)
    wrapListener(ws)
    guard(ws, "onopen")
    guard(ws, "onmessage")
    guard(ws, "onerror")
    guard(ws, "onclose")
    return ws
  }

  if (typeof NativeWS === "function") {
    Patched.prototype = NativeWS.prototype
    Patched.CONNECTING = NativeWS.CONNECTING
    Patched.OPEN = NativeWS.OPEN
    Patched.CLOSING = NativeWS.CLOSING
    Patched.CLOSED = NativeWS.CLOSED
    window.WebSocket = Patched
  }

  function freeze() {
    window.__SYNCHRO_STOP = true
    ensureObserver()
    hideDevUi()
    for (var i = 0; i < sockets.length; i++) {
      try {
        sockets[i].close()
      } catch (err) {}
    }
  }

  function showStopped() {
    freeze()
    if (!document.body || document.getElementById("synchro-stopped")) return
    var el = document.createElement("div")
    el.id = "synchro-stopped"
    el.setAttribute("role", "status")
    el.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:#141a2b;color:#f4f1e8;font:16px/1.45 ui-sans-serif,system-ui,sans-serif;text-align:center"
    el.innerHTML = '<div><p style="font-size:1.125rem;font-weight:500;margin:0">Synchro est arrêté</p><p style="margin:8px 0 0;color:#c9c3b4;font-size:0.875rem">Vous pouvez fermer cet onglet.</p></div>'
    document.body.appendChild(el)
    hideDevUi()
  }

  window.__synchroFreezeDev = freeze
  window.__synchroShowStopped = showStopped
  ensureObserver()
})()
`

declare global {
  interface Window {
    __SYNCHRO_STOP?: boolean
    __synchroDevStopObserving?: boolean
    __synchroFreezeDev?: () => void
    __synchroShowStopped?: () => void
  }
}
