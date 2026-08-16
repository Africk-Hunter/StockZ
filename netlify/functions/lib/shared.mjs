import { Agent } from "undici";

// Yahoo's response headers (cookies etc.) exceed Node's built-in fetch
// default header-size limit (UND_ERR_HEADERS_OVERFLOW), so use a dedicated
// agent with a larger limit instead of the global fetch. Shared across all
// three functions so there's one connection pool instead of three.
export const agent = new Agent({ maxHeaderSize: 1048576 });

export const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Referer": "https://finance.yahoo.com/",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1",
};

export const START_TIME = "1400118174"; // May 15, 2014

const TICKER_PATTERN = /^[A-Z.\-]{1,10}$/;

// Validates and normalizes a ticker from a query param before it's ever
// interpolated into an outbound URL or used to build a response. Returns
// null for anything that doesn't look like a real ticker symbol.
export function sanitizeTicker(raw) {
  const upper = String(raw ?? "").trim().toUpperCase();
  return TICKER_PATTERN.test(upper) ? upper : null;
}

// A bounded, cancellable fetch timeout — Node's fetch/undici otherwise has
// no default and will hang on a stalled Yahoo response indefinitely.
export function fetchTimeoutSignal(ms = 10000) {
  return AbortSignal.timeout(ms);
}

// A minimal per-instance, in-memory rate limiter. Netlify Functions are
// stateless across cold starts and spread across many concurrent instances,
// so this is not a hard global cap — it's a cheap first line of defense
// against a single warm instance being hammered, on top of whatever
// limiting is configured at the platform/CDN level.
const requestLog = new Map(); // ip -> recent request timestamps (ms)
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

export function isRateLimited(ip) {
  const now = Date.now();
  const key = ip || "unknown";
  const timestamps = (requestLog.get(key) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(key, timestamps);
  return timestamps.length > RATE_LIMIT_MAX_REQUESTS;
}

export function clientIp(req) {
  return req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown";
}

// A minimal per-instance, in-memory response cache. Like the rate limiter,
// this only helps within a single warm Netlify Function instance rather
// than acting as a distributed cache — but it's enough to absorb the common
// case of a user bouncing between pages for the same ticker within a few
// minutes, without re-scraping Yahoo every time.
const responseCache = new Map(); // key -> { value, expiresAt }

export function getCached(key) {
  const entry = responseCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return undefined;
  }
  return entry.value;
}

export function setCached(key, value, ttlMs = 60_000) {
  responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function rateLimitResponse() {
  return new Response(JSON.stringify({ error: "Too many requests. Please slow down." }), {
    status: 429,
    headers: { "Content-Type": "application/json" },
  });
}

export function missingTickerResponse() {
  return new Response(JSON.stringify({ error: "Ticker symbol not provided or invalid." }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}
