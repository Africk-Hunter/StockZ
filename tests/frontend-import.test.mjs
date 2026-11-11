import test from "node:test";
import assert from "node:assert/strict";
import { parseImportFile, looksLikeJson } from "../public/src/lib/watchlist-import.mjs";
import { serializeImportableExport } from "../public/src/lib/watchlist-export.mjs";

test("looksLikeJson tells a JSON file from a ticker list", () => {
  assert.equal(looksLikeJson('  {"a":1}'), true);
  assert.equal(looksLikeJson("AAPL, MSFT"), false);
});

test("parseImportFile reads back what the export wrote", () => {
  const items = [
    { ticker: "AAPL", name: "Apple", currentPrice: 1, goodBuyPrice: 1, badBuyPrice: 2, folderIds: ["f1", "f2"] },
    { ticker: "BRK-B", name: "Berkshire", currentPrice: 1, goodBuyPrice: 1, badBuyPrice: 2, folderIds: ["f1"] },
    { ticker: "XOM", name: "Exxon", currentPrice: 1, goodBuyPrice: 1, badBuyPrice: 2, folderIds: [] },
  ];
  const folders = [{ id: "f1", name: "Tech" }, { id: "f2", name: "Dividends" }];
  const text = serializeImportableExport(items, folders, new Set(["AAPL", "BRK-B", "XOM"]));
  const result = parseImportFile(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.tickers, ["AAPL", "BRK-B", "XOM"]);
  assert.deepEqual(result.watchlists, [
    { name: "Tech", tickers: ["AAPL", "BRK-B"] },
    { name: "Dividends", tickers: ["AAPL"] },
  ]);
  assert.deepEqual(result.tickerFolders.get("AAPL"), ["Tech", "Dividends"]);
  assert.equal(result.tickerFolders.has("XOM"), false);
});

test("parseImportFile rejects bad input with a message", () => {
  assert.equal(parseImportFile("{ not json").ok, false);
  assert.match(parseImportFile('{"format":"other"}').error, /Not a StockZ export/);
  assert.match(parseImportFile('{"format":"stockz-watchlist","version":99,"stocks":[]}').error, /newer version/);
  assert.match(parseImportFile('{"format":"stockz-watchlist","version":1,"stocks":[]}').error, /no valid tickers/);
});

test("parseImportFile reports invalid tickers and dedupes", () => {
  const result = parseImportFile(JSON.stringify({
    format: "stockz-watchlist", version: 1,
    watchlists: [{ name: " A ", tickers: ["aapl", "aapl", "bad$"] }],
    stocks: [{ ticker: "AAPL" }, { ticker: "msft" }],
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.tickers, ["AAPL", "MSFT"]);
  assert.deepEqual(result.invalid, ["bad$"]);
  assert.deepEqual(result.watchlists, [{ name: "A", tickers: ["AAPL"] }]);
});
