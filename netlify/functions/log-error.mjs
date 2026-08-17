import { isRateLimited, clientIp } from "./lib/shared.mjs";

// There's no database or email provider wired up for this static site, so
// "sending" an error report just means writing it to this function's
// stdout — Netlify captures that in the Functions logs (Netlify dashboard
// > Logs > Functions), which is where reports actually get read.
const MAX_BODY_BYTES = 20_000;
const MAX_STRING_LEN = 4000;

function truncate(value, max = MAX_STRING_LEN) {
  if (typeof value !== "string") return undefined;
  return value.length > max ? `${value.slice(0, max)}…[truncated]` : value;
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(null, { status: 405 });
  }

  if (isRateLimited(clientIp(req))) {
    return new Response(null, { status: 429 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return new Response(null, { status: 413 });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }

  const report = {
    receivedAt: new Date().toISOString(),
    level: truncate(String(body.level ?? "unknown"), 50),
    message: truncate(String(body.message ?? "")),
    description: truncate(body.description),
    stack: truncate(body.stack),
    page: truncate(String(body.page ?? ""), 300),
    userAgent: truncate(String(body.userAgent ?? ""), 300),
    clientTimestamp: truncate(String(body.timestamp ?? ""), 50),
    recentErrors: Array.isArray(body.recentErrors) ? body.recentErrors.slice(-10) : undefined,
    ip: clientIp(req),
  };

  console.error("[bug-report]", JSON.stringify(report));

  return new Response(null, { status: 204 });
};

export const config = {
  path: "/log-error",
};
