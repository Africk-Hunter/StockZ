# Devlog

A running log of notable changes to StockZ, in plain language.

---

## 1.0 — Netlify migration + dividend info _(in progress, uncommitted)_

**Status:** working tree changes, not yet committed.

### Summary

Retired the Python/Flask backend entirely and rebuilt StockZ as a fully
static site on Netlify, with the Yahoo Finance scraping moved into Netlify
Functions. Also picked up a dividend-info feature on the Ticker Info page
along the way.

### Backend: Flask → Netlify Functions

- Removed `app.py`, `requirements.txt`, `pyscript.json` — no more Python,
  no more server to run/host.
- Removed `templates/` (Jinja) and the old `src/` (now superseded by
  `public/`).
- Added `netlify/functions/`:
  - `run-calculations.mjs` — scrapes monthly close prices from
    `finance.yahoo.com/quote/<TICKER>/history` (Node `fetch` + `cheerio`),
    matching the Close column by header text so it survives Yahoo
    reordering columns. Same response shape (`{ prices, dates }`) and
    request URL as the old Flask route, so the frontend didn't need to
    change how it calls it.
  - `run-dividend-info.mjs` — new. Scrapes `key-statistics` for forward
    dividend yield and payout ratio, and the dividend-filtered `history`
    view for the most recent payout amount.
  - `stock-info.mjs` — new. Quick lookup of company name, current price,
    and dividend yield off the main quote page.
  - All three scrapes use `undici` with an enlarged `maxHeaderSize`
    (Yahoo's response headers overflow Node's built-in `fetch` default).
- Added `netlify.toml`: publish dir `public`, functions dir
  `netlify/functions`, build command `npm run build`, plus clean-URL
  redirects (`/main`, `/tickerInfo`, `/watchlist`) to their `.html` files.

### Frontend: reorganized under `public/`

- `index.html`, `main.html`, `tickerInfo.html`, `watchlist.html` moved to
  `public/`; `src/` (JS/CSS/icons) moved to `public/src/`.
- `tailwind.config.js` content globs updated to scan `public/*.html` and
  `public/src/*.{html,js,mjs,css}` instead of the old `dist/`/`src/`/`templates/`
  paths.

### New feature: dividend info on Ticker Info page

- Dividend yield, payout ratio, and last payout amount now shown as stat
  tiles, backed by `run-dividend-info.mjs`.
- Link buttons out to StreetInsider (dividend history) and Zacks (EPS
  chart).
- Kept isolated from `/run-calculations` on purpose — a scrape failure
  here can't break the core buy-range calculation.

### Tooling / config

- `package.json`: `dev`/`build` scripts now point at
  `public/src/input.css` → `public/src/output.css`; `build` runs
  minified (this is what Netlify runs on deploy). Added `cheerio` and
  `undici` as dependencies; added an `engines.node >= 18` constraint.
- `.gitignore`: added `.netlify`.
- `README.md`: updated setup instructions for `netlify dev` instead of
  `pip install` + `python app.py`.
- Added `CLAUDE.md` (repo guidance for Claude Code).
- Added `Programmer Notes/` — planning docs for this work
  (`implementation_plan.md`, `task.md`) plus `buy-range-formula.html`.

### Not done here

- No test suite or linter added — none existed before either.
- Buy-range calculation logic in `javascript.mjs` (`findDipInformation`,
  `runStockCalculations`) is unchanged — only where the file lives moved.

---

## 1.1 — Audit remediation _(in progress, uncommitted)_

**Status:** working tree changes, not yet committed.

### Summary

Fixed every open finding from the post-migration StockZ Audit — security,
correctness, performance, and cleanliness — across the three Netlify
Functions, `javascript.mjs`, the static pages, and project config. No
functional feature changes; this pass is entirely about closing the gaps the
audit found. `firestore.rules` was added as a checked-in source of truth but
still needs a manual `firebase deploy --only firestore:rules` to take effect.

### Netlify Functions

- Added `netlify/functions/lib/shared.mjs`: the request headers, the shared
  `undici` `Agent`, `START_TIME`, `sanitizeTicker()`, a per-instance rate
  limiter, and a fetch timeout helper, previously duplicated 3 ways.
- All three functions: validate `ticker` against an allowlist regex instead
  of only checking presence; URL-encode it before it's ever interpolated
  into a Yahoo request; pass an `AbortSignal.timeout()` on every outbound
  `fetch`; apply a basic per-IP rate limit; return a real error status
  (502) on scrape failure instead of always responding 200 with empty data.
