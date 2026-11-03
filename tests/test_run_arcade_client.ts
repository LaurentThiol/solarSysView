import assert from "node:assert/strict"
import test from "node:test"

import type { ChampionRecord } from "../src/lib/run-arcade/champion.ts"
import {
  CHAMPION_STORE_KEY,
  importChampion,
  listChampions,
  loadChampion,
  readUnsent,
  retryUnsent,
  sameChampion,
  saveChampion,
  serverUnsentState,
  UNSENT_KEEP,
  UNSENT_STORE_KEY,
  unsentState,
} from "../src/lib/run-arcade/client.ts"
import { newSkill } from "../src/lib/run-arcade/skills.ts"

const flush = () => new Promise((resolve) => setImmediate(resolve))

function champion(generation: number, savedAt: string, runner = "R1"): ChampionRecord {
  return {
    generation,
    runner,
    cents: 4350,
    examCents: 4750,
    calls: 9,
    raceFrom: "2026-08-07",
    raceTo: "2026-10-30",
    skills: [
      newSkill(
        `${runner.toLowerCase()}-base`,
        "Geste de base",
        { curve: "*", gesture: "glisse", ratio: 0.618, span: "bande", window: 8, days: null },
        { cutoff: "", origin: "maison", examCents: null }
      ),
    ],
    journal: [],
    savedAt,
  }
}

const HOURS = (hour: number) => `2026-11-03T${String(hour).padStart(2, "0")}:00:00.000Z`

/** Un navigateur de papier : `quota` fait refuser toute écriture, comme un stockage plein. */
function installBrowser() {
  const browser = { store: new Map<string, string>(), quota: false }
  Object.assign(globalThis, {
    window: {
      localStorage: {
        getItem: (key: string) => browser.store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (browser.quota) throw new Error("QuotaExceededError")
          browser.store.set(key, value)
        },
        removeItem: (key: string) => {
          browser.store.delete(key)
        },
      },
      addEventListener() {},
      removeEventListener() {},
    },
  })
  return browser
}

type Call = { method: string; url: string; body: ChampionRecord | null }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

/** Neon de papier. `answer` rend la réponse de chaque appel, ou jette pour une panne réseau. */
function fakeNeon(answer: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? "GET",
      url: String(input),
      body: init?.body ? (JSON.parse(String(init.body)) as ChampionRecord) : null,
    }
    calls.push(call)
    return answer(call)
  }) as typeof fetch
  return {
    calls,
    posts: () => calls.filter((call) => call.method === "POST").map((call) => call.body as ChampionRecord),
  }
}

const down = (): Response => {
  throw new TypeError("fetch failed")
}

const written = () => json({ ok: true, source: "neon", id: 1, versions: 1 })

function refusal(reply: { ok: boolean }) {
  assert.equal(reply.ok, false)
  return (reply as { ok: false; error: string }).error
}

test("a browser that refuses the copy says so, and does not promise one", async () => {
  const browser = installBrowser()
  browser.quota = true
  fakeNeon(() => json({ ok: false, detail: "Neon non configuré" }, 503))
  const error = refusal(await saveChampion(champion(5, HOURS(10))))
  assert.match(error, /Neon non configuré/)
  assert.match(error, /copie navigateur impossible/)
  assert.match(error, /exportez-le/)
  assert.doesNotMatch(error, /copie gardée/)
  assert.equal(browser.store.size, 0)
  assert.deepEqual(readUnsent(), [])
})

test("a refused write keeps a copy and says how to send it again", async () => {
  const browser = installBrowser()
  fakeNeon(() => json({ ok: false, detail: "Neon non configuré" }, 503))
  const error = refusal(await saveChampion(champion(5, HOURS(10))))
  assert.match(error, /Neon non configuré/)
  assert.match(error, /copie gardée dans ce navigateur/)
  assert.match(error, /Réessayer l’écriture/)
  assert.doesNotMatch(error, /impossible/)
  assert.equal(readUnsent().length, 1)
  assert.ok(browser.store.has(CHAMPION_STORE_KEY))
  assert.ok(browser.store.has(UNSENT_STORE_KEY))
})

test("a network failure is a refusal too, with the copy kept", async () => {
  installBrowser()
  fakeNeon(down)
  const error = refusal(await saveChampion(champion(5, HOURS(10))))
  assert.match(error, /fetch failed/)
  assert.match(error, /copie gardée dans ce navigateur/)
  assert.equal(readUnsent().length, 1)
})

test("a confirmed write leaves nothing in the queue", async () => {
  const browser = installBrowser()
  const neon = fakeNeon(written)
  const reply = await saveChampion(champion(5, HOURS(10)))
  assert.deepEqual(reply, { ok: true, source: "Neon" })
  assert.equal(neon.posts().length, 1)
  assert.deepEqual(readUnsent(), [])
  assert.equal(browser.store.has(UNSENT_STORE_KEY), false)
  assert.ok(browser.store.has(CHAMPION_STORE_KEY))
})

