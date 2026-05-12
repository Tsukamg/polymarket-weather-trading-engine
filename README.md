# 🌤 WeatherBet - Polymarket Weather Trading Bot

Automated weather market trading bot for Polymarket. Finds mispriced temperature outcomes using real forecast data from multiple sources across 20 cities worldwide.

TypeScript on Node.js (global `fetch`). Optional **`@polymarket/clob-client`** when `WEATHERBOT_CLOB_LIVE=1`.

---

## Versions

### Legacy `bot_v1.py` / `bot_v2.py`
Removed from this repo; behavior of the **full bot** lives in `src/` (ported from `bot_v2.py`).

### Full bot (`src/`) — current
Everything in v1, plus:
- **20 cities** across 4 continents (US, Europe, Asia, South America, Oceania)
- **3 forecast sources** — ECMWF (global), HRRR/GFS (US, hourly), METAR (real-time observations)
- **Expected Value** — skips trades where the math doesn't work
- **Kelly Criterion** — sizes positions based on edge strength
- **Stop-loss + trailing stop** — 20% stop, moves to breakeven at +20%
- **Slippage filter** — skips markets with spread > $0.03
- **Self-calibration** — learns forecast accuracy per city over time
- **Full data storage** — every forecast snapshot, trade, and resolution saved to JSON

---

## How It Works

Polymarket runs markets like "Will the highest temperature in Chicago be between 46–47°F on March 7?" These markets are often mispriced — the forecast says 78% likely but the market is trading at 8 cents.

The bot:
1. Fetches forecasts from ECMWF and HRRR via Open-Meteo (free, no key required)
2. Gets real-time observations from METAR airport stations
3. Finds the matching temperature bucket on Polymarket
4. Calculates Expected Value — only enters if the math is positive
5. Sizes the position using fractional Kelly Criterion
6. Monitors stops every 10 minutes, full scan every hour
7. Auto-resolves markets by querying Polymarket API directly

---

## Why Airport Coordinates Matter

Most bots use city center coordinates. That's wrong.

Every Polymarket weather market resolves on a specific airport station. NYC resolves on LaGuardia (KLGA), Dallas on Love Field (KDAL) — not DFW. The difference between city center and airport can be 3–8°F. On markets with 1–2°F buckets, that's the difference between the right trade and a guaranteed loss.

| City | Station | Airport |
|------|---------|---------|
| NYC | KLGA | LaGuardia |
| Chicago | KORD | O'Hare |
| Miami | KMIA | Miami Intl |
| Dallas | KDAL | Love Field |
| Seattle | KSEA | Sea-Tac |
| Atlanta | KATL | Hartsfield |
| London | EGLC | London City |
| Tokyo | RJTT | Haneda |
| ... | ... | ... |

---

## Installation
Requires **Node.js 20.10+** ( `@polymarket/clob-client` engine; plus `fetch` / `AbortSignal` timeouts ).

```bash
git clone https://github.com/Tsukamg/polymarket-weather-trading-engine
cd polymarket-weather-trading-engine
npm install
npm run build
```

Configuration is read from the environment. Copy the template and edit:

```bash
cp env.example .env
```

On Windows: `copy env.example .env`

Variables are prefixed with **`WEATHERBOT_`** (see `env.example` for defaults and comments). The app loads `.env` automatically via [`dotenv`](https://github.com/motdotla/dotenv) when any module imports `src/config.ts`.

Set **`WEATHERBOT_VC_KEY`** for Visual Crossing (actual temperatures after resolution). Get a key at [visualcrossing.com](https://www.visualcrossing.com).

**Polymarket CLOB:** set **`WEATHERBOT_CLOB_LIVE=1`** with **`WEATHERBOT_POLY_PRIVATE_KEY`**, **`WEATHERBOT_POLY_PROXY_WALLET`**, and optional CLOB API vars (see `env.example`). Uses **`@polymarket/clob-client`** (`createAndPostMarketOrder`) for buys/sells; Gamma remains the source of market ids and **`clobTokenIds`** YES token. Without `WEATHERBOT_CLOB_LIVE`, behaviour stays **paper-only** (tracked balance + Gamma quotes).

---

## Usage
```bash
npm start -- run       # start the bot — full scan on interval, monitor between scans
npm start -- status    # balance and open positions
npm start -- report    # full breakdown of all resolved markets
# or after build:
node dist/index.js run
```

Development without a separate build step:

```bash
npm run dev -- status
```

---

## Data Storage

All data is saved to `data/markets/` — one JSON file per market. Each file contains:
- Hourly forecast snapshots (ECMWF, HRRR, METAR)
- Market price history
- Position details (entry, stop, PnL)
- Final resolution outcome

This data is used for self-calibration — the bot learns forecast accuracy per city over time and adjusts position sizing accordingly.

---

## APIs Used

| API | Auth | Purpose |
|-----|------|---------|
| Open-Meteo | None | ECMWF + HRRR forecasts |
| Aviation Weather (METAR) | None | Real-time station observations |
| Polymarket Gamma | None | Market data |
| Visual Crossing | Free key | Historical temps for resolution |

---

## Disclaimer

This is not financial advice. Prediction markets carry real risk. Run the simulation thoroughly before committing real capital.