- `run-calculations.mjs`: the Close/Date column-by-header-text matching and
  per-row `NaN` skip (rather than aborting the whole parse on one bad row)
  were already fixed in the 1.0 migration — untouched here.

### `javascript.mjs`

- Fixed the buy-range calculation bugs: the off-by-one in
  `calculateAverageMonthlyChange`, the adaptive-threshold loop that could
  evaluate at a negative (spurious-dip-inducing) threshold, the `9999`
  price-ceiling sentinel, an out-of-bounds array read at the most recent
  month, and a missing `max > min` guard. `assignValueOnScreen` now treats
  `NaN` the same as null/undefined ("N/A") instead of rendering "$NaN".
- Fixed the DOM-based XSS on the ticker label (`innerHTML` → `textContent`)
  and validate/uppercase tickers once at capture time via `sanitizeTicker()`
  before they're ever used as a Firestore document ID or sent to a
  function.
- `getStockData()` now rejects on failure and times out instead of hanging
  its promise forever, and resolves with the parsed data directly instead
  of relying on an immediate `localStorage` read-back — the same
  read-back-race pattern was also removed from `updateWatchListValues`,
  which now caps its per-item fetches at 4 concurrent and writes the
  updated watchlist to Firestore as one `writeBatch` instead of N
  `updateDoc` calls.
- `deleteFromFirebase` now deletes by direct document reference instead of
  scanning the whole collection, and its caller awaits it and only updates
  the DOM/`localStorage` on success (previously fire-and-forget).
- Extracted `navigateTo()` and `loadTickerAndNavigate()` to remove the
  duplicated nav-redirect and fetch-calculate-navigate blocks; renamed the
  `findDipInformation`/`runStockCalculations` tuple to say what it actually
  holds (`recoveryLowPrice`/`preDropPrice` instead of
  `dipPrice`/`dipHolderPrice`); removed the dead `dipPrice`/`currentPrice`/
  `currentTicker` module-level bindings; named the dip-threshold magic
  numbers.
- Wrapped the remaining unguarded `JSON.parse(localStorage...)` call sites
  in try/catch.

### Static pages / config

- Removed the unused jQuery `<script>` from `index.html`; gave the
  username/password inputs distinct `name` attributes; added
  `preventDefault()` to both login `keypress` handlers.
- Pinned Chart.js to `4.4.4` with a verified SRI hash instead of loading an
  unpinned, unverified latest build.
- `netlify.toml`: added a `[[headers]]` block (CSP, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).
- `tailwind.config.js`: content globs are now recursive
  (`public/**/*.html`, `public/src/**/*...`); fixed the stale `desktopXL`
  breakpoint comment.
- `.gitignore`: added `.env`, `.vscode/`, and OS artifact entries.
- Fixed `main.html`'s stray double-space class typo.

### Not done here

- `firestore.rules` is new and checked in, but not deployed — someone with
  access to the `stockz-1d5ca` Firebase project needs to run
  `firebase deploy --only firestore:rules`.
- The watchlist-folders/sorting/chart/dividend-panel feature code itself
  wasn't in scope (it wasn't part of the audit) and is untouched.
- No SRI hash was added for the Google Fonts stylesheet — `<link>`-based
  stylesheets don't support the `integrity` attribute the same way scripts
  do without also fixing the `crossorigin` request mode; left as-is.

---

## 1.2 — Mobile redesign _(in progress, uncommitted)_

**Status:** working tree changes, not yet committed.

### Summary

Implemented the mobile redesign handoff (card-based Watch List, a horizontal
buy-range chip strip on Ticker Info, a watchlist-backed quick-access list on
Search, and a bottom tab bar) for viewports below the existing `laptop:`
(1024px) breakpoint. Reuses the site's existing color tokens and component
conventions rather than the handoff mockup's literal palette — the desktop
(`laptop:`+) layout is unchanged.

### Watch List

- New `createStockCardItem()` renders a mobile card per stock (name/ticker,
  price, delete + add-to-folder buttons, then a GB/BB pill row — no
  dividend pill, per product direction) alongside the existing
  `createStockContainerItem()` desktop row; both render from the same cached
  data in `updateWatchlistUI()`. Sort controls and the table header stay
  desktop-only, matching the mockup.
- Minimal empty state (mobile only): "No stocks yet" + a link to Search,
  reusing the same card chrome.

### Ticker Info

- New mobile-only horizontal-scroll strip of 4 buy-range chips (Great/Good/
  Okay/Bad), populated from the real computed `greatBRLow/High` … values
  already in `mostRecentCalculations` (not an approximated formula).
