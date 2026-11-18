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

test("une vitesse hors bornes est refusée et les vitesses lentes ou rétrogrades sont acceptées", () => {
  const now = Date.UTC(2026, 10, 13, 12, 0, 0);
  const state = solar.initialState(now);
  for (const invalid of [1e12, 5000, -5000, NaN]) {
    const rejected = solar.reduce(state, { type: "setRate", rateDaysPerSec: invalid }, now);
    assert.equal(rejected.accepted, false);
    assert.equal(rejected.state.rateDaysPerSec, 1);
  }
  assert.equal(state.rateDaysPerSec, 1);

  for (const valid of [1 / 86400, 1 / 1440, 1 / 24, 30, -1, -30, -365]) {
    const accepted = solar.reduce(state, { type: "setRate", rateDaysPerSec: valid }, now);
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.state.rateDaysPerSec, valid);
  }
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

test("le cabriolet Tesla est inactif avant le 7 février 2018 puis suit son ellipse héliocentrique", () => {
  const beforeJd = solar.unixToJd(Date.UTC(2018, 1, 5, 0, 0, 0));
  assert.equal(body(beforeJd, "roadster").active, false);

  const escapeJd = solar.unixToJd(Date.UTC(2018, 1, 7, 2, 30, 0));
  const roadsterAtEscape = body(escapeJd, "roadster");
  const earthAtEscape = body(escapeJd, "earth");
  assert.equal(roadsterAtEscape.active, true);
  const earthDistAu = Math.hypot(
    roadsterAtEscape.x - earthAtEscape.x,
    roadsterAtEscape.y - earthAtEscape.y,
    roadsterAtEscape.z - earthAtEscape.z,
  );
  assert.ok(earthDistAu < 0.002, `distance Terre au départ = ${earthDistAu} UA`);

  const aphelionJd = solar.unixToJd(Date.UTC(2018, 10, 9, 12, 0, 0));
  const atAphelion = body(aphelionJd, "roadster");
  assert.ok(atAphelion.rAu > 1.65 && atAphelion.rAu < 1.68, `aphélie = ${atAphelion.rAu} UA`);
  assert.ok(atAphelion.speedKmS > 19 && atAphelion.speedKmS < 35, `vitesse = ${atAphelion.speedKmS}`);

  const marsFlybyJd = solar.unixToJd(Date.UTC(2020, 9, 7, 6, 0, 0));
  const roadsterFlyby = body(marsFlybyJd, "roadster");
  const marsFlyby = body(marsFlybyJd, "mars");
  const marsDistKm =
    Math.hypot(
      roadsterFlyby.x - marsFlyby.x,
      roadsterFlyby.y - marsFlyby.y,
      roadsterFlyby.z - marsFlyby.z,
    ) * solar.AU_KM;
  assert.ok(marsDistKm < 10_000_000, `approche de Mars = ${marsDistKm} km`);
});

test("l'ISS théorique reste à ~415 km d'altitude et inclinée à 51,64° sur l'équateur terrestre", () => {
  const jd0 = solar.unixToJd(Date.UTC(2026, 5, 21, 12, 0, 0));
  let maxLatDeg = 0;
  const steps = 72;
  const periodDays = 92.9 / 1440;

  for (let i = 0; i < steps; i += 1) {
    const jd = jd0 + (i / steps) * periodDays;
    const earth = body(jd, "earth");
    const iss = body(jd, "iss");
    assert.equal(iss.active, true);
    const relEcl = { x: iss.x - earth.x, y: iss.y - earth.y, z: iss.z - earth.z };
    const distKm = Math.hypot(relEcl.x, relEcl.y, relEcl.z) * solar.AU_KM;
    const altitudeKm = distKm - 6371;
    assert.ok(Math.abs(altitudeKm - 415) < 5, `altitude = ${altitudeKm} km`);
    assert.ok(Math.abs(iss.speedKmS - 7.66) < 0.1, `vitesse ISS = ${iss.speedKmS} km/s`);

    const eq = solar.eclipticToEquatorial(relEcl);
    const latDeg = (Math.asin(eq.z / Math.hypot(eq.x, eq.y, eq.z)) * 180) / Math.PI;
    if (Math.abs(latDeg) > maxLatDeg) maxLatDeg = Math.abs(latDeg);
  }
  assert.ok(maxLatDeg > 51.4 && maxLatDeg < 51.7, `latitude équatoriale max = ${maxLatDeg}°`);
});

test("la comète de Halley passe à ~0,59 UA au périhélie de février 1986 et s'éloigne au-delà de 30 UA", () => {
  const perihelionJd = solar.unixToJd(Date.UTC(1986, 1, 9, 11, 0, 0));
  const atPeri = body(perihelionJd, "halley");
  assert.ok(atPeri.rAu > 0.58 && atPeri.rAu < 0.6, `périhélie Halley = ${atPeri.rAu} UA`);
  assert.ok(atPeri.speedKmS > 52 && atPeri.speedKmS < 56, `vitesse périhélie = ${atPeri.speedKmS}`);

  const aphelionJd = solar.unixToJd(Date.UTC(2023, 11, 9, 0, 0, 0));
  const atAph = body(aphelionJd, "halley");
  assert.ok(atAph.rAu > 34 && atAph.rAu < 36, `aphélie Halley = ${atAph.rAu} UA`);
});

test("James Webb est inactif avant Noël 2021 puis orbite autour de L2 à ~1,5 M km derrière la Terre", () => {
  const beforeJd = solar.unixToJd(Date.UTC(2021, 10, 1));
  assert.equal(body(beforeJd, "jwst").active, false);

  const l2Jd = solar.unixToJd(Date.UTC(2022, 5, 1, 0, 0, 0));
  const earth = body(l2Jd, "earth");
  const jwst = body(l2Jd, "jwst");
  assert.equal(jwst.active, true);
  const rel = { x: jwst.x - earth.x, y: jwst.y - earth.y, z: jwst.z - earth.z };
  const distKm = Math.hypot(rel.x, rel.y, rel.z) * solar.AU_KM;
  assert.ok(distKm > 1_250_000 && distKm < 1_850_000, `distance JWST-Terre = ${distKm} km`);
  // Vérifie que JWST est bien du côté anti-solaire de la Terre (produit scalaire > 0)
  const dotAntiSun = earth.x * rel.x + earth.y * rel.y + earth.z * rel.z;
  assert.ok(dotAntiSun > 0, `JWST doit être à l'opposé du Soleil (${dotAntiSun})`);
});

test("l'ISS hybride utilise la télémétrie temps réel près de l'échantillon puis bascule en théorique", () => {
  const sampleJd = solar.unixToJd(Date.UTC(2026, 10, 18, 12, 0, 0));
  const telemetry = {
    latDeg: 48.8566,
    lonDeg: 2.3522,
    altitudeKm: 421,
    velocityKmS: 7.65,
    jd: sampleJd,
    dLatPerDay: 1200,
    dLonPerDay: 5100,
  };

  const liveList = solar.positions(sampleJd + 10 / 86400, { issTelemetry: telemetry });
  const liveIss = liveList.find((p) => p.id === "iss");
  const earth = liveList.find((p) => p.id === "earth");
  assert.equal(liveIss.source, "live");
  const liveAltKm =
    Math.hypot(liveIss.x - earth.x, liveIss.y - earth.y, liveIss.z - earth.z) * solar.AU_KM - 6371;
  assert.ok(Math.abs(liveAltKm - 421) < 1, `altitude live = ${liveAltKm}`);

  // 1 heure plus tard : bascule automatique sur l'orbite théorique à 415 km
  const futureList = solar.positions(sampleJd + 1 / 24, { issTelemetry: telemetry });
  const theoIss = futureList.find((p) => p.id === "iss");
  assert.equal(theoIss.source, "theoretical");
});

test("le catalogue expose le Soleil, huit planètes, les lunes, Halley et les trois engins", () => {
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
    "halley",
    "iss",
    "jwst",
    "roadster",
  ]);
});

test("une chaîne JSON invalide ne devient pas une commande", () => {
  assert.equal(solar.parseCommand("{"), null);
  assert.equal(solar.parseCommand("[]"), null);
  assert.equal(solar.parseCommand("x".repeat(401)), null);
  assert.deepEqual(solar.parseCommand('{"type":"pause"}'), { type: "pause" });
});
