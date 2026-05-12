import path from "path";
import {
  BALANCE,
  CALIBRATION_MIN,
  LOCATIONS,
  MAX_BET,
  MAX_HOURS,
  MAX_PRICE,
  MAX_SLIPPAGE,
  MIN_EV,
  MIN_HOURS,
  MIN_VOLUME,
  MONTHS,
  MONITOR_INTERVAL,
  SCAN_INTERVAL,
} from "./config.js";
import { getEcmwf, getHrrr, getMetar } from "./forecasts.js";
import { fetchJson, sleep } from "./http.js";
import {
  betSize,
  bucketProb,
  calcEv,
  calcKelly,
  hoursToResolution,
  inBucket,
  parseTempRange,
} from "./math.js";
import {
  checkMarketResolved,
  fetchMarketBestPrices,
  getPolymarketEvent,
  type GammaEvent,
} from "./polymarket.js";
import { clobBuyYesUsd, clobSellYesShares, isLiveClobEnabled, resolveYesTokenId } from "./clob.js";
import type { ForecastSnap, OutcomeRow, Position } from "./storage.js";
import {
  getSigma,
  loadAllMarkets,
  loadCal,
  loadMarket,
  loadState,
  newMarket,
  runCalibration,
  saveMarket,
  saveState,
} from "./storage.js";

function utcTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function datesNext4Utc(): string[] {
  const out: string[] = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function hrrrCutoffUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 2);
  return d.toISOString().slice(0, 10);
}

export async function takeForecastSnapshot(
  citySlug: string,
  dates: string[],
): Promise<Record<string, ForecastSnap>> {
  const loc = LOCATIONS[citySlug]!;
  const dateSet = new Set(dates);
  const [ecmwf, hrrr] = await Promise.all([
    getEcmwf(citySlug, dateSet, loc),
    getHrrr(citySlug, dateSet, loc),
  ]);
  const nowStr = new Date().toISOString();
  const today = utcTodayIso();
  const hrrrUntil = hrrrCutoffUtc();
  const metarToday = dates.includes(today) ? await getMetar(citySlug, loc) : null;

  const snapshots: Record<string, ForecastSnap> = {};
  for (const date of dates) {
    const row: ForecastSnap = {
      ts: nowStr,
      ecmwf: ecmwf[date] ?? null,
      hrrr: date <= hrrrUntil ? hrrr[date] ?? null : null,
      metar: date === today ? metarToday : null,
    };
    if (loc.region === "us" && row.hrrr != null) {
      row.best = row.hrrr;
      row.best_source = "hrrr";
    } else if (row.ecmwf != null) {
      row.best = row.ecmwf;
      row.best_source = "ecmwf";
    } else {
      row.best = null;
      row.best_source = null;
    }
    snapshots[date] = row;
  }
  return snapshots;
}

function parseEventOutcomes(event: GammaEvent): OutcomeRow[] {
  const outcomes: OutcomeRow[] = [];
  for (const market of event.markets ?? []) {
    const question = market.question ?? "";
    const mid = String(market.id ?? "");
    const volume = Number(market.volume ?? 0);
    const rng = parseTempRange(question);
    if (!rng) continue;
    let bid: number;
    let ask: number;
    try {
      const prices = JSON.parse(market.outcomePrices ?? "[0.5,0.5]") as number[];
      bid = Number(prices[0]);
      ask = prices.length > 1 ? Number(prices[1]) : bid;
    } catch {
      continue;
    }
    outcomes.push({
      question,
      market_id: mid,
      range: rng,
      bid: Math.round(bid * 10000) / 10000,
      ask: Math.round(ask * 10000) / 10000,
      price: Math.round(bid * 10000) / 10000,
      spread: Math.round((ask - bid) * 10000) / 10000,
      volume: Math.round(volume),
    });
  }
  outcomes.sort((a, b) => a.range[0] - b.range[0]);
  return outcomes;
}

async function liveSellExitOrKeepOpen(pos: Position, label: string): Promise<boolean> {
  if (!isLiveClobEnabled() || !pos.clob_yes_token_id) return true;
  try {
    await clobSellYesShares(pos.clob_yes_token_id, pos.shares);
    console.log(`  [CLOB] sold YES (${label})`);
    return true;
  } catch (e) {
    console.error(`  [CLOB] sell failed (${label}) — leaving position open in app + on-chain`, e);
    return false;
  }
}

