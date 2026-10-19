import assert from "node:assert/strict"
import test from "node:test"

import {
  formatDrawDate,
  formatEuro,
  formatJackpot,
  formatRank1Step,
  formatWinnerTotals,
  fromRelativeRange,
  meanPrizeByRank,
  numberFrequencyTable,
  parsePrizeTiers,
  prizeAtRank,
  rank1WinnerStep,
  rankWinnersTotal,
  relativeToRange,
  starFrequencyTable,
  toCsv,
  toDrawSeries,
  totalWinners,
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
    {
      rank: 2,
      winners_fr: 1,
      winners_eu: 4,
      winners_total: 4,
      prize: 245123.45,
    },
    {
      rank: 3,
      winners_fr: null,
      winners_eu: null,
      winners_total: null,
      prize: null,
    },
  ])
})

test("formatDrawDate writes the first of the month as 1er", () => {
  assert.equal(formatDrawDate("2026-09-01"), "mardi 1er septembre 2026")
  assert.equal(formatDrawDate("2026-05-01"), "vendredi 1er mai 2026")
  assert.equal(formatDrawDate("2026-01-01"), "jeudi 1er janvier 2026")
  assert.equal(formatDrawDate("2026-02-01"), "dimanche 1er février 2026")
  assert.equal(formatDrawDate("2026-10-01"), "jeudi 1er octobre 2026")
  assert.equal(formatDrawDate("2026-09-11"), "vendredi 11 septembre 2026")
  assert.equal(formatDrawDate("2026-09-21"), "lundi 21 septembre 2026")
  assert.equal(formatDrawDate("2026-10-31"), "samedi 31 octobre 2026")
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

test("toCsv includes jackpot, winner totals and r2–r13", () => {
  const csv = toCsv([sample])
  assert.match(
    csv,
    /^date,jour,tirage,n1,n2,n3,n4,n5,etoile1,etoile2,jackpot,gagnants_fr,gagnants_eu,r2/
  )
  assert.match(csv, /,0,10,80,,,,,,,,,,,4\.2\n/)
})

test("totalWinners sums ranks and does not add FR to EU", () => {
  assert.equal(rankWinnersTotal(5, 7), 7)
  assert.deepEqual(totalWinners(sample), { fr: 10, eu: 80 })
  assert.match(formatWinnerTotals(sample), /10 FR/)
  assert.match(formatWinnerTotals(sample), /80 EU/)
  assert.deepEqual(
    totalWinners({
      ...sample,
      winners_total_fr: 324137,
      winners_total_eu: 1334600,
    }),
    { fr: 324137, eu: 1334600 }
  )
})

test("rank1WinnerStep is 0 with a jackpot winner and +1 on a rollover", () => {
  assert.equal(rank1WinnerStep(sample), 1)
  assert.equal(formatRank1Step(1), "+1 · pas gagnant")
  assert.equal(
    rank1WinnerStep({
      ...sample,
      prizes: [{ rank: 1, winners_fr: 0, winners_eu: 2, prize: 17_000_000 }],
    }),
    0
  )
  assert.equal(formatRank1Step(0), "0 · gagnant")
  assert.equal(rank1WinnerStep({ ...sample, prizes: undefined }), null)
  const series = toDrawSeries([
    sample,
    {
      ...sample,
      id: 26071,
      date: "2026-09-04",
      prizes: [{ rank: 1, winners_fr: 1, winners_eu: 1, prize: 50_000_000 }],
    },
    { ...sample, id: 26072, date: "2026-09-08", prizes: undefined },
  ])
  assert.deepEqual(
    series.map((point) => point.rank1),
    [1, 0, null]
  )
})

function draw(date: string, numbers: number[], stars: number[]): Draw {
  return {
    id: Number(date.replaceAll("-", "")),
    date,
    weekday: "mardi",
    numbers,
    stars,
  }
}

test("frequency lookback counts the window and dates delay from history", () => {
  const history = [
    draw("2026-01-02", [7, 8, 9, 10, 11], [1, 2]),
    draw("2026-01-06", [12, 13, 14, 15, 16], [3, 4]),
    draw("2026-01-09", [17, 18, 19, 20, 21], [5, 6]),
    draw("2026-01-13", [1, 2, 3, 4, 5], [1, 2]),
    draw("2026-01-16", [22, 23, 24, 25, 26], [7, 8]),
  ]
  const window = history.slice(3)
  const numbers = numberFrequencyTable(window, history)
  const seven = numbers.find((row) => row.value === 7)
  const one = numbers.find((row) => row.value === 1)
  assert.equal(seven?.count, 0)
  assert.equal(seven?.delayDraws, 4)
  assert.equal(one?.count, 1)
  assert.equal(one?.delayDraws, 1)

  const stars = starFrequencyTable(window, 12, history)
  const starOne = stars.find((row) => row.value === 1)
  const starThree = stars.find((row) => row.value === 3)
  assert.equal(starOne?.count, 1)
  assert.equal(starOne?.delayDraws, 1)
  assert.equal(starThree?.count, 0)
  assert.equal(starThree?.delayDraws, 3)
})

test("relative range is reversible for off-curve Y on the combined chart", () => {
  const range = { min: 15, max: 240 }
  assert.equal(relativeToRange(15, range), 0)
  assert.equal(relativeToRange(240, range), 100)
  assert.equal(fromRelativeRange(0, range), 15)
  assert.equal(fromRelativeRange(100, range), 240)
  const mid = relativeToRange(127.5, range)
  assert.ok(Math.abs(fromRelativeRange(mid, range) - 127.5) < 1e-12)
})
