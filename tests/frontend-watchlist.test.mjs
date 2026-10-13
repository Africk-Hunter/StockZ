import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeTicker, tickerPath, parseBulkTickers } from "../public/src/lib/ticker.mjs";
import {
  newYorkDate,
  bandsAreFresh,
  priceJumped,
  mapWithConcurrencyLimit,
  getBuyTierPosition,
  isWithinBuyRange,
  compareWatchlistValues,
  sortWatchlistItems,
  getCurrentPriceRangeColorClass,
} from "../public/src/lib/watchlist-logic.mjs";
import { formatMarketCap, formatPrice } from "../public/src/lib/format.mjs";

const fe = { sanitizeTicker, tickerPath, newYorkDate, bandsAreFresh, priceJumped, mapWithConcurrencyLimit, getBuyTierPosition, isWithinBuyRange, compareWatchlistValues, getCurrentPriceRangeColorClass };

test("sanitizeTicker", () => {
  assert.equal(fe.sanitizeTicker(" wfc "), "WFC");
  assert.equal(fe.sanitizeTicker("BRK.B"), "BRK.B");
  assert.equal(fe.sanitizeTicker("BRK-B"), "BRK-B");
  for (const bad of ["", null, undefined, "A B", "TOOLONGTICKER", "AA$", "../x", "AAPL1"]) {
    assert.equal(fe.sanitizeTicker(bad), null, String(bad));
  }
});

test("tickerPath builds the shareable URL", () => {
  assert.equal(fe.tickerPath("WFC"), "/WFC");
  assert.equal(fe.tickerPath("BRK.B"), "/BRK.B");
});

test("priceJumped flags >30% moves in either direction (splits)", () => {
  assert.equal(fe.priceJumped(100, 105), false);
  assert.equal(fe.priceJumped(100, 131), true);
  assert.equal(fe.priceJumped(100, 50), true);
  assert.equal(fe.priceJumped(100, 77), false);
  assert.equal(fe.priceJumped(100, 76), true);
  assert.equal(fe.priceJumped(0, 50), false);
  assert.equal(fe.priceJumped("x", 50), false);
});

test("bandsAreFresh", () => {
  const noon = (y, m, d) => Date.UTC(y, m - 1, d, 17);
  assert.equal(fe.bandsAreFresh({}), false);
  assert.equal(fe.bandsAreFresh({ bandsUpdatedAt: noon(2026, 10, 5) }, noon(2026, 10, 9)), true);
  // Calculated on the 1st, checked later: stale (the 1st's close was still moving).
  assert.equal(fe.bandsAreFresh({ bandsUpdatedAt: noon(2026, 10, 1) }, noon(2026, 10, 2)), false);
  assert.equal(fe.bandsAreFresh({ bandsUpdatedAt: noon(2026, 10, 1) }, noon(2026, 10, 1)), true);
  // New month: stale.
  assert.equal(fe.bandsAreFresh({ bandsUpdatedAt: noon(2026, 9, 25) }, noon(2026, 10, 3)), false);
  // Older than a week: stale even within the month.
  assert.equal(fe.bandsAreFresh({ bandsUpdatedAt: noon(2026, 10, 2) }, noon(2026, 10, 12)), false);
});

test("newYorkDate uses the New York calendar day", () => {
  // 03:00 UTC on Oct 2 is still Oct 1 in New York (EDT).
  const { year, month, day } = fe.newYorkDate(Date.UTC(2026, 9, 2, 3));
  assert.deepEqual({ year, month, day }, { year: 2026, month: 10, day: 1 });
});

test("mapWithConcurrencyLimit preserves order and respects the limit", async () => {
  let active = 0;
  let peak = 0;
  const results = await fe.mapWithConcurrencyLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return n * 10;
  });
  assert.deepEqual([...results], [10, 20, 30, 40, 50, 60]);
  assert.equal(peak, 2);
  assert.equal((await fe.mapWithConcurrencyLimit([], 3, async (x) => x)).length, 0);
});

