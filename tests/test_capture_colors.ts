import assert from "node:assert/strict"
import test from "node:test"

import { isUnsafeColor, resolvePaintColor } from "../src/lib/capture/colors"

test("oklch / color() are treated as unsafe for html-to-image", () => {
  assert.equal(isUnsafeColor("oklch(0.82 0.12 85)"), true)
  assert.equal(isUnsafeColor("color(srgb 0.8 0.7 0.2)"), true)
  assert.equal(isUnsafeColor("rgb(210, 193, 90)"), false)
})

test("resolvePaintColor prefers a used rgb value over the oklch specified value", () => {
  const resolved = resolvePaintColor("oklch(0.82 0.12 85)", "rgb(210, 193, 90)", () => {
    throw new Error("toRgb should not run when used is already safe")
  })
  assert.equal(resolved, "rgb(210, 193, 90)")
})

test("custom properties convert through toRgb instead of the page background", () => {
  const resolved = resolvePaintColor("oklch(0.82 0.12 85)", undefined, (css) => {
    assert.ok(css.includes("oklch"))
    return "rgb(210, 193, 90)"
  })
  assert.equal(resolved, "rgb(210, 193, 90)")
})

test("failed conversion returns null rather than a dark background fallback", () => {
  const resolved = resolvePaintColor("oklch(0.82 0.12 85)", "oklch(0.82 0.12 85)", () => null)
  assert.equal(resolved, null)
})

test("none / transparent / url paints are kept", () => {
  assert.equal(resolvePaintColor("none", undefined, () => null), "none")
  assert.equal(resolvePaintColor("url(#clip)", undefined, () => null), "url(#clip)")
})
