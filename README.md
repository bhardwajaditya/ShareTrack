# ShareTrack

An intelligent stock portfolio tracker for **NSE India** with technical analysis, multi-strategy backtesting, and automated daily reports. Built with Next.js, MongoDB, and a curated set of technical indicators.

ShareTrack pulls daily OHLCV data from Yahoo Finance, evaluates positions against four distinct trading strategies, and surfaces actionable BUY / SELL / HOLD signals for individual stocks, full NSE indexes, or your live portfolio.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Trading Strategies](#trading-strategies)
- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Environment Setup](#environment-setup)
- [Running Locally](#running-locally)
- [Docker Deployment](#docker-deployment)
- [API Reference](#api-reference)
- [Automated Reports (Cron)](#automated-reports-cron)
- [Scripts](#scripts)
- [Documentation](#documentation)

---

## Features

### Dashboard (`/`)
Welcome screen with portfolio summary stats, the latest report preview, and action-required highlights. Pulls live data from your MongoDB-backed portfolio and reports collections.

### Market Analysis (`/analysis`)
Browse any major NSE index (NIFTY 50, NIFTY 100, NIFTY 500, NIFTY BANK, NIFTY IT, NIFTY PHARMA, midcap/smallcap indexes, sectoral and thematic indexes) and run all four strategies across every stock in the index. Results are rendered in a sortable/filterable AG Grid with signal badges and supporting indicator values.

Two analysis modes:
- **Normal** — full strategy scoring across trend-following and breakout setups
- **Sideways** — range-reversion strategy tuned for non-trending markets

### Portfolio (`/portfolio`)
Manually maintain holdings (symbol, quantity, average buy price, notes). Stored in MongoDB. Provides full CRUD with live P&L computed against the latest Yahoo Finance close.

### Backtest (`/backtest`)
Backtest all four strategies on **1 year of historical data** for a single NSE index or every available index, with `₹1,00,000` starting capital per stock. Tracks:

- Total P&L (₹) and percentage return
- Win rate, false positives, false negatives
- Maximum drawdown
- Per-strategy and per-stock breakdowns
- Buy & Hold benchmark comparison

### Reports (`/reports`)
Persisted daily analysis reports stored in MongoDB. Each report records: total holdings analyzed, action-required items (STRONG SELL / SELL / LOSS ALERT / MOMENTUM), per-holding signals, RSI, and execution time. Reports can be browsed in the UI or generated on demand via a cron-triggerable endpoint.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [Next.js 15](https://nextjs.org/) (Pages Router) |
| UI | React 18, Bootstrap 5, React Bootstrap, Tailwind CSS 4 |
| Data Grid | AG Grid Community 33 |
| Charts | `@talkrz/price-chart` |
| Database | MongoDB 7 (via `mongodb` Node driver) |
| Market Data | Yahoo Finance public chart API, `stock-nse-india` |
| Indicators | `technicalindicators` (SMA, EMA, RSI, MACD, Bollinger Bands, Stochastic, ADX, MFI, ATR, VWAP) |
| Email | `@emailjs/browser` |
| Package Manager | Yarn (classic) |

---

## Trading Strategies

ShareTrack evaluates each stock against four strategies. See [`docs/Trading_Strategies_Guide.md`](docs/Trading_Strategies_Guide.md) for the full scoring rubric.

| # | Strategy | Style | Best For |
|---|----------|-------|----------|
| 1 | **Trend-Pullback** | Trend-following with pullback entries | Catching retracements in strong uptrends (50 EMA filter + Bollinger / Stochastic setup + MACD trigger + volume validation) |
| 2 | **MFI Momentum Trend** | Volume-weighted momentum | Buying pullbacks in uptrends using MFI(14) as a volume-weighted RSI, gated by ADX > 20 |
| 3 | **Momentum Breakout (Donchian)** | Breakout | 10-day high breakouts confirmed by ADX > 25, volume > 1.5× average, and RSI in the 50–70 momentum zone |
| 4 | **Opening Range Breakout** | Range expansion | Capturing volatility after 3-day consolidation, with VWAP confirmation and a midpoint stop loss |

All strategies use a **0–100 weighted score** and emit one of `STRONG BUY` / `BUY` / `HOLD` / `SELL` / `STRONG SELL`. Phase 1 (trend filter) failures cap the bullish score so the engine cannot enter counter-trend positions.

---

## Project Structure

```
ShareTrack/
├── pages/
│   ├── index.js                 # Dashboard
│   ├── analysis.js              # NSE index analysis with all 4 strategies
│   ├── portfolio.js             # Portfolio CRUD
│   ├── backtest.js              # 1-year multi-strategy backtest
│   ├── reports.js               # Historical reports browser
│   ├── sma-analysis.js          # Standalone SMA analysis view
│   ├── nse/[id].js              # Individual NSE index detail page
│   ├── stock/[id].js            # Individual stock detail page
│   └── api/
│       ├── portfolio.js         # GET / POST / PUT / DELETE holdings
│       ├── reports.js           # GET stored reports
│       ├── analyze-portfolio.js # Run all strategies against live portfolio
│       ├── stock-data.js        # Historical OHLCV (Yahoo Finance + Mongo cache)
│       ├── indicators.js        # Compute technical indicators on demand
│       ├── sentiment.js         # Sentiment analysis endpoint
│       ├── nse-symbols.js       # NSE symbol lookup
│       ├── nse-index-stocks.js  # Constituents of a given index
│       └── cron/
│           └── generate-report.js # Cron-triggerable daily report
├── components/
│   ├── Layout.js                # Navbar + sidebar shell
│   ├── IndexSelector.js
│   └── StockChart.js
├── utils/
│   ├── stockData.js             # All 4 strategy implementations (single source of truth)
│   ├── backtest.js              # Backtest engine
│   ├── mongodb.js               # Mongo connection + cached collections
│   ├── nseIndexes.js            # NSE index catalog (major / sectoral / thematic)
│   ├── constants.js             # NSE index slug map
│   └── dataPreprocessing.js
├── scripts/
│   └── test-db-connection.js    # Standalone MongoDB connectivity check
├── docs/
│   ├── Trading_Strategies_Guide.md
│   └── Trading_Strategies_Guide.pdf
├── Dockerfile
├── docker-compose.yml
├── next.config.js
└── package.json
```

---

## Requirements

- **Node.js** v22.16.0 (newer LTS should work, but `package.json` is pinned to the v22 line)
- **Yarn** (classic, v1.x)
- **MongoDB** 7+ (local install, Docker, or MongoDB Atlas). The app degrades gracefully if Mongo is not configured — the analysis and backtest pages still work, but portfolio and reports require Mongo.

---

## Environment Setup

1. Copy the example env file:
   ```bash
   cp .env.example .env.local
   ```

2. Configure the variables in `.env.local`:

   | Variable | Required | Description |
   |----------|----------|-------------|
   | `MONGODB_URI` | Yes (for portfolio/reports) | Mongo connection string — e.g. `mongodb://localhost:27017/sharetrack` or an Atlas SRV URI |
   | `MONGODB_DB` | Yes | Database name (defaults to `sharetrack`) |
   | `CRON_SECRET` | No | If set, `/api/cron/generate-report` will require `x-cron-secret` header or `?secret=` query param |

   For Docker Compose use `MONGODB_URI=mongodb://mongodb:27017/sharetrack`.

---

## Running Locally

```bash
# Install dependencies
yarn install

# (Optional) Verify MongoDB connectivity
node scripts/test-db-connection.js

# Start the Next.js dev server
yarn dev
```

The app is served at <http://localhost:3000>.

Other scripts:

```bash
yarn build   # Production build
yarn start   # Run production build
yarn lint    # Next.js linting
```

---

## Docker Deployment

A single command brings up MongoDB and the Next.js app together:

```bash
docker compose up --build
```

This launches:

- `sharetrack-mongodb` — MongoDB 7 on port `27017`, with a named `mongodb_data` volume for persistence
- `sharetrack-web` — the Next.js production server on port `3000`, wired to talk to the Mongo container via `mongodb://mongodb:27017/sharetrack`

To run only the database (e.g. for local dev against `yarn dev`):

```bash
docker compose up mongodb
```

The standalone `Dockerfile` is a multi-stage build (`node:18-alpine` builder + runner) and can be used independently in other orchestration environments.

---

## API Reference

All routes are under `/api`. JSON in, JSON out.

### Portfolio — `/api/portfolio`

| Method | Description | Body / Query |
|--------|-------------|--------------|
| `GET` | List all holdings | — |
| `POST` | Add a holding | `{ symbol, quantity, avgBuyPrice, notes? }` |
| `PUT` | Update a holding | `{ id, symbol?, quantity?, avgBuyPrice?, notes? }` |
| `DELETE` | Remove a holding | `?id=<ObjectId>` |

Symbols are auto-uppercased. A holding for the same symbol cannot be inserted twice — use `PUT` instead.

### Reports — `/api/reports`

| Method | Description | Query |
|--------|-------------|-------|
| `GET` | List recent reports | `?limit=30` |
| `GET` | Fetch a specific report | `?id=<ObjectId>` |

### Live Portfolio Analysis — `/api/analyze-portfolio`

Runs all four strategies against every holding using fresh 1-year Yahoo Finance data and returns per-holding signals plus an `actionRequired` list.

### Stock Data — `/api/stock-data`

Fetches OHLCV history. Symbols default to NSE (`.NS`); other Yahoo Finance exchange suffixes (`.BO`, `.L`, `.TO`, `.AX`, `.HK`, `.SI`, `.F`, `.DE`, `.PA`) and index symbols starting with `^` are passed through unchanged. Data is cached in the `stockHistoricalData` Mongo collection, indexed on `(symbol, date)`.

### Indicators — `/api/indicators`

On-demand calculation of SMA, RSI, MACD, Bollinger Bands, ADX, Stochastic, VWAP, etc. for a given symbol/period.

### NSE Helpers

- `/api/nse-symbols` — search NSE symbols
- `/api/nse-index-stocks?index=<INDEX_ID>` — list constituents of an index
- `/api/sentiment` — sentiment scoring endpoint

---

## Automated Reports (Cron)

`/api/cron/generate-report` is designed to be hit by any external scheduler — `cron-job.org`, GitHub Actions, Vercel Cron, or a server-side `cron`. It iterates over every holding, pulls 1 month of OHLCV, runs a fast SMA/RSI/volume scoring pass, and writes a report document to MongoDB.

**Recommended schedule:** `9:00 AM IST` (before the NSE opens at 09:15).

Example:

```bash
curl -X POST https://your-host/api/cron/generate-report \
  -H "x-cron-secret: $CRON_SECRET"
```

Or with a query string:

```bash
curl "https://your-host/api/cron/generate-report?secret=$CRON_SECRET"
```

If `CRON_SECRET` is not set in the environment, the endpoint is open (useful for local testing).

Each generated report flags any of:

- `STRONG SELL` / `SELL` signals
- `LOSS ALERT` for positions down more than 10%
- `MOMENTUM` for `STRONG BUY` signals on already-profitable positions

The `actionRequiredCount` surfaces on the dashboard so you see what needs attention at a glance.

---

## Scripts

- `scripts/test-db-connection.js` — quick standalone connectivity check against `MONGODB_URI`. Loads `.env.local` (falling back to `.env`), pings the database, lists collections, and prints Atlas-specific hints if authentication fails (code `8000`).

  ```bash
  node scripts/test-db-connection.js
  ```

---

## Documentation

- [`docs/Trading_Strategies_Guide.md`](docs/Trading_Strategies_Guide.md) — full scoring rubric for all four strategies, indicator periods, benchmark methodology, and backtest metric definitions
- [`docs/Trading_Strategies_Guide.pdf`](docs/Trading_Strategies_Guide.pdf) — PDF version of the same guide