async function liveSellSettlementAttempt(pos: Position, label: string): Promise<void> {
  if (!isLiveClobEnabled() || !pos.clob_yes_token_id) return;
  try {
    await clobSellYesShares(pos.clob_yes_token_id, pos.shares);
    console.log(`  [CLOB] sold YES (${label})`);
  } catch (e) {
    console.warn(`  [CLOB] settlement sell failed (${label}) — you may redeem/close manually`, e);
  }
}

export async function scanAndUpdate(): Promise<{ newPos: number; closed: number; resolved: number }> {
  const now = new Date();
  const state = loadState();
  let balance = state.balance;
  let newPos = 0;
  let closed = 0;
  let resolved = 0;

  for (const citySlug of Object.keys(LOCATIONS)) {
    const loc = LOCATIONS[citySlug]!;
    const unit = loc.unit;
    const unitSym = unit === "F" ? "F" : "C";
    process.stdout.write(`  -> ${loc.name}... `);

    const dates = datesNext4Utc();
    let snapshots: Record<string, ForecastSnap>;
    try {
      snapshots = await takeForecastSnapshot(citySlug, dates);
      await sleep(300);
    } catch (e) {
      console.log(`skipped (${String(e)})`);
      continue;
    }

    for (let i = 0; i < 4; i++) {
      const date = dates[i];
      if (!date) continue;
      const parts = date.split("-").map(Number);
      const mo = parts[1];
      const day = parts[2];
      const year = parts[3];
      if (!mo || !day || !year) continue;
      const monthName = MONTHS[mo - 1];
      if (!monthName) continue;

      const event = await getPolymarketEvent(citySlug, monthName, day, year);
      if (!event) continue;

      const endDate = event.endDate ?? "";
      const hours = endDate ? hoursToResolution(endDate) : 0;
      const horizon = `D+${i}`;

      let mkt = loadMarket(citySlug, date);
      if (mkt === null) {
        if (hours < MIN_HOURS || hours > MAX_HOURS) continue;
        mkt = newMarket(citySlug, date, event, hours);
      }

      if (mkt.status === "resolved") continue;

      const outcomes = parseEventOutcomes(event);
      mkt.all_outcomes = outcomes;

      const snap = snapshots[date] ?? {};
      const forecastSnap: ForecastSnap = {
        ts: snap.ts,
        horizon,
        hours_left: Math.round(hours * 10) / 10,
        ecmwf: snap.ecmwf ?? null,
        hrrr: snap.hrrr ?? null,
        metar: snap.metar ?? null,
        best: snap.best ?? null,
        best_source: snap.best_source ?? null,
      };
      mkt.forecast_snapshots.push(forecastSnap);

      const top = outcomes.length ? outcomes.reduce((a, b) => (a.price >= b.price ? a : b)) : null;
      mkt.market_snapshots.push({
        ts: snap.ts,
        top_bucket: top ? `${top.range[0]}-${top.range[1]}${unitSym}` : null,
        top_price: top ? top.price : null,
      });

      const forecastTemp = snap.best ?? null;
      const bestSource = snap.best_source ?? null;

      if (mkt.position?.status === "open") {
        const pos = mkt.position;
        let currentPrice: number | null = null;
        let oMatch: OutcomeRow | undefined;
        for (const o of outcomes) {
          if (o.market_id === pos.market_id) {
            currentPrice = o.price;
            oMatch = o;
            break;
          }
        }

        if (currentPrice != null && oMatch) {
          currentPrice = oMatch.bid;
          const entry = pos.entry_price;
          const stop = pos.stop_price ?? entry * 0.8;

          if (currentPrice >= entry * 1.2 && stop < entry) {
            pos.stop_price = entry;
            pos.trailing_activated = true;
          }

          if (currentPrice <= stop) {
            const exitLabel = `${loc.name} ${date}`;
            const soldOk = await liveSellExitOrKeepOpen(pos, exitLabel);
            if (!soldOk) continue;
            const pnl = Math.round((currentPrice - entry) * pos.shares * 100) / 100;
            balance += pos.cost + pnl;
            pos.closed_at = snap.ts ?? null;
            pos.close_reason = currentPrice < entry ? "stop_loss" : "trailing_stop";
            pos.exit_price = currentPrice;
            pos.pnl = pnl;
            pos.status = "closed";
            closed += 1;
            const reason = currentPrice < entry ? "STOP" : "TRAILING BE";
            console.log(
              `  [${reason}] ${loc.name} ${date} | entry $${entry.toFixed(3)} exit $${currentPrice.toFixed(3)} | PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`,
            );
          }
        }
      }

      if (mkt.position?.status === "open" && forecastTemp != null) {
        const pos = mkt.position;
        const oldLow = pos.bucket_low;
        const oldHigh = pos.bucket_high;
        const buffer = unit === "F" ? 2.0 : 1.0;
        const midBucket =
          oldLow !== -999 && oldHigh !== 999 ? (oldLow + oldHigh) / 2 : forecastTemp;
        const forecastFar =
          Math.abs(forecastTemp - midBucket) > Math.abs(midBucket - oldLow) + buffer;
        if (!inBucket(forecastTemp, oldLow, oldHigh) && forecastFar) {
          let currentPrice: number | null = null;
          for (const o of outcomes) {
            if (o.market_id === pos.market_id) {
              currentPrice = o.price;
              break;
            }
          }
          if (currentPrice != null) {
            const exitLabel = `${loc.name} ${date}`;
            const soldOk = await liveSellExitOrKeepOpen(pos, `${exitLabel} forecast_changed`);
            if (!soldOk) continue;
            const pnl = Math.round((currentPrice - pos.entry_price) * pos.shares * 100) / 100;
            balance += pos.cost + pnl;
            mkt.position.closed_at = snap.ts ?? null;
            mkt.position.close_reason = "forecast_changed";
            mkt.position.exit_price = currentPrice;
            mkt.position.pnl = pnl;
            mkt.position.status = "closed";
            closed += 1;
            console.log(
              `  [CLOSE] ${loc.name} ${date} — forecast changed | PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`,
            );
          }
        }
      }

      if (!mkt.position && forecastTemp != null && hours >= MIN_HOURS) {
        const sigma = getSigma(citySlug, bestSource ?? "ecmwf");
        let bestSignal: Position | null = null;

        let matchedBucket: OutcomeRow | undefined;
        for (const o of outcomes) {
          const [tLow, tHigh] = o.range;
          if (inBucket(forecastTemp, tLow, tHigh)) {
            matchedBucket = o;
            break;
          }
        }

        if (matchedBucket) {
          const o = matchedBucket;
          const [tLow, tHigh] = o.range;
          const volume = o.volume;
          const bid = o.bid;
          const ask = o.ask;
          const spread = o.spread;

          if (volume >= MIN_VOLUME) {
            const p = bucketProb(forecastTemp, tLow, tHigh, sigma);
            const ev = calcEv(p, ask);
            if (ev >= MIN_EV) {
              const kelly = calcKelly(p, ask);
              const size = betSize(kelly, balance, MAX_BET);
              if (size >= 0.5) {
                bestSignal = {
                  market_id: o.market_id,
                  question: o.question,
                  bucket_low: tLow,
                  bucket_high: tHigh,
                  entry_price: ask,
                  bid_at_entry: bid,
                  spread,
                  shares: Math.round((size / ask) * 100) / 100,
                  cost: size,
                  p: Math.round(p * 10000) / 10000,
                  ev: Math.round(ev * 10000) / 10000,
                  kelly: Math.round(kelly * 10000) / 10000,
                  forecast_temp: forecastTemp,
                  forecast_src: bestSource,
                  sigma,
                  opened_at: snap.ts,
                  status: "open",
                  pnl: null,
                  exit_price: null,
                  close_reason: null,
                  closed_at: null,
                };
              }
            }
          }
        }

        if (bestSignal) {
          let skipPosition = false;
          try {
            const prices = await fetchMarketBestPrices(bestSignal.market_id);
            if (prices) {
              const realAsk = prices.bestAsk;
              const realBid = prices.bestBid;
              const realSpread = Math.round((realAsk - realBid) * 10000) / 10000;
              if (realSpread > MAX_SLIPPAGE || realAsk >= MAX_PRICE) {
                console.log(
                  `  [SKIP] ${loc.name} ${date} — real ask $${realAsk.toFixed(3)} spread $${realSpread.toFixed(3)}`,
                );
                skipPosition = true;
              } else {
                bestSignal.entry_price = realAsk;
                bestSignal.bid_at_entry = realBid;
                bestSignal.spread = realSpread;
                bestSignal.shares = Math.round((bestSignal.cost / realAsk) * 100) / 100;
                bestSignal.ev = Math.round(calcEv(bestSignal.p, realAsk) * 10000) / 10000;
              }
            }
          } catch (e) {
            console.error(`  [WARN] Could not fetch real ask for ${bestSignal.market_id}:`, e);
          }

          if (!skipPosition && bestSignal.entry_price < MAX_PRICE) {
            let proceed = true;
            if (isLiveClobEnabled()) {
              const yesToken = await resolveYesTokenId(bestSignal.market_id);
              if (!yesToken) {
                console.log(
                  `  [CLOB SKIP] ${loc.name} ${date} — no YES token id (check Gamma / clobTokenIds)`,
                );
                proceed = false;
              } else {
                try {
                  await clobBuyYesUsd(yesToken, bestSignal.cost);
                  bestSignal.clob_yes_token_id = yesToken;
                } catch (e) {
                  console.error(`  [CLOB BUY FAIL] ${loc.name} ${date}:`, e);
                  proceed = false;
                }
              }
            }
            if (!proceed) continue;
            balance -= bestSignal.cost;
            mkt.position = bestSignal;
            state.total_trades += 1;
            newPos += 1;
            const bucketLabel = `${bestSignal.bucket_low}-${bestSignal.bucket_high}${unitSym}`;
            console.log(
              `  [BUY]  ${loc.name} ${horizon} ${date} | ${bucketLabel} | ` +
                `$${bestSignal.entry_price.toFixed(3)} | EV ${bestSignal.ev >= 0 ? "+" : ""}${bestSignal.ev.toFixed(2)} | ` +
                `$${bestSignal.cost.toFixed(2)} (${(bestSignal.forecast_src ?? "").toUpperCase()})`,
            );
          }
        }
      }

      if (hours < 0.5 && mkt.status === "open") {
        mkt.status = "closed";
      }

      saveMarket(mkt);
      await sleep(100);
    }

    console.log("ok");
  }

  for (const mkt of loadAllMarkets()) {
    if (mkt.status === "resolved") continue;
    const pos = mkt.position;
    if (!pos || pos.status !== "open") continue;
    const marketId = pos.market_id;
    if (!marketId) continue;

    const won = await checkMarketResolved(marketId);
    if (won === null) continue;

    await liveSellSettlementAttempt(pos, `${mkt.city_name} ${mkt.date}`);

    const price = pos.entry_price;
    const size = pos.cost;
    const shares = pos.shares;
    const pnl = won ? Math.round(shares * (1 - price) * 100) / 100 : Math.round(-size * 100) / 100;

    balance += size + pnl;
    pos.exit_price = won ? 1.0 : 0.0;
    pos.pnl = pnl;
    pos.close_reason = "resolved";
    pos.closed_at = now.toISOString();
    pos.status = "closed";
    mkt.pnl = pnl;
    mkt.status = "resolved";
    mkt.resolved_outcome = won ? "win" : "loss";

    if (won) state.wins += 1;
    else state.losses += 1;

    const result = won ? "WIN" : "LOSS";
    console.log(`  [${result}] ${mkt.city_name} ${mkt.date} | PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`);
    resolved += 1;

    saveMarket(mkt);
    await sleep(300);
  }

  state.balance = Math.round(balance * 100) / 100;
  state.peak_balance = Math.max(state.peak_balance ?? balance, balance);
  saveState(state);

  const allMkts = loadAllMarkets();
  const resolvedCount = allMkts.filter((m) => m.status === "resolved").length;
  if (resolvedCount >= CALIBRATION_MIN) {
    runCalibration(allMkts);
  }

  return { newPos, closed, resolved };
}

