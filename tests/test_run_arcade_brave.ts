import assert from "node:assert/strict"
import { register } from "node:module"
import test from "node:test"

import type { NextRequest } from "next/server"

import { askBrave } from "../src/lib/run-arcade/client.ts"
import { RACE_DRAWS_MAX } from "../src/lib/run-arcade/depart.ts"
import { EXAM_WINDOW } from "../src/lib/run-arcade/examen.ts"
import { RUN_ARCADE_HELP } from "../src/lib/run-arcade/help.ts"
import {
  citedDates,
  citesLateDate,
  filterResults,
  freshness,
  guardQuery,
  keepResult,
  knowsThrough,
  starsLeak,
  valuesNear,
  withExclusions,
  type BraveItem,
  type HiddenDraw,
} from "../src/lib/run-arcade/brave-filter.ts"
import { BRAVE_SEARCH_CAP, type BraveReply } from "../src/lib/run-arcade/session.ts"

register("./node-next-stub.mjs", import.meta.url)
const { POST } = await import("../src/app/api/run-arcade/brave/route.ts")

const cutoff = "2026-08-04"
const hidden: HiddenDraw[] = [{ date: "2026-08-04", numbers: [7, 12, 23, 38, 44], stars: [3, 9] }]

function item(text: string, age = "2025-11-02T08:00:00"): BraveItem {
  return { title: "Méthode", url: "https://exemple.fr/a", description: text, page_age: age }
}

test("dates are read in French and English, with or without the day", () => {
  assert.deepEqual(citedDates("tirage du 4 août 2026, puis 2026-08-07 et 11/08/2026", 2026).days, [
    "2026-08-04",
    "2026-08-07",
    "2026-08-11",
    "2026-11-08",
  ])
  assert.deepEqual(citedDates("draw of August 7, 2026", 2026).days, ["2026-08-07"])
  assert.equal(citesLateDate("résultats d’août 2026", cutoff), true)
  assert.equal(citesLateDate("résultats de juillet 2026", cutoff), false)
  assert.equal(citesLateDate("le 3 août 2026", cutoff), false)
})

