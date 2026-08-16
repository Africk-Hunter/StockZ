import * as cheerio from "cheerio";
import { fetch as undiciFetch } from "undici";
import {
  agent,
  REQUEST_HEADERS,
  START_TIME,
  sanitizeTicker,
  fetchTimeoutSignal,
  isRateLimited,
  clientIp,
  rateLimitResponse,
  missingTickerResponse,
} from "./lib/shared.mjs";

async function scrapeStockData(ticker) {
  const currentTime = String(Math.floor(Date.now() / 1000));
  const url = `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/history/?frequency=1mo&period1=${START_TIME}&period2=${currentTime}`;

  const response = await undiciFetch(url, {
    dispatcher: agent,
    headers: REQUEST_HEADERS,
    signal: fetchTimeoutSignal(),
  });

  if (!response.ok) {
    throw new Error(`Failed to retrieve data. Status code: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  let historicalTable = null;
  $("table").each((_, table) => {
    const theadText = $(table).find("thead").text();
    if (theadText.includes("Date") && theadText.includes("Close")) {
      historicalTable = table;
      return false; // break
    }
  });

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

export default async (req) => {
  if (isRateLimited(clientIp(req))) {
    return rateLimitResponse();
  }

  const ticker = sanitizeTicker(new URL(req.url).searchParams.get("ticker"));

  if (!ticker) {
    return missingTickerResponse();
  }

  try {
    const { prices, dates } = await scrapeStockData(ticker);
    return new Response(JSON.stringify({ prices, dates }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`Error scraping ${ticker}:`, error);
    return new Response(JSON.stringify({ error: "Failed to retrieve stock data.", prices: [], dates: [] }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/run-calculations",
};
