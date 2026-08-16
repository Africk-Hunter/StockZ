# Implementation Plan: Mobile Redesign (Watch List / Ticker Info / Search)

## Goal
Implement the mobile redesign described in the handoff (`README.md`, `stock-z-mobile-mockups.dc.html`, `ios-frame-reference.jsx`) inside StockZ's existing static site — no framework, no build step besides Tailwind. Per user direction, this uses the site's **existing** design tokens and component conventions (see mapping below), not the mockup's literal hex palette.

StockZ has no client-side router and no shared partials — each page (`main.html`, `tickerInfo.html`, `watchlist.html`) is a standalone HTML file that duplicates the nav markup and is driven by the one shared `javascript.mjs`. The existing responsive split point is `laptop:` (1024px) — e.g. the current nav already swaps an icon-only mobile view for a text nav at `laptop:`. This plan reuses that exact same breakpoint and that exact same "two elements, toggle by breakpoint" convention, rather than introducing a new breakpoint.

`index.html` (login) is not part of the handoff's 3 screens — no changes planned there.

## Design token mapping (mockup hex → existing Tailwind token)
| Mockup token | Existing StockZ token | Notes |
|---|---|---|
| Background `#0d100d` | `bg-background` (`#111311`) | already page bg |
| Card `#161d19` / border `#232f28` | `border-text-color border-opacity-25` on transparent/`bg-background` | matches existing card/box convention (`tickerParentBox`, `watchListContainerLarge`) |
| Text primary `#f5f7f5` | `text-text-color` | |
| Text muted `#6f8079` / `#8a9a92` | `text-text-color text-opacity-60` (existing pattern already used in folder dropdown) | |
| Accent green `#5fd66f` | `text-accent-color` / `bg-accent-color` | |
| Great/Good/Okay/Bad zone colors | `great-buy-one`, `good-buy-one`, `okay-buy-one`, `desperate-buy-one` (+ `text-background` for on-chip text) | matches existing buy-range cell convention exactly |
| Tab bar bg `#101310` | `bg-background` with `border-t border-text-color border-opacity-25` | matches existing `nav`'s `border-b` convention, mirrored |
| Poppins headings | `font-poppins` | already configured |

No new Tailwind colors/tokens planned.

