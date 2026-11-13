"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const solar = require("./solar.js");

function body(jd, id) {
  return solar.positions(jd).find((point) => point.id === id);
}

function angle(a, b) {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  const ra = Math.hypot(a.x, a.y, a.z);
  const rb = Math.hypot(b.x, b.y, b.z);
  return Math.acos(Math.min(1, Math.max(-1, dot / (ra * rb))));
}

test("l'équation de Kepler se referme, même pour une forte excentricité", () => {
  for (const eccentricity of [0, 0.2, 0.8, 0.20563593]) {
    for (const mean of [-2.2, -0.4, 0, 1.2, 3]) {
      const eccentric = solar.solveKepler(mean, eccentricity);
      const back = eccentric - eccentricity * Math.sin(eccentric);
      const twoPi = Math.PI * 2;
      let delta = (back - mean) % twoPi;
      if (delta > Math.PI) delta -= twoPi;
      if (delta < -Math.PI) delta += twoPi;
      assert.ok(Math.abs(delta) < 1e-9, `e=${eccentricity} M=${mean}`);
    }
  }
});

test("la Terre reste près de 1 UA à J2000 et retrouve sa place après une période", () => {
  const start = body(solar.J2000, "earth");
  const radius = Math.hypot(start.x, start.y, start.z);
  assert.ok(Math.abs(radius - 1) < 0.02, radius);
  const later = body(solar.J2000 + 365.256363, "earth");
  const drift = angle(start, later);
  assert.ok(drift < (0.2 * Math.PI) / 180, drift);
});

test("la Lune reste dans le voisinage de la Terre", () => {
  const earth = body(solar.J2000, "earth");
  const moon = body(solar.J2000, "moon");
  const distance = Math.hypot(moon.x - earth.x, moon.y - earth.y, moon.z - earth.z);
  assert.ok(distance > 0.002 && distance < 0.003, distance);
});

test("les lunes galiléennes restent autour de Jupiter", () => {
  const jupiter = body(solar.J2000 + 40, "jupiter");
  for (const id of ["io", "europa", "ganymede", "callisto"]) {
    const moon = body(solar.J2000 + 40, id);
    const distance = Math.hypot(moon.x - jupiter.x, moon.y - jupiter.y, moon.z - jupiter.z);
    assert.ok(distance < 0.02, `${id} ${distance}`);
  }
});

test("une orbite échantillonnée de la Terre ne s'écrase pas sur un point", () => {
  const samples = solar.sampleOrbit("earth", 120);
  assert.equal(samples.length, 120);
  const radii = samples.map((point) => Math.hypot(point.x, point.y, point.z));
  for (const radius of radii) assert.ok(radius > 0.95 && radius < 1.05, radius);
  const spread = Math.hypot(samples[0].x - samples[30].x, samples[0].y - samples[30].y);
  assert.ok(spread > 0.5, spread);
});

test("une vitesse hors bornes est refusée et n'altère pas l'état reçu", () => {
  const now = Date.UTC(2026, 10, 13, 12, 0, 0);
  const state = solar.initialState(now);
  const rejected = solar.reduce(state, { type: "setRate", rateDaysPerSec: 1e12 }, now);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.state.rateDaysPerSec, 1);
  assert.equal(state.rateDaysPerSec, 1);
  const accepted = solar.reduce(state, { type: "setRate", rateDaysPerSec: 30 }, now);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.state.rateDaysPerSec, 30);
});

test("une date hors de l'intervalle −3000 à 3000 est refusée", () => {
  const now = Date.UTC(2026, 10, 13);
  const state = solar.initialState(now);
  const rejected = solar.reduce(state, { type: "setDate", year: 9000 }, now);
  assert.equal(rejected.accepted, false);
  assert.ok(Math.abs(rejected.state.jd - state.jd) < 1e-9);
  const accepted = solar.reduce(state, { type: "setDate", year: 1900 }, now);
  assert.equal(accepted.accepted, true);
  assert.equal(solar.utcYear(accepted.state.jd), 1900);
});

test("la pause fige la date, et un long trou de temps est borné", () => {
  const now = 1_700_000_000_000;
  let state = solar.reduce(solar.initialState(now), { type: "pause" }, now).state;
  const frozen = solar.reduce(state, { type: "tick" }, now + 10_000).state;
  assert.equal(frozen.jd, state.jd);
  state = solar.reduce(frozen, { type: "play" }, now + 10_000).state;
  state = solar.reduce(state, { type: "setRate", rateDaysPerSec: 10 }, now + 10_000).state;
  const jumped = solar.reduce(state, { type: "tick" }, now + 10_000 + 86_400_000).state;
  const advancedDays = jumped.jd - state.jd;
  assert.ok(advancedDays > 19 && advancedDays < 21, advancedDays);
});

test("le catalogue expose le Soleil, huit planètes et les lunes demandées", () => {
  const ids = solar.catalog().bodies.map((item) => item.id);
  assert.deepEqual(ids, [
    "sun",
    "mercury",
    "venus",
    "earth",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "moon",
    "io",
    "europa",
    "ganymede",
    "callisto",
  ]);
});

test("une chaîne JSON invalide ne devient pas une commande", () => {
  assert.equal(solar.parseCommand("{"), null);
  assert.equal(solar.parseCommand("[]"), null);
  assert.equal(solar.parseCommand("x".repeat(401)), null);
  assert.deepEqual(solar.parseCommand('{"type":"pause"}'), { type: "pause" });
});