/** [nom, texte, jours lus, mois lus] : l’année 2026 est celle de la coupure, pour un jour sans année. */
const FORMATS: [string, string, string[], string[]][] = [
  ["ISO, tirets", "mis à jour le 2026-09-01", ["2026-09-01"], []],
  ["ISO, barres", "mis à jour le 2026/09/01", ["2026-09-01"], []],
  ["ISO, points", "mis à jour le 2026.09.01", ["2026-09-01"], []],
  ["ISO, heure collée", "published 2026-09-01T10:00:00Z", ["2026-09-01"], []],
  ["ISO, heure après une espace", "published 2026-09-01 10:00:00", ["2026-09-01"], []],
  ["ISO compact", "tirage 20260901", ["2026-09-01"], []],
  ["JJ/MM/AAAA, deux lectures", "tirage du 01/09/2026", ["2026-01-09", "2026-09-01"], []],
  ["JJ-MM-AAAA, deux lectures", "tirage du 11-09-2026", ["2026-09-11", "2026-11-09"], []],
  ["JJ.MM.AAAA, une seule lecture", "tirage du 14.08.2026", ["2026-08-14"], []],
  ["MM/JJ/AA, une seule lecture", "tirage du 08/14/26", ["2026-08-14"], []],
  ["année à deux chiffres", "Tirage du 11/09/26 : 3 gagnants", ["2026-09-11", "2026-11-09"], []],
  ["mois abrégé avec point (fr)", "Tirage du 30 oct. 2026", ["2026-10-30"], []],
  ["mois abrégé sans point (fr)", "Tirage du 30 oct 2026", ["2026-10-30"], []],
  ["1er et septembre abrégé", "Tirage du 1er sept. 2026", ["2026-09-01"], []],
  ["janvier abrégé, année d’après", "Tirage du 14 janv. 2027", ["2027-01-14"], []],
  ["février abrégé sans accent", "Tirage du 3 fevr 2026", ["2026-02-03"], []],
  ["majuscules et accent", "LE 7 AOÛT 2026", ["2026-08-07"], []],
  ["espaces insécables", "le 7\u00a0août\u202f2026", ["2026-08-07"], []],
  ["mois en lettres, année à deux chiffres", "Tirage du 7 août 26", ["2026-08-07"], []],
  ["mois anglais d’abord, virgule", "Draw of Aug 14, 2026", ["2026-08-14"], []],
  ["mois anglais abrégé avec point", "Draw of Aug. 14 2026", ["2026-08-14"], []],
  ["ordinal anglais", "Draw of August 14th, 2026", ["2026-08-14"], []],
  ["jour d’abord, virgule après le mois", "Draw of 14 August, 2026", ["2026-08-14"], []],
  ["the 7th of August", "the 7th of August 2026", ["2026-08-07"], []],
  ["jour et mois sans année", "Tirage du vendredi 14 août : 3 gagnants", ["2026-08-14"], []],
  ["jour et mois anglais sans année", "Friday Aug 14", ["2026-08-14"], []],
  ["JJ/MM sans année", "tirage du 14/08", ["2026-08-14"], []],
  ["MM/JJ sans année", "tirage du 08/14", ["2026-08-14"], []],
  ["JJ/MM ou MM/JJ sans année", "tirage du 03/04", ["2026-03-04", "2026-04-03"], []],
  ["JJ-MM sans année", "tirage du 14-08", ["2026-08-14"], []],
  ["MM-JJ sans année", "tirage du 08-14", ["2026-08-14"], []],
  ["JJ-MM ou MM-JJ sans année", "tirage du 03-04", ["2026-03-04", "2026-04-03"], []],
  ["JJ.MM sans année", "tirage du 14.08", ["2026-08-14"], []],
  ["MM.JJ sans année", "tirage du 08.14", ["2026-08-14"], []],
  ["JJ.MM ou MM.JJ sans année", "tirage du 03.04", ["2026-03-04", "2026-04-03"], []],
  ["mois et année", "résultats d’août 2026", [], ["2026-08"]],
  ["mois abrégé et année", "Résultats de sept. 2026", [], ["2026-09"]],
  ["AAAA-MM", "archive 2026-09", [], ["2026-09"]],
  ["MM/AAAA", "archive 09/2026", [], ["2026-09"]],
  ["une date complète n’est pas aussi un mois", "le 3 août 2026", ["2026-08-03"], []],
  ["un jour qui n’existe pas", "le 31/04/2026 et le 29 février 2026", [], []],
  ["un 29 février qui existe", "le 29 février 2028", ["2028-02-29"], []],
  ["pas des dates", "r = 0.92 et 3.14 sur 12 octets, 3 marchés, 5 decisions, le mardi", [], []],
]

test("one reader gives the dates of every format of the table", () => {
  for (const [name, text, days, months] of FORMATS) {
    assert.deepEqual(citedDates(text, 2026), { days, months }, name)
  }
  // Sans année de référence, un jour sans année est ignoré : on ne devine pas.
  assert.deepEqual(citedDates("tirage du 14 août et du 14/08", undefined), { days: [], months: [] })
})

/** Les pages dont la date est écrite autrement, et que l’ancien filtre gardait : aucune n’a de page_age. */
const LATE_PAGES: [string, string][] = [
  ["ISO avec barres", "Statistiques mises à jour le 2026/09/01 : 3 gagnants"],
  ["ISO avec heure", "published 2026-09-01T10:00:00Z, 3 gagnants"],
  ["année à deux chiffres", "Tirage du 11/09/26 : 3 gagnants"],
  ["mois abrégé (fr)", "Tirage du 30 oct. 2026 : 3 gagnants"],
  ["mois abrégé (en)", "Draw of Aug 14, 2026: 3 winners"],
  ["virgule après le mois", "Draw of 14 August, 2026: 3 winners"],
  ["sans l’année", "Tirage du vendredi 14 août : 3 gagnants"],
  ["date complète (contrôle)", "Tirage du 14 août 2026 : 3 gagnants"],
  ["JJ/MM sans année", "Tirage du 14/08 : 3 gagnants"],
  ["JJ-MM sans année", "Tirage du 14-08 : 3 gagnants"],
  ["JJ.MM sans année", "Tirage du 14.08 : 3 gagnants"],
  ["ISO compact", "tirage 20260901"],
  ["mois en lettres", "Résultats d’octobre 2026"],
]