test("Neon offline for three generations keeps all three, and the newest is the parent", async () => {
  installBrowser()
  fakeNeon(down)
  for (const [generation, hour] of [
    [5, 10],
    [6, 11],
    [7, 12],
  ] as const) {
    await saveChampion(champion(generation, HOURS(hour)))
  }
  assert.deepEqual(
    readUnsent().map((item) => item.generation),
    [5, 6, 7]
  )
  assert.equal((await loadChampion())?.generation, 7)

  fakeNeon(() => json({ ok: true, champion: champion(4, HOURS(9)) }))
  assert.equal((await loadChampion())?.generation, 7)
})

test("Neon back: the queue is sent oldest first, and empties", async () => {
  installBrowser()
  fakeNeon(down)
  for (const [generation, hour] of [
    [5, 10],
    [6, 11],
    [7, 12],
  ] as const) {
    await saveChampion(champion(generation, HOURS(hour)))
  }
  const neon = fakeNeon(written)
  const result = await retryUnsent()
  assert.deepEqual(
    neon.posts().map((item) => item.generation),
    [5, 6, 7]
  )
  assert.equal(result.sent, 3)
  assert.equal(result.left, 0)
  assert.equal(result.text, "3 champions écrits dans Neon.")
  assert.deepEqual(
    result.written.map((item) => item.generation),
    [5, 6, 7]
  )
  assert.deepEqual(readUnsent(), [])
})

test("a champion Neon refuses stays in the queue while the others go", async () => {
  installBrowser()
  fakeNeon(down)
  for (const [generation, hour] of [
    [5, 10],
    [6, 11],
    [7, 12],
  ] as const) {
    await saveChampion(champion(generation, HOURS(hour)))
  }
  fakeNeon((call) => (call.body?.generation === 6 ? json({ detail: "skill sans identifiant" }, 400) : written()))
  const result = await retryUnsent()
  assert.equal(result.sent, 2)
  assert.equal(result.left, 1)
  assert.match(result.text, /2 champions écrits dans Neon/)
  assert.match(result.text, /1 champion reste non écrit : skill sans identifiant/)
  assert.deepEqual(
    readUnsent().map((item) => item.generation),
    [6]
  )

  fakeNeon(down)
  const again = await retryUnsent()
  assert.equal(again.sent, 0)
  assert.match(again.text, /^1 champion reste non écrit : fetch failed/)
})

test("an empty queue has nothing to send", async () => {
  installBrowser()
  const neon = fakeNeon(written)
  const result = await retryUnsent()
  assert.deepEqual(result, { sent: 0, left: 0, text: "Aucun champion à renvoyer.", written: [] })
  assert.equal(neon.calls.length, 0)
})

test("the same champion is queued once, even when it is sent again", async () => {
  installBrowser()
  fakeNeon(down)
  await saveChampion(champion(5, HOURS(10)))
  await saveChampion(champion(5, HOURS(10)))
  await retryUnsent()
  assert.equal(readUnsent().length, 1)
})

test("a champion is already in the queue while its write is in flight", async () => {
  installBrowser()
  let release: (reply: Response) => void = () => {}
  fakeNeon(() => new Promise<Response>((resolve) => (release = resolve)))
  const pending = saveChampion(champion(5, HOURS(10)))
  await flush()
  assert.equal(readUnsent().length, 1)
  assert.equal(unsentState().sending, true)
  release(written())
  assert.deepEqual(await pending, { ok: true, source: "Neon" })
  assert.deepEqual(readUnsent(), [])
  assert.equal(unsentState().sending, false)
})

test("the queue keeps the twenty newest champions and says when it drops one", async () => {
  installBrowser()
  fakeNeon(down)
  for (let generation = 1; generation <= UNSENT_KEEP; generation += 1) {
    await saveChampion(champion(generation, HOURS(generation % 24)))
  }
  assert.equal(readUnsent().length, UNSENT_KEEP)
  const error = refusal(await saveChampion(champion(UNSENT_KEEP + 1, "2026-11-04T01:00:00.000Z")))
  assert.match(error, /La file garde 20 champions : le plus ancien est abandonné/)
  const kept = readUnsent().map((item) => item.generation)
  assert.equal(kept.length, UNSENT_KEEP)
  assert.equal(kept[0], 2)
  assert.equal(kept[kept.length - 1], UNSENT_KEEP + 1)
})

test("the queue state is the same object until the stored text changes", async () => {
  const browser = installBrowser()
  const empty = unsentState()
  assert.equal(unsentState(), empty)
  assert.deepEqual(empty.items, [])
  assert.equal(serverUnsentState().items.length, 0)
  fakeNeon(down)
  await saveChampion(champion(5, HOURS(10)))
  const one = unsentState()
  assert.notEqual(one, empty)
  assert.equal(one.items.length, 1)
  assert.equal(unsentState(), one)
  browser.store.delete(UNSENT_STORE_KEY)
  assert.equal(unsentState().items.length, 0)
})

