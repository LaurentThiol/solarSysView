"use strict";

/**
 * Éléments képlériens moyens, époque J2000 (JD 2451545.0).
 * Planètes : valeurs approchées publiées par le JPL (SSD), sans les dérivées
 * séculaires. Lunes : orbites képlériennes simplifiées, suffisantes pour
 * une scène et non pour une éphéméride de navigation.
 *
 * Repère : écliptique héliocentrique, en unités astronomiques.
 * x, y dans le plan de l'écliptique, z vers le nord écliptique.
 */

const J2000 = 2451545.0;
const UNIX_EPOCH_JD = 2440587.5;
const AU_KM = 149597870.7;
const DAY_MS = 86400000;
const MAX_STEP_SEC = 2;
const MIN_RATE = 0;
const MAX_RATE = 4000;
const MIN_YEAR = -3000;
const MAX_YEAR = 3000;

const BODIES = [
  {
    id: "sun",
    name: "Soleil",
    kind: "star",
    parent: null,
    radiusKm: 695700,
    obliquityDeg: 7.25,
    spinHours: 609.12,
    color: "#f3d7a1",
    fact: "Une étoile de la séquence principale qui concentre plus de 99 % de la masse du système.",
    aAu: 0,
    e: 0,
    iDeg: 0,
    OmegaDeg: 0,
    wDeg: 0,
    M0Deg: 0,
    periodDays: null,
  },
  {
    id: "mercury",
    name: "Mercure",
    kind: "planet",
    parent: null,
    radiusKm: 2439.7,
    obliquityDeg: 0.03,
    spinHours: 1407.6,
    color: "#b7b1a8",
    fact: "La plus proche du Soleil : elle boucle son orbite en 88 jours et n'a presque pas d'atmosphère.",
    aAu: 0.38709927,
    e: 0.20563593,
    iDeg: 7.00497902,
    OmegaDeg: 48.33076593,
    wDeg: 29.12703035,
    M0Deg: 174.79252722,
    periodDays: 87.9691,
  },
  {
    id: "venus",
    name: "Vénus",
    kind: "planet",
    parent: null,
    radiusKm: 6051.8,
    obliquityDeg: 177.36,
    spinHours: -5832.5,
    color: "#e6d3a3",
    fact: "Une atmosphère dense de dioxyde de carbone y maintient la surface plus chaude que sur Mercure.",
    aAu: 0.72333566,
    e: 0.00677672,
    iDeg: 3.39467605,
    OmegaDeg: 76.67984255,
    wDeg: 54.92262463,
    M0Deg: 50.37663232,
    periodDays: 224.701,
  },
  {
    id: "earth",
    name: "Terre",
    kind: "planet",
    parent: null,
    radiusKm: 6371,
    obliquityDeg: 23.44,
    spinHours: 23.9345,
    color: "#6ea4d4",
    fact: "La seule planète connue à porter des océans liquides stables et une biosphère.",
    aAu: 1.00000261,
    e: 0.01671123,
    iDeg: -0.00001531,
    OmegaDeg: 0,
    wDeg: 102.93768193,
    M0Deg: -2.47311027,
    periodDays: 365.256363,
  },
  {
    id: "mars",
    name: "Mars",
    kind: "planet",
    parent: null,
    radiusKm: 3389.5,
    obliquityDeg: 25.19,
    spinHours: 24.6229,
    color: "#c46a4a",
    fact: "Un désert froid, rouillé par l'oxyde de fer, avec les plus hauts volcans du système.",
    aAu: 1.52371034,
    e: 0.0933941,
    iDeg: 1.84969142,
    OmegaDeg: 49.55953891,
    wDeg: -73.5031685,
    M0Deg: 19.39019754,
    periodDays: 686.98,
  },
  {
    id: "jupiter",
    name: "Jupiter",
    kind: "planet",
    parent: null,
    radiusKm: 69911,
    obliquityDeg: 3.13,
    spinHours: 9.925,
    color: "#d4b48c",
    fact: "Géante gazeuse dont la masse dépasse celle de toutes les autres planètes réunies.",
    aAu: 5.202887,
    e: 0.04838624,
    iDeg: 1.30439695,
    OmegaDeg: 100.47390909,
    wDeg: -85.74542926,
    M0Deg: 19.66796068,
    periodDays: 4332.589,
  },
  {
    id: "saturn",
    name: "Saturne",
    kind: "planet",
    parent: null,
    radiusKm: 58232,
    obliquityDeg: 26.73,
    spinHours: 10.656,
    color: "#e4d2a8",
    fact: "Ses anneaux de glace s'étendent très loin, mais leur épaisseur se mesure en dizaines de mètres.",
    aAu: 9.53667594,
    e: 0.05386179,
    iDeg: 2.48599187,
    OmegaDeg: 113.66242448,
    wDeg: -21.06354617,
    M0Deg: -42.64463408,
    periodDays: 10759.22,
  },
  {
    id: "uranus",
    name: "Uranus",
    kind: "planet",
    parent: null,
    radiusKm: 25362,
    obliquityDeg: 97.77,
    spinHours: -17.24,
    color: "#b7dde4",
    fact: "Couchée sur le côté, elle présente longtemps un pôle au Soleil avant de basculer vers l'autre.",
    aAu: 19.18916464,
    e: 0.04725744,
    iDeg: 0.77263783,
    OmegaDeg: 74.01692503,
    wDeg: 96.93735127,
    M0Deg: 142.28382821,
    periodDays: 30688.5,
  },
  {
    id: "neptune",
    name: "Neptune",
    kind: "planet",
    parent: null,
    radiusKm: 24622,
    obliquityDeg: 28.32,
    spinHours: 16.11,
    color: "#6a7fd0",
    fact: "La plus lointaine des géantes, balayée par les vents les plus rapides du système.",
    aAu: 30.06992276,
    e: 0.00859048,
    iDeg: 1.77004347,
    OmegaDeg: 131.78422574,
    wDeg: -86.81946347,
    M0Deg: -100.08479196,
    periodDays: 60182,
  },
  {
    id: "moon",
    name: "Lune",
    kind: "moon",
    parent: "earth",
    radiusKm: 1737.4,
    obliquityDeg: 6.68,
    spinHours: 655.728,
    color: "#d5d0c6",
    fact: "Elle stabilise l'inclinaison de la Terre et s'en éloigne de quelques centimètres par an.",
    aAu: 384400 / AU_KM,
    e: 0.0549,
    iDeg: 5.145,
    OmegaDeg: 125.08,
    wDeg: 318.15,
    M0Deg: 135.27,
    periodDays: 27.321661,
  },
  {
    id: "io",
    name: "Io",
    kind: "moon",
    parent: "jupiter",
    radiusKm: 1821.6,
    obliquityDeg: 0.05,
    spinHours: 42.459,
    color: "#e6d27a",
    fact: "Le volcanisme le plus intense du système, entretenu par les marées de Jupiter.",
    aAu: 421700 / AU_KM,
    e: 0.0041,
    iDeg: 0.04,
    OmegaDeg: 0,
    wDeg: 0,
    M0Deg: 12,
    periodDays: 1.769137786,
  },
  {
    id: "europa",
    name: "Europe",
    kind: "moon",
    parent: "jupiter",
    radiusKm: 1560.8,
    obliquityDeg: 0.1,
    spinHours: 85.229,
    color: "#e7e2d4",
    fact: "Sous une croûte de glace, un océan d'eau liquide est tenu pour probable.",
    aAu: 671100 / AU_KM,
    e: 0.009,
    iDeg: 0.47,
    OmegaDeg: 0,
    wDeg: 0,
    M0Deg: 96,
    periodDays: 3.551181,
  },
  {
    id: "ganymede",
    name: "Ganymède",
    kind: "moon",
    parent: "jupiter",
    radiusKm: 2634.1,
    obliquityDeg: 0.2,
    spinHours: 171.709,
    color: "#b9a48a",
    fact: "La plus grande lune du système solaire, plus grosse que Mercure.",
    aAu: 1070400 / AU_KM,
    e: 0.0013,
    iDeg: 0.2,
    OmegaDeg: 0,
    wDeg: 0,
    M0Deg: 210,
    periodDays: 7.15455296,
  },
  {
    id: "callisto",
    name: "Callisto",
    kind: "moon",
    parent: "jupiter",
    radiusKm: 2410.3,
    obliquityDeg: 0.3,
    spinHours: 400.536,
    color: "#8d7b6a",
    fact: "Une surface très ancienne, criblée de cratères, loin des marées violentes d'Io.",
    aAu: 1882700 / AU_KM,
    e: 0.0074,
    iDeg: 0.19,
    OmegaDeg: 0,
    wDeg: 0,
    M0Deg: 300,
    periodDays: 16.6890184,
  },
];

