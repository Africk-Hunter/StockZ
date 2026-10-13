/* Pure watchlist helpers: freshness/split detection, buy-tier ordering and
   color classes, sorting, and bounded concurrency. No DOM, no storage. */

// Buy ranges are built only from monthly closes (the scraper keeps rows dated
// the 1st), so within a month a fresh scrape returns the same numbers. A
// refresh therefore skips the history fetch while an item's ranges are
// "fresh" and only updates the live price.
const BANDS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // backstop, mainly for splits
const SPLIT_JUMP_RATIO = 1.3; // price moved >30% since the last refresh

// Calendar date in New York, the timezone Yahoo's history dates use.
export function newYorkDate(ms) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric'
    }).formatToParts(new Date(ms));
    const part = (type) => Number(parts.find((p) => p.type === type).value);
    return { year: part('year'), month: part('month'), day: part('day') };
}

export function bandsAreFresh(item, now = Date.now()) {
    if (!item.bandsUpdatedAt) return false;
    if (now - item.bandsUpdatedAt > BANDS_MAX_AGE_MS) return false;
    const calculated = newYorkDate(item.bandsUpdatedAt);
    const current = newYorkDate(now);
    if (calculated.year !== current.year || calculated.month !== current.month) return false;
    // The 1st's close is still moving that day, so ranges calculated then
    // are recalculated once on a later day.
    if (calculated.day === 1 && current.day > 1) return false;
    return true;
}

// A sudden large price change since the last refresh usually means a stock
// split (which rewrites all past prices), so the ranges must be recalculated.
export function priceJumped(oldPrice, newPrice) {
    const before = Number(oldPrice);
    const after = Number(newPrice);
    if (!(before > 0) || !(after > 0)) return false;
    const ratio = after / before;
    return ratio > SPLIT_JUMP_RATIO || ratio < 1 / SPLIT_JUMP_RATIO;
}

// Runs the requested items through `mapper`, but never more than `limit` at
// once — used to cap how many concurrent requests a watchlist refresh can
// fire at the backend (and, behind it, at Yahoo).
export async function mapWithConcurrencyLimit(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function worker() {
        while (nextIndex < items.length) {
            const current = nextIndex++;
            results[current] = await mapper(items[current], current);
        }
    }
    const workerCount = Math.min(limit, items.length);
    await Promise.all(Array.from({ length: workerCount }, worker));
    return results;
}

// Where the current price sits within the item's good-to-bad buy span (0 = at the
// great-buy end, 1 = at the bad-buy end). Below the span is negative (best), and
// items with missing data sort last. Ordering by this orders by buy tier.
export function getBuyTierPosition(item) {
    const price = Number(item.currentPrice);
    const min = Number(item.goodBuyPrice);
    const max = Number(item.badBuyPrice);
    if (!Number.isFinite(price) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        return Infinity;
    }
    return (price - min) / (max - min);
}

export function isWithinBuyRange(item) {
    const position = getBuyTierPosition(item);
    return position >= 0 && position <= 1;
}

export function compareWatchlistValues(valueA, valueB, key) {
    if (key === 'ticker') {
        return String(valueA).localeCompare(String(valueB));
    }
    const numA = parseFloat(String(valueA ?? '').replace('$', '')) || 0;
    const numB = parseFloat(String(valueB ?? '').replace('$', '')) || 0;
    return numA - numB;
}

// Sorts `items` in place by `sortKey` ('priceTier' orders by buy tier) and
// returns it. A null sortKey leaves the order alone.
export function sortWatchlistItems(items, sortKey, direction) {
    if (!sortKey) return items;
    return items.sort((a, b) => {
        // Price sort only orders stocks inside their buy range; the rest stay last
        if (sortKey === 'currentPrice') {
            const inRangeA = isWithinBuyRange(a);
            const inRangeB = isWithinBuyRange(b);
            if (inRangeA !== inRangeB) return inRangeA ? -1 : 1;
            if (!inRangeA) return 0;
        }
        const comparison = sortKey === 'priceTier'
            ? getBuyTierPosition(a) - getBuyTierPosition(b)
            : compareWatchlistValues(a[sortKey], b[sortKey], sortKey);
        return direction === 'asc' ? comparison : -comparison;
    });
}

// A watchlist item only stores the outer bounds of the buy-range (goodBuyPrice
// = greatBRLow, badBuyPrice = badBRHigh), not the four individual bands —
// but computeBuyRanges() always splits that span into 8 equal steps
// (great/good/okay bands each 1 step wide, separated by 1-step gaps, with the
// bad band spanning the final 2 steps), so the bands can be reconstructed
// from just those two bounds without re-fetching price history.
export function getCurrentPriceRangeColorClass(currentPrice, goodBuyPrice, badBuyPrice) {
    const price = Number(currentPrice);
    const min = Number(goodBuyPrice);
    const max = Number(badBuyPrice);
    if (!Number.isFinite(price) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        return null;
    }

    if (price < min) {
        return 'bg-purple-500';
    }

    const step = (max - min) / 8;
    // The 1-step gaps between bands belong to the cheaper band below them, so a
    // price that falls in a gap still gets a tier color instead of none.
    if (price < min + 2 * step) return 'bg-great-buy-one';
    if (price < min + 4 * step) return 'bg-good-buy-one';
    if (price < min + 6 * step) return 'bg-okay-buy-one';
    if (price <= max) return 'bg-desperate-buy-one';

    return null;
}
