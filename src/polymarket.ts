import { fetchJson } from "./http.js";

export interface GammaMarket {
  id?: string | number;
  question?: string;
  volume?: number | string;
  outcomePrices?: string;
  bestAsk?: number | string;
  bestBid?: number | string;
}

export interface GammaEvent {
  endDate?: string;
  markets?: GammaMarket[];
}

export async function getPolymarketEvent(
  citySlug: string,
  month: string,
  day: number,
  year: number,
): Promise<GammaEvent | null> {
  const slug = `highest-temperature-in-${citySlug}-on-${month}-${day}-${year}`;
  try {
    const data = await fetchJson<GammaEvent[]>(
      `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`,
    );
    if (data && Array.isArray(data) && data.length > 0) return data[0] ?? null;
  } catch {
    /* ignore */
  }
  return null;
}

export async function getMarketPrice(marketId: string): Promise<number | null> {
  try {
    const r = await fetchJson<{ outcomePrices?: string }>(`https://gamma-api.polymarket.com/markets/${marketId}`);
    const prices = JSON.parse(r.outcomePrices ?? "[0.5,0.5]") as number[];
    return Number(prices[0]);
  } catch {
    return null;
  }
}

export async function checkMarketResolved(marketId: string): Promise<boolean | null> {
  try {
    const data = await fetchJson<{ closed?: boolean; outcomePrices?: string }>(
      `https://gamma-api.polymarket.com/markets/${marketId}`,
    );
    if (!data.closed) return null;
    const prices = JSON.parse(data.outcomePrices ?? "[0.5,0.5]") as number[];
    const yesPrice = Number(prices[0]);
    if (yesPrice >= 0.95) return true;
    if (yesPrice <= 0.05) return false;
    return null;
  } catch (e) {
    console.error(`  [RESOLVE] ${marketId}:`, e);
    return null;
  }
}

export async function fetchMarketBestPrices(marketId: string): Promise<{ bestAsk: number; bestBid: number } | null> {
  try {
    const mdata = await fetchJson<{ bestAsk?: number | string; bestBid?: number | string }>(
      `https://gamma-api.polymarket.com/markets/${marketId}`,
    );
    if (mdata.bestAsk == null || mdata.bestBid == null) return null;
    return { bestAsk: Number(mdata.bestAsk), bestBid: Number(mdata.bestBid) };
  } catch {
    return null;
  }
}
