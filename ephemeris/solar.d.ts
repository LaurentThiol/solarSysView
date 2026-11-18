export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type BodyKind = "star" | "planet" | "moon" | "craft";
export type OrbitFrame = "ecliptic" | "equatorial";

export interface BodyInfo {
  id: string;
  name: string;
  kind: BodyKind;
  parent: string | null;
  frame: OrbitFrame;
  radiusKm: number;
  spanMeters: number | null;
  altitudeKm: number | null;
  obliquityDeg: number;
  spinHours: number;
  retrograde: boolean;
  color: string;
  fact: string;
  aAu: number;
  e: number;
  iDeg: number;
  periodDays: number | null;
  hasOrbit: boolean;
  sinceJd: number | null;
}

export interface Catalog {
  epoch: string;
  epochJd: number;
  auKm: number;
  note: string;
  bodies: BodyInfo[];
}

export interface BodyPosition extends Vec3 {
  id: string;
  spin: number;
  rAu: number;
  speedKmS: number;
  active: boolean;
}

export interface SimState {
  jd: number;
  playing: boolean;
  rateDaysPerSec: number;
  updatedAtMs: number;
}

export interface Tick {
  type: "tick";
  jd: number;
  playing: boolean;
  rateDaysPerSec: number;
  serverTimeMs: number;
  bodies: BodyPosition[];
}

export interface ReduceResult {
  state: SimState;
  tick: Tick;
  label: string;
  accepted: boolean;
}

export interface SolarCommand {
  type: "pause" | "play" | "toggle" | "tick" | "setRate" | "setDate";
  rateDaysPerSec?: number;
  jd?: number;
  year?: number;
}

declare const solar: {
  J2000: number;
  AU_KM: number;
  EARTH_OBLIQUITY_DEG: number;
  MIN_YEAR: number;
  MAX_YEAR: number;
  MIN_RATE: number;
  MAX_RATE: number;
  catalog(): Catalog;
  positions(jd: number): BodyPosition[];
  sampleOrbit(id: string, count: number, jd?: number): Vec3[];
  initialState(nowMs: number): SimState;
  reduce(state: SimState, command: unknown, nowMs: number): ReduceResult;
  parseCommand(payload: unknown): SolarCommand | null;
  unixToJd(ms: number): number;
  jdToUnix(jd: number): number;
  utcYear(jd: number): number;
  solveKepler(meanAnomaly: number, eccentricity: number): number;
  equatorialToEcliptic(vec: Vec3, obliquityDeg?: number): Vec3;
  eclipticToEquatorial(vec: Vec3, obliquityDeg?: number): Vec3;
};

export default solar;
