import assert from "node:assert/strict"
import test from "node:test"

import {
  formatEuro,
  formatJackpot,
  meanPrizeByRank,
  parsePrizeTiers,
  prizeAtRank,
  toCsv,
  type Draw,
} from "../src/lib/draws"

const sample: Draw = {
  id: 26070,
  date: "2026-09-01",
  weekday: "mardi",
  numbers: [1, 2, 3, 4, 5],
  stars: [6, 7],
  prizes: [
    { rank: 1, winners_fr: 0, winners_eu: 0, prize: 0 },
    { rank: 13, winners_fr: 10, winners_eu: 80, prize: 4.2 },
  ],
}

test("parsePrizeTiers keeps numeric ranks and drops junk", () => {
  const tiers = parsePrizeTiers([
    { rank: "2", winners_fr: "1", winners_eu: "4", prize: "245123.45" },
    { rank: 99, prize: 1 },
    { rank: 3, prize: null },
  ])
  assert.deepEqual(tiers, [
    { rank: 2, winners_fr: 1, winners_eu: 4, prize: 245123.45 },
    { rank: 3, winners_fr: null, winners_eu: null, prize: null },
  ])
})

test("formatJackpot reports a rolled jackpot", () => {
  assert.equal(formatJackpot(sample), "Report")
  assert.match(formatEuro(4.2), /4,20/)
  assert.match(formatEuro(4.2), /€/)
  assert.equal(prizeAtRank(sample, 13), 4.2)
  assert.equal(prizeAtRank(sample, 2), null)
})

test("meanPrizeByRank averages available rapports", () => {
  const means = meanPrizeByRank([
    sample,
    {
      ...sample,
      date: "2026-09-04",
      prizes: [{ rank: 13, winners_fr: 1, winners_eu: 2, prize: 5.8 }],
    },
  ])
  assert.equal(means.get(13), 5)
  assert.equal(means.get(1), 0)
})

test("toCsv includes jackpot and r2–r13", () => {
  const csv = toCsv([sample])
  assert.match(csv, /^date,jour,tirage,n1,n2,n3,n4,n5,etoile1,etoile2,jackpot,r2/)
  assert.match(csv, /,0,,,,,,,,,,,4\.2\n/)
})
