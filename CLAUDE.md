# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

StockZ is a fully static (no Python, no traditional backend) web app that scrapes historical monthly stock closing prices from Yahoo Finance and computes suggested "buy range" price bands (great/good/okay/bad) for a given ticker. Users can log in (Firebase Auth) and save tickers to a per-user watchlist (Firestore). Hosted on Netlify.

## Commands

```
npm install                       # Node deps (tailwindcss, postcss, autoprefixer, firebase, cheerio, concurrently)
npm install -g netlify-cli        # one-time, needed for local dev
npm run dev                       # runs tailwindcss --watch AND `netlify dev` together (see below)
npm run build                     # one-off minified tailwindcss build (also what Netlify runs on deploy)
```

There is no configured test suite (`npm test` is a stub) and no linter.

`npm run dev` runs two processes concurrently via `concurrently`: `css:watch` (tailwindcss `--watch`, rebuilding `public/src/output.css` on every save) and `netlify dev` (serves `public/` + runs `netlify/functions` locally at http://localhost:8888). `netlify.toml`'s `[dev]` block pins `framework = "#static"` so Netlify Dev skips framework auto-detection and serves `public/` directly with its built-in live-reload (file-watch + injected websocket) — so editing `input.css` or any Tailwind class in `public/*.html`/`public/src/` regenerates `output.css`, which Netlify Dev then live-reloads in the browser automatically. No manual refresh needed while `npm run dev` is running. (`npm run css:watch` alone still works if you only need the Tailwind watcher without Netlify Dev.)

## Architecture

**No backend server.** The site is plain static HTML/CSS/JS published from `public/` (Netlify's publish directory). The only server-side code is three Netlify Functions under [`netlify/functions/`](netlify/functions/) — `run-calculations.mjs`, `stock-info.mjs`, and `run-dividend-info.mjs` — which exist solely to work around Yahoo Finance not sending CORS headers (a browser can't `fetch()` `finance.yahoo.com` directly) and share request headers/rate-limiting/ticker-validation helpers via `netlify/functions/lib/shared.mjs`. `run-calculations.mjs` scrapes `finance.yahoo.com/quote/<TICKER>/history` server-side (Node's built-in `fetch`, via `undici`, + `cheerio`), extracts the Close column by matching header text (not a fixed column index — Yahoo's column order has drifted before), and returns `{ prices: [...], dates: [...] }` as JSON (most recent first) — the same shape the old Flask route used. `javascript.mjs` reads `.prices`/`.dates` off that response everywhere it calls `/run-calculations`; if that shape is ever changed to a bare array, every read site (`getStockData` callers, `createStockChart`) needs to change with it, in the same commit. There is no database — all persistence is client-side (localStorage) or in Firestore.

**Frontend has no build step / bundler / framework.** Every page (`public/index.html`, `main.html`, `tickerInfo.html`, `watchlist.html`) loads the *same* single module, `public/src/javascript.mjs`, via `<script type="module">`. Behavior branches per-page using DOM feature detection — e.g. `if (enterButton) { ... } else { ... }`, `if (tickerParentBox) { ... }`, `if (watchlistItemsContainer) { ... }` — based on which element IDs exist in that page's HTML. There is no client-side router; navigation is done via `window.location.href` with a CSS fade-out transition first. Clean URLs (`/main`, `/tickerInfo`, `/watchlist`) are preserved via rewrites in `netlify.toml` mapping to the corresponding `.html` file.

**Auth & storage**: Firebase Auth (email/password) and Firestore are initialized directly in `javascript.mjs` with an embedded `firebaseConfig`. Each user's watchlist lives at Firestore path `users/{uid}/watchlist/{ticker}`. Fetched/derived data (`mostRecentData`, `mostRecentCalculations`, `userWatchListData`, `recentlyCalculatedWarning`) is cached in `localStorage` and read back on subsequent pages instead of being passed through URL params or app state — keep this in mind when tracing data flow between pages.

**Buy-range calculation** (core domain logic, in `javascript.mjs`): `findDipInformation()` scans monthly closes for the most significant price drop (scored by recency and drop size, with an adaptive threshold that lowers itself — and sets a UI warning — if no dip clears the initial 10% threshold), then `runStockCalculations()` derives 4 price bands (great/good/okay/bad, each with low/high) between a computed min and max around that dip. Tailwind color tokens `great-buy-*`, `good-buy-*`, `okay-buy-*`, `desperate-buy-*` (defined in `tailwind.config.js`) drive the corresponding UI. Both functions take `data` as a bare array of closes indexed numerically (`data[0]` is the current price) — callers pass `response.prices` from the `/run-calculations` result, not the response object itself.

**Charting**: `tickerInfo.html` loads Chart.js from a CDN; `createStockChart()` in `javascript.mjs` renders the price history line chart with responsive tick/font-size logic keyed off `tailwind.config.js`'s custom breakpoints (`tablet`/`laptop`/`desktop`/`desktopXL`).

## Deployment

Deployed at stock-z.com via Netlify (migrated from Render + Flask/gunicorn). `netlify.toml` sets `publish = "public"`, `functions = "netlify/functions"`, and `command = "npm run build"`.
