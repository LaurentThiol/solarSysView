import assert from "node:assert/strict"
import test from "node:test"

import {
  appendRank1Key,
  chartYDomain,
  keepRank1Choice,
  modeOffersRank1,
  rank1HiddenDefault,
  splitRank1Axis,
  weekdaySplitKeys,
  weekdaySplitSeries,
} from "../src/lib/draw-chart-rank.ts"

test("1er rang is offered on eachNumber and sumNumbers only", () => {
  assert.equal(modeOffersRank1("eachNumber"), true)
  assert.equal(modeOffersRank1("sumNumbers"), true)
  assert.equal(modeOffersRank1("sumBoth"), false)
  assert.equal(modeOffersRank1("sumStars"), false)
  assert.equal(modeOffersRank1("eachStar"), false)
})

test("1er rang stays off by default and a couple focus does not turn it back on", () => {
  assert.deepEqual(rank1HiddenDefault(), { rank1: true })
  assert.deepEqual(keepRank1Choice({}), { rank1: true })
  assert.deepEqual(keepRank1Choice({ rank1: true, n2: true }), { rank1: true })
  assert.deepEqual(keepRank1Choice({ rank1: false, n1: true }), { rank1: false })
})

test("appendRank1Key adds the overlay when the archive has winners", () => {
  assert.deepEqual(appendRank1Key("sumNumbers", ["sumNumbers"], true), [
    "sumNumbers",
    "rank1",
  ])
  assert.deepEqual(appendRank1Key("eachNumber", ["n1", "n2", "n3", "n4", "n5"], true), [
    "n1",
    "n2",
    "n3",
    "n4",
    "n5",
    "rank1",
  ])
  assert.deepEqual(appendRank1Key("sumNumbers", ["sumNumbers"], false), ["sumNumbers"])
  assert.deepEqual(appendRank1Key("sumStars", ["sumStars"], true), ["sumStars"])
})

test("splitRank1Axis uses the right axis when 1er rang is mixed with another series", () => {
  assert.equal(splitRank1Axis("sumNumbers", ["sumNumbers", "rank1"]), true)
  assert.equal(splitRank1Axis("eachNumber", ["n1", "rank1"]), true)
  assert.equal(splitRank1Axis("sumNumbers", ["rank1"]), false)
  assert.equal(splitRank1Axis("sumNumbers", ["sumNumbers"]), false)
  assert.equal(splitRank1Axis("sumStars", ["sumStars", "rank1"]), false)
})

test("mardi and vendredi follow every visible series and drop rank1", () => {
  assert.deepEqual(
    weekdaySplitKeys(["n1", "n2", "n3", "n4", "n5", "rank1"]),
    ["n1", "n2", "n3", "n4", "n5"]
  )
  assert.deepEqual(weekdaySplitKeys(["n2", "n3", "n4", "n5", "rank1"]), [
    "n2",
    "n3",
    "n4",
    "n5",
  ])
  assert.deepEqual(weekdaySplitKeys(["n1"]), ["n1"])
  assert.deepEqual(weekdaySplitKeys(["rank1"]), [])
  assert.deepEqual(weekdaySplitKeys([]), [])
  assert.equal(weekdaySplitSeries(["n1", "n2", "n3", "n4", "n5", "rank1"]), "n1")
  assert.equal(weekdaySplitSeries(["n2", "n3", "n4", "n5", "rank1"]), "n2")
  assert.equal(weekdaySplitSeries(["n1"]), "n1")
  assert.equal(weekdaySplitSeries(["rank1"]), null)
  assert.equal(weekdaySplitSeries([]), null)
})

test("y domain isolates 1er rang on 0–1 and keeps the sum on 15–auto", () => {
  assert.deepEqual(chartYDomain("sumNumbers", ["rank1"]), [0, 1])
  assert.deepEqual(chartYDomain("eachNumber", ["rank1"]), [0, 1])
  assert.deepEqual(chartYDomain("sumNumbers", ["sumNumbers", "rank1"]), [15, "auto"])
  assert.deepEqual(chartYDomain("eachNumber", ["n1", "n2", "n3", "n4", "n5", "rank1"]), [
    1, 50,
  ])
})
