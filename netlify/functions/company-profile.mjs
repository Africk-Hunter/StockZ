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

// Yahoo renders market cap as a short string ("243.281B"); convert to dollars.
const CAP_SUFFIXES = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };

function parseMarketCap(text) {
  const match = String(text ?? "").replace(/,/g, "").trim().match(/^([\d.]+)\s*([KMBT])?$/i);
  if (!match) return null;
  const value = parseFloat(match[1]) * (CAP_SUFFIXES[(match[2] || "").toUpperCase()] || 1);
  return Number.isFinite(value) ? value : null;
}

// Buckets match the user's portfolio sheet.
function capCategory(cap) {
  if (cap === null) return null;
  if (cap > 200e9) return "Mega-cap";
  if (cap >= 10e9) return "Large-cap";
  if (cap >= 2e9) return "Mid-cap";
  if (cap >= 250e6) return "Small-cap";
  return "Micro-cap";
}

async function fetchHtml(url) {
  const response = await undiciFetch(url, { dispatcher: agent, headers: REQUEST_HEADERS, signal: fetchTimeoutSignal() });
  if (!response.ok) {
    throw new Error(`Status code: ${response.status} for ${url}`);
  }
  return cheerio.load(await response.text());
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
  if (isRateLimited(clientIp(req))) {
    return rateLimitResponse();
  }

  const ticker = sanitizeTicker(new URL(req.url).searchParams.get("ticker"));

  if (!ticker) {
    return missingTickerResponse();
  }

  const [marketCap, sector] = await Promise.all([fetchMarketCap(ticker), fetchSector(ticker)]);

  return new Response(JSON.stringify({ marketCap, capCategory: capCategory(marketCap), sector }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config = {
  path: "/company-profile",
};
