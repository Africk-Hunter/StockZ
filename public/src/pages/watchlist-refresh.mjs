/* Watchlist refresh: re-fetches prices (and, when stale, buy ranges) for every
   saved ticker with bounded concurrency, repainting rows as they arrive. */
import { getCachedWatchList, setCachedWatchList } from '../lib/storage.mjs';
import { fetchWatchlistItems, updateWatchlistItemValues } from '../lib/watchlist-repo.mjs';
import { getStockData, fetchStockInfo, runStockCalculations } from '../lib/stock-service.mjs';
import { bandsAreFresh, priceJumped, mapWithConcurrencyLimit } from '../lib/watchlist-logic.mjs';
import { recordError } from '../lib/error-reporting.mjs';
import { notifyWatchlistChanged } from '../lib/events.mjs';
import { watchlistState } from './watchlist-state.mjs';
import { updateWatchlistRowInPlace } from './watchlist-rows.mjs';

// Tells the user which tickers a refresh couldn't update (their old values are
// kept) instead of failing silently; clears itself when everything succeeded.
function setRefreshProgress(done, total) {
    const statusEl = document.getElementById('refreshStatus');
    if (!statusEl) return;
    statusEl.dataset.progress = '1';
    statusEl.textContent = `Refreshing ${done} of ${total}…`;
    statusEl.classList.remove('hidden');
}

export function showRefreshStatus(failedTickers) {
    const statusEl = document.getElementById('refreshStatus');
    if (!statusEl) return;
    statusEl.dataset.progress = '';
    if (!failedTickers || failedTickers.length === 0) {
        statusEl.classList.add('hidden');
        statusEl.textContent = '';
        return;
    }
    const shown = failedTickers.slice(0, 5).join(', ');
    const extra = failedTickers.length > 5 ? ` and ${failedTickers.length - 5} more` : '';
    statusEl.textContent = `Couldn't fully refresh ${failedTickers.length} ${failedTickers.length === 1 ? 'ticker' : 'tickers'} (${shown}${extra}). Showing previous values; try again in a minute.`;
    statusEl.classList.remove('hidden');
}

// If a refresh threw, don't leave "Refreshing n of N…" stuck.
export function clearStuckRefreshProgress() {
    const statusEl = document.getElementById('refreshStatus');
    if (statusEl && statusEl.dataset.progress === '1') showRefreshStatus([]);
}

