/* Ticker validation: only accept things that actually look like ticker
   symbols before they're used as a Firestore document ID or forwarded to a
   backend function. */
const TICKER_PATTERN = /^[A-Z.\-]{1,10}$/;

export function sanitizeTicker(raw) {
    const upper = String(raw ?? '').trim().toUpperCase();
    return TICKER_PATTERN.test(upper) ? upper : null;
}

// Shareable per-ticker URL, e.g. /WFC (rewritten to tickerInfo.html in netlify.toml).
export function tickerPath(ticker) {
    return '/' + encodeURIComponent(ticker);
}

// Splits free-form bulk-add input into tickers to add, tickers that are
// already on the watchlist, and tokens that aren't valid tickers. Order is
// preserved and duplicates are collapsed.
export function parseBulkTickers(rawText, existingTickers) {
    const invalid = [];
    const alreadyAdded = [];
    const toAdd = [];
    rawText.split(/[\s,;]+/).filter(Boolean).forEach((token) => {
        const ticker = sanitizeTicker(token);
        if (!ticker) {
            invalid.push(token);
        } else if (existingTickers.has(ticker)) {
            if (!alreadyAdded.includes(ticker)) alreadyAdded.push(ticker);
        } else if (!toAdd.includes(ticker)) {
            toAdd.push(ticker);
        }
    });
    return { invalid, alreadyAdded, toAdd };
}
