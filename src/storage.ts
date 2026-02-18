import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
} from "fs";
import path from "path";
import {
  BALANCE,
  CALIBRATION_FILE,
  CALIBRATION_MIN,
  LOCATIONS,
  MARKETS_DIR,
  SIGMA_C,
  SIGMA_F,
  STATE_FILE,
} from "./config.js";
import type { GammaEvent } from "./polymarket.js";

export interface OutcomeRow {
  question: string;
  market_id: string;
  range: [number, number];
  bid: number;
  ask: number;
  price: number;
  spread: number;
  volume: number;
}

export interface ForecastSnap {
  ts?: string;
  horizon?: string;
  hours_left?: number;
  ecmwf?: number | null;
  hrrr?: number | null;
  metar?: number | null;
  best?: number | null;
  best_source?: string | null;
}

export interface MarketSnap {
  ts?: string;
  top_bucket: string | null;
  top_price: number | null;
}

export interface Position {
  market_id: string;
  question: string;
  bucket_low: number;
  bucket_high: number;
  entry_price: number;
  bid_at_entry: number;
  spread: number;
  shares: number;
  cost: number;
  p: number;
  ev: number;
  kelly: number;
  forecast_temp: number;
  forecast_src: string | null;
  sigma: number;
  opened_at?: string;
  status: string;
  pnl: number | null;
  exit_price: number | null;
  close_reason: string | null;
  closed_at: string | null;
  stop_price?: number;
  trailing_activated?: boolean;
}

export interface MarketRecord {
  city: string;
  city_name: string;
  date: string;
  unit: "F" | "C";
  station: string;
  event_end_date: string;
  hours_at_discovery: number;
  status: string;
  position: Position | null;
  actual_temp: number | null;
  resolved_outcome: string | null;
  pnl: number | null;
  forecast_snapshots: ForecastSnap[];
  market_snapshots: MarketSnap[];
  all_outcomes: OutcomeRow[];
  created_at: string;
}

export interface SimState {
  balance: number;
  starting_balance: number;
  total_trades: number;
  wins: number;
  losses: number;
  peak_balance: number;
}

export interface CalEntry {
  sigma: number;
  n: number;
  updated_at: string;
}

let calCache: Record<string, CalEntry> | null = null;

export function loadCal(): Record<string, CalEntry> {
  if (calCache) return calCache;
  if (existsSync(CALIBRATION_FILE)) {
    calCache = JSON.parse(readFileSync(CALIBRATION_FILE, "utf-8")) as Record<string, CalEntry>;
    return calCache;
  }
  calCache = {};
  return calCache;
}

export function resetCalLoad(): void {
  calCache = null;
}

export function persistCal(cal: Record<string, CalEntry>): void {
  calCache = cal;
  writeFileSync(CALIBRATION_FILE, JSON.stringify(cal, null, 2), "utf-8");
}

export function getSigma(citySlug: string, source = "ecmwf"): number {
  const cal = loadCal();
  const key = `${citySlug}_${source}`;
  if (cal[key]) return cal[key].sigma;
  const loc = LOCATIONS[citySlug];
  return loc?.unit === "F" ? SIGMA_F : SIGMA_C;
}

function lastTempForSource(snaps: ForecastSnap[], source: string): number | null {
  for (let i = snaps.length - 1; i >= 0; i--) {
    const s = snaps[i];
    if (!s) continue;
    if (source === "ecmwf" && s.ecmwf != null) return s.ecmwf;
    if (source === "hrrr" && s.hrrr != null) return s.hrrr;
    if (source === "metar" && s.metar != null) return s.metar;
  }
  return null;
}

export function runCalibration(markets: MarketRecord[]): Record<string, CalEntry> {
  const resolved = markets.filter((m) => m.status === "resolved" && m.actual_temp != null);
  const cal: Record<string, CalEntry> = { ...loadCal() };
  const updated: string[] = [];

  for (const source of ["ecmwf", "hrrr", "metar"] as const) {
    const cities = new Set(resolved.map((m) => m.city));
    for (const city of cities) {
      const loc = LOCATIONS[city];
      if (!loc) continue;
      const group = resolved.filter((m) => m.city === city);
      const errors: number[] = [];
      for (const m of group) {
        const t = lastTempForSource(m.forecast_snapshots ?? [], source);
        if (t != null && m.actual_temp != null) errors.push(Math.abs(t - m.actual_temp));
      }
      if (errors.length < CALIBRATION_MIN) continue;
      const mae = errors.reduce((a, b) => a + b, 0) / errors.length;
      const key = `${city}_${source}`;
      const old = cal[key]?.sigma ?? (loc.unit === "F" ? SIGMA_F : SIGMA_C);
      const newSigma = Math.round(mae * 1000) / 1000;
      cal[key] = {
        sigma: newSigma,
        n: errors.length,
        updated_at: new Date().toISOString(),
      };
      if (Math.abs(newSigma - old) > 0.05) {
        updated.push(`${loc.name} ${source}: ${old.toFixed(2)}->${newSigma.toFixed(2)}`);
      }
    }
  }

  persistCal(cal);
  if (updated.length) console.log(`  [CAL] ${updated.join(", ")}`);
  return cal;
}

export function marketPath(citySlug: string, dateStr: string): string {
  return path.join(MARKETS_DIR, `${citySlug}_${dateStr}.json`);
}

export function loadMarket(citySlug: string, dateStr: string): MarketRecord | null {
  const p = marketPath(citySlug, dateStr);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as MarketRecord;
}

export function saveMarket(market: MarketRecord): void {
  const p = marketPath(market.city, market.date);
  writeFileSync(p, JSON.stringify(market, null, 2), "utf-8");
}

export function loadAllMarkets(): MarketRecord[] {
  const markets: MarketRecord[] = [];
  if (!existsSync(MARKETS_DIR)) return markets;
  for (const f of readdirSync(MARKETS_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const text = readFileSync(path.join(MARKETS_DIR, f), "utf-8");
      markets.push(JSON.parse(text) as MarketRecord);
    } catch {
      /* skip bad file */
    }
  }
  return markets;
}

export function newMarket(citySlug: string, dateStr: string, event: GammaEvent, hours: number): MarketRecord {
  const loc = LOCATIONS[citySlug]!;
  return {
    city: citySlug,
    city_name: loc.name,
    date: dateStr,
    unit: loc.unit,
    station: loc.station,
    event_end_date: event.endDate ?? "",
    hours_at_discovery: Math.round(hours * 10) / 10,
    status: "open",
    position: null,
    actual_temp: null,
    resolved_outcome: null,
    pnl: null,
    forecast_snapshots: [],
    market_snapshots: [],
    all_outcomes: [],
    created_at: new Date().toISOString(),
  };
}

export function loadState(): SimState {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as SimState;
  }
  return {
    balance: BALANCE,
    starting_balance: BALANCE,
    total_trades: 0,
    wins: 0,
    losses: 0,
    peak_balance: BALANCE,
  };
}

export function saveState(state: SimState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}