export async function updateWatchListValues(user) {
    const watchlistItems = await fetchWatchlistItems(user.uid);

    // Per-refresh tallies, summarised once at the end (see below) so a
    // failure burst shows up as one log line instead of N.
    const refreshStats = { historyOk: 0, historyFailed: 0, historySkipped: 0, splitSuspected: 0, infoOk: 0, infoFailed: 0, statuses: {} };
    const failedTickers = new Set();
    const refreshStartedAt = Date.now();

    // Progressive rendering: as each ticker finishes, write just its refreshed
    // fields into the cached list and repaint (throttled), so rows update as
    // they arrive instead of all at once after the slowest ticker. Tickers
    // removed from the cache mid-refresh are not resurrected, and folderIds
    // are left as the cache has them.
    let completed = 0;
    let renderTimer = null;
    const pendingTickers = new Set();
    // Repaints only the rows whose data changed since the last flush, in place.
    const flushPendingRows = () => {
        const tickers = Array.from(pendingTickers);
        pendingTickers.clear();
        const cachedByTicker = new Map(getCachedWatchList().map((cachedItem) => [cachedItem.ticker, cachedItem]));
        tickers.forEach((ticker) => {
            const cachedItem = cachedByTicker.get(ticker);
            if (cachedItem) updateWatchlistRowInPlace(cachedItem);
        });
    };
    const scheduleRender = (ticker) => {
        pendingTickers.add(ticker);
        if (renderTimer) return;
        renderTimer = setTimeout(() => {
            renderTimer = null;
            flushPendingRows();
        }, 400);
    };
    const onItemDone = (updatedItem, isRetry) => {
        if (!isRetry) {
            completed++;
            setRefreshProgress(completed, watchlistItems.length);
        }
        const cached = getCachedWatchList();
        if (!cached.some((cachedItem) => cachedItem.ticker === updatedItem.ticker)) return;
        setCachedWatchList(cached.map((cachedItem) => (
            cachedItem.ticker === updatedItem.ticker
                ? {
                    ...cachedItem,
                    goodBuyPrice: updatedItem.goodBuyPrice,
                    badBuyPrice: updatedItem.badBuyPrice,
                    name: updatedItem.name,
                    currentPrice: updatedItem.currentPrice,
                    dividendYield: updatedItem.dividendYield,
                    bandsUpdatedAt: updatedItem.bandsUpdatedAt
                }
                : cachedItem
        )));
        scheduleRender(updatedItem.ticker);
    };
    setRefreshProgress(0, watchlistItems.length);

    // Tickers that hit the server's rate limit (429) get one retry pass after
    // the main pass, once the limit window has had a moment to ease.
    const retryTickers = new Set();
    const tallyFailure = (kind, error, ticker) => {
        refreshStats[kind + 'Failed']++;
        failedTickers.add(ticker);
        if (error && error.status === 429) retryTickers.add(ticker);
        const status = error && error.status ? error.status : 'none';
        refreshStats.statuses[status] = (refreshStats.statuses[status] || 0) + 1;
    };

    const updateOne = async (item, isRetry = false) => {
        // A retry that succeeds should clear the ticker's earlier failure.
        failedTickers.delete(item.ticker);
        let updatedItem = {
            ticker: item.ticker,
            goodBuyPrice: item.goodBuyPrice,
            badBuyPrice: item.badBuyPrice,
            name: item.name || null,
            currentPrice: item.currentPrice ?? null,
            dividendYield: item.dividendYield ?? null,
            bandsUpdatedAt: item.bandsUpdatedAt ?? null,
            folderIds: Array.isArray(item.folderIds) ? item.folderIds : []
        };
        // No cache key is passed to getStockData: concurrent bulk callers
        // would overwrite the shared mostRecentData the ticker page reads.
        const settle = (promise) => promise.then(
            (value) => ({ status: 'fulfilled', value }),
            (reason) => ({ status: 'rejected', reason })
        );

        let historyResult = null;
        let infoResult;
        if (bandsAreFresh(item)) {
            // Ranges are still valid: fetch only the price, and fetch history
            // too only if the price jumped enough to suggest a split.
            infoResult = await settle(fetchStockInfo(item.ticker));
            if (infoResult.status === 'fulfilled' && priceJumped(item.currentPrice, infoResult.value.currentPrice)) {
                refreshStats.splitSuspected++;
                historyResult = await settle(getStockData(item.ticker));
            } else {
                refreshStats.historySkipped++;
            }
        } else {
            // History and price don't depend on each other, so fetch both at once.
            [historyResult, infoResult] = await Promise.all([
                settle(getStockData(item.ticker)),
                settle(fetchStockInfo(item.ticker))
            ]);
        }

        if (historyResult && historyResult.status === 'fulfilled') {
            try {
                const calculations = runStockCalculations(historyResult.value.prices, item.ticker);
                updatedItem.goodBuyPrice = calculations.greatBRLow.toFixed(2);
                updatedItem.badBuyPrice = calculations.badBRHigh.toFixed(2);
                updatedItem.bandsUpdatedAt = Date.now();
                refreshStats.historyOk++;
            } catch (error) {
                tallyFailure('history', error, item.ticker);
                console.warn(`Error calculating ${item.ticker}: `, error);
            }
        } else if (historyResult) {
            // bandsUpdatedAt is left unchanged so the next refresh retries.
            tallyFailure('history', historyResult.reason, item.ticker);
            // console.warn (not console.error): error calls are each reported
            // to the server, and the [refresh-summary] already covers failures.
            console.warn(`Error refreshing ${item.ticker}: `, historyResult.reason);
        }

        // Each half updates independently: a failed history fetch no longer
        // blocks a fresh price, and vice versa.
        if (infoResult.status === 'fulfilled') {
            const info = infoResult.value;
            updatedItem.name = info.name || item.name || null;
            updatedItem.currentPrice = info.currentPrice ?? item.currentPrice ?? null;
            updatedItem.dividendYield = info.dividendYield ?? item.dividendYield ?? null;
            refreshStats.infoOk++;
        } else {
            tallyFailure('info', infoResult.reason, item.ticker);
            console.warn(`Error fetching stock info for ${item.ticker}: `, infoResult.reason);
        }
        onItemDone(updatedItem, isRetry);
        return updatedItem;
    };

    // Cap concurrency (instead of firing every item's requests at once) and
    // batch the Firestore writes into one round trip instead of N.
    const updatedWatchlistItems = await mapWithConcurrencyLimit(watchlistItems, 8, (item) => updateOne(item));

    // One gentler retry pass for tickers the server rate-limited. The first
    // pass's result is retried (not the original), so a ticker whose history
    // already succeeded is fresh and only re-fetches its price.
    const toRetry = updatedWatchlistItems.filter((updatedItem) => retryTickers.has(updatedItem.ticker));
    retryTickers.clear();
    if (toRetry.length > 0) {
        refreshStats.retried = toRetry.length;
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const retried = await mapWithConcurrencyLimit(toRetry, 4, (item) => updateOne(item, true));
        retried.forEach((retriedItem) => {
            const index = updatedWatchlistItems.findIndex((updatedItem) => updatedItem.ticker === retriedItem.ticker);
            if (index !== -1) updatedWatchlistItems[index] = retriedItem;
        });
    }
    clearTimeout(renderTimer);
    renderTimer = null;
    flushPendingRows();

    // One-line outcome for the whole refresh. Failures (e.g. 429s from the
    // server rate limiter) are also sent to the server log via recordError.
    const refreshSummary = JSON.stringify({
        tickers: watchlistItems.length,
        ...refreshStats,
        ms: Date.now() - refreshStartedAt
    });
    console.warn('[refresh-summary]', refreshSummary);
    if (refreshStats.historyFailed + refreshStats.infoFailed > 0) {
        recordError('refresh-summary', refreshSummary);
    }

    await updateWatchlistItemValues(user.uid, updatedWatchlistItems);

    setCachedWatchList(updatedWatchlistItems);
    // Rows were already updated in place as they arrived. A full rebuild is
    // only needed to re-sort, since refreshed prices can change the order.
    if (watchlistState.sortKey) {
        notifyWatchlistChanged();
    }
    return { failed: Array.from(failedTickers) };
}
