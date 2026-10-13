import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import { fileURLToPath } from "node:url";

import { parseHistoricalPrices } from "../netlify/functions/run-calculations.mjs";
import { parseStockInfo } from "../netlify/functions/stock-info.mjs";
import { parseMarketCap, capCategory } from "../netlify/functions/company-profile.mjs";
import { extractLabelledValue } from "../netlify/functions/run-dividend-info.mjs";
import runCalculations from "../netlify/functions/run-calculations.mjs";
import stockInfo from "../netlify/functions/stock-info.mjs";
import companyProfile from "../netlify/functions/company-profile.mjs";
import dividendInfo from "../netlify/functions/run-dividend-info.mjs";
import logError from "../netlify/functions/log-error.mjs";

// Real saved Yahoo pages (WFC). Read-only: the HTML/ folder is kept as
// reference samples and must not be modified.
const loadSample = (name) => cheerio.load(readFileSync(fileURLToPath(new URL(`../HTML/${name}`, import.meta.url)), "utf8"));

test("parseHistoricalPrices reads monthly closes, newest first, skipping mid-month rows", () => {
  const { prices, dates } = parseHistoricalPrices(loadSample("Stock_Historical"));
  assert.equal(prices.length, dates.length);
  assert.ok(prices.length >= 3);
  assert.deepEqual(dates.slice(0, 2), ["Oct 1, 2026", "Sep 1, 2026"]);
  assert.deepEqual(prices.slice(0, 2), [80.25, 80.05]);
  for (const date of dates) assert.match(date, /^[A-Za-z]{3,9}\s+1,\s*\d{4}$/);
  for (const price of prices) assert.ok(Number.isFinite(price) && price > 0);
});

test("parseHistoricalPrices finds Close by header text, not position", () => {
  const $ = cheerio.load(`<table><thead><tr><th>Date</th><th>Volume</th><th>Close</th></tr></thead>
    <tbody><tr><td>Mar 1, 2026</td><td>1,000</td><td>1,234.50</td></tr>
    <tr><td>Feb 1, 2026</td><td>2,000</td><td>bad</td></tr>
    <tr><td>Jan 1, 2026</td><td>3,000</td><td>10</td></tr></tbody></table>`);
  assert.deepEqual(parseHistoricalPrices($), { prices: [1234.5, 10], dates: ["Mar 1, 2026", "Jan 1, 2026"] });
});

test("parseHistoricalPrices throws when the table or Close column is missing", () => {
  assert.throws(() => parseHistoricalPrices(cheerio.load("<p>nothing</p>")), /Historical data not found/);
});

test("parseStockInfo extracts name and price from a real quote page", () => {
  const info = parseStockInfo(loadSample("Stock_Itself"), "WFC");
  assert.equal(info.name, "Wells Fargo & Company");
  assert.equal(info.currentPrice, 80.45);
  assert.ok(info.dividendYield === null || /%$/.test(info.dividendYield));
});

test("parseStockInfo returns nulls for an unrecognized page", () => {
  assert.deepEqual(parseStockInfo(cheerio.load("<html></html>"), "WFC"), { name: null, currentPrice: null, dividendYield: null });
});

test("parseMarketCap and capCategory", () => {
  assert.equal(parseMarketCap("243.281B"), 243.281e9);
  assert.equal(parseMarketCap("1,500M"), 1.5e9);
  assert.equal(parseMarketCap("2.1T"), 2.1e12);
  assert.equal(parseMarketCap("12345"), 12345);
  assert.equal(parseMarketCap("n/a"), null);
  assert.equal(parseMarketCap(undefined), null);
  assert.equal(capCategory(null), null);
  assert.equal(capCategory(500e9), "Mega-cap");
  assert.equal(capCategory(200e9), "Large-cap");
  assert.equal(capCategory(10e9), "Large-cap");
  assert.equal(capCategory(2e9), "Mid-cap");
  assert.equal(capCategory(250e6), "Small-cap");
  assert.equal(capCategory(1e6), "Micro-cap");
});

test("extractLabelledValue strips the label and footnote numbers", () => {
  const $ = cheerio.load(`<table>
    <tr><td>Payout Ratio</td><td>4 38.10%</td></tr>
    <tr><td>Forward Annual Dividend Yield</td><td>2.5%</td></tr></table>`);
  assert.equal(extractLabelledValue($, "Payout Ratio"), "38.10%");
  assert.equal(extractLabelledValue($, "Forward Annual Dividend Yield"), "2.5%");
  assert.equal(extractLabelledValue($, "Nonexistent"), null);
});

// ---- Request guards (no network: these all reject before any fetch) ----

const get = (path, ip = "203.0.113.1") =>
  new Request(`http://localhost${path}`, { headers: { "x-nf-client-connection-ip": ip } });

test("ticker endpoints reject missing or malformed tickers with 400", async () => {
  let n = 0;
  for (const handler of [runCalculations, stockInfo, companyProfile, dividendInfo]) {
    for (const query of ["", "?ticker=", "?ticker=$$", "?ticker=../etc", "?ticker=WAYTOOLONGTICKER"]) {
      const res = await handler(get(`/x${query}`, `10.0.0.${++n}`));
      assert.equal(res.status, 400, `${handler.name || "handler"} ${query}`);
      assert.match(res.headers.get("content-type"), /application\/json/);
      assert.match((await res.json()).error, /Ticker/);
    }
  }
});

test("ticker endpoints return 429 once an IP exceeds the rate limit", async () => {
  const ip = "198.51.100.77";
  let status;
  for (let i = 0; i < 301; i++) status = (await runCalculations(get("/x?ticker=", ip))).status;
  assert.equal(status, 429);
  const res = await stockInfo(get("/x?ticker=", ip)); // limiter is shared per instance
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /Too many requests/);
});

test("log-error validates method, size and JSON, and accepts a good report", async () => {
  const post = (body, ip) =>
    logError(new Request("http://localhost/log-error", { method: "POST", body, headers: { "x-nf-client-connection-ip": ip } }));
  assert.equal((await logError(new Request("http://localhost/log-error"))).status, 405);
  assert.equal((await post("not json", "192.0.2.1")).status, 400);
  assert.equal((await post("x".repeat(20_001), "192.0.2.2")).status, 413);
  const log = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.join(" "));
  try {
    const res = await post(JSON.stringify({ level: "error", message: "boom", stack: "s".repeat(5000) }), "192.0.2.3");
    assert.equal(res.status, 204);
  } finally {
    console.error = log;
  }
  assert.equal(logged.length, 1);
  assert.match(logged[0], /^\[bug-report\]/);
  assert.match(logged[0], /truncated/);
});
