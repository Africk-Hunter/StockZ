import { INSTANCE_ID, fetchHtml, guardTickerRequest, jsonResponse } from "./lib/shared.mjs";

// Extracts name, price and dividend yield from a cheerio-loaded quote page.
export function parseStockInfo($, ticker) {
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

async function scrapeStockInfo(ticker) {
  return parseStockInfo(await fetchHtml(`https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/`), ticker);
}

export default async (req) => {
  const guard = guardTickerRequest(req);
  if (guard.response) return guard.response;
  const { ticker } = guard;

  const startedAt = Date.now();
  try {
    const info = await scrapeStockInfo(ticker);
    console.log("[req]", JSON.stringify({ fn: "stock-info", ticker, instance: INSTANCE_ID, ms: Date.now() - startedAt, status: 200 }));
    return jsonResponse(info);
  } catch (error) {
    console.log("[req]", JSON.stringify({ fn: "stock-info", ticker, instance: INSTANCE_ID, ms: Date.now() - startedAt, status: 502 }));
    console.error(`Error scraping stock info for ${ticker}:`, error);
    return jsonResponse({ error: "Failed to retrieve stock info.", name: null, currentPrice: null, dividendYield: null }, 502);
  }
};

export const config = {
  path: "/stock-info",
};
