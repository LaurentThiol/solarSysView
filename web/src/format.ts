import solar from "../../ephemeris/solar.js";

const PARIS = "Europe/Paris";

export function formatParisDate(jd: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: PARIS,
  }).format(new Date(solar.jdToUnix(jd)));
}

export function formatJulian(jd: number): string {
  const text = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(jd);
  return `JJ ${text}`;
}

export function formatAu(value: number): string {
  const digits = value >= 10 ? 2 : 3;
  const text = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(value);
  return `${text} UA`;
}

export function formatKm(value: number): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} km`;
}

export function formatRate(rate: number): string {
  if (Math.abs(rate - 365) < 0.05) return "1 an / s";
  const text = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: rate >= 10 ? 0 : 1,
  }).format(rate);
  return rate >= 2 ? `${text} jours / s` : `${text} jour / s`;
}

export function formatPeriod(days: number | null): string {
  if (days == null) return "—";
  if (days >= 800) {
    const years = days / 365.25;
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(years)} ans`;
  }
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(days)} j`;
}

export function formatDay(hours: number, retrograde: boolean): string {
  const abs = Math.abs(hours);
  const text =
    abs >= 48
      ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(abs / 24)} j`
      : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(abs)} h`;
  return retrograde ? `${text}, rétrograde` : text;
}

export function formatDegrees(value: number): string {
  const shown = Math.abs(value) < 0.005 ? 0 : value;
  return `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(shown)}°`;
}

export function formatEccentricity(value: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(value);
}

export function parisInputValue(jd: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(solar.jdToUnix(jd)));
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const hour = read("hour") === "24" ? "00" : read("hour");
  return `${read("year")}-${read("month")}-${read("day")}T${hour}:${read("minute")}`;
}

export function jdFromParisInput(value: string): number | null {
  const match = /^(-?\d{1,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setUTCHours(Number(match[4]), Number(match[5]), 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  const civil = date.getTime();
  const utc = civil - zoneOffset(new Date(civil));
  const corrected = civil - zoneOffset(new Date(utc));
  return corrected / 86400000 + 2440587.5;
}

function zoneOffset(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PARIS,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour") % 24, read("minute"), read("second"));
  return asUtc - date.getTime();
}