## Cross-cutting JS refactor (`public/src/javascript.mjs`)
1. **Nav wiring by class, not id.** The new bottom tab bar duplicates the 3 nav destinations (+ logout) that the top nav already has, so both can't share element ids. Replace the `getElementById` nav wiring with `document.querySelectorAll('.nav-ticker-info')` / `.nav-home` / `.nav-watchlist` / `.nav-logout`, each page's top nav AND new bottom tab bar carrying the relevant class. Behavior (fade-out + navigate) unchanged.
2. **`goToTickerInfo(ticker)` helper.** Factors out the existing repeated `getStockData → runStockCalculations → navigate to /tickerInfo` sequence (currently duplicated in `tickerSubmit()` and the watchlist row's `nameDiv` click handler). Reused by: ticker submit, watchlist row/card click, and the new mobile search quick-access rows.
3. **Chart gridlines on mobile.** Extend the existing `displayTicks()` (already hides tick labels `<640px`) to also drive `scales.x.grid.display` / `scales.y.grid.display`, so mobile matches the mockup's "no axis labels or gridlines."

## Files

### [MODIFY] `public/watchlist.html` + `javascript.mjs`
- Wrap the existing sort-header row + `watchlistItemsContainer` (table rows) in `hidden laptop:flex` / `laptop:grid` — desktop behavior unchanged.
- Add mobile-only (`laptop:hidden`) block: "Watch List" title, reusing the *existing* `folderDropdownBtn`/`folderDropdownPanel` (already breakpoint-agnostic, not duplicated) for the filter pill, followed by a new `watchlistCardsContainer`.
- Add `createStockCardItem(item)` in JS: card (name/ticker + price + delete button, then a 2-pill row GB/BB — per user direction, the three fields shown per stock are Current Price, GB, BB; no dividend pill), using the same `item` fields as `createStockContainerItem`. Also include a folder-icon button (existing feature, kept for parity — the mockup omits it only because folders aren't part of this prototype's data model). Reuses the existing `trashcan.svg` icon for delete, matching current desktop convention instead of inventing a new "×" glyph.
- `updateWatchlistUI()` renders both the desktop rows and the mobile cards from the same data.
- Minimal empty-state (`laptop:hidden`): if the watchlist is empty, show one card with "No stocks yet" + a link to Search, using the same card chrome (per the handoff's own guidance).
- Sort controls (Name/Price/GB/BB/Div) stay desktop-only (`laptop:` table), matching the mockup, which has no sort UI on mobile.

### [MODIFY] `public/tickerInfo.html` + `javascript.mjs`
- Wrap the existing split-cell 4-band `buyHolder` in `hidden laptop:flex` (desktop unchanged).
- Add mobile-only (`laptop:hidden`) horizontal-scroll strip of 4 chips (Great/Good/Okay/Bad), each a single-tone chip (`bg-great-buy-one` etc. + `text-background`) showing the zone's actual low–high range. `loadCalculatedValues()` populates these from the *real* computed `greatBRLow/High` … `badBRLow/High` values already in `mostRecentCalculations` — not the mockup's approximate `spread`-based formula, since exact numbers already exist.
- Price snapshot, dividend stats list, and the secondary actions grid (`otherButtons`) are already structurally 2-up / 3-row / 2×2 — only mobile-width classes change (`w-3/4` → full-width under `laptop:`), no new markup.
- **Watchlist toggle button behavior fix** (affects the single `addToWatchlist` button, so both mobile and desktop get this — it's a real functional gap, not a mobile-only visual change): on page load, check the ticker against cached `userWatchListData`; set label/style to "Remove from Watchlist" (existing muted tokens) if present, else "Add to Watchlist" (existing accent tokens). Click now branches to add (existing `addToWatchlistFunc`) or remove (existing `deleteFromFirebase` + localStorage filter, same as the watchlist page's delete), then flips state immediately.
- Chart: gridline hiding per the cross-cutting JS change above. Scrub/tooltip interaction is already provided by Chart.js's existing `interaction: {mode:'index', intersect:false}` + crosshair plugin, which already responds to touch drag — no chart rewrite.

### [MODIFY] `public/main.html` + `javascript.mjs`
- Add mobile-only (`laptop:hidden`) "STOCK Z" wordmark header (small, matches mockup) replacing the icon-only top nav on mobile.
- Existing ticker input/`Continue` flow is kept as the actual search mechanism (the app has no ticker/company-name database to fuzzy-search against — the mockup's `ALL_STOCKS` list is prototype-only data). Add a mobile-only quick-access list below the input, sourced from cached `userWatchListData`:
  - Empty input → label "Your Watchlist", full cached list.
  - Non-empty input → label "Results", filtered by substring match on ticker or name; if nothing matches (e.g. a ticker not yet watchlisted), the existing "Continue" button still works to look it up directly.
  - Tapping a row calls the new `goToTickerInfo(ticker)` helper.
- This is a deliberate scope adjustment vs. the mockup (called out here since it changes the described interaction), not a silent deviation.

### Shared bottom tab bar (new markup duplicated in `main.html`, `tickerInfo.html`, `watchlist.html`, per the site's existing no-partials convention)
- `laptop:hidden`, fixed to bottom, `bg-background border-t border-text-color border-opacity-25`, 3 equal-width tabs (Watch List / Ticker Info / Search) reusing the **existing** icon assets (`listIcon.png`, `tickerIcon.png`, `houseIcon.svg`) rather than inventing new geometric shapes — consistent with "reuse site patterns." Active tab is hardcoded per page (same convention the top nav already uses for its `underline` active state) via `text-accent-color` vs `text-text-color text-opacity-60`.
- A small logout affordance is added per mobile page (the mockup's screens don't show one, but the app needs it) — small icon reusing `logOut.png`, top-right of each mobile header.
- Existing top nav (`nav` element) becomes `hidden laptop:grid` on all 3 pages — desktop unaffected.

### [MODIFY] `Programmer Notes/DEVLOG.md`
- Add an entry once implemented.

## Not doing
- No changes to `index.html` (login) — outside the handoff's 3 screens.
- No new Tailwind color tokens — reusing the existing palette per user direction.
- Not building a real ticker/company-name search index — no backend support for it; scoped down to watchlist-based quick access (see `main.html` section above).
- Not adding delete confirmation on mobile watchlist cards — matches existing desktop behavior (no confirm today either).
- Not touching Netlify functions — response shapes are unchanged.

## Open judgment calls (flagging before implementing, not blocking on them)
1. Watchlist add/remove toggle fix on Ticker Info page is a real behavior change (not purely visual) applied to the one shared button — affects desktop too.
2. Search screen becomes "search your watchlist" rather than fuzzy full-market search, since no ticker/name database exists client- or server-side.
3. Sort controls and per-item folder assignment are kept as desktop-only / mobile-parity additions respectively, both diverging slightly from the literal mockup in favor of not losing existing functionality.

## Risk
- `createStockCardItem`/`createStockContainerItem` now run per item on every watchlist render — negligible perf cost at typical watchlist sizes.
- Reusing PNG icon assets (not recolorable via CSS) for the tab bar means the "active" state is communicated via label color + icon opacity rather than icon recoloring — acceptable but not pixel-identical to the mockup's colored SVG icons.
