import { START_TIME, fetchHtml, findTableByHeaders, guardTickerRequest, jsonResponse } from "./lib/shared.mjs";

// Mirrors the Python version's "search by label text, walk up to the
// containing row" resilience strategy rather than depending on Yahoo's
// (frequently-changing) CSS class names.
export function extractLabelledValue($, label) {
  for (const tag of ["tr", "li", "div"]) {
    const row = $(`${tag}:contains("${label}")`).first();
    if (row.length) {
      const text = row.text().replace(/\s+/g, " ").trim();
      let value = text.replace(label, "").trim();
      // Yahoo prepends a superscript footnote reference number (e.g. "4 0.44%")
      // to some stats in this table; it isn't part of the value.
      value = value.replace(/^\d{1,2}\s+(?=\S)/, "").trim();
      return value || null;
    }
  }
  return null;
}

async function fetchDividendYieldAndPayoutRatio(ticker) {
  let dividendYield = null;
  let payoutRatio = null;

  try {
    const statsUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/key-statistics`;
    const $ = await fetchHtml(statsUrl);
    dividendYield = extractLabelledValue($, "Forward Annual Dividend Yield");
    payoutRatio = extractLabelledValue($, "Payout Ratio");
  } catch (error) {
    console.error("An error occurred while parsing key statistics:", error);
  }

  return { dividendYield, payoutRatio };
}

async function fetchLastPayoutAmount(ticker) {
  try {
    const currentTime = String(Math.floor(Date.now() / 1000));
    const divUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/history/?filter=div&frequency=1d&period1=${START_TIME}&period2=${currentTime}`;
    const $ = await fetchHtml(divUrl);
    const dividendTable = findTableByHeaders($, "Date", "Dividends");

    if (!dividendTable) {
      console.error("Dividend history not found on the page.");
      return null;
    }

    let lastPayoutAmount = null;
    $(dividendTable)
      .find("tbody tr")
      .each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length >= 2) {
          const cellText = $(cells[1]).text().trim();
          // Dividend-only rows render as a merged cell like "0.2500 Dividend";
          // keep just the payout amount.
          const amountMatch = cellText.match(/^\$?[\d,.]+/);
          if (amountMatch) {
            lastPayoutAmount = amountMatch[0].startsWith("$") ? amountMatch[0] : `$${amountMatch[0]}`;
          } else {
            lastPayoutAmount = cellText;
          }
          return false; // break
        }
      });
    return lastPayoutAmount;
  } catch (error) {
    console.error("An error occurred while parsing dividend history:", error);
    return null;
  }
}

export default async (req) => {
  const guard = guardTickerRequest(req);
  if (guard.response) return guard.response;
  const { ticker } = guard;

  try {
    const [{ dividendYield, payoutRatio }, lastPayoutAmount] = await Promise.all([
      fetchDividendYieldAndPayoutRatio(ticker),
      fetchLastPayoutAmount(ticker),
    ]);

    return jsonResponse({ dividendYield, payoutRatio, lastPayoutAmount });
  } catch (error) {
    console.error(`Error fetching dividend info for ${ticker}:`, error);
    return jsonResponse({ error: "Failed to retrieve dividend info.", dividendYield: null, payoutRatio: null, lastPayoutAmount: null }, 502);
  }
};

export const config = {
  path: "/run-dividend-info",
};