const KEPT_PAGES: [string, string][] = [
  ["octobre d’un an plus tôt", "Tirage du 30 oct. 2025 : 3 gagnants"],
  ["année à deux chiffres, un an plus tôt", "Tirage du 11/09/25"],
  ["mois anglais, un an plus tôt", "Draw of Aug 14, 2025"],
  ["ISO avec barres, un an plus tôt", "mis à jour le 2025/09/01"],
  ["ISO avec heure, un an plus tôt", "published 2025-09-01T10:00:00Z"],
  ["jour sans année avant la coupure", "Tirage du 30 mai"],
  ["mois d’avant la coupure", "résultats de juillet 2026"],
  ["jour de la même année avant la coupure", "le 3 août 2026"],
  ["une fraction qui ressemble à une date passée", "une chance sur 1/6"],
  ["des nombres", "r = 0.92 sur 12 octets et 3 marchés"],
]

test("a page that cites a late date in any format is removed, a page of before is kept", () => {
  const late = "2026-08-07"
  const wanted: HiddenDraw[] = [{ date: late, numbers: [7, 12, 23, 38, 44], stars: [3, 9] }]
  const page = (text: string): BraveItem => ({ title: "Page", url: "https://exemple.fr/x", description: text })
  for (const [name, text] of LATE_PAGES) assert.equal(keepResult(page(text), late, wanted), false, name)
  for (const [name, text] of KEPT_PAGES) assert.equal(keepResult(page(text), late, wanted), true, name)
})

test("a relation phrase never looks like a late date", () => {
  const phrases = [
    "n1 et n2, même sens, n2 en retard d’un pas",
    "Σn et e1, sens opposé, même pas",
    "d3 et Σ★, même sens, Σ★ en retard de deux pas",
    "n5, mardi et vendredi, écart de 4 jours",
    "d0, d’une année sur l’autre, sens opposé, décalage de 11 jours",
    "n3, d’une année sur l’autre, même sens, sans décalage",
  ]
  for (const phrase of phrases) assert.equal(guardQuery(phrase, "2026-08-07").ok, true, phrase)
  assert.equal(guardQuery("résultats du 2026/09/01", "2026-08-07").ok, false)
  assert.equal(guardQuery("draw of Aug 14, 2026", "2026-08-07").ok, false)
})

test("a long text without a date is read in linear time", () => {
  const texts = ["août ".repeat(50_000), "14 août ".repeat(20_000), "1/2/3 ".repeat(30_000), "2026-".repeat(20_000)]
  const started = performance.now()
  for (const text of texts) citedDates(text, 2026)
  assert.ok(performance.now() - started < 2_000)
})

test("a page without page_age is kept when clean, and a late or invalid page_age is removed", () => {
  assert.equal(keepResult({ ...item("φ et suites"), page_age: undefined }, cutoff, hidden), true)
  assert.equal(keepResult({ ...item("φ et suites"), page_age: "   " }, cutoff, hidden), true)
  assert.equal(keepResult({ ...item("tirage du 4 août 2026"), page_age: undefined }, cutoff, hidden), false)
  assert.equal(keepResult({ ...item("Combinaison : 44 07 23 12 38"), page_age: undefined }, cutoff, hidden), false)
  assert.equal(keepResult({ ...item("étoiles : 9 et 3"), page_age: undefined }, cutoff, hidden), false)
  assert.equal(keepResult(item("φ et suites", "invalid-date"), cutoff, hidden), false)
  assert.equal(keepResult(item("φ et suites", "2026-08-04T06:00:00"), cutoff, hidden), false)
  assert.equal(keepResult(item("φ et suites", "2026-08-03T23:00:00"), cutoff, hidden), true)
})

