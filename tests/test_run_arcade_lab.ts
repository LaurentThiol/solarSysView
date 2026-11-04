import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  archiveNotice,
  lastDrawLine,
  LAUNCH_MIN_POINTS,
  launchReady,
  trackYears,
} from "../src/lib/run-arcade/archive.ts"
import { championRecord, parseChampion, type ChampionRecord } from "../src/lib/run-arcade/champion.ts"
import { formatDuration, formatSlice, playedSlice } from "../src/lib/run-arcade/clock.ts"
import { buildTrack, type RankPoint } from "../src/lib/run-arcade/curves.ts"
import { departBounds, maxRaceDraws } from "../src/lib/run-arcade/depart.ts"
import { settleFields, settleInteger, settleMinutes, type FieldValues } from "../src/lib/run-arcade/fields.ts"
import { championKey, lastKnownChampion, parentChampion } from "../src/lib/run-arcade/lineage.ts"
import {
  createSession,
  MIN_SLICE_MS,
  type RunArcadeSession,
  type SessionDeps,
} from "../src/lib/run-arcade/session.ts"
import { createMinds, newRunner, RUNNER_MAX } from "../src/lib/run-arcade/thought.ts"
import { DRAWS, toDrawSeries } from "../src/lib/draws.ts"

const lab = readFileSync(new URL("../src/components/brain/run-arcade-lab.tsx", import.meta.url), "utf8")
const liveBand = readFileSync(new URL("../src/components/brain/run-arcade-live.tsx", import.meta.url), "utf8")

const flush = () => new Promise((resolve) => setImmediate(resolve))

function dateAt(index: number) {
  return new Date(Date.UTC(2025, 0, 3 + index * 3, 12)).toISOString().slice(0, 10)
}

function series(length: number): RankPoint[] {
  return Array.from({ length }, (_, index) => ({
    date: dateAt(index),
    n1: 2 + (index % 5),
    n2: 10 + (index % 4),
    n3: 20 + (index % 6),
    n4: 30 + (index % 5),
    n5: 40 + (index % 7),
    e1: 1 + (index % 5),
    e2: 7 + (index % 5),
  }))
}

/** Une session dont les minuteries ne tirent jamais : `skip()` joue les tours un à un. */
function quietSession() {
  const deps: SessionDeps = {
    now: () => 0,
    setTimer: () => 1,
    clearTimer: () => undefined,
    askIa: async () => ({ ok: false, error: "absente", absent: true }),
    askBrave: async () => ({ ok: false, error: "absente", absent: true }),
    saveChampion: async () => ({ ok: true, source: "test" }),
  }
  return createSession(deps)
}

async function playToTheEnd(session: RunArcadeSession) {
  let guard = 0
  while (session.getSnapshot().phase !== "fin" && guard < 300) {
    session.skip()
    guard += 1
  }
  await flush()
}

/** Un champion déjà écrit, tel que Neon le rend. */
function written(generation: number, runner = "R1", id?: number): ChampionRecord {
  const base = newRunner(createMinds(1)[0])
  return {
    ...championRecord({
      runner: { ...base, mind: { ...base.mind, name: runner } },
      generation,
      raceFrom: dateAt(100),
      raceTo: dateAt(124),
      journal: [],
      savedAt: `2026-10-${String(generation).padStart(2, "0")}T09:00:00.000Z`,
    }),
    ...(id != null ? { id } : {}),
  }
}

/** Ce que le lab fait à chaque rendu : il retient le dernier champion fini, puis lit le parent. */
type Page = { opened: ChampionRecord | null; lastFinished: ChampionRecord | null; imported: ChampionRecord | null }

function parentShown(page: Page, session: RunArcadeSession) {
  const snapshot = session.getSnapshot()
  if (snapshot.champion && snapshot.champion !== page.lastFinished) page.lastFinished = snapshot.champion
  return parentChampion({
    imported: page.imported,
    finished: snapshot.champion,
    running: snapshot.parent,
    stored: lastKnownChampion(page.opened, page.lastFinished),
  })
}

/** Lancer, comme le lab : le fichier ou le champion cliqué sert une fois, puis il est oublié. */
function launchFrom(page: Page, session: RunArcadeSession, rows: RankPoint[]) {
  const parent = parentShown(page, session)
  page.imported = null
  session.launch({ count: 3, draws: 8, minutes: 0, series: rows, champion: parent })
}

