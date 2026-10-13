import {
  START_TIME,
  INSTANCE_ID,
  fetchHtml,
  findTableByHeaders,
  guardTickerRequest,
  jsonResponse,
} from "./lib/shared.mjs";

// Parses the monthly history table into parallel prices/dates arrays, most
// recent first. Takes a cheerio-loaded page so it can be tested offline.
export function parseHistoricalPrices($) {
  const historicalTable = findTableByHeaders($, "Date", "Close");

  if (!historicalTable) {
    throw new Error("Historical data not found on the page.");
  }

  // Find the Close column by header text rather than a fixed index, since
  // Yahoo's column order/count has drifted before (Date/Open/High/Low/Close/Adj Close/Volume).
  const headerCells = $(historicalTable).find("thead th");
  let closeIndex = -1;
  headerCells.each((index, th) => {
    const text = $(th).text().trim();
    if (text.startsWith("Close")) {
      closeIndex = index;
      return false;
    }
  });
  if (closeIndex === -1) {
    throw new Error("Close column not found in historical data table.");
  }

  // Find the Date column the same way, so dates stay aligned with prices
  // regardless of Yahoo's column order.
  let dateIndex = -1;
  headerCells.each((index, th) => {
    const text = $(th).text().trim();
    if (text.startsWith("Date")) {
      dateIndex = index;
      return false;
    }
  });

  const prices = [];
  const dates = [];
  $(historicalTable)
    .find("tbody tr")
    .each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length > closeIndex) {
        // Yahoo returns the current month as extra daily rows (e.g. "Oct 2",
        // "Oct 1") alongside the monthly bars dated the 1st. Keep only rows
        // dated the 1st so each month appears exactly once.
        const dateText = dateIndex !== -1 ? $(cells[dateIndex]).text().trim() : "";
        if (dateIndex !== -1 && !/^[A-Za-z]{3,9}\s+1,\s*\d{4}$/.test(dateText)) return;
        const rawText = $(cells[closeIndex]).text().replace(/,/g, "").trim();
        const value = parseFloat(rawText);
        if (!Number.isNaN(value)) {
          prices.push(value);
          dates.push(dateIndex !== -1 && cells.length > dateIndex ? $(cells[dateIndex]).text().trim() : "");
        }
      }
    });

  return { prices, dates };
}

async function scrapeStockData(ticker) {
  const currentTime = String(Math.floor(Date.now() / 1000));
  const url = `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/history/?frequency=1mo&period1=${START_TIME}&period2=${currentTime}`;

  return parseHistoricalPrices(await fetchHtml(url));
}

export default async (req) => {
  const guard = guardTickerRequest(req);
  if (guard.response) return guard.response;
  const { ticker } = guard;

  const startedAt = Date.now();
  try {
    const { prices, dates } = await scrapeStockData(ticker);
    console.log("[req]", JSON.stringify({ fn: "run-calculations", ticker, instance: INSTANCE_ID, ms: Date.now() - startedAt, status: 200 }));
    return jsonResponse({ prices, dates });
  } catch (error) {
    console.log("[req]", JSON.stringify({ fn: "run-calculations", ticker, instance: INSTANCE_ID, ms: Date.now() - startedAt, status: 502 }));
    console.error(`Error scraping ${ticker}:`, error);
    return jsonResponse({ error: "Failed to retrieve stock data.", prices: [], dates: [] }, 502);
  }
};

export const config = {
  path: "/run-calculations",
};
