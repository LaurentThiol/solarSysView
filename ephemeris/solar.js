"use strict";

/**
 * Éléments képlériens approchés (époque J2000, JD 2451545.0).
 * Planètes : table JPL Standish & Williams (−3000 à 3000) avec dérives séculaires.
 * Lunes : orbites képlériennes simplifiées.
 * Engins : cabriolet Tesla (héliocentrique JPL 2018-017A) et ISS théorique
 * (orbite circulaire équatoriale terrestre à 415 km, inclinée à 51,64°).
 *
 * Repère de sortie : écliptique héliocentrique J2000, en unités astronomiques.
 * x vers le point vernal, y à 90° de longitude écliptique, z vers le nord écliptique.
 */

const J2000 = 2451545.0;
const JULIAN_CENTURY = 36525;
const UNIX_EPOCH_JD = 2440587.5;
const AU_KM = 149597870.7;
const DAY_MS = 86400000;
const MAX_STEP_SEC = 2;
const MIN_RATE = -4000;
const MAX_RATE = 4000;
const MIN_YEAR = -3000;
const MAX_YEAR = 3000;
const EARTH_OBLIQUITY_DEG = 23.43928;

const MU_KM3_S2 = {
  sun: 132712440018,
  earth: 398600.4418,
  jupiter: 126686534,
};