test("the parent is the newest of Neon, the copy and the queue, and Neon wins a tie", async () => {
  const browser = installBrowser()
  fakeNeon(() => json({ ok: true, champion: champion(4, HOURS(9)) }))
  assert.equal((await loadChampion())?.generation, 4)

  browser.store.set(CHAMPION_STORE_KEY, JSON.stringify(champion(3, HOURS(8))))
  assert.equal((await loadChampion())?.generation, 4)

  browser.store.set(CHAMPION_STORE_KEY, JSON.stringify(champion(5, HOURS(10))))
  assert.equal((await loadChampion())?.generation, 5)

  browser.store.set(UNSENT_STORE_KEY, JSON.stringify([champion(6, HOURS(11))]))
  assert.equal((await loadChampion())?.generation, 6)

  fakeNeon(down)
  assert.equal((await loadChampion())?.generation, 6)

  browser.store.clear()
  assert.equal(await loadChampion(), null)

  const tie = { ...champion(4, HOURS(9)), runner: "R9" }
  browser.store.set(CHAMPION_STORE_KEY, JSON.stringify(champion(4, HOURS(9), "R2")))
  fakeNeon(() => json({ ok: true, champion: tie }))
  assert.equal((await loadChampion())?.runner, "R9")
})

test("an old champion imported from a file does not take the place of the newest copy", async () => {
  const browser = installBrowser()
  fakeNeon(written)
  await saveChampion(champion(7, HOURS(12), "R7"))
  await importChampion(champion(4, HOURS(9), "R4"))
  const copy = JSON.parse(browser.store.get(CHAMPION_STORE_KEY) ?? "null") as ChampionRecord
  assert.equal(copy.generation, 7)

  fakeNeon(down)
  assert.equal((await loadChampion())?.generation, 7)
  await saveChampion(champion(8, HOURS(13), "R8"))
  assert.equal(JSON.parse(browser.store.get(CHAMPION_STORE_KEY) ?? "null").generation, 8)
})

test("an imported champion already in Neon is not written again", async () => {
  installBrowser()
  const known = champion(4, HOURS(9), "R4")
  const neon = fakeNeon((call) => (call.method === "GET" ? json({ ok: true, items: [champion(5, HOURS(12)), known] }) : written()))
  const outcome = await importChampion({ ...known })
  assert.equal(outcome.state, "déjà écrit")
  assert.match(outcome.text, /génération 4 · R4 est déjà dans Neon : rien n’est réécrit/)
  assert.equal(neon.posts().length, 0)
  assert.deepEqual(readUnsent(), [])
})

test("an imported champion the server already knows is reported as written already", async () => {
  installBrowser()
  const neon = fakeNeon((call) =>
    call.method === "GET"
      ? json({ ok: true, items: [] })
      : json({ ok: true, source: "neon", id: 3, versions: 1, duplicate: true })
  )
  const outcome = await importChampion(champion(4, HOURS(9), "R4"))
  assert.equal(outcome.state, "déjà écrit")
  assert.equal(neon.posts().length, 1)
  assert.deepEqual(readUnsent(), [])
})

test("a new imported champion is written, and says so", async () => {
  installBrowser()
  const neon = fakeNeon((call) => (call.method === "GET" ? json({ ok: true, items: [champion(5, HOURS(12))] }) : written()))
  const outcome = await importChampion(champion(4, HOURS(9), "R4"))
  assert.deepEqual(outcome, { state: "écrit", text: "génération 4 · R4 est écrit dans Neon." })
  assert.equal(neon.posts().length, 1)
  assert.deepEqual(readUnsent(), [])
})

test("an import Neon refuses says so, and the champion waits in the queue", async () => {
  installBrowser()
  fakeNeon((call) => (call.method === "GET" ? down() : json({ detail: "Neon non configuré" }, 503)))
  const outcome = await importChampion(champion(4, HOURS(9), "R4"))
  assert.equal(outcome.state, "non écrit")
  assert.match(outcome.text, /génération 4 · R4 n’est pas écrit dans Neon : Neon non configuré/)
  assert.match(outcome.text, /Réessayer l’écriture/)
  assert.equal(readUnsent().length, 1)

  fakeNeon(written)
  assert.equal((await retryUnsent()).sent, 1)
  assert.deepEqual(readUnsent(), [])
})

test("the same champion has the same generation, runner and date, and nothing else counts", () => {
  const base = champion(4, HOURS(9), "R4")
  const poorer: ChampionRecord = { ...base, cents: 1 }
  assert.equal(sameChampion(base, poorer), true)
  assert.equal(sameChampion(base, { ...base, generation: 5 }), false)
  assert.equal(sameChampion(base, { ...base, runner: "R5" }), false)
  assert.equal(sameChampion(base, { ...base, savedAt: HOURS(10) }), false)
})

test("the list of written champions is empty when Neon does not answer", async () => {
  installBrowser()
  fakeNeon(down)
  assert.deepEqual(await listChampions(), [])
  fakeNeon(() => json({ detail: "Neon non configuré" }, 503))
  assert.deepEqual(await listChampions(), [])
  fakeNeon(() => json({ ok: true, items: [champion(5, HOURS(12)), { generation: "x" }] }))
  assert.equal((await listChampions()).length, 1)
})
