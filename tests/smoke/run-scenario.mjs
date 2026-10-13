// Usage: node --import ./tests/smoke/register.mjs tests/smoke/run-scenario.mjs <scenario>
// Runs one page scenario against the real app code (SMOKE_ENTRY overrides the
// entry module, e.g. to run the same scenarios against a pre-refactor copy).
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { FakeElement, createFakeBrowser, installFakeFirebase, flush } from "./fake-env.mjs";

FakeElement.prototype.getContext = function () { return {}; };
globalThis.Chart = class {
  constructor(_ctx, config) { this.data = config.data; this.options = config.options; }
  update() {}
  resize() {}
};

const ENTRY = process.env.SMOKE_ENTRY
  ? pathToFileURL(process.env.SMOKE_ENTRY).href
  : new URL("../../public/src/javascript.mjs", import.meta.url).href;

const PRICES = [120, 110, 100, 60, 90, 100, 105, 110]; // newest first
const watchlistItem = (ticker, currentPrice, good, bad, folderIds = []) => ({
  ticker, name: `${ticker} Corp`, currentPrice, goodBuyPrice: good, badBuyPrice: bad,
  dividendYield: "1.5%", bandsUpdatedAt: null, folderIds,
});
const ITEMS = [
  watchlistItem("AAA", 150, "100.00", "200.00"),          // in range
  watchlistItem("BBB", 50, "100.00", "200.00", ["f1"]),   // below range (best)
  watchlistItem("CCC", 500, "100.00", "200.00"),          // above range
];
const FOLDERS = [{ id: "f1", name: "Tech", createdAt: 1 }];
const json = (v) => JSON.stringify(v);
const tickers = (container) => container.children.map((c) => c.dataset.ticker);

const backend = (path, { ticker } = {}) => {
  if (path === "/run-calculations") return { prices: PRICES, dates: PRICES.map((_, i) => `d${i}`) };
  if (path === "/stock-info") return { name: `${ticker} Inc`, currentPrice: 99.5, dividendYield: "2.0%" };
  if (path === "/run-dividend-info") return { dividendYield: "2.5%", payoutRatio: "40%", lastPayoutAmount: "$0.25" };
  if (path === "/company-profile") return { marketCap: 243.281e9, capCategory: "Mega-cap", sector: "Financial Services" };
  return null;
};

const WATCHLIST_IDS = [
  "watchlistItemsContainer", "watchlistCardsContainer", "watchListContainerLarge", "refreshButton", "refreshStatus",
  "sortByName", "sortByPrice", "sortByGB", "sortByBB", "sortByDividend",
  "sortByNameArrow", "sortByPriceArrow", "sortByGBArrow", "sortByBBArrow", "sortByDividendArrow",
  "mobileSortSelect", "mobileSortDir", "mainWrapper",
  "folderDropdownWrapper", "folderDropdownBtn", "folderDropdownLabel", "folderDropdownPanel",
  "folderModalOverlay", "folderModalTitle", "folderModalCloseBtn", "folderModalList",
  "folderModalNewFolderForm", "folderModalNewFolderInput", "folderModalAddBtn",
  "deleteConfirmModalOverlay", "deleteConfirmModalMessage", "deleteConfirmModalCloseBtn",
  "deleteConfirmModalCancelBtn", "deleteConfirmModalConfirmBtn",
  "renameFolderModalOverlay", "renameFolderModalForm", "renameFolderModalInput",
  "renameFolderModalCloseBtn", "renameFolderModalCancelBtn", "renameFolderModalSaveBtn",
  "bulkAddBtn", "bulkAddModalOverlay", "bulkAddModalForm", "bulkAddModalInput", "bulkAddModalStatus",
  "bulkAddModalCloseBtn", "bulkAddModalCancelBtn", "bulkAddModalSubmitBtn", "bulkAddModalFolders",
];

function watchlistBrowser(extra = {}) {
  const browser = createFakeBrowser({
    ids: WATCHLIST_IDS,
    localStorageData: { userWatchListData: json(ITEMS), userWatchlistFolders: json(FOLDERS) },
    xhr: backend,
    ...extra,
  });
  browser.elements.get("refreshButton").appendChild(new FakeElement("img"));
  browser.elements.get("mobileSortDir").appendChild(new FakeElement("svg"));
  return browser;
}