test("the five numbers of a hidden draw are found in any order", () => {
  assert.equal(valuesNear("44 - 07 - 23 - 12 - 38", [7, 12, 23, 38, 44], 80), true)
  assert.equal(keepResult(item("Combinaison : 44 07 23 12 38"), cutoff, hidden), false)
  const spread = `7 ${"x".repeat(60)} 12 ${"x".repeat(60)} 23 ${"x".repeat(60)} 38 ${"x".repeat(60)} 44`
  assert.equal(keepResult(item(spread), cutoff, hidden), true)
  assert.equal(keepResult(item("Fréquences 2025 : 7, 12, 23, 38, 41"), cutoff, hidden), true)
})

test("the two stars count next to a star word, or with three numbers of the draw", () => {
  assert.equal(starsLeak("entre 3 et 9 heures", hidden[0]), false)
  assert.equal(keepResult(item("entre 3 et 9 heures"), cutoff, hidden), true)
  assert.equal(keepResult(item("étoiles : 9 et 3"), cutoff, hidden), false)
  assert.equal(keepResult(item("Lucky stars 3 9"), cutoff, hidden), false)
  assert.equal(keepResult(item("12 38 44 + 3 9"), cutoff, hidden), false)
})

test("kept results come back cleaned, without counting what was removed", () => {
  const notes = filterResults(
    [
      item("Le <strong>nombre d’or</strong> &amp; les suites", "2025-03-01"),
      item("Combinaison : 44 07 23 12 38"),
    ],
    cutoff,
    hidden
  )
  assert.equal(notes.length, 1)
  assert.equal(notes[0].snippet, "Le nombre d’or les suites")
})

test("the query stays before the cutoff and skips results sites", () => {
  assert.equal(freshness("2025-01-01", cutoff), "2025-01-01to2026-08-03")
  assert.equal(guardQuery("résultats du 7 août 2026", cutoff).ok, false)
  assert.equal(guardQuery("euromillions 2027", cutoff).ok, false)
  assert.equal(guardQuery("euromillions 2026 fréquences", cutoff).ok, true)
  assert.equal(guardQuery("   ", cutoff).ok, false)
  const query = withExclusions("nombre d’or")
  assert.match(query, /-site:fdj\.fr/)
  assert.match(query, /-résultat/)
  assert.match(query, /-loto/)
  assert.match(query, /^nombre d’or /)
})

test("the filter knows the last draw of the track, or it does not vouch for what is hidden", () => {
  const known: HiddenDraw[] = [
    { date: "2026-10-20", numbers: [1, 2, 3, 4, 5], stars: [1, 2] },
    { date: "2026-10-23", numbers: [3, 17, 22, 38, 44], stars: [2, 9] },
  ]
  assert.equal(knowsThrough(known, "2026-10-23"), true)
  assert.equal(knowsThrough(known, "2026-10-20"), true)
  assert.equal(knowsThrough(known, "2026-10-27"), false)
  assert.equal(knowsThrough([], "2026-10-23"), false)
})

type Network = {
  /** L’API Python des tirages : sa réponse, `cut` (le réseau échoue) ou `none` (aucune adresse, comme en production). */
  api: Response | "cut" | "none"
  /** Ce que Brave rend. */
  pages?: BraveItem[]
  /** Corps Brave brut, quand il ne porte pas une liste de résultats. */
  braveBody?: unknown
}

const SEARCH = { query: "n1 et n2, même sens, même pas", from: "2025-01-01", cutoff: "2026-08-07", through: "2026-10-23" }