test("two generations in a row: Relancer restarts from the last champion, not the one read at opening", async () => {
  const rows = series(60)
  const session = quietSession()
  const page: Page = { opened: written(20), lastFinished: null, imported: null }

  launchFrom(page, session, rows)
  assert.equal(session.getSnapshot().generation, 21)
  await playToTheEnd(session)
  assert.equal(session.getSnapshot().champion?.generation, 21)
  assert.equal(parentShown(page, session)?.generation, 21)

  launchFrom(page, session, rows)
  assert.equal(session.getSnapshot().generation, 22)
  assert.equal(session.getSnapshot().champion, null)
  assert.equal(parentShown(page, session)?.generation, 21, "pendant la course, le parent est la génération 21")
  assert.equal(lastKnownChampion(page.opened, page.lastFinished)?.generation, 21)

  launchFrom(page, session, rows)
  assert.equal(session.getSnapshot().generation, 22, "Relancer ne fait pas reculer la lignée")
  assert.equal(session.getSnapshot().parent?.generation, 21)
  await playToTheEnd(session)
  assert.equal(session.getSnapshot().champion?.generation, 22)
  session.dispose()
})

test("Relancer after a champion picked in the list restarts from that champion", async () => {
  const rows = series(60)
  const session = quietSession()
  const page: Page = { opened: written(22), lastFinished: null, imported: written(18, "R4", 5) }

  launchFrom(page, session, rows)
  assert.equal(session.getSnapshot().generation, 19)
  assert.equal(page.imported, null)
  assert.equal(parentShown(page, session)?.generation, 18, "le parent de la course en cours reste le champion cliqué")

  launchFrom(page, session, rows)
  assert.equal(session.getSnapshot().generation, 19, "et non la génération 23 du dernier champion écrit")
  session.dispose()
})

test("a slow read of Neon never replaces a race finished here", () => {
  const opening = written(20)
  const finished = written(21)
  assert.equal(lastKnownChampion(null, null), null)
  assert.equal(lastKnownChampion(opening, null), opening)
  assert.equal(lastKnownChampion(null, finished), finished)
  assert.equal(lastKnownChampion(opening, finished), finished)
  assert.equal(lastKnownChampion(written(30), finished), finished)
})

test("a champion read from Neon keeps its id, and the list keys stay distinct", () => {
  const row = { ...written(21), id: 7 }
  const kept = parseChampion(JSON.parse(JSON.stringify(row)))
  assert.equal(kept?.id, 7)
  for (const bad of [0, -3, 1.5, "7", null, true]) {
    const dropped = parseChampion({ ...JSON.parse(JSON.stringify(row)), id: bad })
    assert.ok(dropped)
    assert.equal("id" in dropped, false, String(bad))
  }
  const plain = parseChampion(JSON.parse(JSON.stringify(written(21))))
  assert.ok(plain)
  assert.equal("id" in plain, false)

  const twin = { ...written(21), id: 8 }
  assert.notEqual(championKey(row, 0), championKey(twin, 1))
  assert.notEqual(championKey({ ...row, id: undefined }, 0), championKey({ ...row, id: undefined }, 1))
  const keys = new Set([row, twin, { ...row, id: 9 }].map((item, position) => championKey(item, position)))
  assert.equal(keys.size, 3)
})

test("Lancer waits for the archive, and says so when only the embedded extract is there", () => {
  assert.equal(launchReady({ loading: true, points: 69 }), false)
  assert.equal(launchReady({ loading: false, points: 69 }), true)
  assert.equal(launchReady({ loading: false, points: LAUNCH_MIN_POINTS - 1 }), false)
  assert.equal(launchReady({ loading: false, points: LAUNCH_MIN_POINTS }), true)

  const extract = toDrawSeries(DRAWS)
  assert.ok(extract.length > 4)
  assert.equal(archiveNotice({ loading: true, source: "json", points: extract }), null)
  assert.equal(archiveNotice({ loading: false, source: "neon", points: extract }), null)
  assert.equal(archiveNotice({ loading: false, source: "json", points: [] }), null)
  const notice = archiveNotice({ loading: false, source: "json", points: extract }) ?? ""
  const last = extract[extract.length - 1].date
  assert.match(notice, /^Archive embarquée/)
  assert.ok(notice.includes(`${extract.length} tirages`))
  assert.ok(notice.includes(`${last.slice(8, 10)}/${last.slice(5, 7)}/${last.slice(0, 4)}`))
  assert.match(archiveNotice({ loading: false, source: "json", points: extract.slice(0, 1) }) ?? "", / 1 tirage du /)
})

