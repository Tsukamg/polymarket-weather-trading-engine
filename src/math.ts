import { KELLY_FRACTION } from "./config.js";

/** Abramowitz & Stegun approximation */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y =
    1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax));
  return sign * y;
}

export function normCdf(x: number): number {
  return 0.5 * (1.0 + erf(x / Math.sqrt(2.0)));
}

export function inBucket(forecast: number, tLow: number, tHigh: number): boolean {
  if (tLow === tHigh) {
    return Math.round(Number(forecast)) === Math.round(tLow);
  }
  return tLow <= Number(forecast) && Number(forecast) <= tHigh;
}

export function bucketProb(forecast: number, tLow: number, tHigh: number, sigma?: number): number {
  const s = sigma ?? 2.0;
  if (tLow === -999) {
    return normCdf((tHigh - Number(forecast)) / s);
  }
  if (tHigh === 999) {
    return 1.0 - normCdf((tLow - Number(forecast)) / s);
  }
  return inBucket(forecast, tLow, tHigh) ? 1.0 : 0.0;
}

export function calcEv(p: number, price: number): number {
  if (price <= 0 || price >= 1) return 0.0;
  return Math.round((p * (1.0 / price - 1.0) - (1.0 - p)) * 10000) / 10000;
}

export function calcKelly(p: number, price: number): number {
  if (price <= 0 || price >= 1) return 0.0;
  const b = 1.0 / price - 1.0;
  const f = (p * b - (1.0 - p)) / b;
  return Math.round(Math.min(Math.max(0.0, f) * KELLY_FRACTION, 1.0) * 10000) / 10000;
}

export function betSize(kelly: number, balance: number, maxBet: number): number {
  const raw = kelly * balance;
  return Math.round(Math.min(raw, maxBet) * 100) / 100;
}

export function parseTempRange(question: string | undefined): [number, number] | null {
  if (!question) return null;
  const num = "(-?\\d+(?:\\.\\d+)?)";
  if (/or below/i.test(question)) {
    const m = new RegExp(`${num}[°]?[FC] or below`, "i").exec(question);
    if (m?.[1]) return [-999.0, Number.parseFloat(m[1])];
  }
  if (/or higher/i.test(question)) {
    const m = new RegExp(`${num}[°]?[FC] or higher`, "i").exec(question);
    if (m?.[1]) return [Number.parseFloat(m[1]), 999.0];
  }
  let m = new RegExp(`between ${num}-${num}[°]?[FC]`, "i").exec(question);
  if (m?.[1] && m[2]) return [Number.parseFloat(m[1]), Number.parseFloat(m[2])];
  m = new RegExp(`be ${num}[°]?[FC] on`, "i").exec(question);
  if (m?.[1]) {
    const v = Number.parseFloat(m[1]);
    return [v, v];
  }
  return null;
}

export function hoursToResolution(endDateStr: string): number {
  try {
    const end = new Date(endDateStr.replace("Z", "+00:00"));
    const now = new Date();
    return Math.max(0.0, (end.getTime() - now.getTime()) / 3600000);
  } catch {
    return 999.0;
  }
}
