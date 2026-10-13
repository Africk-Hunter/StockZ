import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import {
  sanitizeTicker,
  isRateLimited,
  clientIp,
  getCached,
  setCached,
  jsonResponse,
  guardTickerRequest,
  findTableByHeaders,
} from "../netlify/functions/lib/shared.mjs";

test("sanitizeTicker normalizes and rejects", () => {
  assert.equal(sanitizeTicker(" brk.b "), "BRK.B");
  assert.equal(sanitizeTicker("BF-B"), "BF-B");
  for (const bad of [null, undefined, "", "A1", "A B", "ABCDEFGHIJK", "<script>"]) {
    assert.equal(sanitizeTicker(bad), null, String(bad));
  }
});

test("clientIp prefers the Netlify header, then x-forwarded-for", () => {
  const req = (headers) => new Request("http://x", { headers });
  assert.equal(clientIp(req({ "x-nf-client-connection-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" })), "1.1.1.1");
  assert.equal(clientIp(req({ "x-forwarded-for": "2.2.2.2" })), "2.2.2.2");
  assert.equal(clientIp(req({})), "unknown");
});

test("isRateLimited allows 300 requests per minute per IP, independently", () => {
  const log = console.log;
  console.log = () => {};
  try {
    for (let i = 0; i < 300; i++) assert.equal(isRateLimited("rl-a"), false, `request ${i + 1}`);
    assert.equal(isRateLimited("rl-a"), true);
    assert.equal(isRateLimited("rl-b"), false);
  } finally {
    console.log = log;
  }
});

test("response cache stores values and expires them", async () => {
  assert.equal(getCached("missing"), undefined);
  setCached("k", { a: 1 }, 20);
  assert.deepEqual(getCached("k"), { a: 1 });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(getCached("k"), undefined);
});

test("jsonResponse sets status and content type", async () => {
  const res = jsonResponse({ ok: true });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/json");
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(jsonResponse({}, 502).status, 502);
});

test("guardTickerRequest returns the ticker or an error response", async () => {
  const req = (query, ip) => new Request(`http://x/f${query}`, { headers: { "x-nf-client-connection-ip": ip } });
  assert.deepEqual(guardTickerRequest(req("?ticker=aapl", "guard-1")), { ticker: "AAPL" });
  const bad = guardTickerRequest(req("?ticker=!!", "guard-2"));
  assert.equal(bad.ticker, undefined);
  assert.equal(bad.response.status, 400);
});

test("findTableByHeaders requires every label in the thead", () => {
  const $ = cheerio.load(`
    <table id="a"><thead><tr><th>Date</th><th>Dividends</th></tr></thead></table>
    <table id="b"><thead><tr><th>Date</th><th>Close</th></tr></thead></table>`);
  assert.equal($(findTableByHeaders($, "Date", "Close")).attr("id"), "b");
  assert.equal($(findTableByHeaders($, "Dividends")).attr("id"), "a");
  assert.equal(findTableByHeaders($, "Date", "Volume"), null);
});
