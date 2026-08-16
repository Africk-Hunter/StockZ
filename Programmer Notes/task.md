# Task Checklist: Mobile Redesign (Watch List / Ticker Info / Search)

- [x] javascript.mjs: refactor nav wiring to shared classes (`.nav-ticker-info`, `.nav-home`, `.nav-watchlist`, `.nav-logout`)
- [x] javascript.mjs: add `goToTickerInfo(ticker)` helper; use in `tickerSubmit`, watchlist row click — already existed as `loadTickerAndNavigate`, reused instead of duplicating
- [x] javascript.mjs: chart gridlines hidden on mobile widths
- [x] watchlist.html: hide desktop table + sort row under `laptop:`, add mobile title/card container
- [x] javascript.mjs: `createStockCardItem()` (price/GB/BB, no dividend) + wire into `updateWatchlistUI()`; mobile empty state
- [x] tickerInfo.html: hide desktop `buyHolder` under `laptop:`, add mobile horizontal buy-range chip strip
- [x] javascript.mjs: populate mobile buy-range chips from real calculations in `loadCalculatedValues()`
- [x] tickerInfo.html: mobile-width fixes for price snapshot / dividend list / actions grid
- [x] javascript.mjs: watchlist add/remove toggle behavior on `addToWatchlist` button
- [x] main.html: mobile wordmark header, mobile watchlist quick-access list markup
- [x] javascript.mjs: quick-access list render/filter wired to `mainTickerInput` input event
- [x] main.html / tickerInfo.html / watchlist.html: shared bottom tab bar + mobile logout icon, top nav `hidden laptop:grid`
- [ ] Programmer Notes/DEVLOG.md: add entry
- [ ] npm run build (regenerate public/src/output.css with new mobile classes)
- [ ] Manual check: run the app, click through all 3 screens at a mobile viewport and at laptop+ viewport