export async function monitorPositions(): Promise<number> {
  const markets = loadAllMarkets();
  const openPos = markets.filter((m) => m.position?.status === "open");
  if (!openPos.length) return 0;

  const state = loadState();
  let balance = state.balance;
  let closed = 0;

  for (const mkt of openPos) {
    const pos = mkt.position!;
    const mid = pos.market_id;

    let currentPrice: number | null = null;
    try {
      const mdata = await fetchJson<{ bestBid?: number | string | null }>(
        `https://gamma-api.polymarket.com/markets/${mid}`,
      );
      const bestBid = mdata.bestBid;
      if (bestBid != null) currentPrice = Number(bestBid);
    } catch {
      /* fallback below */
    }

    if (currentPrice == null) {
      for (const o of mkt.all_outcomes ?? []) {
        if (o.market_id === mid) {
          currentPrice = o.bid ?? o.price;
          break;
        }
      }
    }

    if (currentPrice == null) continue;

    const entry = pos.entry_price;
    let stop = pos.stop_price ?? entry * 0.8;
    const cityName = LOCATIONS[mkt.city]?.name ?? mkt.city;

    const endDate = mkt.event_end_date ?? "";
    const hoursLeft = hoursToResolution(endDate);

    let takeProfit: number | null;
    if (hoursLeft < 24) takeProfit = null;
    else if (hoursLeft < 48) takeProfit = 0.85;
    else takeProfit = 0.75;

    if (currentPrice >= entry * 1.2 && stop < entry) {
      pos.stop_price = entry;
      pos.trailing_activated = true;
      console.log(`  [TRAILING] ${cityName} ${mkt.date} — stop moved to breakeven $${entry.toFixed(3)}`);
    }

    const takeTriggered = takeProfit != null && currentPrice >= takeProfit;
    const stopTriggered = currentPrice <= stop;

    if (takeTriggered || stopTriggered) {
      const soldOk = await liveSellExitOrKeepOpen(pos, `${cityName} ${mkt.date}`);
      if (!soldOk) continue;
      const pnl = Math.round((currentPrice - entry) * pos.shares * 100) / 100;
      balance += pos.cost + pnl;
      pos.closed_at = new Date().toISOString();
      let reason: string;
      if (takeTriggered) {
        pos.close_reason = "take_profit";
        reason = "TAKE";
      } else if (currentPrice < entry) {
        pos.close_reason = "stop_loss";
        reason = "STOP";
      } else {
        pos.close_reason = "trailing_stop";
        reason = "TRAILING BE";
      }
      pos.exit_price = currentPrice;
      pos.pnl = pnl;
      pos.status = "closed";
      closed += 1;
      console.log(
        `  [${reason}] ${cityName} ${mkt.date} | entry $${entry.toFixed(3)} exit $${currentPrice.toFixed(3)} | ${hoursLeft.toFixed(0)}h left | PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`,
      );
      saveMarket(mkt);
    }
  }

  if (closed) {
    state.balance = Math.round(balance * 100) / 100;
    saveState(state);
  }

  return closed;
}

