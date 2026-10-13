import { fetchHtml, guardTickerRequest, jsonResponse } from "./lib/shared.mjs";

// Yahoo renders market cap as a short string ("243.281B"); convert to dollars.
const CAP_SUFFIXES = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };

export function parseMarketCap(text) {
  const match = String(text ?? "").replace(/,/g, "").trim().match(/^([\d.]+)\s*([KMBT])?$/i);
  if (!match) return null;
  const value = parseFloat(match[1]) * (CAP_SUFFIXES[(match[2] || "").toUpperCase()] || 1);
  return Number.isFinite(value) ? value : null;
}

// Buckets match the user's portfolio sheet.
export function capCategory(cap) {
  if (cap === null) return null;
  if (cap > 200e9) return "Mega-cap";
  if (cap >= 10e9) return "Large-cap";
  if (cap >= 2e9) return "Mid-cap";
  if (cap >= 250e6) return "Small-cap";
  return "Micro-cap";
}

async function fetchMarketCap(ticker) {
  try {
    const $ = await fetchHtml(`https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/`);
    const el = $('fin-streamer[data-field="marketCap"]').first();
    const raw = el.attr("data-value") || el.text();
    return parseMarketCap(raw);
  } catch (error) {
    console.error("An error occurred while parsing market cap:", error);
    return null;
  }
}

async function fetchSector(ticker) {
  try {
    const $ = await fetchHtml(`https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/profile/`);
    // Profile page lists "<dt>Sector:</dt><dd><a>Financial Services</a></dd>".
    const dt = $("dt").filter((_, el) => $(el).text().trim().replace(/:$/, "") === "Sector").first();
    const sector = dt.length ? dt.next("dd").text().replace(/\s+/g, " ").trim() : "";
    return sector || null;
  } catch (error) {
    console.error("An error occurred while parsing sector:", error);
    return null;
  }
}

export default async (req) => {
  const guard = guardTickerRequest(req);
  if (guard.response) return guard.response;
  const { ticker } = guard;

  const [marketCap, sector] = await Promise.all([fetchMarketCap(ticker), fetchSector(ticker)]);

  return jsonResponse({ marketCap, capCategory: capCategory(marketCap), sector });
};

export const config = {
  path: "/company-profile",
};
