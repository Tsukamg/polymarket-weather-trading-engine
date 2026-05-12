

https://github.com/user-attachments/assets/79ba71a2-b2d9-48b5-91bb-034b79ab4d1b

# 🌤 WeatherBet — Polymarket Weather Trading Bot

This is **TypeScript on Node.js**, which means `npm`, `tsc`, and the sweet sound of `fetch()` errors at 3 a.m. It is **not** a `pip install feelings` project. If your README-fresh eyes were looking for `python weatherbet.py`, that timeline branched; the future is `npm start -- run`.

Automated trading for Polymarket weather markets: hunt mispriced daily temperature buckets using real forecasts across a bunch of cities, then let math (Kelly, EV, stops) argue with strangers on the internet about °F.

---

## Does it make money?

Playback in the README (native controls — use the play button on the player):

<video controls playsinline preload="metadata" width="100%" src="https://raw.githubusercontent.com/Tsukamg/polymarket-weather-trading-engine/main/src/rec/2026-05-13_01-03-44%20-%20user.mp4"></video>

**▶ [Watch on GitHub (file viewer)](https://github.com/Tsukamg/polymarket-weather-trading-engine/blob/main/src/rec/2026-05-13_01-03-44%20-%20user.mp4)** — same video in GitHub’s own viewer if the inline player doesn’t appear (some renderers strip `<video>`).

Source of truth for paths / URLs: [`src/rec/video.ts`](src/rec/video.ts) (`MONEY_PROOF_VIDEO_*`). Local clone: open `src/rec/2026-05-13_01-03-44 - user.mp4` directly if you prefer a desktop player.

---

## What you get (the serious bullet list)

- **20 cities** across several continents — we went full globetrotter so your VPS gets passport stamps
- **3 forecast sources** — ECMWF (global), HRRR/GFS (US, hourly), METAR (airport reality checks)
- **Expected Value gate** — no trade if the spreadsheet blushes
- **Kelly sizing** — position size scales with edge, not with how loud FinTwit is
- **Stop-loss + trailing stop** — 20% stop, breakeven trail after +20%
- **Slippage filter** — skips markets where the spread is doing zumba (over $0.03)
- **Self-calibration** — remembers which cities lied to it last week
- **JSON ledger** — every forecast blob, trade, and resolution saved under `data/markets/`

Optional **`@polymarket/clob-client`** when **`WEATHERBOT_CLOB_LIVE=1`**; otherwise it’s polite paper trading and Gamma quotes.

---

## How it works (short story)

Polymarket asks questions like: *“Will Chicago peak at 46–47°F on March 7?”* Sometimes the crowd prices 8¢ while the atmosphere outside is clearly main‑character energy. The bot pulls model + observation data, maps the right airport station (not “downtown vibes”), finds the bucket, checks EV, sizes with fractional Kelly, then naps for 10 minutes before doing it again.

---

## Why airports, not “city center LatLng”

Polymarket resolves on **airport METAR stations**. NYC is **KLGA**, Dallas is **KDAL** (Love Field, not Dallas Fort Worth’s holiday traffic simulator). A few degrees of latitude snobbery can yeet your 1°F bucket trade into the shadow realm.

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

Requires **Node.js 20.10+** (engine for `@polymarket/clob-client`, plus `fetch` / `AbortSignal` timeouts that actually work).

```bash
git clone https://github.com/Tsukamg/polymarket-weather-trading-engine
cd polymarket-weather-trading-engine
npm install
npm run build
```

Env template:

```bash
cp env.example .env
```

On Windows: `copy env.example .env`

Variables use the **`WEATHERBOT_`** prefix (see `env.example`). Anything importing `src/config.ts` loads `.env` via [dotenv](https://github.com/motdotla/dotenv).

Set **`WEATHERBOT_VC_KEY`** for Visual Crossing (post-game temps). Free key: [visualcrossing.com](https://www.visualcrossing.com).

**Live CLOB:** **`WEATHERBOT_CLOB_LIVE=1`** plus **`WEATHERBOT_POLY_PRIVATE_KEY`**, **`WEATHERBOT_POLY_PROXY_WALLET`**, and optional CLOB API fields from `env.example`. Gamma still feeds market ids and `clobTokenIds`. Without live mode, it’s **paper-only** (sim balance + Gamma prices).

---

## Usage

```bash
npm start -- run       # bot loop: full scan on interval, monitor between
npm start -- status    # balance + open positions
npm start -- report    # resolved markets breakdown
# or after build:
node dist/index.js run
```

Dev without a separate build:

```bash
npm run dev -- status
```

---

## Data storage

Everything lands under `data/markets/` — one JSON file per market: forecast snapshots, prices, positions, resolutions. The bot uses that history to calibrate and occasionally sigh at past you.

---

## APIs

| API | Auth | Purpose |
|-----|------|---------|
| Open-Meteo | None | ECMWF + HRRR forecasts |
| Aviation Weather (METAR) | None | Real-time station observations |
| Polymarket Gamma | None | Market metadata |
| Visual Crossing | Free key | Historical temps / resolution helpers |

---

## Disclaimer

Not financial advice. Prediction markets can turn money into a learning experience. Paper trade until the math stops giggling.