export async function runLoop(): Promise<void> {
  loadCal();

  const onSigInt = () => {
    console.log("\n  Stopping — saving state...");
    saveState(loadState());
    console.log("  Done. Bye!");
    process.exit(0);
  };
  process.once("SIGINT", onSigInt);

  console.log(`\n${"=".repeat(55)}`);
  console.log("  WEATHERBET — STARTING");
  console.log(`${"=".repeat(55)}`);
  console.log(`  Cities:     ${Object.keys(LOCATIONS).length}`);
  console.log(`  Balance:    $${BALANCE.toLocaleString("en-US", { maximumFractionDigits: 0 })} | Max bet: $${MAX_BET}`);
  console.log(`  Scan:       ${SCAN_INTERVAL / 60} min | Monitor: ${MONITOR_INTERVAL / 60} min`);
  console.log("  Sources:    ECMWF + HRRR(US) + METAR(D+0)");
  console.log(`  CLOB:       ${isLiveClobEnabled() ? "LIVE (@polymarket/clob-client)" : "paper (Gamma prices only)"}`);
  console.log(`  Data:       ${path.join(process.cwd(), "data")}`);
  console.log("  Ctrl+C to stop\n");

  let lastFullScan = 0;

  while (true) {
    const nowTs = Date.now() / 1000;
    const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);

    if (nowTs - lastFullScan >= SCAN_INTERVAL) {
      console.log(`[${nowStr}] full scan...`);
      try {
        const { newPos, closed, resolved } = await scanAndUpdate();
        const st = loadState();
        console.log(
          `  balance: $${st.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | ` +
            `new: ${newPos} | closed: ${closed} | resolved: ${resolved}`,
        );
        lastFullScan = Date.now() / 1000;
      } catch (e) {
        const msg = String(e);
        if (msg.includes("fetch") || msg.includes("ECONNREFUSED") || msg.includes("network")) {
          console.log("  Connection lost — waiting 60 sec");
          await sleep(60_000);
          continue;
        }
        console.log(`  Error: ${e} — waiting 60 sec`);
        await sleep(60_000);
        continue;
      }
    } else {
      console.log(`[${nowStr}] monitoring positions...`);
      try {
        const stopped = await monitorPositions();
        if (stopped) {
          const st = loadState();
          console.log(
            `  balance: $${st.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          );
        }
      } catch (e) {
        console.log(`  Monitor error: ${e}`);
      }
    }

    await sleep(MONITOR_INTERVAL * 1000);
  }
}