const scenarios = {
  async login() {
    const browser = createFakeBrowser({ ids: ["enterButton", "inputUsername", "inputPassword", "stockZ"], xhr: backend });
    const fb = installFakeFirebase({ watchlistDocs: [["AAA", { goodBuyPrice: "1", badBuyPrice: "2" }]], folderDocs: [["f1", { name: "Tech", createdAt: 1 }]] });
    await import(ENTRY);
    const [enter, user, pass] = ["enterButton", "inputUsername", "inputPassword"].map((id) => browser.elements.get(id));

    user.value = "me@example.com"; pass.value = "wrong";
    await enter.fire("click");
    assert.deepEqual(browser.nav.alerts, ["Incorrect email or password. Please try again."]);
    assert.equal(user.style.background, "red");

    pass.value = "right";
    await enter.fire("click");
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(browser.nav.assigned.filter((a) => a[0] === "href").at(-1), ["href", "/main"]);
    assert.equal(JSON.parse(browser.store.get("userWatchListData"))[0].ticker, "AAA");
    assert.equal(JSON.parse(browser.store.get("userWatchlistFolders"))[0].name, "Tech");
    assert.ok(fb.calls.some((c) => c[0] === "signIn"));
  },

  async "login-already-signed-in"() {
    const browser = createFakeBrowser({ ids: ["enterButton", "inputUsername", "inputPassword", "stockZ"], xhr: backend });
    const fb = installFakeFirebase({ watchlistDocs: [["AAA", {}]] });
    await import(ENTRY);
    await fb.signIn({ uid: "u1" });
    assert.deepEqual(browser.nav.assigned.at(-1), ["href", "/main"]);
    assert.equal(JSON.parse(browser.store.get("userWatchListData"))[0].ticker, "AAA");
  },

  async main() {
    const browser = createFakeBrowser({
      ids: ["tickerParentBox", "mainTickerInput", "tickerSubmitBtn", "mobileSearchResultsContainer", "mobileSearchResultsLabel"],
      localStorageData: { userWatchListData: json(ITEMS) },
      xhr: backend,
    });
    installFakeFirebase();
    await import(ENTRY);
    const input = browser.elements.get("mainTickerInput");
    const container = browser.elements.get("mobileSearchResultsContainer");
    assert.equal(container.children.length, 3);
    assert.equal(browser.elements.get("mobileSearchResultsLabel").textContent, "Your Watchlist");

    input.value = "bbb";
    await input.fire("input");
    assert.equal(container.children.length, 1);
    assert.equal(browser.elements.get("mobileSearchResultsLabel").textContent, "Results");

    input.value = "wfc";
    await input.fire("input");
    await browser.elements.get("tickerSubmitBtn").fire("click");
    await flush();
    assert.deepEqual(browser.nav.assigned.at(-1), ["href", "/WFC"]);
    assert.equal(JSON.parse(browser.store.get("mostRecentCalculations")).ticker, "WFC");
    assert.deepEqual(JSON.parse(browser.store.get("mostRecentData")).prices, PRICES);

    // Invalid ticker is rejected without any request.
    const before = browser.nav.assigned.length;
    input.value = "no good!";
    await browser.elements.get("tickerSubmitBtn").fire("click");
    assert.ok(input.hasClass("invalid-ticker"));
    assert.equal(browser.nav.assigned.length, before);
  },

  async "ticker-info"() {
    const calc = { ticker: "WFC", greatBRLow: 65.5, greatBRHigh: 67, goodBRLow: 68, goodBRHigh: 70, okayBRLow: 72, okayBRHigh: 73, badBRLow: 75, badBRHigh: 78, dipPrice: 60, currentPrice: 120 };
    const ids = [
      "tickerLabelIP", "stockStatsLink", "stockDescLink", "dividendHistoryLink", "epsChartLink",
      "dividendYield", "payoutRatio", "lastPayoutAmount", "marketCapValue", "capCategory", "sectorValue",
      "addToWatchlist", "grBL", "grBH", "gBL", "gBH", "oBL", "oBH", "bBL", "bBH", "dipPrice", "currentPrice",
      "mobileGreatRange", "mobileGoodRange", "mobileOkayRange", "mobileBadRange",
      "thresHoldWarning", "chartRangeButtons", "stockChart", "buyHolder", "extraInfo", "otherButtons",
      "folderModalOverlay", "folderModalTitle", "folderModalCloseBtn", "folderModalList",
      "folderModalNewFolderForm", "folderModalNewFolderInput", "folderModalAddBtn",
      "deleteConfirmModalOverlay", "deleteConfirmModalMessage", "deleteConfirmModalCloseBtn",
      "deleteConfirmModalCancelBtn", "deleteConfirmModalConfirmBtn",
    ];
    const browser = createFakeBrowser({
      ids, url: "http://localhost/tickerInfo",
      localStorageData: {
        mostRecentCalculations: json(calc),
        mostRecentData: json({ prices: PRICES, dates: PRICES.map((_, i) => `d${i}`) }),
        recentlyCalculatedWarning: json("threshold"),
        userWatchListData: json(ITEMS), userWatchlistFolders: json(FOLDERS),
      },
      xhr: backend,
    });
    const fb = installFakeFirebase();
    await import(ENTRY);
    await flush();
    const el = (id) => browser.elements.get(id);

    assert.equal(el("tickerLabelIP").textContent, "WFC");
    assert.equal(el("grBL").innerHTML, "$65.50");
    assert.equal(el("bBH").innerHTML, "$78.00");
    assert.equal(el("mobileGreatRange").textContent, "$65.50–$67.00");
    assert.equal(el("thresHoldWarning").style.display, "flex");
    assert.equal(el("dividendYield").innerHTML, "2.5%");
    assert.equal(el("marketCapValue").textContent, "$243.28B");
    assert.equal(el("sectorValue").textContent, "Financial Services");
    // The pre-refactor entry file hit a TDZ error here (CHART_RANGE_OPTIONS used
    // before its declaration), so the range buttons never rendered. SMOKE_ORIGINAL=1
    // skips this check when running these scenarios against that old file.
    if (!process.env.SMOKE_ORIGINAL) assert.equal(el("chartRangeButtons").children.length, 4);
    assert.equal(el("addToWatchlist").textContent, "Add To Watchlist");

    // Not signed in: clicking Add does nothing.
    await el("addToWatchlist").fire("click");
    assert.equal(el("folderModalTitle").textContent, "");
    assert.equal(fb.calls.filter((c) => c[0] === "setDoc").length, 0);

    // Signed in: Add opens the folder modal; confirming writes the item.
    fb.auth.currentUser = { uid: "u1" };
    await el("addToWatchlist").fire("click");
    assert.equal(el("folderModalTitle").textContent, "Add WFC to a Watchlist");
    assert.equal(el("folderModalOverlay").hasClass("hidden"), false);
    await el("folderModalAddBtn").fire("click");
    await flush();
    const write = fb.calls.find((c) => c[0] === "setDoc");
    assert.equal(write[1], "users/u1/watchlist/WFC");
    assert.equal(write[2].goodBuyPrice, "65.50");
    assert.equal(write[2].name, "WFC Inc");
    assert.equal(el("addToWatchlist").textContent, "Modify Watchlist(s)");
    assert.ok(JSON.parse(browser.store.get("userWatchListData")).some((i) => i.ticker === "WFC"));
    assert.equal(el("folderModalOverlay").hasClass("hidden"), true);
  },

  async "ticker-path-uncached"() {
    const browser = createFakeBrowser({
      ids: ["tickerLabelIP", "thresHoldWarning", "addToWatchlist"], url: "http://localhost/WFC", xhr: backend,
    });
    installFakeFirebase();
    await import(ENTRY);
    await flush();
    assert.equal(browser.nav.reloads, 1);
    assert.equal(JSON.parse(browser.store.get("mostRecentCalculations")).ticker, "WFC");
  },

  async watchlist() {
    const browser = watchlistBrowser();
    const fb = installFakeFirebase({
      watchlistDocs: ITEMS.map((i) => [i.ticker, { ...i }]),
      folderDocs: [["f1", { name: "Tech", createdAt: 1 }]],
    });
    await import(ENTRY);
    await fb.signIn({ uid: "u1" });
    await flush();
    const el = (id) => browser.elements.get(id);
    const rows = () => tickers(el("watchlistItemsContainer"));

    // Default order: buy tier, best first (below range, in range, above range).
    assert.deepEqual(rows(), ["BBB", "AAA", "CCC"]);
    assert.deepEqual(tickers(el("watchlistCardsContainer")), ["BBB", "AAA", "CCC"]);
    assert.equal(el("sortByPriceArrow").textContent, "★");
    // Folder dropdown: All + one folder + divider + new-folder form.
    assert.equal(el("folderDropdownPanel").children.length, 4);

    // Sorting by name toggles asc/desc.
    await el("sortByName").fire("click");
    assert.deepEqual(rows(), ["AAA", "BBB", "CCC"]);
    assert.equal(el("sortByNameArrow").textContent, "▲");
    await el("sortByName").fire("click");
    assert.deepEqual(rows(), ["CCC", "BBB", "AAA"]);
    assert.equal(el("sortByNameArrow").textContent, "▼");

    // Selecting a folder filters the list.
    const techRow = el("folderDropdownPanel").children[1];
    await techRow.children[0].fire("click");
    assert.equal(el("folderDropdownLabel").textContent, "Tech");
    assert.deepEqual(rows(), ["BBB"]);
    await el("folderDropdownPanel").children[0].fire("click");
    assert.equal(el("folderDropdownLabel").textContent, "All Stocks");
    assert.equal(rows().length, 3);

    // Delete a row through the confirm modal.
    const bbbRow = el("watchlistItemsContainer").children.find((c) => c.dataset.ticker === "BBB");
    const deleteButton = bbbRow.descendants().find((d) => d.id === "watchlistDeleteButton");
    await deleteButton.fire("click");
    assert.equal(el("deleteConfirmModalMessage").textContent, "Remove BBB from your watch list?");
    await el("deleteConfirmModalConfirmBtn").fire("click");
    assert.ok(fb.calls.some((c) => c[0] === "deleteDoc" && c[1] === "users/u1/watchlist/BBB"));
    assert.deepEqual(JSON.parse(browser.store.get("userWatchListData")).map((i) => i.ticker), ["AAA", "CCC"]);
    assert.equal(el("deleteConfirmModalOverlay").hasClass("hidden"), true);

    // Folder modal: add AAA to the Tech folder.
    const aaaRow = el("watchlistItemsContainer").children.find((c) => c.dataset.ticker === "AAA");
    const folderIcon = aaaRow.descendants().find((d) => d.title === "Add to watchlists");
    await folderIcon.fire("click");
    assert.equal(el("folderModalTitle").textContent, "Modify AAA Watchlist(s)");
    const techBox = el("folderModalList").descendants().filter((d) => d.type === "checkbox").at(-1); // the Tech folder, after "All"
    techBox.checked = true;
    await techBox.fire("change");
    await el("folderModalAddBtn").fire("click");
    await flush();
    assert.deepEqual(fb.calls.find((c) => c[0] === "updateDoc" && c[1] === "users/u1/watchlist/AAA")[2], { folderIds: ["f1"] });
    assert.deepEqual(JSON.parse(browser.store.get("userWatchListData")).find((i) => i.ticker === "AAA").folderIds, ["f1"]);

    // Create a folder from the dropdown.
    const form = el("folderDropdownPanel").children.at(-1);
    form.children[0].value = "Banks";
    await form.fire("submit");
    await flush();
    assert.ok(fb.calls.some((c) => c[0] === "setDoc" && c[2].name === "Banks"));
    assert.equal(JSON.parse(browser.store.get("userWatchlistFolders")).length, 2);

    // Refresh: recomputes bands + price, persists in one batch, rows updated.
    await el("refreshButton").fire("click");
    await new Promise((r) => setTimeout(r, 700));
    const batch = fb.calls.filter((c) => c[0] === "batch").at(-1)[1];
    assert.deepEqual(batch.map((op) => op[1]).sort(), ["users/u1/watchlist/AAA", "users/u1/watchlist/BBB", "users/u1/watchlist/CCC"]);
    const refreshed = JSON.parse(browser.store.get("userWatchListData"));
    assert.ok(refreshed.every((i) => i.currentPrice === 99.5 && i.name.endsWith("Inc") && i.bandsUpdatedAt));
    assert.equal(el("refreshStatus").hasClass("hidden"), true);
    assert.equal(el("refreshButton").disabled, false);
  },

  async "watchlist-bulk-add"() {
    const browser = watchlistBrowser();
    const fb = installFakeFirebase({ watchlistDocs: ITEMS.map((i) => [i.ticker, i]), folderDocs: [["f1", { name: "Tech", createdAt: 1 }]] });
    await import(ENTRY);
    await fb.signIn({ uid: "u1" });
    await flush();
    const el = (id) => browser.elements.get(id);

    await el("bulkAddBtn").fire("click");
    assert.equal(el("bulkAddModalOverlay").hasClass("hidden"), false);
    el("bulkAddModalInput").value = "zzz, aaa, bad!, yyy";
    await el("bulkAddModalForm").fire("submit");
    await flush(12);
    const batch = fb.calls.filter((c) => c[0] === "batch").at(-1)[1];
    assert.deepEqual(batch.map((op) => op[1]).sort(), ["users/u1/watchlist/YYY", "users/u1/watchlist/ZZZ"]);
    assert.match(el("bulkAddModalStatus").textContent, /^Added 2\. Invalid: bad!\. Already on your watch list: AAA\.$/);
    assert.equal(JSON.parse(browser.store.get("userWatchListData")).length, 5);
    assert.equal(el("watchlistItemsContainer").children.length, 5);
    assert.equal(el("bulkAddModalInput").disabled, false);

    // Nothing to add.
    el("bulkAddModalInput").value = "aaa";
    await el("bulkAddModalForm").fire("submit");
    assert.equal(el("bulkAddModalStatus").textContent, "Already on your watch list: AAA");
  },
};

const name = process.argv[2];
if (!scenarios[name]) {
  console.error(`Unknown scenario "${name}". Known: ${Object.keys(scenarios).join(", ")}`);
  process.exit(2);
}
try {
  await scenarios[name]();
  console.log(`scenario ${name}: ok`);
  process.exit(0);
} catch (error) {
  console.error(`scenario ${name}: FAILED\n`, error);
  process.exit(1);
}