test("the years written come from the dates of the track", () => {
  const two = [{ date: "2025-11-04" }, { date: "2026-03-10" }]
  const one = [{ date: "2026-01-02" }, { date: "2026-08-28" }]
  assert.equal(trackYears(two), "années 2025 et 2026")
  assert.equal(trackYears(one), "année 2026")
  assert.equal(trackYears([]), "")
  const extract = buildTrack(toDrawSeries(DRAWS))
  const present = new Set(extract.map((point) => point.date.slice(0, 4)))
  for (const year of trackYears(extract).match(/\d{4}/g) ?? []) assert.ok(present.has(year), year)
})

test("under the result, Persiste copies the last draw of the archive and the line says which one", () => {
  const format = (iso: string) => `<${iso}>`
  assert.equal(lastDrawLine("2026-10-30", "2026-10-30", format), "<2026-10-30>. Persiste recopie ce tirage.")
  assert.equal(lastDrawLine("2026-10-30", null, format), "<2026-10-30>. Persiste recopie ce tirage.")
  const aged = lastDrawLine("2026-10-23", "2026-10-30", format)
  assert.match(aged, /^<2026-10-23> : dernier tirage de la course de ce champion\./)
  assert.match(aged, /Persiste recopie le dernier de l’archive, le <2026-10-30>\.$/)
})

test("typing 30 in Tirages gives 30, and a half-typed value is fixed when the field is left", () => {
  const rows = series(150)
  const values: FieldValues = { count: 8, draws: 25, minutes: 10, date: "" }
  assert.equal(settleFields(rows, values, { draws: "30" }).draws, 30)
  assert.equal(settleFields(rows, values, { draws: "3" }).draws, 4)
  assert.equal(settleFields(rows, values, { draws: "" }).draws, 25, "vide : la valeur d’avant, pas le minimum")
  assert.equal(settleFields(rows, values, { draws: "12.6" }).draws, 13)
  assert.equal(settleFields(rows, values, { draws: "5000" }).draws, maxRaceDraws(rows))
  assert.equal(settleFields(rows, values, {}).draws, 25)

  assert.equal(settleFields(rows, values, { count: "" }).count, 8)
  assert.equal(settleFields(rows, values, { count: String(RUNNER_MAX) }).count, RUNNER_MAX)
  assert.equal(settleFields(rows, values, { count: "0" }).count, 1)
  assert.equal(settleFields(rows, values, { count: "400" }).count, RUNNER_MAX)

  assert.equal(settleFields(rows, values, { minutes: "2.3" }).minutes, 2.5)
  assert.equal(settleFields(rows, values, { minutes: "0.2" }).minutes, 0)
  assert.equal(settleFields(rows, values, { minutes: "999" }).minutes, 120)
  assert.equal(settleFields(rows, values, { minutes: "" }).minutes, 10)
  assert.equal(settleInteger("abc", 4, 120, 25), 25)
  assert.equal(settleInteger("Infinity", 4, 120, 25), 25)
  assert.equal(settleMinutes("-3", 10), 0)
})

test("the value of Tirages comes down under the maximum when the track is shorter", () => {
  const short = series(20)
  assert.equal(maxRaceDraws(short), 18)
  const values: FieldValues = { count: 8, draws: 25, minutes: 10, date: "" }
  assert.equal(settleFields(short, values, {}).draws, 18)
  assert.equal(settleFields(short, values, { draws: "40" }).draws, 18)
  assert.equal(settleFields(series(150), values, {}).draws, 25)
})

test("the start date is only taken from a complete day, and an empty field is not the first draw", () => {
  const rows = series(150)
  const bounds = departBounds(rows, 25)
  const middle = bounds.free[10].date
  const values: FieldValues = { count: 8, draws: 25, minutes: 10, date: middle }
  assert.equal(settleFields(rows, values, { date: bounds.free[20].date }).date, bounds.free[20].date)
  assert.equal(settleFields(rows, values, { date: "" }).date, middle, "vide : le départ d’avant")
  assert.equal(settleFields(rows, values, { date: "2025-02" }).date, middle)
  assert.equal(settleFields(rows, values, {}).date, middle)
  const nextDay = new Date(`${bounds.free[20].date}T12:00:00Z`)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  assert.equal(settleFields(rows, values, { date: nextDay.toISOString().slice(0, 10) }).date, bounds.free[21].date)
  assert.equal(settleFields(rows, values, { date: "2099-01-01" }).date, bounds.last)
  assert.equal(settleFields(rows, values, { date: "1999-01-01" }).date, bounds.first)
  assert.equal(settleFields(rows, { ...values, date: "" }, {}).date, bounds.first)
  assert.equal(settleFields([], values, {}).date, "")
})

