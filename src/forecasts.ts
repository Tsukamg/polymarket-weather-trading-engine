import { TIMEZONES, VC_KEY, type LocationInfo } from "./config.js";
import { fetchJson, sleep } from "./http.js";

interface OpenMeteoDaily {
  daily?: { time: string[]; temperature_2m_max: (number | null)[] };
  error?: boolean | string;
}

export async function getEcmwf(citySlug: string, dates: Set<string>, loc: LocationInfo): Promise<Record<string, number>> {
  const unit = loc.unit;
  const tempUnit = unit === "F" ? "fahrenheit" : "celsius";
  const result: Record<string, number> = {};
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${loc.lat}&longitude=${loc.lon}` +
    `&daily=temperature_2m_max&temperature_unit=${tempUnit}` +
    `&forecast_days=7&timezone=${encodeURIComponent(TIMEZONES[citySlug] ?? "UTC")}` +
    `&models=ecmwf_ifs025&bias_correction=true`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await fetchJson<OpenMeteoDaily>(url);
      if (!data.error && data.daily?.time && data.daily.temperature_2m_max) {
        const { time, temperature_2m_max } = data.daily;
        for (let i = 0; i < time.length; i++) {
          const date = time[i];
          const temp = temperature_2m_max[i];
          if (date && dates.has(date) && temp != null) {
            result[date] = unit === "C" ? Math.round(temp * 10) / 10 : Math.round(temp);
          }
        }
      }
      break;
    } catch (e) {
      if (attempt < 2) await sleep(3000);
      else console.error(`  [ECMWF] ${citySlug}:`, e);
    }
  }
  return result;
}

export async function getHrrr(citySlug: string, dates: Set<string>, loc: LocationInfo): Promise<Record<string, number>> {
  if (loc.region !== "us") return {};
  const result: Record<string, number> = {};
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${loc.lat}&longitude=${loc.lon}` +
    `&daily=temperature_2m_max&temperature_unit=fahrenheit` +
    `&forecast_days=3&timezone=${encodeURIComponent(TIMEZONES[citySlug] ?? "UTC")}` +
    `&models=gfs_seamless`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await fetchJson<OpenMeteoDaily>(url);
      if (!data.error && data.daily?.time && data.daily.temperature_2m_max) {
        const { time, temperature_2m_max } = data.daily;
        for (let i = 0; i < time.length; i++) {
          const date = time[i];
          const temp = temperature_2m_max[i];
          if (date && dates.has(date) && temp != null) result[date] = Math.round(temp);
        }
      }
      break;
    } catch (e) {
      if (attempt < 2) await sleep(3000);
      else console.error(`  [HRRR] ${citySlug}:`, e);
    }
  }
  return result;
}

interface MetarRow {
  temp?: number | string | null;
}

export async function getMetar(citySlug: string, loc: LocationInfo): Promise<number | null> {
  const station = loc.station;
  const unit = loc.unit;
  try {
    const url = `https://aviationweather.gov/api/data/metar?ids=${station}&format=json`;
    const data = await fetchJson<MetarRow[]>(url);
    if (data && Array.isArray(data)) {
      const tempC = data[0]?.temp;
      if (tempC != null) {
        if (unit === "F") return Math.round(Number(tempC) * (9 / 5) + 32);
        return Math.round(Number(tempC) * 10) / 10;
      }
    }
  } catch (e) {
    console.error(`  [METAR] ${citySlug}:`, e);
  }
  return null;
}

interface VcDay {
  tempmax?: number | null;
}

interface VcResponse {
  days?: VcDay[];
}

export async function getActualTemp(citySlug: string, dateStr: string, loc: LocationInfo): Promise<number | null> {
  const station = loc.station;
  const unit = loc.unit;
  const vcUnit = unit === "F" ? "us" : "metric";
  const url =
    `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline` +
    `/${station}/${dateStr}/${dateStr}` +
    `?unitGroup=${vcUnit}&key=${encodeURIComponent(VC_KEY)}&include=days&elements=tempmax`;
  try {
    const data = await fetchJson<VcResponse>(url);
    const days = data.days;
    const mx = days?.[0]?.tempmax;
    if (mx != null) return Math.round(Number(mx) * 10) / 10;
  } catch (e) {
    console.error(`  [VC] ${citySlug} ${dateStr}:`, e);
  }
  return null;
}