test("buy-tier position and range helpers", () => {
  const item = (currentPrice, goodBuyPrice = 100, badBuyPrice = 200) => ({ currentPrice, goodBuyPrice, badBuyPrice });
  assert.equal(fe.getBuyTierPosition(item(150)), 0.5);
  assert.equal(fe.getBuyTierPosition(item(50)), -0.5);
  assert.equal(fe.getBuyTierPosition(item(150, 200, 100)), Infinity);
  assert.equal(fe.getBuyTierPosition(item(undefined)), Infinity);
  assert.equal(fe.isWithinBuyRange(item(100)), true);
  assert.equal(fe.isWithinBuyRange(item(200)), true);
  assert.equal(fe.isWithinBuyRange(item(201)), false);
  assert.equal(fe.isWithinBuyRange(item(99)), false);
});

test("compareWatchlistValues", () => {
  assert.ok(fe.compareWatchlistValues("AAA", "BBB", "ticker") < 0);
  assert.ok(fe.compareWatchlistValues("$10.50", "$9", "price") > 0);
  assert.equal(fe.compareWatchlistValues(undefined, "N/A", "price"), 0);
});

test("getCurrentPriceRangeColorClass maps price to tier", () => {
  const color = (price) => fe.getCurrentPriceRangeColorClass(price, 100, 180); // step = 10
  assert.equal(color(99), "bg-purple-500");
  assert.equal(color(100), "bg-great-buy-one");
  assert.equal(color(119), "bg-great-buy-one");
  assert.equal(color(120), "bg-good-buy-one");
  assert.equal(color(140), "bg-okay-buy-one");
  assert.equal(color(160), "bg-desperate-buy-one");
  assert.equal(color(180), "bg-desperate-buy-one");
  assert.equal(color(181), null);
  assert.equal(fe.getCurrentPriceRangeColorClass("x", 100, 180), null);
  assert.equal(fe.getCurrentPriceRangeColorClass(150, 180, 100), null);
});

test("parseBulkTickers sorts tokens into add / already-added / invalid", () => {
  const result = parseBulkTickers("aapl, msft;  AAPL  wfc\n bad$ brk.b", new Set(["WFC"]));
  assert.deepEqual(result, { invalid: ["bad$"], alreadyAdded: ["WFC"], toAdd: ["AAPL", "MSFT", "BRK.B"] });
  assert.deepEqual(parseBulkTickers("", new Set()), { invalid: [], alreadyAdded: [], toAdd: [] });
});

test("sortWatchlistItems", () => {
  const item = (ticker, currentPrice, goodBuyPrice = 100, badBuyPrice = 200) => ({ ticker, currentPrice, goodBuyPrice, badBuyPrice });
  const items = () => [item("B", 150), item("A", 300), item("C", 120), item("D", 90)];
  const order = (list) => list.map((i) => i.ticker).join("");
  assert.equal(order(sortWatchlistItems(items(), "ticker", "asc")), "ABCD");
  assert.equal(order(sortWatchlistItems(items(), "ticker", "desc")), "DCBA");
  // Buy tier: below range (best) first, then ascending position, out-of-range-above last.
  assert.equal(order(sortWatchlistItems(items(), "priceTier", "asc")), "DCBA");
  // Price sort puts in-range items first (high to low), the rest after.
  assert.equal(order(sortWatchlistItems(items(), "currentPrice", "desc")), "BCAD");
  assert.equal(order(sortWatchlistItems(items(), null, "asc")), "BACD");
});

test("formatMarketCap", () => {
  assert.equal(formatMarketCap(243.281e9), "$243.28B");
  assert.equal(formatMarketCap(2.1e12), "$2.10T");
  assert.equal(formatMarketCap(5e6), "$5.00M");
  assert.equal(formatMarketCap(12345), "$12,345");
  assert.equal(formatMarketCap(null), "N/A");
  assert.equal(formatMarketCap(NaN), "N/A");
});

test("formatPrice", () => {
  assert.equal(formatPrice(80.4), "$80.40");
  assert.equal(formatPrice("12"), "$12.00");
  assert.equal(formatPrice(null), "—");
  assert.equal(formatPrice(undefined), "—");
});