const BODIES = [
  {
    id: "sun",
    name: "Soleil",
    kind: "star",
    parent: null,
    frame: "ecliptic",
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
    frame: "ecliptic",
    radiusKm: 2439.7,
    obliquityDeg: 0.03,
    spinHours: 1407.6,
    color: "#b7b1a8",
    fact: "La plus proche du Soleil : elle boucle son orbite en 88 jours et n'a presque pas d'atmosphère.",
    aAu: 0.38709843,
    e: 0.20563661,
    iDeg: 7.00559432,
    OmegaDeg: 48.33961819,
    wDeg: 29.11810076,
    M0Deg: 174.79394829,
    periodDays: 87.9691,
    secular: {
      a0: 0.38709843,
      da: 0.0,
      e0: 0.20563661,
      de: 0.00002123,
      i0: 7.00559432,
      di: -0.00590158,
      L0: 252.25166724,
      dL: 149472.67486623,
      p0: 77.45771895,
      dp: 0.15940013,
      O0: 48.33961819,
      dO: -0.12214182,
    },
  },
  {
    id: "venus",
    name: "Vénus",
    kind: "planet",
    parent: null,
    frame: "ecliptic",
    radiusKm: 6051.8,
    obliquityDeg: 177.36,
    spinHours: -5832.5,
    color: "#e6d3a3",
    fact: "Une atmosphère dense de dioxyde de carbone y maintient la surface plus chaude que sur Mercure.",
    aAu: 0.72332102,
    e: 0.00676399,
    iDeg: 3.39777545,
    OmegaDeg: 76.67261496,
    wDeg: 55.09494217,
    M0Deg: 50.21215137,
    periodDays: 224.701,
    secular: {
      a0: 0.72332102,
      da: -0.00000026,
      e0: 0.00676399,
      de: -0.00005107,
      i0: 3.39777545,
      di: 0.00043494,
      L0: 181.9797085,
      dL: 58517.8156026,
      p0: 131.76755713,
      dp: 0.05679648,
      O0: 76.67261496,
      dO: -0.27274174,
    },
  },
  {
    id: "earth",
    name: "Terre",
    kind: "planet",
    parent: null,
    frame: "ecliptic",
    radiusKm: 6371,
    obliquityDeg: 23.43928,
    spinHours: 23.9344696,
    spin0Deg: 280.4606,
    color: "#6ea4d4",
    fact: "La seule planète connue à porter des océans liquides stables et une biosphère.",
    aAu: 1.00000018,
    e: 0.01673163,
    iDeg: -0.00054346,
    OmegaDeg: -5.11260389,
    wDeg: 108.04266274,
    M0Deg: -2.46314313,
    periodDays: 365.256363,
    secular: {
      a0: 1.00000018,
      da: -0.00000003,
      e0: 0.01673163,
      de: -0.00003661,
      i0: -0.00054346,
      di: -0.01337178,
      L0: 100.46691572,
      dL: 35999.37306329,
      p0: 102.93005885,
      dp: 0.3179526,
      O0: -5.11260389,
      dO: -0.24123856,
    },
  },
  {
    id: "mars",
    name: "Mars",
    kind: "planet",
    parent: null,
    frame: "ecliptic",
    radiusKm: 3389.5,
    obliquityDeg: 25.19,
    spinHours: 24.6229,
    color: "#c46a4a",
    fact: "Un désert froid, rouillé par l'oxyde de fer, avec les plus hauts volcans du système.",
    aAu: 1.52371243,
    e: 0.09336511,
    iDeg: 1.85181869,
    OmegaDeg: 49.71320984,
    wDeg: -73.63065768,
    M0Deg: 19.3493162,
    periodDays: 686.98,
    secular: {
      a0: 1.52371243,
      da: 0.00000097,
      e0: 0.09336511,
      de: 0.00009149,
      i0: 1.85181869,
      di: -0.00724757,
      L0: -4.56813164,
      dL: 19140.29934243,
      p0: -23.91744784,
      dp: 0.45223625,
      O0: 49.71320984,
      dO: -0.26852431,
    },
  },
  {
    id: "jupiter",
    name: "Jupiter",
    kind: "planet",
    parent: null,
    frame: "ecliptic",
    radiusKm: 69911,
    obliquityDeg: 3.13,
    spinHours: 9.925,
    color: "#d4b48c",
    fact: "Géante gazeuse dont la masse dépasse celle de toutes les autres planètes réunies.",
    aAu: 5.20248019,
    e: 0.0485359,
    iDeg: 1.29861416,
    OmegaDeg: 100.29282654,
    wDeg: -86.0178741,
    M0Deg: 20.05983908,
    periodDays: 4332.589,
    secular: {
      a0: 5.20248019,
      da: -0.00002864,
      e0: 0.0485359,
      de: 0.00018026,
      i0: 1.29861416,
      di: -0.00322699,
      L0: 34.33479152,
      dL: 3034.90371757,
      p0: 14.27495244,
      dp: 0.18199196,
      O0: 100.29282654,
      dO: 0.13024619,
      b: -0.00012452,
      c: 0.0606406,
      s: -0.35635438,
      f: 38.35125,
    },
  },
  {
    id: "saturn",
    name: "Saturne",
    kind: "planet",
    parent: null,
    frame: "ecliptic",
    radiusKm: 58232,
    obliquityDeg: 26.73,
    spinHours: 10.656,
    color: "#e4d2a8",
    fact: "Ses anneaux de glace s'étendent très loin, mais leur épaisseur se mesure en dizaines de mètres.",
    aAu: 9.54149883,
    e: 0.05550825,
    iDeg: 2.49424102,
    OmegaDeg: 113.63998702,
    wDeg: -20.77862639,
    M0Deg: -42.78564734,
    periodDays: 10759.22,
    secular: {
      a0: 9.54149883,
      da: -0.00003065,
      e0: 0.05550825,
      de: -0.00032044,
      i0: 2.49424102,
      di: 0.00451969,
      L0: 50.07571329,
      dL: 1222.11494724,
      p0: 92.86136063,
      dp: 0.54179478,
      O0: 113.63998702,
      dO: -0.25015002,
      b: 0.00025899,
      c: -0.13434469,
      s: 0.87320147,
      f: 38.35125,
    },
  },
  {
    id: "uranus",
    name: "Uranus",
    kind: "planet",
    parent: null,
    frame: "ecliptic",
    radiusKm: 25362,
    obliquityDeg: 97.77,
    spinHours: -17.24,
    color: "#b7dde4",
    fact: "Couchée sur le côté, elle présente longtemps un pôle au Soleil avant de basculer vers l'autre.",
    aAu: 19.18797948,
    e: 0.0468574,
    iDeg: 0.77298127,
    OmegaDeg: 73.96250215,
    wDeg: 98.47154226,
    M0Deg: 141.76872184,
    periodDays: 30688.5,
    secular: {
      a0: 19.18797948,
      da: -0.00020455,
      e0: 0.0468574,
      de: -0.0000155,
      i0: 0.77298127,
      di: -0.00180155,
      L0: 314.20276625,
      dL: 428.49512595,
      p0: 172.43404441,
      dp: 0.09266985,
      O0: 73.96250215,
      dO: 0.05739699,
      b: 0.00058331,
      c: -0.97731848,
      s: 0.17689245,
      f: 7.67025,
    },
  },
  {
    id: "neptune",
    name: "Neptune",
    kind: "planet",
    parent: null,
    frame: "ecliptic",
    radiusKm: 24622,
    obliquityDeg: 28.32,
    spinHours: 16.11,
    color: "#6a7fd0",
    fact: "La plus lointaine des géantes, balayée par les vents les plus rapides du système.",
    aAu: 30.06952752,
    e: 0.00895439,
    iDeg: 1.7700552,
    OmegaDeg: 131.78635853,
    wDeg: -85.10477129,
    M0Deg: 257.54130563,
    periodDays: 60182,
    secular: {
      a0: 30.06952752,
      da: 0.00006447,
      e0: 0.00895439,
      de: 0.00000818,
      i0: 1.7700552,
      di: 0.000224,
      L0: 304.22289287,
      dL: 218.46515314,
      p0: 46.68158724,
      dp: 0.01009938,
      O0: 131.78635853,
      dO: -0.00606302,
      b: -0.00041348,
      c: 0.68346318,
      s: -0.10162547,
      f: 7.67025,
    },
  },
  {
    id: "moon",
    name: "Lune",
    kind: "moon",
    parent: "earth",
    frame: "ecliptic",
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
    frame: "ecliptic",
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
    frame: "ecliptic",
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
    frame: "ecliptic",
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
    frame: "ecliptic",
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
  {
    id: "iss",
    name: "ISS (théorique)",
    kind: "craft",
    parent: "earth",
    frame: "equatorial",
    radiusKm: 0.0545,
    spanMeters: 109,
    altitudeKm: 415,
    obliquityDeg: 0,
    spinHours: 92.9 / 60,
    color: "#f2be6b",
    fact: "Orbite basse théorique circulaire à 415 km d'altitude, inclinée à 51,64° sur l'équateur terrestre et bouclée en 93 minutes.",
    aAu: (6371 + 415) / AU_KM,
    e: 0,
    iDeg: 51.64,
    OmegaDeg: 40,
    OmegaRateDegPerDay: -4.97,
    wDeg: 0,
    M0Deg: 0,
    periodDays: 92.9 / 1440,
  },
  {
    id: "roadster",
    name: "Cabriolet Tesla",
    kind: "craft",
    parent: null,
    frame: "ecliptic",
    radiusKm: 0.0065,
    spanMeters: 13,
    altitudeKm: null,
    obliquityDeg: 15,
    spinHours: 4.7589 / 60,
    color: "#d94b58",
    fact: "Roadster d'Elon Musk et mannequin Starman (2018-017A), éjectés le 7 février 2018 sur une ellipse héliocentrique croisant l'orbite de Mars.",
    aAu: 1.3249,
    e: 0.25571,
    iDeg: 1.0775,
    OmegaDeg: 317.096,
    wDeg: 177.49,
    M0Deg: 48.61574922,
    periodDays: 556.98,
    sinceJd: 2458156.5 + 2.5 / 24,
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

function equatorialToEcliptic(vec, obliquityDeg = EARTH_OBLIQUITY_DEG) {
  const eps = rad(obliquityDeg);
  const c = Math.cos(eps);
  const s = Math.sin(eps);
  return {
    x: vec.x,
    y: c * vec.y + s * vec.z,
    z: -s * vec.y + c * vec.z,
  };
}

function eclipticToEquatorial(vec, obliquityDeg = EARTH_OBLIQUITY_DEG) {
  const eps = rad(obliquityDeg);
  const c = Math.cos(eps);
  const s = Math.sin(eps);
  return {
    x: vec.x,
    y: c * vec.y - s * vec.z,
    z: s * vec.y + c * vec.z,
  };
}

function elementsAt(body, jd) {
  if (body.secular) {
    const T = (jd - J2000) / JULIAN_CENTURY;
    const s = body.secular;
    const aAu = s.a0 + s.da * T;
    const e = Math.max(0, Math.min(0.99, s.e0 + s.de * T));
    const iDeg = s.i0 + s.di * T;
    const OmegaDeg = s.O0 + s.dO * T;
    const varpiDeg = s.p0 + s.dp * T;
    const wDeg = varpiDeg - OmegaDeg;
    const extra = s.f
      ? s.b * T * T + s.c * Math.cos(rad(s.f * T)) + s.s * Math.sin(rad(s.f * T))
      : 0;
    const meanAnomaly = rad(s.L0 + s.dL * T - varpiDeg + extra);
    return { aAu, e, iDeg, OmegaDeg, wDeg, meanAnomaly };
  }
  const OmegaDeg = body.OmegaDeg + (body.OmegaRateDegPerDay || 0) * (jd - J2000);
  const motion = body.periodDays ? (Math.PI * 2) / body.periodDays : 0;
  const meanAnomaly = rad(body.M0Deg) + motion * (jd - J2000);
  return {
    aAu: body.aAu,
    e: body.e,
    iDeg: body.iDeg,
    OmegaDeg,
    wDeg: body.wDeg,
    meanAnomaly,
  };
}

function orbitalPoint(elements, meanAnomaly, frame, parentObliquityDeg) {
  const e = elements.e;
  const E = solveKepler(meanAnomaly, e);
  const nu = trueAnomaly(E, e);
  const radius = elements.aAu * (1 - e * Math.cos(E));
  const xOrb = radius * Math.cos(nu);
  const yOrb = radius * Math.sin(nu);
  const cosw = Math.cos(rad(elements.wDeg));
  const sinw = Math.sin(rad(elements.wDeg));
  const cosi = Math.cos(rad(elements.iDeg));
  const sini = Math.sin(rad(elements.iDeg));
  const cosO = Math.cos(rad(elements.OmegaDeg));
  const sinO = Math.sin(rad(elements.OmegaDeg));
  const x1 = cosw * xOrb - sinw * yOrb;
  const y1 = sinw * xOrb + cosw * yOrb;
  const point = {
    x: cosO * x1 - sinO * y1 * cosi,
    y: sinO * x1 + cosO * y1 * cosi,
    z: y1 * sini,
  };
  return frame === "equatorial" ? equatorialToEcliptic(point, parentObliquityDeg) : point;
}

function orbitalSpeedKmS(body, aAu, localRadiusAu) {
  if (!body.periodDays || aAu <= 0 || localRadiusAu <= 0) return 0;
  const mu = MU_KM3_S2[body.parent || "sun"] || MU_KM3_S2.sun;
  const rKm = localRadiusAu * AU_KM;
  const aKm = aAu * AU_KM;
  const v2 = mu * (2 / rKm - 1 / aKm);
  return v2 > 0 ? Math.sqrt(v2) : 0;
}

function spinAngle(body, jd) {
  if (!body.spinHours) return 0;
  const offset = body.spin0Deg ? rad(body.spin0Deg) : 0;
  const turns = (jd - J2000) * (24 / body.spinHours);
  const frac = turns - Math.floor(turns);
  return (offset + frac * Math.PI * 2) % (Math.PI * 2);
}

function positions(jd) {
  const placed = new Map();
  const list = [];
  for (const body of BODIES) {
    let rel = { x: 0, y: 0, z: 0 };
    let aAu = body.aAu;
    if (body.periodDays) {
      const elements = elementsAt(body, jd);
      aAu = elements.aAu;
      const parentBody = body.parent ? BY_ID.get(body.parent) : null;
      const obliquity = parentBody ? parentBody.obliquityDeg : EARTH_OBLIQUITY_DEG;
      rel = orbitalPoint(elements, elements.meanAnomaly, body.frame, obliquity);
    }
    const localRadiusAu = Math.hypot(rel.x, rel.y, rel.z);
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
      speedKmS: orbitalSpeedKmS(body, aAu, localRadiusAu),
      active: body.sinceJd == null || jd >= body.sinceJd,
    };
    placed.set(body.id, point);
    list.push(point);
  }
  return list;
}

function sampleOrbit(id, count, jd = J2000) {
  const body = BY_ID.get(id);
  if (!body || !body.periodDays) return [];
  const safe = Math.max(24, Math.min(720, count | 0));
  const atJd = Number.isFinite(jd) ? jd : J2000;
  const elements = elementsAt(body, atJd);
  const parentBody = body.parent ? BY_ID.get(body.parent) : null;
  const obliquity = parentBody ? parentBody.obliquityDeg : EARTH_OBLIQUITY_DEG;
  const points = [];
  for (let i = 0; i < safe; i += 1) {
    points.push(orbitalPoint(elements, (i / safe) * Math.PI * 2, body.frame, obliquity));
  }
  return points;
}

function publicBody(body) {
  return {
    id: body.id,
    name: body.name,
    kind: body.kind,
    parent: body.parent,
    frame: body.frame || "ecliptic",
    radiusKm: body.radiusKm,
    spanMeters: body.spanMeters ?? null,
    altitudeKm: body.altitudeKm ?? null,
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
    sinceJd: body.sinceJd ?? null,
  };
}

function catalog() {
  return {
    epoch: "J2000",
    epochJd: J2000,
    auKm: AU_KM,
    note: "Planètes : éléments képlériens JPL avec dérives séculaires (−3000 à 3000). Lunes, ISS théorique et cabriolet Tesla : orbites képlériennes approchées.",
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

const MIN_JD = jdFromCivil(MIN_YEAR, 0, 1, 0, 0, 0);
const MAX_JD = jdFromCivil(MAX_YEAR, 11, 31, 23, 59, 59);

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
  if (!state.playing) {
    return {
      jd: state.jd,
      playing: false,
      rateDaysPerSec: state.rateDaysPerSec,
      updatedAtMs: nowMs,
    };
  }
  const candidate = state.jd + state.rateDaysPerSec * elapsed;
  if (candidate < MIN_JD) {
    return { jd: MIN_JD, playing: false, rateDaysPerSec: state.rateDaysPerSec, updatedAtMs: nowMs };
  }
  if (candidate > MAX_JD) {
    return { jd: MAX_JD, playing: false, rateDaysPerSec: state.rateDaysPerSec, updatedAtMs: nowMs };
  }
  return {
    jd: candidate,
    playing: true,
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
  const abs = Math.abs(rate);
  if (abs < 1e-8) return "0 j/s";
  const sign = rate < 0 ? "−" : "";
  if (Math.abs(abs - 1 / 86400) / (1 / 86400) < 0.05) return `${sign}1×`;
  if (abs < 1 / 24 - 1e-5) {
    const min = Math.round(abs * 1440 * 10) / 10;
    return `${sign}${String(min).replace(".", ",")} min/s`;
  }
  if (abs < 0.95) {
    const hours = Math.round(abs * 24 * 10) / 10;
    return `${sign}${String(hours).replace(".", ",")} h/s`;
  }
  if (Math.abs(abs - 365) < 1) return `${sign}1 an/s`;
  if (abs >= 10) return `${sign}${Math.round(abs)} j/s`;
  const rounded = Math.round(abs * 10) / 10;
  return `${sign}${String(rounded).replace(".", ",")} j/s`;
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
  EARTH_OBLIQUITY_DEG,
  MIN_YEAR,
  MAX_YEAR,
  MIN_RATE,
  MAX_RATE,
  solveKepler,
  equatorialToEcliptic,
  eclipticToEquatorial,
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
