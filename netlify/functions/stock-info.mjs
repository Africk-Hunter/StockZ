import * as cheerio from "cheerio";
import { fetch as undiciFetch } from "undici";
import {
  agent,
  REQUEST_HEADERS,
  sanitizeTicker,
  fetchTimeoutSignal,
  isRateLimited,
  clientIp,
  rateLimitResponse,
  missingTickerResponse,
} from "./lib/shared.mjs";

async function scrapeStockInfo(ticker) {
  const url = `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/`;

  const response = await undiciFetch(url, {
    dispatcher: agent,
    headers: REQUEST_HEADERS,
    signal: fetchTimeoutSignal(),
  });

  if (!response.ok) {
    throw new Error(`Failed to retrieve stock info. Status code: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  let name = null;
  let currentPrice = null;
  let dividendYield = null;

  try {
    $("h1").each((_, h1) => {
      const text = $(h1).text().trim();
      if (text.includes(`(${ticker})`)) {
        name = text.slice(0, text.lastIndexOf("(")).trim();
        return false; // break
      }
    });
  } catch (error) {
    console.error("An error occurred while parsing the stock name:", error);
  }

  try {
    const priceEl = $('[data-testid="qsp-price"]').first();
    if (priceEl.length) {
      const parsed = parseFloat(priceEl.text().replace(/,/g, "").trim());
      if (!Number.isNaN(parsed)) {
        currentPrice = parsed;
      }
    }
  } catch (error) {
    console.error("An error occurred while parsing the current price:", error);
  }

  try {
    const labelEl = $('[title="Forward Dividend & Yield"]').first();
    const valueEl = labelEl.length ? labelEl.closest("li").find("span.value").first() : null;
    if (valueEl && valueEl.length) {
      const match = valueEl.text().trim().match(/\(([\d.]+%)\)/);
      if (match) {
        dividendYield = match[1];
      }
    }
  } catch (error) {
    console.error("An error occurred while parsing the dividend yield:", error);
  }

  return { name, currentPrice, dividendYield };
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
    const info = await scrapeStockInfo(ticker);
    return new Response(JSON.stringify(info), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`Error scraping stock info for ${ticker}:`, error);
    return new Response(
      JSON.stringify({ error: "Failed to retrieve stock info.", name: null, currentPrice: null, dividendYield: null }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config = {
  path: "/stock-info",
};