const BY_ID = new Map(BODIES.map((body) => [body.id, body]));

function rad(deg) {
  return (deg * Math.PI) / 180;
}

function solveKepler(meanAnomaly, eccentricity) {
  const twoPi = Math.PI * 2;
  let M = meanAnomaly % twoPi;
  if (M > Math.PI) M -= twoPi;
  if (M < -Math.PI) M += twoPi;
  const e = eccentricity;
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let i = 0; i < 40; i += 1) {
    const delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return E;
}

function trueAnomaly(eccentricAnomaly, eccentricity) {
  const e = eccentricity;
  const cosE = Math.cos(eccentricAnomaly);
  const sinE = Math.sin(eccentricAnomaly);
  const denom = 1 - e * cosE;
  const cosNu = (cosE - e) / denom;
  const sinNu = (Math.sqrt(1 - e * e) * sinE) / denom;
  return Math.atan2(sinNu, cosNu);
}

function orbitalPosition(body, meanAnomaly) {
  const e = body.e;
  const E = solveKepler(meanAnomaly, e);
  const nu = trueAnomaly(E, e);
  const radius = body.aAu * (1 - e * Math.cos(E));
  const xOrb = radius * Math.cos(nu);
  const yOrb = radius * Math.sin(nu);
  const cosw = Math.cos(rad(body.wDeg));
  const sinw = Math.sin(rad(body.wDeg));
  const cosi = Math.cos(rad(body.iDeg));
  const sini = Math.sin(rad(body.iDeg));
  const cosO = Math.cos(rad(body.OmegaDeg));
  const sinO = Math.sin(rad(body.OmegaDeg));
  const x1 = cosw * xOrb - sinw * yOrb;
  const y1 = sinw * xOrb + cosw * yOrb;
  return {
    x: cosO * x1 - sinO * y1 * cosi,
    y: sinO * x1 + cosO * y1 * cosi,
    z: y1 * sini,
  };
}