function apiDraws(rows: { draw_date: string; numbers?: number[]; stars?: number[] }[]) {
  return Response.json({ items: rows })
}

const OCTOBER = { draw_date: "2026-10-23", numbers: [3, 17, 22, 38, 44], stars: [2, 9] }

/** Appelle la vraie route, avec un faux Brave et une fausse API : les adresses appelées sont rendues dans l’ordre. */
async function ask(body: Record<string, unknown>, network: Network) {
  const calls: string[] = []
  const realFetch = globalThis.fetch
  const before = {
    key: process.env.BRAVE_API_KEY,
    api: process.env.SYNCHRO_API_URL,
    netlify: process.env.NETLIFY,
  }
  process.env.BRAVE_API_KEY = "BSA-test-key-0123456789abcdef"
  if (network.api === "none") {
    delete process.env.SYNCHRO_API_URL
    process.env.NETLIFY = "true"
  } else {
    process.env.SYNCHRO_API_URL = "http://api.test"
  }
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith("https://api.search.brave.com/")) {
      return Response.json("braveBody" in network ? network.braveBody : { web: { results: network.pages ?? [] } })
    }
    if (url.startsWith("http://api.test/api/draws")) {
      if (network.api === "cut" || network.api === "none") throw new TypeError("fetch failed")
      return network.api
    }
    throw new Error(`appel inattendu : ${url}`)
  }) as typeof fetch
  try {
    const request = new Request("http://localhost/api/run-arcade/brave", { method: "POST", body: JSON.stringify(body) })
    const response = await POST(request as NextRequest)
    return { status: response.status, body: (await response.json()) as Record<string, unknown>, calls }
  } finally {
    globalThis.fetch = realFetch
    for (const [name, value] of [
      ["BRAVE_API_KEY", before.key],
      ["SYNCHRO_API_URL", before.api],
      ["NETLIFY", before.netlify],
    ] as const) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

function braveCalls(calls: readonly string[]) {
  return calls.filter((url) => url.startsWith("https://api.search.brave.com/"))
}

const PAGES: BraveItem[] = [
  {
    title: "Statistiques EuroMillions : suites et sommes",
    url: "https://exemple.fr/stats",
    description: "Dernier tirage mis à jour : 3 17 22 38 44, étoiles 2 et 9.",
    page_age: "2026-06-01T10:00:00",
  },
  { title: "Archive", url: "https://exemple.fr/archive", description: "Statistiques mises à jour le 2026/09/01 : 3 gagnants" },
  { title: "Le nombre d’or", url: "https://exemple.fr/or", description: "Le nombre d’or et les suites", page_age: "2025-03-01" },
]

test("the route answers 503 with a delay and no page when the draws API is cut", async () => {
  const cut = await ask(SEARCH, { api: "cut", pages: PAGES })
  assert.equal(cut.status, 503)
  assert.equal(cut.body.ok, false)
  assert.ok(Number(cut.body.retryAfterMs) > 0)
  assert.equal(cut.body.results, undefined)
  assert.equal(cut.body.absent, undefined)
  assert.deepEqual(braveCalls(cut.calls), [])

  const failing = await ask(SEARCH, { api: new Response("panne", { status: 500 }), pages: PAGES })
  assert.equal(failing.status, 503)
  assert.equal(failing.body.results, undefined)
  assert.deepEqual(braveCalls(failing.calls), [])

  const garbled = await ask(SEARCH, { api: new Response("pas du json", { status: 200 }), pages: PAGES })
  assert.equal(garbled.status, 503)
  assert.deepEqual(braveCalls(garbled.calls), [])
})

test("the route does not fall back on the embedded draws when there is no API at all", async () => {
  const bare = await ask({ ...SEARCH, through: "2026-08-28" }, { api: "none", pages: PAGES })
  assert.equal(bare.status, 503)
  assert.equal(bare.body.results, undefined)
  assert.deepEqual(bare.calls, [])
})

test("the route refuses when it knows no draw as recent as the end of the track", async () => {
  const stale = await ask(SEARCH, {
    api: apiDraws([{ draw_date: "2026-10-20", numbers: [1, 2, 3, 4, 5], stars: [1, 2] }]),
    pages: PAGES,
  })
  assert.equal(stale.status, 503)
  assert.match(String(stale.body.error), /2026-10-23/)
  assert.ok(Number(stale.body.retryAfterMs) > 0)
  assert.equal(stale.body.results, undefined)
  assert.deepEqual(braveCalls(stale.calls), [])
})

test("the route refuses a hidden draw it cannot read, and a page that stops after the cutoff", async () => {
  const unreadable = await ask(SEARCH, { api: apiDraws([{ draw_date: "2026-10-23" }]), pages: PAGES })
  assert.equal(unreadable.status, 503)
  assert.deepEqual(braveCalls(unreadable.calls), [])

  // 200 tirages, du plus récent au plus ancien : le plus ancien suit la coupure, d’autres tirages cachés manquent peut-être.
  const day = (index: number) => new Date(Date.parse("2026-10-23T12:00:00Z") - index * 3.5 * 86_400_000).toISOString().slice(0, 10)
  const page = Array.from({ length: 200 }, (_, index) => ({
    draw_date: index === 0 ? "2026-10-23" : day(index),
    numbers: [1, 2, 3, 4, 5],
    stars: [1, 2],
  }))
  assert.ok(page[199].draw_date > "2024-06-01")
  const early = { ...SEARCH, from: "2023-01-01" }
  const truncated = await ask({ ...early, cutoff: "2024-06-01" }, { api: apiDraws(page), pages: PAGES })
  assert.equal(truncated.status, 503)
  assert.deepEqual(braveCalls(truncated.calls), [])
  // Si la page remonte jusqu’à la coupure, rien ne manque.
  const covered = await ask({ ...early, cutoff: page[199].draw_date }, { api: apiDraws(page), pages: PAGES })
  assert.equal(covered.status, 200)
})

test("the route reads the hidden draws first, then filters what Brave returns", async () => {
  const served = await ask(SEARCH, {
    api: apiDraws([OCTOBER, { draw_date: "2026-08-04", numbers: [9, 10, 11, 12, 13], stars: [4, 5] }]),
    pages: PAGES,
  })
  assert.equal(served.status, 200)
  const results = served.body.results as { url: string }[]
  assert.deepEqual(
    results.map((result) => result.url),
    ["https://exemple.fr/or"]
  )
  assert.match(served.calls[0], /^http:\/\/api\.test\/api\/draws\?limit=\d+&offset=0$/)
  // La page couvre la plus longue course et son examen : sans cela, des tirages cachés manqueraient au filtre.
  assert.ok(Number(/limit=(\d+)/.exec(served.calls[0])?.[1]) >= RACE_DRAWS_MAX + EXAM_WINDOW)
  const search = braveCalls(served.calls)
  assert.equal(search.length, 1)
  assert.ok(served.calls.indexOf(search[0]) > 0)
  assert.match(decodeURIComponent(search[0]), /freshness=2025-01-01to2026-08-06/)
})

test("the route answers 502 when Brave returns 200 without a results list, and 200 for a real empty list", async () => {
  const api = apiDraws([OCTOBER, { draw_date: "2026-08-04", numbers: [9, 10, 11, 12, 13], stars: [4, 5] }])
  for (const braveBody of [{ web: {} }, {}, { web: { results: "pas une liste" } }, null]) {
    const broken = await ask(SEARCH, { api: apiDraws([OCTOBER]), braveBody })
    assert.equal(broken.status, 502, JSON.stringify(braveBody))
    assert.equal(broken.body.ok, false)
    assert.equal(broken.body.results, undefined)
    assert.equal(braveCalls(broken.calls).length, 1)
  }
  const empty = await ask(SEARCH, { api, pages: [] })
  assert.equal(empty.status, 200)
  assert.deepEqual(empty.body, { ok: true, results: [] })
})

test("a search without the last date of the track, or with a track that ends before the cutoff, is invalid", async () => {
  const { through, ...withoutThrough } = SEARCH
  assert.equal(through, "2026-10-23")
  const missing = await ask(withoutThrough, { api: apiDraws([OCTOBER]), pages: PAGES })
  assert.equal(missing.status, 400)
  assert.deepEqual(missing.calls, [])
  const early = await ask({ ...SEARCH, through: "2026-07-01" }, { api: apiDraws([OCTOBER]), pages: PAGES })
  assert.equal(early.status, 400)
})

/** Ce que le client rend quand la route répond `response`, et le corps qu’il lui a envoyé. */
async function clientReply(response: Response) {
  const realFetch = globalThis.fetch
  let sent: unknown = null
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body))
    return response
  }) as typeof fetch
  try {
    const request = { query: "x", from: "2025-01-01", cutoff: "2026-08-07", through: "2026-10-23" }
    const reply = await askBrave(request, new AbortController().signal)
    assert.deepEqual(sent, request)
    return reply
  } finally {
    globalThis.fetch = realFetch
  }
}

