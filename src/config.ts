import "dotenv/config";
import { mkdirSync } from "fs";
import path from "path";

export type Region = "us" | "eu" | "asia" | "ca" | "sa" | "oc";

export interface LocationInfo {
  lat: number;
  lon: number;
  name: string;
  station: string;
  unit: "F" | "C";
  region: Region;
}

function envNum(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw == null || raw === "") return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultValue;
}

function envStr(key: string, defaultValue: string): string {
  const raw = process.env[key];
  return raw != null && raw !== "" ? raw : defaultValue;
}

const P = "WEATHERBOT_" as const;

export const BALANCE = envNum(`${P}BALANCE`, 10000.0);
export const MAX_BET = envNum(`${P}MAX_BET`, 20.0);
export const MIN_EV = envNum(`${P}MIN_EV`, 0.1);
export const MAX_PRICE = envNum(`${P}MAX_PRICE`, 0.45);
export const MIN_VOLUME = envNum(`${P}MIN_VOLUME`, 500);
export const MIN_HOURS = envNum(`${P}MIN_HOURS`, 2.0);
export const MAX_HOURS = envNum(`${P}MAX_HOURS`, 72.0);
export const KELLY_FRACTION = envNum(`${P}KELLY_FRACTION`, 0.25);
export const MAX_SLIPPAGE = envNum(`${P}MAX_SLIPPAGE`, 0.03);
export const SCAN_INTERVAL = envNum(`${P}SCAN_INTERVAL`, 3600);
export const CALIBRATION_MIN = envNum(`${P}CALIBRATION_MIN`, 30);
export const VC_KEY = envStr(`${P}VC_KEY`, "");

/**
 * Polymarket on-chain / CLOB credentials (Polygon).
 * The current bot only uses the public Gamma API for quotes; live order placement is not implemented yet.
 * When you add trading, read these from `process.env` via this module — keep secrets in `.env` only.
 */
export const POLY_PRIVATE_KEY = envStr(`${P}POLY_PRIVATE_KEY`, "").replace(/^0x/i, "");
/** Polymarket “proxy” / funder address (the wallet that holds USDC on Polymarket). */
export const POLY_PROXY_WALLET = envStr(`${P}POLY_PROXY_WALLET`, "");
export const POLY_CHAIN_ID = envNum(`${P}POLY_CHAIN_ID`, 137);
/** CLOB L2 API (if your integration uses API key auth after deriving credentials). */
export const POLY_CLOB_API_KEY = envStr(`${P}POLY_CLOB_API_KEY`, "");
export const POLY_CLOB_API_SECRET = envStr(`${P}POLY_CLOB_API_SECRET`, "");
export const POLY_CLOB_API_PASSPHRASE = envStr(`${P}POLY_CLOB_API_PASSPHRASE`, "");

export const SIGMA_F = 2.0;
export const SIGMA_C = 1.2;

const root = process.cwd();
export const DATA_DIR = path.join(root, "data");
mkdirSync(DATA_DIR, { recursive: true });
export const STATE_FILE = path.join(DATA_DIR, "state.json");
export const MARKETS_DIR = path.join(DATA_DIR, "markets");
mkdirSync(MARKETS_DIR, { recursive: true });
export const CALIBRATION_FILE = path.join(DATA_DIR, "calibration.json");

export const LOCATIONS: Record<string, LocationInfo> = {
  nyc: { lat: 40.7772, lon: -73.8726, name: "New York City", station: "KLGA", unit: "F", region: "us" },
  chicago: { lat: 41.9742, lon: -87.9073, name: "Chicago", station: "KORD", unit: "F", region: "us" },
  miami: { lat: 25.7959, lon: -80.287, name: "Miami", station: "KMIA", unit: "F", region: "us" },
  dallas: { lat: 32.8471, lon: -96.8518, name: "Dallas", station: "KDAL", unit: "F", region: "us" },
  seattle: { lat: 47.4502, lon: -122.3088, name: "Seattle", station: "KSEA", unit: "F", region: "us" },
  atlanta: { lat: 33.6407, lon: -84.4277, name: "Atlanta", station: "KATL", unit: "F", region: "us" },
  london: { lat: 51.5048, lon: 0.0495, name: "London", station: "EGLC", unit: "C", region: "eu" },
  paris: { lat: 48.9962, lon: 2.5979, name: "Paris", station: "LFPG", unit: "C", region: "eu" },
  munich: { lat: 48.3537, lon: 11.775, name: "Munich", station: "EDDM", unit: "C", region: "eu" },
  ankara: { lat: 40.1281, lon: 32.9951, name: "Ankara", station: "LTAC", unit: "C", region: "eu" },
  seoul: { lat: 37.4691, lon: 126.4505, name: "Seoul", station: "RKSI", unit: "C", region: "asia" },
  tokyo: { lat: 35.7647, lon: 140.3864, name: "Tokyo", station: "RJTT", unit: "C", region: "asia" },
  shanghai: { lat: 31.1443, lon: 121.8083, name: "Shanghai", station: "ZSPD", unit: "C", region: "asia" },
  singapore: { lat: 1.3502, lon: 103.994, name: "Singapore", station: "WSSS", unit: "C", region: "asia" },
  lucknow: { lat: 26.7606, lon: 80.8893, name: "Lucknow", station: "VILK", unit: "C", region: "asia" },
  "tel-aviv": { lat: 32.0114, lon: 34.8867, name: "Tel Aviv", station: "LLBG", unit: "C", region: "asia" },
  toronto: { lat: 43.6772, lon: -79.6306, name: "Toronto", station: "CYYZ", unit: "C", region: "ca" },
  "sao-paulo": { lat: -23.4356, lon: -46.4731, name: "Sao Paulo", station: "SBGR", unit: "C", region: "sa" },
  "buenos-aires": { lat: -34.8222, lon: -58.5358, name: "Buenos Aires", station: "SAEZ", unit: "C", region: "sa" },
  wellington: { lat: -41.3272, lon: 174.8052, name: "Wellington", station: "NZWN", unit: "C", region: "oc" },
};

export const TIMEZONES: Record<string, string> = {
  nyc: "America/New_York",
  chicago: "America/Chicago",
  miami: "America/New_York",
  dallas: "America/Chicago",
  seattle: "America/Los_Angeles",
  atlanta: "America/New_York",
  london: "Europe/London",
  paris: "Europe/Paris",
  munich: "Europe/Berlin",
  ankara: "Europe/Istanbul",
  seoul: "Asia/Seoul",
  tokyo: "Asia/Tokyo",
  shanghai: "Asia/Shanghai",
  singapore: "Asia/Singapore",
  lucknow: "Asia/Kolkata",
  "tel-aviv": "Asia/Jerusalem",
  toronto: "America/Toronto",
  "sao-paulo": "America/Sao_Paulo",
  "buenos-aires": "America/Argentina/Buenos_Aires",
  wellington: "Pacific/Auckland",
};

export const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

export const MONITOR_INTERVAL = 600;