function meanAnomalyAt(body, jd) {
  const motion = (Math.PI * 2) / body.periodDays;
  return rad(body.M0Deg) + motion * (jd - J2000);
}

function spinAngle(body, jd) {
  if (!body.spinHours) return 0;
  const turns = (jd - J2000) * (24 / body.spinHours);
  const frac = turns - Math.floor(turns);
  return frac * Math.PI * 2;
}

function positions(jd) {
  const placed = new Map();
  const list = [];
  for (const body of BODIES) {
    let rel = { x: 0, y: 0, z: 0 };
    if (body.periodDays) rel = orbitalPosition(body, meanAnomalyAt(body, jd));
    const parent = body.parent ? placed.get(body.parent) : null;
    const x = rel.x + (parent ? parent.x : 0);
    const y = rel.y + (parent ? parent.y : 0);
    const z = rel.z + (parent ? parent.z : 0);
    const point = {
      id: body.id,
      x,
      y,
      z,
      spin: spinAngle(body, jd),
      rAu: Math.hypot(x, y, z),
    };
    placed.set(body.id, point);
    list.push(point);
  }
  return list;
}

function sampleOrbit(id, count) {
  const body = BY_ID.get(id);
  if (!body || !body.periodDays) return [];
  const safe = Math.max(24, Math.min(720, count | 0));
  const points = [];
  for (let i = 0; i < safe; i += 1) {
    points.push(orbitalPosition(body, (i / safe) * Math.PI * 2));
  }
  return points;
}

function publicBody(body) {
  return {
    id: body.id,
    name: body.name,
    kind: body.kind,
    parent: body.parent,
    radiusKm: body.radiusKm,
    obliquityDeg: body.obliquityDeg,
    spinHours: body.spinHours,
    retrograde: body.spinHours < 0,
    color: body.color,
    fact: body.fact,
    aAu: body.aAu,
    e: body.e,
    iDeg: body.iDeg,
    periodDays: body.periodDays,
    hasOrbit: Boolean(body.periodDays),
  };
}

function catalog() {
  return {
    epoch: "J2000",
    epochJd: J2000,
    auKm: AU_KM,
    note: "Éléments képlériens moyens, époque J2000. La précision se dégrade loin de l'an 2000. Ce n'est pas une éphéméride JPL.",
    bodies: BODIES.map(publicBody),
  };
}

function unixToJd(ms) {
  return ms / DAY_MS + UNIX_EPOCH_JD;
}

function jdToUnix(jd) {
  return (jd - UNIX_EPOCH_JD) * DAY_MS;
}