function waitOf(reply: BraveReply) {
  return reply.ok ? null : reply.retryAfterMs
}

test("the client sends the end of the track, and lets the session wait after a 429 or a 503 that gives a delay", async () => {
  const limited = await clientReply(Response.json({ ok: false, error: "Brave : trop de requêtes", retryAfterMs: 3000 }, { status: 429 }))
  assert.equal(waitOf(limited), 3000)
  const tooFast = await clientReply(Response.json({ ok: false, error: "Brave : trop de requêtes" }, { status: 429 }))
  assert.equal(waitOf(tooFast), 1500)
  const unreadable = await clientReply(Response.json({ ok: false, error: "tirages cachés inconnus", retryAfterMs: 4000 }, { status: 503 }))
  assert.equal(waitOf(unreadable), 4000)
  assert.equal(unreadable.ok === false && unreadable.absent, false)
  const noKey = await clientReply(Response.json({ ok: false, absent: true, error: "BRAVE_API_KEY absente" }, { status: 503 }))
  assert.equal(waitOf(noKey), undefined)
  assert.equal(noKey.ok === false && noKey.absent, true)
  const broken = await clientReply(Response.json({ ok: false, error: "Brave HTTP 500" }, { status: 502 }))
  assert.equal(waitOf(broken), undefined)
})