- **Watchlist toggle button behavior fix** (affects both mobile and
  desktop, since it's one shared button): the "Add To Watchlist" button now
  checks the cached watchlist on load and flips to "Remove from Watchlist"
  if the ticker's already saved; clicking it now removes as well as adds.
  This was a real functional gap, not a visual-only change.
- Chart gridlines are now hidden below 640px, matching the existing
  tick-label hiding at that width ("no axis labels or gridlines" on mobile).
- Price snapshot / dividend list / secondary-actions grid go full-width on
  mobile (`w-3/4` → `w-full` under `laptop:`).

### Search ("Main")

- No ticker/company-name database exists to fuzzy-search against, so the
  mobile quick-access list searches the user's cached watchlist instead —
  empty query shows "Your Watchlist", a query narrows to "Results" by
  ticker/name substring match. The existing direct-ticker-entry flow still
  works for anything not already watchlisted.

### Navigation

- Added a `laptop:hidden` bottom tab bar (Ticker Info / Search / Watch
  List, reusing the existing nav icon assets) plus a small mobile header
  (StockZ wordmark + logout) on all three pages; the existing top `nav` is
  now `hidden laptop:grid`.
- Nav click wiring switched from per-id listeners to shared classes
  (`.nav-home`, `.nav-ticker-info`, `.nav-watchlist`, `.nav-logout`) since
  each destination now has two DOM elements (desktop nav + mobile tab bar).

### Not done here

- No new Tailwind color tokens — reused the existing palette per product
  direction.
- Sort controls and per-item folder assignment on Watch List remain
  desktop-table-only / mobile-card-only respectively (folder assignment was
  extended to the mobile card for feature parity, since removing it would
  have been a regression).
- Not verified in a real mobile browser this session — see `task.md` for
  the outstanding manual check.

---

## 1.3 — Error reporting + dip-scoring bug fix _(in progress, uncommitted)_

**Status:** working tree changes, not yet committed.

### Summary

Added a lightweight error-logging / "Report a Problem" pipeline (frontend
capture → new `log-error` function → Netlify function logs, since there's
still no database or email provider), and fixed a real scoring bug in
`findDipInformation` where a decayed score was leaking across retry passes.

### Error logging & bug-report widget

- New `netlify/functions/log-error.mjs`: POST-only, rate-limited (reuses
  `isRateLimited`/`clientIp` from `lib/shared.mjs`), body-size-capped
  (20 KB) endpoint that validates/truncates each field and writes the
  report out via `console.error` — the Netlify Functions log viewer is the
  actual "inbox" for these, there's nowhere else for them to go.
- `javascript.mjs`: wraps `console.error` (so every existing and future
  call site is captured for free) and adds `window` `error` /
  `unhandledrejection` listeners; each captured error is pushed onto a
  capped 25-entry `localStorage` ring buffer and beaconed to `/log-error`
  via `navigator.sendBeacon` (falling back to a `keepalive` `fetch`).
- Added a floating "Report a Problem" button + modal
  (`initBugReportWidget()`), injected on every page since the module loads
  everywhere. A user's description is bundled with the last 10 buffered
  errors and POSTed to the same `/log-error` function.

### Bug fix: `findDipInformation` dip-score reset

- `monthScore` was declared once outside `performDipLoop()` and never
  reset between calls. Each threshold-lowering retry (and the final
  unconditional fallback pass) resumed scanning `closeData` from wherever
  the *previous* pass's decayed score had left off, eventually driving
  every candidate's score permanently negative for low-volatility tickers
  that never cleared the higher thresholds — leaving
  `recoveryLowMonth`/`recoveryLowPrice` unset. Moved `let monthScore = 1`
  inside `performDipLoop()` so every pass starts fresh.

### Config

- `netlify.toml`: pinned `NODE_VERSION = "22"` under `[build.environment]`;
  added explicit `[[redirects]]` entries mapping `/stock-info`,
  `/run-calculations`, `/run-dividend-info`, and the new `/log-error` to
  their `/.netlify/functions/*` targets (each function already declares
  its own `config.path`, so this is belt-and-suspenders).
- `package.json`: bumped the `engines.node` constraint from `>=18` to
  `>=22.19.0` to match.

### Not done here

- No UI/visual regression testing performed this session for the new
  bug-report modal.
- `public/src/output.css` changes in this pass are just the regenerated
  Tailwind build output reflecting the new widget's classes — not a
  manual edit.