function utcYear(jd) {
  const date = new Date(jdToUnix(jd));
  if (Number.isNaN(date.getTime())) return NaN;
  return date.getUTCFullYear();
}

function yearInRange(jd) {
  const year = utcYear(jd);
  return Number.isFinite(year) && year >= MIN_YEAR && year <= MAX_YEAR;
}

function jdFromCivil(year, month, day, hours, minutes, seconds) {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(hours, minutes, seconds, 0);
  return unixToJd(date.getTime());
}

function initialState(nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  return {
    jd: unixToJd(now),
    playing: true,
    rateDaysPerSec: 1,
    updatedAtMs: now,
  };
}

function advance(state, nowMs) {
  const elapsed = Math.min(MAX_STEP_SEC, Math.max(0, (nowMs - state.updatedAtMs) / 1000));
  const jd = state.playing ? state.jd + state.rateDaysPerSec * elapsed : state.jd;
  return {
    jd,
    playing: state.playing,
    rateDaysPerSec: state.rateDaysPerSec,
    updatedAtMs: nowMs,
  };
}

function parseCommand(payload) {
  let value = payload;
  if (typeof value === "string") {
    if (value.length > 400) return null;
    const text = value.trim();
    if (!text) return null;
    try {
      value = JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.type === "pause") return { type: "pause" };
  if (value.type === "play") return { type: "play" };
  if (value.type === "toggle") return { type: "toggle" };
  if (value.type === "tick") return { type: "tick" };
  if (value.type === "setRate") {
    const rate = Number(value.rateDaysPerSec);
    if (!Number.isFinite(rate) || rate < MIN_RATE || rate > MAX_RATE) return null;
    return { type: "setRate", rateDaysPerSec: rate };
  }
  if (value.type === "setDate") {
    let jd = null;
    if (Number.isFinite(Number(value.jd))) jd = Number(value.jd);
    else if (Number.isFinite(Number(value.year))) {
      const year = Number(value.year);
      if (!Number.isInteger(year)) return null;
      jd = jdFromCivil(year, 0, 1, 0, 0, 0);
    }
    if (jd == null || !yearInRange(jd)) return null;
    return { type: "setDate", jd };
  }
  return null;
}

function applyCommand(state, command) {
  if (command.type === "pause") return { ...state, playing: false };
  if (command.type === "play") return { ...state, playing: true };
  if (command.type === "toggle") return { ...state, playing: !state.playing };
  if (command.type === "setRate") return { ...state, rateDaysPerSec: command.rateDaysPerSec };
  if (command.type === "setDate") return { ...state, jd: command.jd };
  return state;
}

function formatRate(rate) {
  if (Math.abs(rate - 365) < 0.05) return "1 an/s";
  if (rate >= 10) return `${Math.round(rate)} j/s`;
  const rounded = Math.round(rate * 10) / 10;
  return `${String(rounded).replace(".", ",")} j/s`;
}

function formatLabel(state) {
  const date = new Date(jdToUnix(state.jd));
  const when = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  const rate = state.playing ? formatRate(state.rateDaysPerSec) : "pause";
  return `${when} · ${rate}`;
}

function makeTick(state, nowMs) {
  return {
    type: "tick",
    jd: state.jd,
    playing: state.playing,
    rateDaysPerSec: state.rateDaysPerSec,
    serverTimeMs: nowMs,
    bodies: positions(state.jd),
  };
}

function reduce(state, command, nowMs) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  let next = advance(
    {
      jd: state.jd,
      playing: state.playing,
      rateDaysPerSec: state.rateDaysPerSec,
      updatedAtMs: state.updatedAtMs,
    },
    now,
  );
  let accepted = true;
  const isBareTick = Boolean(command && typeof command === "object" && command.type === "tick");
  if (command != null && !isBareTick) {
    const parsed = parseCommand(command);
    if (!parsed || parsed.type === "tick") {
      accepted = Boolean(parsed);
    } else {
      next = applyCommand(next, parsed);
    }
  }
  return {
    state: next,
    tick: makeTick(next, now),
    label: formatLabel(next),
    accepted,
  };
}

module.exports = {
  J2000,
  AU_KM,
  MIN_YEAR,
  MAX_YEAR,
  MIN_RATE,
  MAX_RATE,
  solveKepler,
  positions,
  sampleOrbit,
  catalog,
  initialState,
  reduce,
  parseCommand,
  unixToJd,
  jdToUnix,
  utcYear,
};
