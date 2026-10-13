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

There is no linter. `npm test` runs a `node:test` suite (`tests/**/*.test.mjs`, no extra deps):

- `shared.test.mjs`, `functions.test.mjs` — the Netlify functions (parsers run offline against the saved Yahoo pages in `HTML/`).
- `frontend-*.test.mjs` — the pure browser-side modules in `public/src/lib/` (buy-range math, watchlist helpers, ticker/format helpers), imported directly.
- `smoke.test.mjs` — boots the real page modules in a fresh Node process per scenario (login, main, ticker info, watchlist, bulk add) against a small fake DOM/XHR/Firebase in `tests/smoke/` (a loader swaps the gstatic Firebase CDN imports for in-memory fakes) and drives them like a user. The fakes only implement the APIs the app uses, so a new DOM call in the app fails loudly there — extend `tests/smoke/fake-env.mjs` deliberately.

## Do not modify `HTML/`

`HTML/Stock_Historical`, `HTML/Stock_Itself`, and `HTML/Stock_Profile.html` are saved Yahoo Finance pages the owner keeps as reference examples (to show Claude what Yahoo's markup looks like). Never edit, delete, reformat, or "clean up" them. Reading them, and using them as read-only test fixtures, is fine.

`npm run dev` runs two processes concurrently via `concurrently`: `css:watch` (tailwindcss `--watch`, rebuilding `public/src/output.css` on every save) and `netlify dev` (serves `public/` + runs `netlify/functions` locally at http://localhost:8888). `netlify.toml`'s `[dev]` block pins `framework = "#static"` so Netlify Dev skips framework auto-detection and serves `public/` directly with its built-in live-reload (file-watch + injected websocket) — so editing `input.css` or any Tailwind class in `public/*.html`/`public/src/` regenerates `output.css`, which Netlify Dev then live-reloads in the browser automatically. No manual refresh needed while `npm run dev` is running. (`npm run css:watch` alone still works if you only need the Tailwind watcher without Netlify Dev.)

## Architecture

**No backend server.** The site is plain static HTML/CSS/JS published from `public/` (Netlify's publish directory). The only server-side code is three Netlify Functions under [`netlify/functions/`](netlify/functions/) — `run-calculations.mjs`, `stock-info.mjs`, and `run-dividend-info.mjs` — which exist solely to work around Yahoo Finance not sending CORS headers (a browser can't `fetch()` `finance.yahoo.com` directly) and share request headers/rate-limiting/ticker-validation helpers via `netlify/functions/lib/shared.mjs`. `run-calculations.mjs` scrapes `finance.yahoo.com/quote/<TICKER>/history` server-side (Node's built-in `fetch`, via `undici`, + `cheerio`), extracts the Close column by matching header text (not a fixed column index — Yahoo's column order has drifted before), and returns `{ prices: [...], dates: [...] }` as JSON (most recent first) — the same shape the old Flask route used. The client reads `.prices`/`.dates` off that response everywhere it calls `/run-calculations` (`lib/stock-service.mjs`, `pages/chart.mjs`, `pages/watchlist-refresh.mjs`, `pages/bulk-add.mjs`); if that shape is ever changed to a bare array, every read site needs to change with it, in the same commit. There is no database — all persistence is client-side (localStorage) or in Firestore.

**Frontend has no build step / bundler / framework.** Every page (`public/index.html`, `main.html`, `tickerInfo.html`, `watchlist.html`) loads the *same* entry module, `public/src/javascript.mjs`, via `<script type="module">`. It is a thin entry point that imports ES modules from `public/src/lib/` and `public/src/pages/` and registers the auth-state handler. Each page module wires itself up only if its page's elements exist (DOM feature detection by element ID), so importing all of them on every page is safe. There is no client-side router; navigation is done via `window.location.href` with a CSS fade-out transition first. Clean URLs (`/main`, `/tickerInfo`, `/watchlist`) are preserved via rewrites in `netlify.toml` mapping to the corresponding `.html` file.

**Module map** (`public/src/`):

- `lib/` — no page wiring: `buy-range.mjs` (pure dip/band math), `watchlist-logic.mjs` (pure: freshness, split detection, tier/sort/color helpers), `ticker.mjs`, `format.mjs`, `firebase.mjs` (the only place that pins the Firebase CDN URLs/version and inits the app), `storage.mjs` (localStorage caches), `watchlist-repo.mjs` (Firestore reads/writes + cache sync; no DOM, failures return null/false and the caller alerts), `stock-service.mjs` (XHR to the Netlify functions, `runStockCalculations`, load-and-navigate), `events.mjs` (the `watchlist:changed` DOM event), `error-reporting.mjs` (installs on import — keep it the first import in the entry).
- `pages/` — `nav`, `login`, `main-page`, `ticker-info` (+ `chart`), `watchlist-page` (+ `watchlist-rows`, `watchlist-refresh`, `watchlist-state`), `folders` (dropdown/picker/rename modals, shared by the watchlist and ticker-info pages), `bulk-add`, `delete-modal`.
- A page that must react to a change it did not make (e.g. the folder modal adding a ticker) calls `notifyWatchlistChanged()`; the watchlist table re-renders and the ticker-info button updates by listening, so those modules do not import each other.

**Auth & storage**: Firebase Auth (email/password) and Firestore are initialized in `lib/firebase.mjs` with an embedded `firebaseConfig`. Each user's watchlist lives at Firestore path `users/{uid}/watchlist/{ticker}`. Fetched/derived data (`mostRecentData`, `mostRecentCalculations`, `userWatchListData`, `recentlyCalculatedWarning`) is cached in `localStorage` and read back on subsequent pages instead of being passed through URL params or app state — keep this in mind when tracing data flow between pages.

**Buy-range calculation** (core domain logic, pure, in `lib/buy-range.mjs`): `findDipInformation()` scans monthly closes for the most significant price drop (scored by recency and drop size, with an adaptive threshold that lowers itself — and sets a UI warning — if no dip clears the initial 10% threshold), then `computeBuyRanges()` derives 4 price bands (great/good/okay/bad, each with low/high) between a computed min and max around that dip. Tailwind color tokens `great-buy-*`, `good-buy-*`, `okay-buy-*`, `desperate-buy-*` (defined in `tailwind.config.js`) drive the corresponding UI. Both take a bare array of closes indexed numerically (`[0]` is the current price) — callers pass `response.prices` from the `/run-calculations` result, not the response object itself. `computeBuyRanges()` returns `{ calculations, thresholdLowered }`; `runStockCalculations()` in `lib/stock-service.mjs` wraps it with the localStorage side effects (the `recentlyCalculatedWarning` flag and the optional result cache). With fewer than two usable closes there is no dip, so all bands collapse onto the current price.

**Charting**: `tickerInfo.html` loads Chart.js from a CDN; `createStockChart()` in `pages/chart.mjs` renders the price history line chart with responsive tick/font-size logic keyed off `tailwind.config.js`'s custom breakpoints (`tablet`/`laptop`/`desktop`/`desktopXL`).

## Deployment

Deployed at stock-z.com via Netlify (migrated from Render + Flask/gunicorn). `netlify.toml` sets `publish = "public"`, `functions = "netlify/functions"`, and `command = "npm run build"`.