test("the help says where Brave stops, what it refuses, and what a pause does to its retry", () => {
  const brave = RUN_ARCADE_HELP.services.items?.find((entry) => entry.label === "Brave")
  assert.ok(brave)
  assert.match(brave.text, /premier tirage de l’examen/)
  assert.match(brave.text, /tirage encore caché/)
  assert.match(brave.text, /ne répond pas/)
  assert.match(brave.text, new RegExp(`${BRAVE_SEARCH_CAP} recherches`))
  assert.match(brave.text, /une seule fois/)
  assert.match(brave.text, /réponse vide/)
  assert.match(brave.text, /hasard/)
  assert.equal(/s’arrête avant le tirage caché/.test(brave.text), false)
  assert.equal(/quelle que soit la façon d’écrire la date/.test(brave.text), false)
  assert.match(brave.text, /formats de date que le filtre sait lire/)
  assert.match(brave.text, /14\/08, 14-08 ou 14\.08/)
  assert.match(RUN_ARCADE_HELP.pause.body, /n’envoie plus d’appel/)
  assert.match(RUN_ARCADE_HELP.pause.body, /nouvelle tentative de Brave/)
  assert.match(RUN_ARCADE_HELP.pause.body, /recherche Brave demandée pendant la pause attend la reprise/)
  assert.match(RUN_ARCADE_HELP.pause.body, /capture du dessin se termine pendant la pause/)
})
