import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupWatchlistItems,
  buildImportableExport,
  serializeImportableExport,
  formatReadableExport,
  exportFileName,
  NO_WATCHLIST_LABEL,
} from "../public/src/lib/watchlist-export.mjs";
import { getBuyTier } from "../public/src/lib/watchlist-logic.mjs";

const item = (ticker, folderIds = [], extra = {}) => ({
  ticker, name: `${ticker} Corp`, currentPrice: 150, goodBuyPrice: "100.00", badBuyPrice: "180.00",
  dividendYield: "1.5%", bandsUpdatedAt: 1700000000000, folderIds, ...extra,
});
const FOLDERS = [
  { id: "f1", name: "Tech", createdAt: 1 },
  { id: "f2", name: "Dividends", createdAt: 2 },
  { id: "f3", name: "Empty", createdAt: 3 },
];
const ITEMS = [
  item("MSFT", ["f1"]),
  item("AAPL", ["f1", "f2"]),
  item("KO", ["f2"]),
  item("WFC"),
  item("ZZZ", ["deleted-folder"]),
];
const NOW = new Date(2026, 10, 7, 12, 0, 0);

test("getBuyTier names the zone the price is in", () => {
  const tier = (price) => getBuyTier(price, 100, 180); // step = 10
  assert.equal(tier(90), "below");
  assert.equal(tier(100), "great");
  assert.equal(tier(125), "good");
  assert.equal(tier(145), "okay");
  assert.equal(tier(180), "bad");
  assert.equal(tier(181), "above");
  assert.equal(getBuyTier(null, 100, 180), null);
  assert.equal(getBuyTier(150, 180, 100), null);
});

test("groupWatchlistItems: folder order, A-Z stocks, unfiled last", () => {
  const groups = groupWatchlistItems(ITEMS, FOLDERS);
  assert.deepEqual(groups.map((g) => [g.id, g.name, g.items.map((i) => i.ticker)]), [
    ["f1", "Tech", ["AAPL", "MSFT"]],
    ["f2", "Dividends", ["AAPL", "KO"]],
    ["f3", "Empty", []],
    // ZZZ only points at a deleted folder, so it counts as unfiled.
    [null, NO_WATCHLIST_LABEL, ["WFC", "ZZZ"]],
  ]);
  assert.equal(groupWatchlistItems([item("A", ["f1"])], FOLDERS).at(-1).id, "f3", "no empty unfiled group");
  assert.deepEqual(ITEMS.map((i) => i.ticker), ["MSFT", "AAPL", "KO", "WFC", "ZZZ"], "input not reordered");
});

test("buildImportableExport keeps only selected stocks and the watchlists they're in", () => {
  const data = buildImportableExport(ITEMS, FOLDERS, new Set(["AAPL", "WFC"]), NOW);
  assert.equal(data.format, "stockz-watchlist");
  assert.equal(data.version, 1);
  assert.equal(data.exportedAt, NOW.toISOString());
  assert.deepEqual(data.watchlists, [
    { name: "Tech", tickers: ["AAPL"] },
    { name: "Dividends", tickers: ["AAPL"] },
  ]);
  assert.deepEqual(data.stocks.map((s) => s.ticker), ["AAPL", "WFC"]);
  assert.deepEqual(data.stocks[0], {
    ticker: "AAPL", name: "AAPL Corp", currentPrice: 150, goodBuyPrice: 100, badBuyPrice: 180,
    dividendYield: "1.5%", bandsUpdatedAt: 1700000000000,
  });
});

test("buildImportableExport turns missing values into null", () => {
  const sparse = { ticker: "NEW", goodBuyPrice: "abc" };
  const [stock] = buildImportableExport([sparse], [], new Set(["NEW"]), NOW).stocks;
  assert.deepEqual(stock, {
    ticker: "NEW", name: null, currentPrice: null, goodBuyPrice: null, badBuyPrice: null,
    dividendYield: null, bandsUpdatedAt: null,
  });
});

test("serializeImportableExport is pretty JSON that round-trips", () => {
  const text = serializeImportableExport(ITEMS, FOLDERS, new Set(["KO"]), NOW);
  assert.ok(text.endsWith("}\n"));
  assert.deepEqual(JSON.parse(text).watchlists, [{ name: "Dividends", tickers: ["KO"] }]);
});

test("formatReadableExport: header, one aligned table per watchlist", () => {
  const text = formatReadableExport(ITEMS, FOLDERS, new Set(["AAPL", "KO", "WFC"]), NOW);
  const lines = text.split("\n");
  assert.equal(lines[0], "StockZ Watch List");
  assert.equal(lines[1], "Exported November 7, 2026 - 3 stocks");
  // AAPL is listed under both of its watchlists; empty/unselected groups are skipped.
  assert.ok(text.includes("Tech (1 stock)\n=============="));
  assert.ok(text.includes("Dividends (2 stocks)"));
  assert.ok(text.includes(`${NO_WATCHLIST_LABEL} (1 stock)`));
  assert.ok(!text.includes("Empty"));
  assert.ok(!text.includes("MSFT"));

  const headerLines = lines.filter((l) => l.startsWith("Ticker"));
  assert.equal(headerLines.length, 3);
  const aapl = lines.find((l) => l.startsWith("AAPL"));
  assert.match(aapl, /^AAPL\s+AAPL Corp\s+\$150\.00\s+\$100\.00\s+\$180\.00\s+1\.5%\s+Okay buy$/);
  // Columns line up: "Name" starts where each row's name starts.
  assert.equal(headerLines[0].indexOf("Name"), aapl.indexOf("AAPL Corp"));
  assert.equal(headerLines[0].indexOf("Zone"), aapl.indexOf("Okay buy"));
});

test("formatReadableExport: placeholders and long names", () => {
  const long = item("LONG", [], { name: "An Extremely Long Company Name Holdings Inc", currentPrice: null, dividendYield: null });
  const row = formatReadableExport([long], [], new Set(["LONG"]), NOW).split("\n").find((l) => l.startsWith("LONG"));
  assert.match(row, /^LONG\s+An Extremely Long Company N\.\.\.\s+-\s+\$100\.00\s+\$180\.00\s+-\s+-$/);
});

test("exportFileName uses the local date", () => {
  assert.equal(exportFileName("json", NOW), "stockz-watchlist-2026-11-07.json");
  assert.equal(exportFileName("txt", new Date(2026, 0, 3)), "stockz-watchlist-2026-01-03.txt");
});