test("the date follows the draws: a longer race moves a start that no longer fits", () => {
  const rows = series(150)
  const wide = departBounds(rows, 25)
  const late = wide.last
  const values: FieldValues = { count: 8, draws: 25, minutes: 10, date: late }
  const settled = settleFields(rows, values, { draws: "100" })
  const narrow = departBounds(rows, 100)
  assert.equal(settled.draws, 100)
  assert.equal(settled.date, narrow.last)
  assert.ok(settled.date < late)
})

test("the slice on screen is the one the session plays, with its floor", async () => {
  const session = quietSession()
  session.launch({ count: 2, draws: 120, minutes: 0.5, series: series(160), champion: null })
  session.skip()
  const snapshot = session.getSnapshot()
  assert.equal(snapshot.phase, "course")
  assert.equal(snapshot.sliceMs, 250)
  const shown = playedSlice(snapshot.minutes, snapshot.sliceMs, MIN_SLICE_MS)
  assert.deepEqual(shown, { ms: MIN_SLICE_MS, floored: true })
  assert.equal(snapshot.phaseEndsAt, shown.ms, "la session planifie la tranche affichée")
  assert.equal(formatDuration(snapshot.sliceMs), "0 s", "l’ancien affichage")
  assert.equal(formatSlice(shown.ms), "0,7 s")
  session.dispose()

  assert.deepEqual(playedSlice(10, 24_000, MIN_SLICE_MS), { ms: 24_000, floored: false })
  assert.deepEqual(playedSlice(10, MIN_SLICE_MS, MIN_SLICE_MS), { ms: MIN_SLICE_MS, floored: false })
  assert.deepEqual(playedSlice(0, 0, MIN_SLICE_MS), { ms: 0, floored: false })
  assert.equal(formatSlice(1500), "1,5 s")
  assert.equal(formatSlice(2000), "2 s")
  assert.equal(formatSlice(9_960), "10 s")
  assert.equal(formatSlice(75_000), "1 min 15 s")
})

test("the lab is wired to these rules", () => {
  assert.match(lab, /canLaunch: launchReady\(\{ loading, points: series\.length \}\)/)
  assert.match(lab, /archiveNotice\(\{ loading, source, points: series \}\)/)
  assert.match(lab, /trackYears\(track\)/)
  assert.equal(/newestYear/.test(lab), false)
  assert.match(lab, /parentChampion\(\{ imported, finished: snapshot\.champion, running: snapshot\.parent, stored \}\)/)
  assert.match(lab, /championRaceTurns\(parent, series\)/)
  assert.match(lab, /history\.map\(\(item\) => championRaceTurns\(item, series\)\)/)
  assert.match(lab, /if \(snapshot\.champion && snapshot\.champion !== lastFinished\) setLastFinished\(snapshot\.champion\)/)
  assert.match(lab, /lastKnownChampion\(opened, lastFinished\)/)
  assert.match(lab, /championKey\(item, position\)/)
  assert.match(lab, /if \(raceDraws > maxDraws\) setRaceDraws\(maxDraws\)/)
  assert.match(lab, /<form\s+noValidate/)
  assert.equal((lab.match(/onBlur=\{settle\}/g) ?? []).length, 4)
  assert.equal((lab.match(/onChange=\{\(event\) => type\(/g) ?? []).length, 4)
  assert.equal(/setCount\(Math\.min/.test(lab), false)
  assert.match(lab, /playedSlice\(snapshot\.minutes, snapshot\.sliceMs, MIN_SLICE_MS\)/)
  assert.match(lab, /archiveLastDate=\{persisted\?\.date \?\? null\}/)
  assert.match(lab, /scoreForecasts\(parent \? \[parent, \.\.\.history\] : history, series\)/)
  assert.match(lab, /forecastLine\(scoreForecasts/)
  assert.match(lab, /data-testid="run-arcade-forecast"/)
})

test("only the band follows the clock, and only while a countdown runs", () => {
  assert.equal(/clock\.subscribe|useSyncExternalStore\(clock/.test(lab), false)
  assert.match(lab, /<LiveBand /)
  assert.match(liveBand, /const counting = endsAt != null && snapshot\.pausedLeftMs == null && snapshot\.minutes > 0/)
  assert.match(liveBand, /useClock\(counting\)/)
  assert.match(liveBand, /active \? clock\.subscribe : idleSubscribe/)
})
